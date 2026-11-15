/*
# Nickname rules, message privacy, blocking, message deletion, global voice playback

1. Nicknames
- `is_profane_text` now normalizes text before matching: yo to ye, digit and symbol lookalikes (0,1,3,4,5,7,8,@,$), Latin lookalike letters, and repeated letters collapsed.
- `profiles.username` is unique ignoring case.
- Nicknames with spaces are rejected; near-profane variants are rejected with "Этот ник уже занят".

2. Private message privacy
- `profiles.dm_privacy`: 'everyone' (default), 'friends', 'nobody'.
- Enforced by trigger on private_messages: blocked pairs, 'nobody', and 'friends' (requires accepted friendship).
- Friend requests are refused when the target is blocked or set to 'nobody'.

3. Blocking
- `blocked_users` table, each user manages only their own rows.

4. Message deletion
- Sender may delete own private message for everyone (DELETE policy).
- `private_message_hides` lets any participant hide a message only for themselves.

5. Global voice playback
- Voice files referenced by chat_messages become readable to signed-in users.

Security
- Trigger functions run as SECURITY DEFINER so they can see blocks regardless of RLS; they are not callable by anon or authenticated.
- All new tables have RLS enabled and only the needed grants.
*/

CREATE OR REPLACE FUNCTION public.is_profane_text(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    regexp_replace(
      regexp_replace(translate(n.s, 'aeopckxyhmt', 'аеорскхунмт'), '[^а-я]', '', 'g'),
      '(.)\1+', '\1', 'g'
    ) ~ 'хуй|хуе|хуя|хую|хуи|пизд|ебан|ебат|ебал|бляд|блят|сука|суки|сучк|сукин|пидор|пидар|пидр|мудак|гандон|гондон|залуп|долбоеб|долбаеб|уеба|ебуч|манда|шлюх|дрочи|дрочк|шалав'
    OR regexp_replace(
      regexp_replace(n.s, '[^a-z]', '', 'g'),
      '(.)\1+', '\1', 'g'
    ) ~ 'huy|hui|pizd|blyat|blya|suka|eban|ebat|pidor|pidar|mudak|dolboeb|dolbaeb|gandon|gondon'
  FROM (
    SELECT translate(replace(lower(coalesce(p, '')), 'ё', 'е'), '0134578@$', 'оиеаствас') AS s
  ) n;
$$;

CREATE OR REPLACE FUNCTION public.reject_profane_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF new.username ~ '\s' THEN
    RAISE EXCEPTION 'В нике нельзя использовать пробелы' USING ERRCODE = 'check_violation';
  END IF;
  IF public.is_profane_text(new.username) THEN
    RAISE EXCEPTION 'Этот ник уже занят' USING ERRCODE = 'check_violation';
  END IF;
  RETURN new;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dm_privacy text NOT NULL DEFAULT 'everyone'
  CHECK (dm_privacy IN ('everyone', 'friends', 'nobody'));
GRANT UPDATE (dm_privacy) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
CREATE POLICY "blocked_select_own" ON public.blocked_users FOR SELECT
  TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "blocked_insert_own" ON public.blocked_users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocked_delete_own" ON public.blocked_users FOR DELETE
  TO authenticated USING (auth.uid() = blocker_id);

CREATE TABLE IF NOT EXISTS public.private_message_hides (
  message_id uuid NOT NULL REFERENCES public.private_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.private_message_hides ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.private_message_hides TO authenticated;
CREATE POLICY "hides_select_own" ON public.private_message_hides FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "hides_insert_own" ON public.private_message_hides FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.private_messages pm
      WHERE pm.id = message_id AND (pm.sender_id = auth.uid() OR pm.recipient_id = auth.uid())
    )
  );

CREATE POLICY "delete_own_sent_messages" ON public.private_messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_id);

CREATE OR REPLACE FUNCTION public.enforce_private_message_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_friend_request_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  addressee_privacy text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id = NEW.addressee_id AND b.blocked_id = NEW.requester_id)
       OR (b.blocker_id = NEW.requester_id AND b.blocked_id = NEW.addressee_id)
  ) THEN
    RAISE EXCEPTION 'Запрос в друзья не отправлен' USING ERRCODE = 'check_violation';
  END IF;

  SELECT dm_privacy INTO addressee_privacy FROM public.profiles WHERE id = NEW.addressee_id;
  IF addressee_privacy = 'nobody' THEN
    RAISE EXCEPTION 'Этот пользователь не принимает запросы в друзья' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_private_message_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_friend_request_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_private_message_rules ON public.private_messages;
CREATE TRIGGER enforce_private_message_rules
  BEFORE INSERT ON public.private_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_private_message_rules();

DROP TRIGGER IF EXISTS enforce_friend_request_rules ON public.friendships;
CREATE TRIGGER enforce_friend_request_rules
  BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_friend_request_rules();

CREATE POLICY "voice_messages_read_chat" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'voice-messages'
    AND EXISTS (SELECT 1 FROM public.chat_messages cm WHERE cm.voice_path = objects.name)
  );
