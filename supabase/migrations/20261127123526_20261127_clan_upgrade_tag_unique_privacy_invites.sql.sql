/*
# Clan upgrade: unique tags, privacy, invites, one clan per user, search index

Retry of the same migration: the profiles UPDATE grant list now matches the real
schema columns (username, avatar_url, bio, xp, level, coins, is_online, last_seen,
dm_privacy, friend_request_privacy, call_privacy). No display_name / status /
favorite_genre / social_links columns exist. All other steps are unchanged and
idempotent: the previous attempt rolled back, so nothing below has been applied yet.

1. Changes to existing tables
- `clans`
  - `tag` becomes UNIQUE (case-insensitive, via lower(tag) unique index).
  - `name` becomes UNIQUE (case-insensitive, via lower(name) unique index).
  - `leader_id` becomes UNIQUE — one clan per leader.
  - New column `is_private` boolean NOT NULL DEFAULT false — when true, the clan
    can only be joined via a leader-approved invite.
- `clan_members`
  - UNIQUE (user_id) — a user can belong to only one clan at a time.
- `profiles`
  - New column `clan_tag` text — denormalized clan tag shown next to the nickname.
  - `clan_tag` is NOT writable by clients directly: UPDATE grants on profiles are
    narrowed to profile-content columns; `clan_tag` is only written by the
    SECURITY DEFINER functions in this migration (clan join/leave/create paths).

2. New tables
- `clan_invites`
  - `id` uuid PK
  - `clan_id` uuid NOT NULL REFERENCES clans(id) ON DELETE CASCADE
  - `inviter_id` uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
  - `invitee_id` uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
  - `status` text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled'))
  - `created_at` timestamptz NOT NULL DEFAULT now()
  - UNIQUE (clan_id, invitee_id) — one live invite per user per clan.
  - RLS enabled. Users see invites addressed to them OR invites for clans they lead.
    Invitees accept/decline their invites; clan leaders cancel invites for their clan.
  - Granted to authenticated only.

3. New functions (all SECURITY DEFINER, search_path locked, EXECUTE revoked from PUBLIC/anon)
- `clan_create(p_name, p_tag, p_description, p_is_private)` — creates a clan + leader
  membership atomically, normalizes tag (uppercase, 2-4 chars), enforces one-clan-per-user,
  sets the leader's profile.clan_tag.
- `clan_join(p_clan_id)` — server-side join: rejects private clans without a pending
  invite, enforces one-clan-per-user, refreshes profile.clan_tag, marks the invite used.
- `clan_leave()` — leaves the current clan; a leader of a non-empty clan must transfer
  leadership first, clears profile.clan_tag.
- `clan_invite(p_invitee_id, p_clan_id)` — leader-only; blocks if invitee already in a
  clan or already invited.
- `clan_respond(p_invite_id, p_accept)` — invitee accepts/declines; accept performs the
  join with all the same checks (one clan).
- `sync_profile_clan_tags()` — one-off backfill of profiles.clan_tag from clan_members.

4. Data cleanup before adding UNIQUE constraints
- Duplicate clan rows ("Soundscape Vit" / tag ZURN created twice within 1 second by the
  same leader) are merged: the row with more members is kept; members of the duplicate
  row that are not in the kept clan are moved, the empty duplicate is deleted.
- Users with memberships in 2 clans keep the older membership; the newer duplicate row
  is removed.

5. Security
- All new functions: REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated.
- RLS enabled on clan_invites with select/insert/update/delete policies scoped by
  auth.uid() (invitee) or clan leadership (inviter side).
- profiles UPDATE grant narrowed to profile-content columns (username, avatar_url, bio,
  xp, level, coins, is_online, last_seen, dm_privacy, friend_request_privacy,
  call_privacy) — clan_tag, is_premium, donate_coins, earned_coins and other
  server-owned columns are no longer client-writable.
- clan_members INSERT grant narrowed to (clan_id) — user_id/role come from the session
  or the SECURITY DEFINER functions.
- clans INSERT grant narrowed to (name, tag, description, is_private) — leader_id is
  server-derived.

6. Notes
- No BEGIN/COMMIT; idempotent guards via IF NOT EXISTS / DROP POLICY IF EXISTS.
- The clan_invites table is created before any policy references it.
*/

-- ── 0. Merge the duplicate clan rows ─────────────────────────────────────────
DO $$
DECLARE
  v_keep uuid;
  v_dup uuid;
BEGIN
  SELECT c.id INTO v_keep
  FROM clans c
  WHERE lower(c.name) = 'soundscape vit'
  ORDER BY (SELECT count(*) FROM clan_members m WHERE m.clan_id = c.id) DESC, c.created_at
  LIMIT 1;

  SELECT c.id INTO v_dup
  FROM clans c
  WHERE lower(c.name) = 'soundscape vit' AND c.id <> v_keep
  LIMIT 1;

  IF v_dup IS NOT NULL THEN
    INSERT INTO clan_members (clan_id, user_id, role, joined_at)
    SELECT v_keep, m.user_id, m.role, m.joined_at
    FROM clan_members m
    WHERE m.clan_id = v_dup
      AND NOT EXISTS (SELECT 1 FROM clan_members k WHERE k.clan_id = v_keep AND k.user_id = m.user_id)
    ON CONFLICT DO NOTHING;
    DELETE FROM clans WHERE id = v_dup;
  END IF;
END $$;

-- ── 1. Users with several clans keep only their oldest membership ────────────
DELETE FROM clan_members m
USING clan_members older
WHERE m.user_id = older.user_id
  AND older.joined_at < m.joined_at;

DELETE FROM clan_members m
USING clan_members older
WHERE m.user_id = older.user_id
  AND older.joined_at = m.joined_at
  AND older.id < m.id;

-- ── 2. New columns ───────────────────────────────────────────────────────────
ALTER TABLE clans ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clan_tag text;

-- ── 3. Backfill profile clan tags for leaders ───────────────────────────────
UPDATE profiles p
SET clan_tag = c.tag
FROM clan_members m
JOIN clans c ON c.id = m.clan_id
WHERE m.user_id = p.id AND m.role = 'leader';

CREATE UNIQUE INDEX IF NOT EXISTS clans_tag_lower_unique ON clans (lower(tag));
CREATE UNIQUE INDEX IF NOT EXISTS clans_name_lower_unique ON clans (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS clans_leader_unique ON clans (leader_id);
CREATE UNIQUE INDEX IF NOT EXISTS clan_members_user_unique ON clan_members (user_id);

-- ── 4. Search index ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS clans_name_trgm_idx ON clans USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS clans_tag_trgm_idx ON clans USING gin (tag gin_trgm_ops);

-- ── 5. clan_invites table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clan_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clan_id, invitee_id)
);

ALTER TABLE clan_invites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON clan_invites TO authenticated;

DROP POLICY IF EXISTS "clan_invites_select_involved" ON clan_invites;
CREATE POLICY "clan_invites_select_involved" ON clan_invites FOR SELECT
TO authenticated
USING (
  auth.uid() = invitee_id
  OR auth.uid() = inviter_id
  OR EXISTS (SELECT 1 FROM clans c WHERE c.id = clan_id AND c.leader_id = auth.uid())
);

DROP POLICY IF EXISTS "clan_invites_insert_leader" ON clan_invites;
CREATE POLICY "clan_invites_insert_leader" ON clan_invites FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = inviter_id
  AND EXISTS (SELECT 1 FROM clans c WHERE c.id = clan_id AND c.leader_id = auth.uid())
);

DROP POLICY IF EXISTS "clan_invites_update_invitee" ON clan_invites;
CREATE POLICY "clan_invites_update_invitee" ON clan_invites FOR UPDATE
TO authenticated
USING (auth.uid() = invitee_id)
WITH CHECK (auth.uid() = invitee_id);

DROP POLICY IF EXISTS "clan_invites_delete_involved" ON clan_invites;
CREATE POLICY "clan_invites_delete_involved" ON clan_invites FOR DELETE
TO authenticated
USING (
  auth.uid() = invitee_id
  OR EXISTS (SELECT 1 FROM clans c WHERE c.id = clan_id AND c.leader_id = auth.uid())
);

-- ── 6. Clan functions ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION clan_create(
  p_name text,
  p_tag text,
  p_description text DEFAULT '',
  p_is_private boolean DEFAULT false
)
RETURNS TABLE(ok boolean, reason text, clan_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tag text;
  v_clan clans;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  p_name := trim(coalesce(p_name, ''));
  v_tag := upper(regexp_replace(coalesce(p_tag, ''), '[^A-Za-zА-Яа-яЁё0-9]', '', 'g'));
  IF p_name = '' OR length(p_name) > 32 THEN reason := 'invalid_name'; RETURN; END IF;
  IF length(v_tag) < 2 OR length(v_tag) > 4 THEN reason := 'invalid_tag'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = v_uid) THEN reason := 'already_in_clan'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM clans WHERE lower(tag) = lower(v_tag)) THEN reason := 'tag_taken'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM clans WHERE lower(name) = lower(p_name)) THEN reason := 'name_taken'; RETURN; END IF;

  INSERT INTO clans (name, tag, description, is_private, leader_id)
  VALUES (p_name, v_tag, left(coalesce(p_description, ''), 300), coalesce(p_is_private, false), v_uid)
  RETURNING * INTO v_clan;

  INSERT INTO clan_members (clan_id, user_id, role) VALUES (v_clan.id, v_uid, 'leader');
  UPDATE profiles SET clan_tag = v_clan.tag WHERE id = v_uid;

  ok := true; reason := 'created'; clan_id := v_clan.id; RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION clan_join(p_clan_id uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clan clans;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT * INTO v_clan FROM clans WHERE id = p_clan_id;
  IF v_clan.id IS NULL THEN reason := 'no_clan'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = v_uid) THEN reason := 'already_in_clan'; RETURN; END IF;

  IF v_clan.is_private AND NOT EXISTS (
    SELECT 1 FROM clan_invites
    WHERE clan_id = p_clan_id AND invitee_id = v_uid AND status = 'pending'
  ) THEN
    reason := 'invite_required'; RETURN;
  END IF;

  BEGIN
    INSERT INTO clan_members (clan_id, user_id, role) VALUES (p_clan_id, v_uid, 'member');
  EXCEPTION WHEN unique_violation THEN
    reason := 'already_in_clan'; RETURN;
  END;

  UPDATE clan_invites SET status = 'accepted'
  WHERE clan_id = p_clan_id AND invitee_id = v_uid AND status = 'pending';

  UPDATE profiles SET clan_tag = v_clan.tag WHERE id = v_uid;
  ok := true; reason := 'joined'; RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION clan_leave()
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_clan_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT role, clan_id INTO v_role, v_clan_id FROM clan_members WHERE user_id = v_uid;
  IF v_clan_id IS NULL THEN reason := 'not_in_clan'; RETURN; END IF;
  IF v_role = 'leader' AND EXISTS (
    SELECT 1 FROM clan_members WHERE clan_id = v_clan_id AND user_id <> v_uid
  ) THEN
    reason := 'leader_must_transfer'; RETURN;
  END IF;
  DELETE FROM clan_members WHERE user_id = v_uid;
  IF v_role = 'leader' THEN
    DELETE FROM clans WHERE leader_id = v_uid;
  END IF;
  UPDATE profiles SET clan_tag = NULL WHERE id = v_uid;
  ok := true; reason := 'left'; RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION clan_invite(p_invitee_id uuid, p_clan_id uuid DEFAULT NULL)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clan_id uuid := p_clan_id;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF v_clan_id IS NULL THEN
    SELECT clan_id INTO v_clan_id FROM clan_members WHERE user_id = v_uid AND role = 'leader';
  END IF;
  IF v_clan_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM clans WHERE id = v_clan_id AND leader_id = v_uid
  ) THEN reason := 'not_leader'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_invitee_id) THEN reason := 'no_user'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = p_invitee_id) THEN reason := 'already_in_clan'; RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM clan_invites
    WHERE clan_id = v_clan_id AND invitee_id = p_invitee_id AND status = 'pending'
  ) THEN reason := 'already_invited'; RETURN; END IF;

  INSERT INTO clan_invites (clan_id, inviter_id, invitee_id)
  VALUES (v_clan_id, v_uid, p_invitee_id)
  ON CONFLICT (clan_id, invitee_id) DO UPDATE
    SET status = 'pending', created_at = now(), inviter_id = v_uid
    WHERE clan_invites.status <> 'pending';

  ok := true; reason := 'invited'; RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION clan_respond(p_invite_id uuid, p_accept boolean)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invite clan_invites;
  v_clan clans;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT * INTO v_invite FROM clan_invites WHERE id = p_invite_id;
  IF v_invite.id IS NULL OR v_invite.invitee_id <> v_uid OR v_invite.status <> 'pending' THEN
    reason := 'no_invite'; RETURN;
  END IF;
  IF NOT p_accept THEN
    UPDATE clan_invites SET status = 'declined' WHERE id = p_invite_id;
    ok := true; reason := 'declined'; RETURN;
  END IF;

  SELECT * INTO v_clan FROM clans WHERE id = v_invite.clan_id;
  IF v_clan.id IS NULL THEN reason := 'no_clan'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = v_uid) THEN reason := 'already_in_clan'; RETURN; END IF;

  BEGIN
    INSERT INTO clan_members (clan_id, user_id, role) VALUES (v_clan.id, v_uid, 'member');
  EXCEPTION WHEN unique_violation THEN
    reason := 'already_in_clan'; RETURN;
  END;

  UPDATE clan_invites SET status = 'accepted' WHERE id = p_invite_id;
  UPDATE profiles SET clan_tag = v_clan.tag WHERE id = v_uid;
  ok := true; reason := 'accepted'; RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION sync_profile_clan_tags()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE profiles p
  SET clan_tag = c.tag
  FROM clan_members m
  JOIN clans c ON c.id = m.clan_id
  WHERE m.user_id = p.id;
  UPDATE profiles p
  SET clan_tag = NULL
  WHERE p.clan_tag IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clan_members m WHERE m.user_id = p.id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION clan_create(text, text, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION clan_join(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION clan_leave() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION clan_invite(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION clan_respond(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sync_profile_clan_tags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION clan_create(text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION clan_join(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION clan_leave() TO authenticated;
GRANT EXECUTE ON FUNCTION clan_invite(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION clan_respond(uuid, boolean) TO authenticated;

-- ── 7. Tighten grants: clan_tag and membership rows are not client-writable ──
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (username, avatar_url, bio, xp, level, coins, is_online, last_seen, dm_privacy, friend_request_privacy, call_privacy) ON profiles TO authenticated;
REVOKE INSERT ON clan_members FROM authenticated;
GRANT INSERT (clan_id) ON clan_members TO authenticated;
REVOKE INSERT ON clans FROM authenticated;
GRANT INSERT (name, tag, description, is_private) ON clans TO authenticated;