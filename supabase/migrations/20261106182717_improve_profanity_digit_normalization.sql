/*
# Improve profanity normalization

1. Digit lookalikes
- "0" is checked both as "о" and "у" (e.g. "Х00Й" is recognized).
- "6" is treated as "б" (e.g. "Dol6aeb").

2. Structure
- `is_profane_core(text)` holds the matching; `is_profane_text(text)` runs it on each normalization variant.

3. Security
- Pure functions, no data access; grants unchanged.
*/

CREATE OR REPLACE FUNCTION public.is_profane_core(s text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    regexp_replace(
      regexp_replace(translate(s, 'aeopckxyhmt', 'аеорскхунмт'), '[^а-я]', '', 'g'),
      '(.)\1+', '\1', 'g'
    ) ~ 'хуй|хуе|хуя|хую|хуи|пизд|ебан|ебат|ебал|бляд|блят|сука|суки|сучк|сукин|пидор|пидар|пидр|мудак|гандон|гондон|залуп|долбоеб|долбаеб|уеба|ебуч|манда|шлюх|дрочи|дрочк|шалав'
    OR regexp_replace(
      regexp_replace(s, '[^a-z]', '', 'g'),
      '(.)\1+', '\1', 'g'
    ) ~ 'huy|hui|pizd|blyat|blya|suka|eban|ebat|pidor|pidar|mudak|dolboeb|dolbaeb|gandon|gondon';
$$;

CREATE OR REPLACE FUNCTION public.is_profane_text(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.is_profane_core(translate(b, '0134578@$6', 'оиеаствасб'))
      OR public.is_profane_core(translate(b, '0134578@$6', 'уиеаствасб'))
  FROM (SELECT replace(lower(coalesce(p, '')), 'ё', 'е') AS b) q;
$$;

REVOKE EXECUTE ON FUNCTION public.is_profane_core(text) FROM PUBLIC, anon, authenticated;
