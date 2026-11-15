/*
# Add a one-time demo payment claim flow

1. Purpose
- Provide a clearly separated demo path for Monday's payment demonstration when YooMoney webhooks and signing secrets are unavailable.
- Keep the real `grant_premium_for_payment()` RPC unchanged so production Premium is still granted only from a succeeded payment.

2. Security and data rules
- Add `grant_demo_payment(uuid)`, callable only by authenticated users.
- The function accepts only the caller's own pending payment or coin purchase row.
- The row is atomically changed from pending to succeeded with a demo operation marker, so the same demo purchase cannot be claimed twice.
- The function derives the user from `auth.uid()` and never trusts a client-supplied user ID, amount, or coin quantity.

3. Important demo limitation
- This function intentionally grants demo entitlements without an external YooMoney confirmation. It is for demonstration only and must be removed or disabled before real-money production use.

4. Data safety
- No existing rows are deleted and no existing production RPC is modified.
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
    SET status = 'succeeded',
        yoomoney_operation_id = 'demo_' || p_payment_id::text
    WHERE id = p_payment_id AND status = 'pending';

    SELECT premium_expires_at INTO v_current_expires
    FROM profiles WHERE id = v_user;

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
    SET status = 'succeeded',
        completed_at = now(),
        yoomoney_operation_id = 'demo_' || p_payment_id::text
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

REVOKE EXECUTE ON FUNCTION grant_demo_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION grant_demo_payment(uuid) TO authenticated;
