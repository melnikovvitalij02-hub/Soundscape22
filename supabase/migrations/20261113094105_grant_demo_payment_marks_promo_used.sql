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

  -- ── Shop path ─────────────────────────────────────────────────────
  v_shop_result := public.fulfill_shop_purchase(p_payment_id);
  IF (v_shop_result->>'granted') = 'true' THEN
    RETURN v_shop_result;
  END IF;

  -- ── Premium + Coins Bundle path (НОВЫЙ) ───────────────────────────
  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id
    AND user_id = v_user
    AND status = 'pending'
    AND payment_type = 'premium_bundle'
  FOR UPDATE;

  IF FOUND THEN
    -- 1. Выдаем монеты
    v_coins := 0;
    SELECT coins_amount INTO v_coins
    FROM coin_purchases
    WHERE user_id = v_user AND label = v_payment.label
    ORDER BY created_at DESC LIMIT 1;

    UPDATE profiles
    SET coins = coins + v_coins,
        donate_coins = donate_coins + v_coins,
        total_donate_purchased = total_donate_purchased + v_coins,
        updated_at = now()
    WHERE id = v_user;

    -- 2. Выдаем Premium (30 дней)
    SELECT premium_expires_at INTO v_current_expires FROM profiles WHERE id = v_user;
    IF v_current_expires IS NOT NULL AND v_current_expires > now() THEN
      v_expires := v_current_expires + interval '30 days';
    ELSE
      v_expires := now() + interval '30 days';
    END IF;

    UPDATE profiles
    SET is_premium = true, premium_expires_at = v_expires
    WHERE id = v_user;

    INSERT INTO subscriptions (user_id, status, plan, tier, started_at, expires_at)
    VALUES (v_user, 'active', 'premium', 'premium', now(), v_expires)
    ON CONFLICT (user_id) DO UPDATE
    SET status = 'active', plan = 'premium', tier = 'premium',
        started_at = now(), expires_at = v_expires;

    -- 3. Обновляем статусы
    UPDATE payments
    SET status = 'succeeded', yoomoney_operation_id = 'demo_' || p_payment_id::text
    WHERE id = p_payment_id AND status = 'pending';

    UPDATE coin_purchases
    SET status = 'completed', completed_at = now(), yoomoney_operation_id = 'demo_' || p_payment_id::text
    WHERE user_id = v_user AND label = v_payment.label AND status = 'pending';

    RETURN jsonb_build_object('granted', true, 'type', 'premium_bundle', 'coins', v_coins, 'demo', true, 'expires_at', v_expires);
  END IF;

  -- ── Premium path ──────────────────────────────────────────────────
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

    UPDATE promo_code_uses
    SET status = 'used', used_at = now()
    WHERE payment_id = p_payment_id AND status = 'reserved';

    RETURN jsonb_build_object('granted', true, 'type', 'premium', 'demo', true, 'expires_at', v_expires);
  END IF;

  -- ── Coins path ────────────────────────────────────────────────────
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

  -- ── Coins path (legacy fallback) ──────────────────────────────────
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