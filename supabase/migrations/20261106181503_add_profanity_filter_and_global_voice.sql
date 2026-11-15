/*
# Profanity filter for chats and nicknames, voice messages in global chat

1. New functions
- `is_profane_text(text)`: returns true when text contains Russian profanity, including
  Russian words typed with Latin lookalike letters, or Russian words transliterated into Latin.
- `mask_profanity(text)`: replaces every profane word with "***".
- `mask_message_content()` trigger: masks profanity in new messages of the global and private chats.
- `reject_profane_username()` trigger: refuses profile usernames containing profanity.

2. Modified tables
- `chat_messages`: new columns `voice_path` (text) and `voice_duration` (int) for voice messages.

3. Security
- Helper functions are not callable by anon or authenticated; they only run inside triggers.
- No policy changes. Existing grants on chat_messages already cover the new columns.

4. Notes
- Matching is applied on letters only, so punctuation or spacing cannot hide a word.
- Migration is idempotent: columns use IF NOT EXISTS, functions use CREATE OR REPLACE, triggers are dropped before creation.
*/

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS voice_path text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS voice_duration int;

CREATE OR REPLACE FUNCTION public.is_profane_text(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    regexp_replace(
      translate(lower(replace(coalesce(p, ''), 'ё', 'е')), 'aeopckxyhmt', 'аеорскхунмт'),
      '[^а-я]', '', 'g'
    ) ~ 'хуй|хуе|хуя|хую|хуи|пизд|ебан|ебат|ебал|бляд|блят|сука|суки|сучк|сукин|пидор|пидар|пидр|мудак|гандон|гондон|залуп|долбоеб|долбаеб|уеба|ебуч|манда|шлюх|дрочи|дрочк|шалав'
    OR regexp_replace(lower(coalesce(p, '')), '[^a-z]', '', 'g')
      ~ 'huy|hui|pizd|blyat|blya|suka|eban|ebat|pidor|pidar|mudak|dolboeb|dolbaeb|gandon|gondon';
$$;

CREATE OR REPLACE FUNCTION public.mask_profanity(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(string_agg(x, ' ' ORDER BY n), '')
  FROM (
    SELECT CASE WHEN public.is_profane_text(w) THEN '***' ELSE w END AS x, n
    FROM regexp_split_to_table(coalesce(p, ''), '\s+') WITH ORDINALITY AS t(w, n)
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.mask_message_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.content := public.mask_profanity(NEW.content);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_profane_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.is_profane_text(NEW.username) THEN
    RAISE EXCEPTION 'Недопустимый никнейм' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_profane_text(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mask_profanity(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mask_message_content() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_profane_username() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mask_profanity_chat_messages ON chat_messages;
CREATE TRIGGER mask_profanity_chat_messages
  BEFORE INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.mask_message_content();

DROP TRIGGER IF EXISTS mask_profanity_private_messages ON private_messages;
CREATE TRIGGER mask_profanity_private_messages
  BEFORE INSERT ON private_messages
  FOR EACH ROW EXECUTE FUNCTION public.mask_message_content();

DROP TRIGGER IF EXISTS reject_profane_username_profiles ON profiles;
CREATE TRIGGER reject_profane_username_profiles
  BEFORE INSERT OR UPDATE OF username ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.reject_profane_username();
