/*
# Align demo coin claims with the existing purchase status constraint

1. Purpose
- The existing `coin_purchases.status` constraint uses `pending`, `completed`, and `failed`.
- Update the demo claim function to use `completed` for coin purchases, matching the live shop table.

2. Security
- Preserve the authenticated, owner-scoped, one-time pending-row claim.
- Premium claims continue to use the existing payment status `succeeded`.

3. Data safety
- No rows are deleted and no existing balances are changed by this migration.
*/

CREATE OR REPLACE FUNCTION grant_demo_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_payment payments%ROWTYPE;
  v_coins integer;
  v_coin_purchase coin_purchases%ROWTYPE;
  v_expires timestamptz;
  v_current_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id
    AND user_id = v_user
    AND status = 'pending'
    AND label LIKE 'subscription_%'
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
