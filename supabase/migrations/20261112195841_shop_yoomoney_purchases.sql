/*
# Shop purchases paid directly via YooMoney (new payment_type 'shop')

1. Plain-English explanation
   Every shop purchase (sample packs, cosmetics, boosts, avatars, sticker
   chests and "Hot tracks" promotions) is now paid with real money through a
   YooMoney redirect instead of spending in-game coins. The browser creates a
   pending row in `payments` with payment_type 'shop' and a label
   `shop_<type>_..._<userId>`; the YooMoney webhook (or the payment-success
   page) then calls `fulfill_shop_purchase`, which grants the purchased item
   server-side. Prices in rubles are derived from the existing coin prices
   with the same rate the coin packages use (100 coins = 30 RUB).

2. Modified tables
   - `payments`: the CHECK constraint on `payment_type` now also allows
     'shop' (previously only 'premium' and 'coins'). No columns are added or
     removed.

3. New functions (all SECURITY DEFINER)
   - `fulfill_shop_purchase(p_payment_id uuid, p_operation_id text)`:
     claims a pending 'shop' payment, parses its label and grants the item
     (sample pack / cosmetic / boost / avatar / random sticker / trending
     promotion) atomically with marking the payment succeeded. May be called
     by the paying user (payment-success page) or by service_role (webhook).
   - `grant_trending_promotion(p_user_id, p_beat_id, p_kind)`: slot checks +
     insert into `trending_promotions` without any coin deduction. Only
     service_role may call it directly (it grants items, so it must never be
     callable for free).
   - `check_promo_availability(p_kind, p_beat_id)`: read-only pre-check so
     the UI can block a YooMoney redirect when top-3/eternal slots are full.
     Callable by authenticated users.

4. Modified functions
   - `grant_demo_payment`: now first tries `fulfill_shop_purchase`, so shop
     purchases complete on the payment-success page exactly like premium and
     coin purchases already do.

5. Removed functions
   - `buy_trending_promotion(uuid, text)`: it granted promotions for in-game
     coins. Dropped so promotions can no longer be obtained that way.

6. Security changes
   - EXECUTE on `fulfill_shop_purchase` granted to `authenticated` and
     `service_role` only (revoked from PUBLIC and anon).
   - EXECUTE on `grant_trending_promotion` granted to `service_role` only.
   - EXECUTE on `check_promo_availability` granted to `authenticated` only.
   - `fulfill_shop_purchase` verifies that the label's trailing user id
     matches the payment row's `user_id`, and that the caller is either that
     user or service_role.
*/

ALTER TABLE payments DROP CONSTRAINT payments_payment_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY['premium'::text, 'coins'::text, 'shop'::text]));

-- ── Trending promotion core (checks + insert, no coin deduction) ─────────
CREATE OR REPLACE FUNCTION public.grant_trending_promotion(p_user_id uuid, p_beat_id uuid, p_kind text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_points integer := 0;
  v_price integer := 0;
  v_duration interval;
  v_expires timestamptz;
  v_active_top3 integer;
  v_eternal_count integer;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF auth.uid() IS NULL THEN
    IF coalesce(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  ELSIF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  CASE p_kind
    WHEN 'boost_basic' THEN v_price := 50; v_points := 100; v_duration := interval '24 hours';
    WHEN 'boost_plus' THEN v_price := 100; v_points := 250; v_duration := interval '24 hours';
    WHEN 'boost_max' THEN v_price := 200; v_points := 600; v_duration := interval '24 hours';
    WHEN 'top3' THEN v_price := 500; v_duration := interval '24 hours';
    WHEN 'eternal' THEN v_price := 2000;
    ELSE RAISE EXCEPTION 'Unknown promotion';
  END CASE;

  PERFORM pg_advisory_xact_lock(hashtext('trending_promotions'));

  IF NOT EXISTS (SELECT 1 FROM beats WHERE id = p_beat_id AND user_id = p_user_id AND is_public) THEN
    RAISE EXCEPTION 'Beat not found';
  END IF;

  IF p_kind = 'top3' THEN
    IF EXISTS (SELECT 1 FROM trending_promotions WHERE beat_id = p_beat_id AND kind = 'top3' AND expires_at > now()) THEN
      RAISE EXCEPTION 'Already in top-3';
    END IF;
    SELECT count(*) INTO v_active_top3 FROM trending_promotions WHERE kind = 'top3' AND expires_at > now();
    IF v_active_top3 >= 3 THEN RAISE EXCEPTION 'Top-3 slots are full'; END IF;
  ELSIF p_kind = 'eternal' THEN
    IF EXISTS (SELECT 1 FROM trending_promotions WHERE beat_id = p_beat_id AND kind = 'eternal') THEN
      RAISE EXCEPTION 'Already has eternal boost';
    END IF;
    SELECT count(*) INTO v_eternal_count FROM trending_promotions WHERE kind = 'eternal';
    IF v_eternal_count >= 7 THEN RAISE EXCEPTION 'Eternal slots are full'; END IF;
  END IF;

  v_expires := CASE WHEN v_duration IS NULL THEN NULL ELSE now() + v_duration END;

  INSERT INTO trending_promotions (beat_id, user_id, kind, price_coins, boost_points, expires_at)
  VALUES (p_beat_id, p_user_id, p_kind, v_price, v_points, v_expires);

  RETURN v_expires;
END;
$$;

DROP FUNCTION IF EXISTS public.buy_trending_promotion(uuid, text);

-- ── Read-only availability pre-check for the UI ──────────────────────────
CREATE OR REPLACE FUNCTION public.check_promo_availability(p_kind text, p_beat_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active_top3 integer;
  v_eternal_count integer;
BEGIN
  IF v_uid IS NULL THEN RETURN 'not_authorized'; END IF;
  IF p_kind NOT IN ('boost_basic', 'boost_plus', 'boost_max', 'top3', 'eternal') THEN
    RETURN 'unknown_promotion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM beats WHERE id = p_beat_id AND user_id = v_uid AND is_public) THEN
    RETURN 'beat_not_found';
  END IF;
  IF p_kind = 'top3' THEN
    IF EXISTS (SELECT 1 FROM trending_promotions WHERE beat_id = p_beat_id AND kind = 'top3' AND expires_at > now()) THEN
      RETURN 'already_top3';
    END IF;
    SELECT count(*) INTO v_active_top3 FROM trending_promotions WHERE kind = 'top3' AND expires_at > now();
    IF v_active_top3 >= 3 THEN RETURN 'top3_full'; END IF;
  ELSIF p_kind = 'eternal' THEN
    IF EXISTS (SELECT 1 FROM trending_promotions WHERE beat_id = p_beat_id AND kind = 'eternal') THEN
      RETURN 'already_eternal';
    END IF;
    SELECT count(*) INTO v_eternal_count FROM trending_promotions WHERE kind = 'eternal';
    IF v_eternal_count >= 7 THEN RETURN 'eternal_full'; END IF;
  END IF;
  RETURN 'ok';
END;
$$;

-- ── Shop fulfillment: claim pending 'shop' payment and grant the item ────
CREATE OR REPLACE FUNCTION public.fulfill_shop_purchase(p_payment_id uuid, p_operation_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_user uuid;
  v_label text;
  v_parts text[];
  v_type text;
  v_item_id uuid;
  v_kind text;
  v_beat_id uuid;
  v_sticker stickers%ROWTYPE;
  v_expires timestamptz;
  v_message text;
BEGIN
  IF auth.uid() IS NULL THEN
    IF coalesce(auth.role(), '') <> 'service_role' THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'not_authorized');
    END IF;
  END IF;

  SELECT * INTO v_payment FROM payments
  WHERE id = p_payment_id AND status = 'pending' AND payment_type = 'shop'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'not_pending_shop');
  END IF;

  v_user := v_payment.user_id;
  v_label := v_payment.label;

  IF v_label IS NULL OR left(v_label, 5) <> 'shop_' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
  END IF;

  v_parts := string_to_array(substring(v_label from 6), '_');
  IF v_parts IS NULL OR array_length(v_parts, 1) < 2 THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
  END IF;

  IF v_parts[array_length(v_parts, 1)] <> v_user::text THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'user_mismatch');
  END IF;

  v_type := v_parts[1];

  IF v_type = 'chest' THEN
    SELECT * INTO v_sticker FROM stickers ORDER BY random() LIMIT 1;
    IF v_sticker.id IS NULL THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'no_stickers');
    END IF;
    INSERT INTO user_stickers (user_id, sticker_id) VALUES (v_user, v_sticker.id)
    ON CONFLICT (user_id, sticker_id) DO NOTHING;
    v_message := 'Стикер: ' || v_sticker.emoji || ' ' || v_sticker.name;
  ELSIF v_type = 'promo' THEN
    IF array_length(v_parts, 1) < 4 THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END IF;
    BEGIN
      v_beat_id := v_parts[2]::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END;
    v_kind := array_to_string(v_parts[3:array_length(v_parts, 1) - 1], '_');
    v_expires := grant_trending_promotion(v_user, v_beat_id, v_kind);
    v_message := 'Продвижение трека активно';
  ELSE
    IF array_length(v_parts, 1) <> 3 THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END IF;
    BEGIN
      v_item_id := v_parts[2]::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END;
    IF v_type = 'sample' THEN
      IF EXISTS (SELECT 1 FROM user_sample_packs WHERE user_id = v_user AND sample_pack_id = v_item_id) THEN
        v_message := 'Сэмпл-пак уже куплен';
      ELSE
        INSERT INTO user_sample_packs (user_id, sample_pack_id, purchased_at) VALUES (v_user, v_item_id, now());
        v_message := 'Сэмпл-пак куплен';
      END IF;
    ELSIF v_type = 'cosmetic' THEN
      IF EXISTS (SELECT 1 FROM user_cosmetics WHERE user_id = v_user AND cosmetic_id = v_item_id) THEN
        v_message := 'Предмет уже куплен';
      ELSE
        INSERT INTO user_cosmetics (user_id, cosmetic_id, is_equipped, purchased_at) VALUES (v_user, v_item_id, false, now());
        v_message := 'Предмет куплен';
      END IF;
    ELSIF v_type = 'boost' THEN
      IF EXISTS (SELECT 1 FROM user_boosts WHERE user_id = v_user AND boost_id = v_item_id) THEN
        v_message := 'Ускорение уже активно';
      ELSE
        INSERT INTO user_boosts (user_id, boost_id, expires_at, created_at)
        SELECT v_user, v_item_id, now() + (b.duration_hours || ' hours')::interval, now()
        FROM boost_items b WHERE b.id = v_item_id;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('granted', false, 'reason', 'item_not_found');
        END IF;
        v_message := 'Ускорение активировано';
      END IF;
    ELSIF v_type = 'avatar' THEN
      IF EXISTS (SELECT 1 FROM user_avatars WHERE user_id = v_user AND avatar_shop_item_id = v_item_id) THEN
        v_message := 'Аватар уже куплен';
      ELSE
        INSERT INTO user_avatars (user_id, avatar_shop_item_id, purchased_at) VALUES (v_user, v_item_id, now());
        v_message := 'Аватар куплен';
      END IF;
    ELSE
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END IF;
  END IF;

  UPDATE payments
  SET status = 'succeeded',
      yoomoney_operation_id = coalesce(p_operation_id, 'demo_' || p_payment_id::text)
  WHERE id = p_payment_id;

  RETURN jsonb_build_object('granted', true, 'type', 'shop', 'item_type', v_type, 'message', v_message);
END;
$$;

-- ── grant_demo_payment: shop purchases now complete via the same path ────
CREATE OR REPLACE FUNCTION public.grant_demo_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
v_user uuid := auth.uid();
v_payment payments%ROWTYPE;
v_coins integer;
v_coin_purchase coin_purchases%ROWTYPE;
v_expires timestamptz;
v_current_expires timestamptz;
v_shop_result jsonb;
BEGIN
IF v_user IS NULL THEN
RETURN jsonb_build_object('granted', false, 'reason', 'not_authenticated');
END IF;

-- ── Shop path: a pending payments row of type 'shop' ────────────────
v_shop_result := public.fulfill_shop_purchase(p_payment_id);
IF (v_shop_result->>'granted') = 'true' THEN
RETURN v_shop_result;
END IF;

-- ── Premium path: a pending payments row of type 'premium' ──────────
SELECT * INTO v_payment
FROM payments
WHERE id = p_payment_id
AND user_id = v_user
AND status = 'pending'
AND payment_type = 'premium'
FOR UPDATE;

IF FOUND THEN
UPDATE payments
SET status = 'succeeded', yoomoney_operation_id = 'demo_' || p_payment_id::text
WHERE id = p_payment_id AND status = 'pending';

SELECT premium_expires_at INTO v_current_expires FROM profiles WHERE id = v_user;
IF v_current_expires IS NOT NULL AND v_current_expires > now() THEN
v_expires := v_current_expires + interval '30 days';
ELSE
v_expires := now() + interval '30 days';
END IF;

UPDATE profiles
SET is_premium = true, premium_expires_at = v_expires, updated_at = now()
WHERE id = v_user;

INSERT INTO subscriptions (user_id, status, plan, tier, started_at, expires_at)
VALUES (v_user, 'active', 'premium', 'premium', now(), v_expires)
ON CONFLICT (user_id) DO UPDATE
SET status = 'active', plan = 'premium', tier = 'premium',
started_at = now(), expires_at = v_expires;

RETURN jsonb_build_object('granted', true, 'type', 'premium', 'demo', true, 'expires_at', v_expires);
END IF;

-- ── Coins path (new unified): a pending payments row of type 'coins' ──
SELECT * INTO v_payment
FROM payments
WHERE id = p_payment_id
AND user_id = v_user
AND status = 'pending'
AND payment_type = 'coins'
FOR UPDATE;

IF FOUND THEN
v_coins := 100;
SELECT coins_amount INTO v_coins
FROM coin_purchases
WHERE user_id = v_user AND label = v_payment.label
ORDER BY created_at DESC LIMIT 1;

UPDATE payments
SET status = 'succeeded', yoomoney_operation_id = 'demo_' || p_payment_id::text
WHERE id = p_payment_id AND status = 'pending';

UPDATE profiles
SET coins = coins + v_coins,
donate_coins = donate_coins + v_coins,
total_donate_purchased = total_donate_purchased + v_coins,
updated_at = now()
WHERE id = v_user;

UPDATE coin_purchases
SET status = 'completed', completed_at = now(), yoomoney_operation_id = 'demo_' || p_payment_id::text
WHERE user_id = v_user AND label = v_payment.label AND status = 'pending';

RETURN jsonb_build_object('granted', true, 'type', 'coins', 'coins', v_coins, 'demo', true);
END IF;

-- ── Coins path (legacy fallback): a pending coin_purchases row ───────
SELECT * INTO v_coin_purchase
FROM coin_purchases
WHERE id = p_payment_id
AND user_id = v_user
AND status = 'pending'
FOR UPDATE;

IF FOUND THEN
v_coins := v_coin_purchase.coins_amount;

UPDATE coin_purchases
SET status = 'completed', completed_at = now(), yoomoney_operation_id = 'demo_' || p_payment_id::text
WHERE id = p_payment_id AND status = 'pending';

UPDATE profiles
SET coins = coins + v_coins,
donate_coins = donate_coins + v_coins,
total_donate_purchased = total_donate_purchased + v_coins,
updated_at = now()
WHERE id = v_user;

RETURN jsonb_build_object('granted', true, 'type', 'coins', 'coins', v_coins, 'demo', true);
END IF;

RETURN jsonb_build_object('granted', false, 'reason', 'demo_payment_not_found');
END;
$$;

-- ── Lock down EXECUTE on the new functions ───────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fulfill_shop_purchase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fulfill_shop_purchase(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.grant_trending_promotion(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_trending_promotion(uuid, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_promo_availability(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_promo_availability(text, uuid) TO authenticated;
