/*
# Secure marketplace purchases

Moves beat marketplace payment, seller payout, and sold-state transition into one atomic server-side function.
The buyer, seller, listing price, commission, and ownership are all checked in the database.
No tables are removed or renamed.
*/

CREATE OR REPLACE FUNCTION public.purchase_marketplace_listing(p_listing_id uuid)
RETURNS TABLE(price_paid integer, seller_payout integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing beat_listings%ROWTYPE;
  v_price integer;
  v_fee integer;
  v_payout integer;
  v_balance integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_listing FROM beat_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_listing.id IS NULL OR v_listing.status <> 'active' OR v_listing.seller_id = auth.uid() THEN RAISE EXCEPTION 'Listing unavailable'; END IF;
  v_price := COALESCE(v_listing.price_coins, 0);
  IF v_price <= 0 THEN RAISE EXCEPTION 'Invalid price'; END IF;
  v_fee := round(v_price * 0.10);
  v_payout := v_price - v_fee;

  UPDATE profiles SET coins = coins - v_price
  WHERE id = auth.uid() AND coins >= v_price
  RETURNING coins INTO v_balance;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE profiles SET coins = LEAST(coins + v_payout, 100000) WHERE id = v_listing.seller_id;
  UPDATE beat_listings
  SET status = 'sold', buyer_id = auth.uid(), sold_at = now(), platform_fee_coins = v_fee
  WHERE id = p_listing_id AND status = 'active';
  IF NOT FOUND THEN
    PERFORM public.change_coins(v_price, 'Возврат: объявление уже продано');
    RAISE EXCEPTION 'Listing unavailable';
  END IF;

  INSERT INTO coin_transactions (user_id, amount, transaction_type, description)
  VALUES (auth.uid(), -v_price, 'marketplace_purchase', 'Покупка бита на маркете');
  INSERT INTO coin_transactions (user_id, amount, transaction_type, description)
  VALUES (v_listing.seller_id, v_payout, 'marketplace_sale', 'Продажа бита на маркете');

  RETURN QUERY SELECT v_price, v_payout;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_marketplace_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_marketplace_listing(uuid) TO authenticated;
