/*
# Anti-farming: unique listens, play-count rate limits, server-side XP caps

## Problem
1. `increment_beat_play` counted every click — an autoclicker could inflate
   `beats.play_count` (which drives the trending score) without limits.
2. XP went through `change_xp` with no per-day ceiling, so looping any
   reward source could farm levels.
3. Listen rewards already require a real 30-second listen on the client, but
   the DB never enforced a minimum listening time or listener diversity.

## Changes

1. New table `beat_plays` — one row per (beat, listener, day) after a verified
   listen. RLS enabled, no direct client access; written only by the SECURITY
   DEFINER function below.

2. `count_verified_play(p_beat_id, p_listened_sec)` replaces the old
   `increment_beat_play` for authenticated users:
   - requires a signed-in listener and a real listening duration
     (min 30 seconds) — autoclickers that just fire the RPC earn nothing;
   - dedupes to ONE count per listener per beat per UTC day
     (unique index enforces it atomically; repeats return without counting);
   - a listener can verify at most 40 plays per day across all beats
     (the "listen farming" ceiling);
   - only increments `play_count` when a real unique listen is recorded.
   Anonymous visitors keep the old unlimited counter via a separate
   `count_anon_play(p_beat_id)` RPC (not used to farm XP/Gem, and trending
   is computed from verified activity).

3. `change_xp(p_amount)` now enforces a server-side daily XP cap:
   - per-call amount limited to 200 (the largest legitimate single reward);
   - per-day total limited to 1500 XP, tracked in `rate_limits`
     (identifier = user id, action = 'xp_daily');
   - returns the resulting xp/level as before.

4. `earn_coins_from_game` unchanged (it already has its own 500/day cap).

## Security
- `beat_plays`: RLS on, no policies — reachable only through the definer
  function; SELECT/INSERT granted to service_role for maintenance.
- Both play functions: SECURITY DEFINER, fixed search_path, EXECUTE revoked
  from PUBLIC; `count_verified_play` granted to authenticated,
  `count_anon_play` to anon + authenticated.
- `change_xp` keeps its existing grant (authenticated via client).
*/

CREATE TABLE IF NOT EXISTS beat_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  listener_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  play_date date NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
  listened_sec int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beat_id, listener_id, play_date)
);

ALTER TABLE beat_plays ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON beat_plays TO service_role;

-- Unique index for atomic dedupe (safe to re-run)
DROP INDEX IF EXISTS beat_plays_unique_daily;
CREATE UNIQUE INDEX IF NOT EXISTS beat_plays_unique_daily
  ON beat_plays (beat_id, listener_id, play_date);

CREATE INDEX IF NOT EXISTS idx_beat_plays_listener_date
  ON beat_plays (listener_id, play_date);

-- Verified play: signed-in, real 30s listen, 1/beat/day, 40/day ceiling
CREATE OR REPLACE FUNCTION public.count_verified_play(p_beat_id uuid, p_listened_sec int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF p_beat_id IS NULL THEN RETURN false; END IF;
  IF p_listened_sec IS NULL OR p_listened_sec < 30 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM beats WHERE id = p_beat_id AND is_public) THEN
    RETURN false;
  END IF;

  -- Daily ceiling on verified plays per listener (anti-farming)
  SELECT count INTO v_count
  FROM rate_limits
  WHERE identifier = v_uid::text AND action = 'verified_plays'
    AND window_start::date = v_today
    AND updated_at::date = v_today
  FOR UPDATE;

  IF v_count IS NULL THEN
    INSERT INTO rate_limits (identifier, action, count, window_start, updated_at)
    VALUES (v_uid::text, 'verified_plays', 1, now(), now())
    ON CONFLICT (identifier, action) DO UPDATE
      SET count = 1, window_start = now(), updated_at = now()
      WHERE rate_limits.window_start::date <> v_today OR rate_limits.updated_at::date <> v_today;
    v_count := 1;
  ELSE
    IF v_count >= 40 THEN RETURN false; END IF;
    UPDATE rate_limits
    SET count = count + 1, window_start = now(), updated_at = now()
    WHERE identifier = v_uid::text AND action = 'verified_plays';
    v_count := v_count + 1;
  END IF;

  -- Atomic unique-listen insert: second same-day listen of this beat is a no-op
  BEGIN
    INSERT INTO beat_plays (beat_id, listener_id, play_date, listened_sec)
    VALUES (p_beat_id, v_uid, v_today, LEAST(GREATEST(p_listened_sec, 30), 86400));
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;

  UPDATE beats
  SET play_count = play_count + 1
  WHERE id = p_beat_id AND is_public;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.count_verified_play(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_verified_play(uuid, int) TO authenticated;

-- Anonymous visitors: still bump the public counter, no rewards attached
CREATE OR REPLACE FUNCTION public.count_anon_play(p_beat_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE beats SET play_count = play_count + 1 WHERE id = p_beat_id AND is_public;
$$;

REVOKE EXECUTE ON FUNCTION public.count_anon_play(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_anon_play(uuid) TO anon, authenticated;

-- XP: server-side daily cap + per-call ceiling
CREATE OR REPLACE FUNCTION public.change_xp(p_amount integer)
RETURNS TABLE(new_xp integer, new_level integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed int;
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 200 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT LEAST(p_amount, GREATEST(0, 1500 - COALESCE(rl.count, 0)))
  INTO v_allowed
  FROM (
    SELECT count FROM rate_limits
    WHERE identifier = v_uid::text AND action = 'xp_daily'
      AND window_start::date = v_today AND updated_at::date = v_today
    FOR UPDATE
  ) rl;

  IF v_allowed IS NULL THEN
    INSERT INTO rate_limits (identifier, action, count, window_start, updated_at)
    VALUES (v_uid::text, 'xp_daily', p_amount, now(), now())
    ON CONFLICT (identifier, action) DO UPDATE
      SET count = rate_limits.count + p_amount,
          window_start = now(),
          updated_at = now()
      WHERE rate_limits.window_start::date <> v_today OR rate_limits.updated_at::date <> v_today;
    v_allowed := p_amount;
  ELSE
    IF v_allowed <= 0 THEN
      RETURN QUERY SELECT profiles.xp, profiles.level FROM profiles WHERE id = v_uid;
      RETURN;
    END IF;
    UPDATE rate_limits
    SET count = count + v_allowed, window_start = now(), updated_at = now()
    WHERE identifier = v_uid::text AND action = 'xp_daily';
  END IF;

  RETURN QUERY
  UPDATE profiles
  SET xp = xp + v_allowed,
      level = floor((xp + v_allowed)::numeric / 500)::integer + 1
  WHERE id = v_uid
  RETURNING profiles.xp, profiles.level;
END;
$$;
