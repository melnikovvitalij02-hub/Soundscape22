/*
# Fix one cosmetic per type

1. Purpose
- Ensure a user can have only one equipped cosmetic for each type: skin, frame, theme, or effect.

2. Modified database object
- Adds `public.equip_cosmetic(p_cosmetic_id uuid)`.
- The function checks ownership, finds the selected item's type, unequips every owned item of that type, then equips the selected item.

3. Security
- The function is `SECURITY DEFINER` with a fixed `search_path`.
- The acting user is always taken from `auth.uid()`.
- Anonymous execution is denied; authenticated users may execute it.

4. Important notes
- No user data is deleted.
- The existing `user_cosmetics` records remain intact; only `is_equipped` changes.
*/

CREATE OR REPLACE FUNCTION public.equip_cosmetic(p_cosmetic_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT c.type INTO v_type
  FROM public.cosmetic_items c
  JOIN public.user_cosmetics uc ON uc.cosmetic_id = c.id
  WHERE c.id = p_cosmetic_id
    AND uc.user_id = auth.uid();

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Cosmetic is not owned';
  END IF;

  UPDATE public.user_cosmetics uc
  SET is_equipped = false
  FROM public.cosmetic_items c
  WHERE uc.user_id = auth.uid()
    AND uc.cosmetic_id = c.id
    AND c.type = v_type;

  UPDATE public.user_cosmetics
  SET is_equipped = true
  WHERE user_id = auth.uid()
    AND cosmetic_id = p_cosmetic_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.equip_cosmetic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.equip_cosmetic(uuid) TO authenticated;
