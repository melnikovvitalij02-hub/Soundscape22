/*
# Access settings: friend requests, messages, calls

1. Changes to profiles
- `friend_request_privacy` (everyone / nobody / specific): who may send friend requests.
- `call_privacy` (everyone / friends / nobody / specific): who may call. Stored now; enforced when calls are added.
- `dm_privacy` gains the value `specific` (only users on the allowlist may write).

2. New table `access_allowlist`
- Stores "specific users" choices: owner_id allows allowed_id for one scope (friend_request, message, call).
- Owners can add and remove only their own rows; nobody can read another user's list.

3. Enforcement
- Friend request trigger: checks friend_request_privacy and dm_privacy 'nobody'.
- Private message trigger: checks dm_privacy 'specific' against the allowlist.

4. Security
- RLS enabled on access_allowlist. Policies: select, insert, delete only for owner_id = auth.uid().
- authenticated gets SELECT, INSERT, DELETE on access_allowlist and UPDATE on the two new profile columns only.
- Trigger functions stay SECURITY DEFINER with search_path set to empty.
*/

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_dm_privacy_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_dm_privacy_check
  CHECK (dm_privacy = ANY (ARRAY['everyone'::text, 'friends'::text, 'nobody'::text, 'specific'::text]));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS friend_request_privacy text NOT NULL DEFAULT 'everyone'
  CHECK (friend_request_privacy IN ('everyone', 'nobody', 'specific'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS call_privacy text NOT NULL DEFAULT 'everyone'
  CHECK (call_privacy IN ('everyone', 'friends', 'nobody', 'specific'));

GRANT UPDATE (friend_request_privacy, call_privacy) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.access_allowlist (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allowed_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('friend_request', 'message', 'call')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, allowed_id, scope),
  CHECK (owner_id <> allowed_id)
);

CREATE INDEX IF NOT EXISTS access_allowlist_allowed_idx ON public.access_allowlist (allowed_id);

ALTER TABLE public.access_allowlist ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.access_allowlist TO authenticated;

DROP POLICY IF EXISTS "allowlist_select_own" ON public.access_allowlist;
CREATE POLICY "allowlist_select_own" ON public.access_allowlist FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "allowlist_insert_own" ON public.access_allowlist;
CREATE POLICY "allowlist_insert_own" ON public.access_allowlist FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "allowlist_delete_own" ON public.access_allowlist;
CREATE POLICY "allowlist_delete_own" ON public.access_allowlist FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.enforce_friend_request_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  addressee_privacy text;
  addressee_request_privacy text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id = NEW.addressee_id AND b.blocked_id = NEW.requester_id)
       OR (b.blocker_id = NEW.requester_id AND b.blocked_id = NEW.addressee_id)
  ) THEN
    RAISE EXCEPTION 'Запрос в друзья не отправлен' USING ERRCODE = 'check_violation';
  END IF;

  SELECT dm_privacy, friend_request_privacy
    INTO addressee_privacy, addressee_request_privacy
    FROM public.profiles WHERE id = NEW.addressee_id;

  IF addressee_privacy = 'nobody' OR addressee_request_privacy = 'nobody' THEN
    RAISE EXCEPTION 'Этот пользователь не принимает запросы в друзья' USING ERRCODE = 'check_violation';
  END IF;

  IF addressee_request_privacy = 'specific' AND NOT EXISTS (
    SELECT 1 FROM public.access_allowlist a
    WHERE a.owner_id = NEW.addressee_id AND a.allowed_id = NEW.requester_id AND a.scope = 'friend_request'
  ) THEN
    RAISE EXCEPTION 'Этот пользователь принимает запросы в друзья только от выбранных пользователей' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_private_message_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  recipient_privacy text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id = NEW.recipient_id AND b.blocked_id = NEW.sender_id)
       OR (b.blocker_id = NEW.sender_id AND b.blocked_id = NEW.recipient_id)
  ) THEN
    RAISE EXCEPTION 'Сообщение не отправлено' USING ERRCODE = 'check_violation';
  END IF;

  SELECT dm_privacy INTO recipient_privacy FROM public.profiles WHERE id = NEW.recipient_id;
  IF recipient_privacy = 'nobody' THEN
    RAISE EXCEPTION 'Этот пользователь не принимает сообщения' USING ERRCODE = 'check_violation';
  END IF;
  IF recipient_privacy = 'friends' AND NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = NEW.sender_id AND f.addressee_id = NEW.recipient_id)
        OR (f.requester_id = NEW.recipient_id AND f.addressee_id = NEW.sender_id))
  ) THEN
    RAISE EXCEPTION 'Этот пользователь принимает сообщения только от друзей' USING ERRCODE = 'check_violation';
  END IF;
  IF recipient_privacy = 'specific' AND NOT EXISTS (
    SELECT 1 FROM public.access_allowlist a
    WHERE a.owner_id = NEW.recipient_id AND a.allowed_id = NEW.sender_id AND a.scope = 'message'
  ) THEN
    RAISE EXCEPTION 'Этот пользователь принимает сообщения только от выбранных пользователей' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
