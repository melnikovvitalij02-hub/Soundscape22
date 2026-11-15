/*
# Fix profanity check for capitalized words with "Ё"

1. Modified function
- `is_profane_text(text)`: lowercases the text before replacing "ё" with "е", so words like "Ёбаный" are detected.

2. Security
- Function signature, grants and triggers are unchanged.

3. Notes
- CREATE OR REPLACE keeps the migration safe to re-run.
*/

CREATE OR REPLACE FUNCTION public.is_profane_text(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    regexp_replace(
      translate(replace(lower(coalesce(p, '')), 'ё', 'е'), 'aeopckxyhmt', 'аеорскхунмт'),
      '[^а-я]', '', 'g'
    ) ~ 'хуй|хуе|хуя|хую|хуи|пизд|ебан|ебат|ебал|бляд|блят|сука|суки|сучк|сукин|пидор|пидар|пидр|мудак|гандон|гондон|залуп|долбоеб|долбаеб|уеба|ебуч|манда|шлюх|дрочи|дрочк|шалав'
    OR regexp_replace(lower(coalesce(p, '')), '[^a-z]', '', 'g')
      ~ 'huy|hui|pizd|blyat|blya|suka|eban|ebat|pidor|pidar|mudak|dolboeb|dolbaeb|gandon|gondon';
$$;
