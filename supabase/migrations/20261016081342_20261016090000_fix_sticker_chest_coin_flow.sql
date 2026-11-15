/*
# Fix sticker chest purchase flow

1. Purpose
- Make sticker chest opening use the regular in-game `profiles.coins` balance.
- Keep the balance deduction, random reward, ownership record, and transaction log in one server-side operation.

2. Modified database object
- Replaces `public.open_sticker_chest()` without changing table structure or deleting data.
- The function atomically deducts 15 regular coins, selects one random sticker, stores ownership, and returns the reward.

3. Security
- The function remains `SECURITY DEFINER` with a fixed `search_path`.
- The caller is always taken from `auth.uid()`; no client-supplied user id is accepted.
- Execution remains available to authenticated users and is not granted to anon users.

4. Important notes
- If no sticker exists, the balance is not changed.
- Duplicate ownership does not create duplicate rows, but opening the chest still costs 15 coins and records the transaction.
*/

CREATE OR REPLACE FUNCTION public.open_sticker_chest()
RETURNS TABLE(sticker_id uuid, sticker_name text, sticker_emoji text, sticker_rarity text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price integer := 15;
  v_sticker stickers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_sticker
  FROM public.stickers
  ORDER BY random()
  LIMIT 1;

  IF v_sticker.id IS NULL THEN
    RAISE EXCEPTION 'No stickers available';
  END IF;

  UPDATE public.profiles
  SET coins = coins - v_price,
      updated_at = now()
  WHERE id = auth.uid()
    AND coins >= v_price;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.user_stickers (user_id, sticker_id)
  VALUES (auth.uid(), v_sticker.id)
  ON CONFLICT (user_id, sticker_id) DO NOTHING;

  INSERT INTO public.coin_transactions (user_id, amount, balance_after, transaction_type, description, related_id)
  SELECT auth.uid(), -v_price, p.coins, 'sticker_chest', 'Открытие сундука со стикером', v_sticker.id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN QUERY
  SELECT v_sticker.id, v_sticker.name, v_sticker.emoji, v_sticker.rarity::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_sticker_chest() FROM anon;
GRANT EXECUTE ON FUNCTION public.open_sticker_chest() TO authenticated;
