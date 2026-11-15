/*
# Audio and video calls with server-side "who can call me" checks

1. New table
- `calls`: one row per call attempt.
  - `caller_id`, `callee_id` (auth users), `kind` ('audio' or 'video').
  - `status`: 'ringing', 'active', 'ended', 'declined', 'cancelled', 'missed'.
  - `created_at`, `answered_at`, `ended_at`.
  - A user cannot call themselves.

2. Functions (the only way to change calls)
- `start_call(p_callee_id, p_kind)`: checks the callee's "who can call me" setting (`call_privacy`): everyone, friends only, selected people (allowlist scope 'call'), or nobody. Also rejects blocked pairs in either direction and busy participants. Calls ringing for more than 60 seconds are marked 'missed' first.
- `answer_call`, `decline_call`, `end_call`: state changes limited to the people in the call.

3. Security
- RLS is enabled. Only participants can read their calls.
- Clients have no INSERT/UPDATE/DELETE on `calls`; those happen only through the functions above.
- The functions are callable by signed-in users only.
- The table is added to realtime so both sides receive ring and status changes.

4. Notes
- Call audio and video travel peer to peer (WebRTC). The database only stores the call state.
*/

CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('audio', 'video')),
  status text NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'active', 'ended', 'declined', 'cancelled', 'missed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  CONSTRAINT calls_not_self CHECK (caller_id <> callee_id)
);

CREATE INDEX IF NOT EXISTS calls_callee_status_idx ON public.calls (callee_id, status);
CREATE INDEX IF NOT EXISTS calls_caller_status_idx ON public.calls (caller_id, status);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls REPLICA IDENTITY FULL;

GRANT SELECT ON public.calls TO authenticated;

DROP POLICY IF EXISTS "calls_select_participants" ON public.calls;
CREATE POLICY "calls_select_participants" ON public.calls FOR SELECT
TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE OR REPLACE FUNCTION public.start_call(p_callee_id uuid, p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_privacy text;
  v_call_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_kind NOT IN ('audio', 'video') THEN
    RAISE EXCEPTION 'Invalid call type';
  END IF;
  IF p_callee_id IS NULL OR p_callee_id = v_user THEN
    RAISE EXCEPTION 'Invalid recipient';
  END IF;

  UPDATE public.calls
  SET status = 'missed', ended_at = now()
  WHERE status = 'ringing'
    AND created_at < now() - interval '60 seconds'
    AND (caller_id IN (v_user, p_callee_id) OR callee_id IN (v_user, p_callee_id));

  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id = v_user AND b.blocked_id = p_callee_id)
       OR (b.blocker_id = p_callee_id AND b.blocked_id = v_user)
  ) THEN
    RAISE EXCEPTION 'Звонок недоступен';
  END IF;

  SELECT call_privacy INTO v_privacy FROM public.profiles WHERE id = p_callee_id;
  IF v_privacy IS NULL THEN
    RAISE EXCEPTION 'Пользователь не найден';
  END IF;

  IF v_privacy = 'nobody' THEN
    RAISE EXCEPTION 'Этот пользователь не принимает звонки';
  END IF;
  IF v_privacy = 'friends' AND NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = v_user AND f.addressee_id = p_callee_id)
        OR (f.requester_id = p_callee_id AND f.addressee_id = v_user))
  ) THEN
    RAISE EXCEPTION 'Этот пользователь принимает звонки только от друзей';
  END IF;
  IF v_privacy = 'specific' AND NOT EXISTS (
    SELECT 1 FROM public.access_allowlist a
    WHERE a.owner_id = p_callee_id AND a.allowed_id = v_user AND a.scope = 'call'
  ) THEN
    RAISE EXCEPTION 'Этот пользователь принимает звонки только от выбранных пользователей';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.calls
    WHERE status IN ('ringing', 'active')
      AND (caller_id IN (v_user, p_callee_id) OR callee_id IN (v_user, p_callee_id))
  ) THEN
    RAISE EXCEPTION 'Один из участников уже в звонке';
  END IF;

  INSERT INTO public.calls (caller_id, callee_id, kind)
  VALUES (v_user, p_callee_id, p_kind)
  RETURNING id INTO v_call_id;

  RETURN v_call_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.answer_call(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.calls
  SET status = 'active', answered_at = now()
  WHERE id = p_call_id AND callee_id = auth.uid() AND status = 'ringing';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Звонок уже недоступен';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_call(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.calls
  SET status = 'declined', ended_at = now()
  WHERE id = p_call_id AND callee_id = auth.uid() AND status = 'ringing';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Звонок уже недоступен';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_call(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.calls
  SET status = CASE
        WHEN status = 'active' THEN 'ended'
        WHEN caller_id = auth.uid() THEN 'cancelled'
        ELSE 'declined'
      END,
      ended_at = now()
  WHERE id = p_call_id
    AND status IN ('ringing', 'active')
    AND (caller_id = auth.uid() OR callee_id = auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_call(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.answer_call(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decline_call(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.end_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_call(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.answer_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_call(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calls'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;
