/*
# Recognize digit 6 as Latin "b" in mixed words

1. Normalization
- `is_profane_text` adds a third variant that maps "6" to Latin "b", so words like "Dol6aeb" are recognized.

2. Security
- Pure function; grants unchanged.
*/

CREATE OR REPLACE FUNCTION public.is_profane_text(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.is_profane_core(translate(b, '0134578@$6', 'оиеаствасб'))
      OR public.is_profane_core(translate(b, '0134578@$6', 'уиеаствасб'))
      OR public.is_profane_core(translate(b, '0134578@$6', 'оиеаствасb'))
  FROM (SELECT replace(lower(coalesce(p, '')), 'ё', 'е') AS b) q;
$$;
