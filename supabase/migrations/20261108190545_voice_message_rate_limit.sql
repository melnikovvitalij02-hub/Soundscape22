/*
# Limit voice message spam

1. What changes
- Each user can send at most 10 voice messages per rolling 10 minutes.
- The limit applies to private messages and to the public chat.
- Texts and other messages are not affected.

2. Modified tables
- `private_messages`: new BEFORE INSERT trigger.
- `chat_messages`: new BEFORE INSERT trigger.

3. Security
- The check runs on the server, so the app cannot bypass it.
- The rate-check function is SECURITY DEFINER with an empty search_path.
- EXECUTE is revoked from PUBLIC, anon and authenticated; triggers still fire.

4. Notes
- Inserts over the limit fail with the message "voice_rate_limit".
- Safe to re-run: triggers and functions are replaced idempotently.
*/

CREATE OR REPLACE FUNCTION public.enforce_voice_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  recent_count integer;
  owner_col text := TG_ARGV[0];
  owner_id uuid;
BEGIN
  IF NEW.voice_path IS NULL THEN
    RETURN NEW;
  END IF;

  IF owner_col = 'sender_id' THEN
    owner_id := NEW.sender_id;
    SELECT count(*) INTO recent_count
    FROM public.private_messages
    WHERE sender_id = owner_id
      AND voice_path IS NOT NULL
      AND created_at > now() - interval '10 minutes';
  ELSE
    owner_id := NEW.user_id;
    SELECT count(*) INTO recent_count
    FROM public.chat_messages
    WHERE user_id = owner_id
      AND voice_path IS NOT NULL
      AND created_at > now() - interval '10 minutes';
  END IF;

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'voice_rate_limit' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_voice_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_voice_rate_limit_private ON public.private_messages;
CREATE TRIGGER enforce_voice_rate_limit_private
BEFORE INSERT ON public.private_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_voice_rate_limit('sender_id');

DROP TRIGGER IF EXISTS enforce_voice_rate_limit_chat ON public.chat_messages;
CREATE TRIGGER enforce_voice_rate_limit_chat
BEFORE INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_voice_rate_limit('user_id');
