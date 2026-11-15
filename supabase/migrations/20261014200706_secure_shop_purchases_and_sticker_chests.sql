/*
# Secure shop purchases and sticker chests

1. Beat purchases
- Add an atomic server-side purchase function.
- The function checks the real beat price, prevents buying private or own beats, and charges the authenticated buyer once.

2. Sticker chests
- Add a server-side chest opening function priced at 15 coins.
- The function chooses one sticker, charges atomically, and grants it without trusting browser-supplied prices.

3. Security
- Functions derive the buyer from auth.uid(), use a fixed search_path, and are callable only by authenticated users.
- Existing user data is preserved.
*/

CREATE OR REPLACE FUNCTION public.purchase_beat(p_beat_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price integer;
  v_balance integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT COALESCE(download_price, 0) INTO v_price
  FROM beats
  WHERE id = p_beat_id AND is_public = true AND user_id <> auth.uid();

  IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'Beat is not available'; END IF;

  UPDATE profiles
  SET coins = coins - v_price
  WHERE id = auth.uid() AND coins >= v_price
  RETURNING coins INTO v_balance;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  INSERT INTO beat_purchases (beat_id, buyer_id, price_paid)
  VALUES (p_beat_id, auth.uid(), v_price);

  INSERT INTO coin_transactions (user_id, amount, transaction_type, description)
  VALUES (auth.uid(), -v_price, 'beat_purchase', 'Покупка бита');

  RETURN v_price;
EXCEPTION
  WHEN unique_violation THEN
    PERFORM public.change_coins(v_price, 'Возврат: бит уже куплен');
    RAISE EXCEPTION 'Beat already purchased';
END;
$$;

CREATE OR REPLACE FUNCTION public.open_sticker_chest()
RETURNS TABLE(sticker_id uuid, sticker_name text, sticker_emoji text, sticker_rarity text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price constant integer := 15;
  v_balance integer;
  v_sticker stickers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE profiles SET coins = coins - v_price
  WHERE id = auth.uid() AND coins >= v_price
  RETURNING coins INTO v_balance;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  SELECT * INTO v_sticker FROM stickers ORDER BY random() LIMIT 1;
  IF v_sticker.id IS NULL THEN
    PERFORM public.change_coins(v_price, 'Возврат: сундук пуст');
    RAISE EXCEPTION 'No stickers available';
  END IF;

  INSERT INTO user_stickers (user_id, sticker_id)
  VALUES (auth.uid(), v_sticker.id)
  ON CONFLICT (user_id, sticker_id) DO NOTHING;

  INSERT INTO coin_transactions (user_id, amount, transaction_type, description)
  VALUES (auth.uid(), -v_price, 'sticker_chest', 'Открытие сундука со стикером');

  RETURN QUERY SELECT v_sticker.id, v_sticker.name, v_sticker.emoji, v_sticker.rarity;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_beat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_beat(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.open_sticker_chest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_sticker_chest() TO authenticated;
