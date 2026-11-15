/*
# Mark promo reservation used when success page completes a promo payment

1. Plain-English explanation
   When a promo-priced Premium payment is completed on the payment-success
   page (the YooMoney webhook may not have fired yet), the promo reservation
   must also be marked 'used' — otherwise the slot would stay reserved. The
   premium path of `grant_demo_payment` now updates `promo_code_uses` by
   payment_id; for regular (non-promo) payments the update matches nothing
   and changes nothing.

2. Modified functions
   - `grant_demo_payment`: premium path additionally marks the promo use.

3. Security changes
   - None; grants unchanged.
*/

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

-- Promo payments: confirm the reservation so the slot is spent.
UPDATE promo_code_uses
SET status = 'used', used_at = now()
WHERE payment_id = p_payment_id AND status = 'reserved';

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
