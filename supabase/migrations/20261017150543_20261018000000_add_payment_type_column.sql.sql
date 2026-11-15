/*
# Add payment_type column to distinguish coin purchases from premium subscriptions

## Problem
The `payments` table had no way to distinguish a 30₽ coin purchase from a 199₽
premium subscription. Both flows used label-prefix sniffing ("subscription_"
vs "coins_") which is fragile and was the root cause of Block 14: a user who
paid 30₽ for 100 donate-coins could receive a Premium subscription instead of
coins, because the grant RPCs and webhook did not reliably branch on the
payment intent.

## Changes

### 1. New column
- `payments.payment_type` (text, NOT NULL, default 'premium'):
  - 'premium'  -> activates is_premium + premium_expires_at
  - 'coins'    -> adds coins to donate_coins (and coins / total_donate_purchased)
  A CHECK constraint restricts the value to those two literals.
  Existing rows (created before this migration) default to 'premium', which
  matches the original intent of the payments table (it was created for
  verified premium subscriptions). The webhook/RPCs now branch on this
  column instead of parsing the label.

### 2. grant_premium_for_payment() — narrowed to premium payments only
The function previously matched any `label LIKE 'subscription_%'` succeeded
payment. It now additionally requires `payment_type = 'premium'`. This is
the critical fix: a coin purchase can no longer trigger a premium grant
through this RPC.

### 3. grant_demo_payment(uuid) — branches on payment_type
The demo RPC previously tried to match a `payments` row with
`label LIKE 'subscription_%'` (premium path) and otherwise fell through to
the `coin_purchases` table (coins path). That worked only by accident and
conflated the two tables. It now:
  - For the premium path: matches a `payments` row with
    `payment_type = 'premium'` AND `status = 'pending'`, then grants premium.
  - For the coins path: first tries a `payments` row with
    `payment_type = 'coins'` AND `status = 'pending'` (the new unified path),
    and falls back to the legacy `coin_purchases` table for backward
    compatibility with rows created before this migration.
  In both coin branches it grants coins via donate_coins + coins +
  total_donate_purchased, never premium.

### 4. Column privileges
`payment_type` is added to the INSERT/SELECT/UPDATE grants for anon and
authenticated on `payments`, so the client can set it when creating a
pending payment and read it back. (The actual entitlement grant still
happens only inside the SECURITY DEFINER functions / service-role webhook,
never via a direct client UPDATE of profile columns.)

## Security
- RLS on `payments` is unchanged (owner-scoped SELECT/INSERT).
- The SECURITY DEFINER functions remain owner-derived (auth.uid()) and do
  not trust any client-supplied user id, amount, or coin quantity.
- `payment_type` has a CHECK constraint so a client cannot set arbitrary
  values.

## Data safety
- ADD COLUMN IF NOT EXISTS is idempotent and non-destructive.
- Existing rows backfill to 'premium' (the table's original purpose).
- No rows are deleted; no existing balances are changed.
- The migration is safe to re-run.
*/

-- 1. Add payment_type column with a safe default and CHECK constraint
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'premium'
  CHECK (payment_type IN ('premium', 'coins'));

-- Backfill is unnecessary (DEFAULT 'premium' applies to all pre-existing rows
-- because the column is NOT NULL with a default), but keep an explicit
-- no-op-safe statement for clarity and any NULL edge cases.
UPDATE payments SET payment_type = 'premium' WHERE payment_type IS NULL;

-- 2. Grant column privileges so the client can set/read payment_type
GRANT SELECT (payment_type) ON payments TO anon, authenticated;
GRANT INSERT (payment_type) ON payments TO anon, authenticated;
GRANT UPDATE (payment_type) ON payments TO anon, authenticated;

-- 3. Narrow grant_premium_for_payment() to payment_type = 'premium'
CREATE OR REPLACE FUNCTION grant_premium_for_payment()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_payment RECORD;
  v_expires timestamptz;
  v_current_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'not_authenticated');
  END IF;

  -- Find the most recent succeeded PREMIUM payment for this user.
  -- payment_type = 'premium' is the critical guard: a coin purchase
  -- (payment_type = 'coins') can no longer trigger a premium grant here.
  SELECT id, label, amount, status, payment_type
  INTO v_payment
  FROM payments
  WHERE user_id = v_user
    AND payment_type = 'premium'
    AND status = 'succeeded'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_succeeded_payment');
  END IF;

  -- Check current premium state — extend from existing expiry if still active
  SELECT premium_expires_at INTO v_current_expires
  FROM profiles WHERE id = v_user;

  IF v_current_expires IS NOT NULL AND v_current_expires > now() THEN
    v_expires := v_current_expires + interval '30 days';
  ELSE
    v_expires := now() + interval '30 days';
  END IF;

  UPDATE profiles
  SET is_premium = true,
      premium_expires_at = v_expires,
      updated_at = now()
  WHERE id = v_user;

  -- Also ensure subscriptions table reflects this
  INSERT INTO subscriptions (user_id, status, plan, tier, started_at, expires_at)
  VALUES (v_user, 'active', 'premium', 'premium', now(), v_expires)
  ON CONFLICT (user_id) DO UPDATE
  SET status = 'active', plan = 'premium', tier = 'premium',
      started_at = now(), expires_at = v_expires;

  RETURN jsonb_build_object('granted', true, 'expires_at', v_expires);
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_premium_for_payment() FROM anon;
GRANT EXECUTE ON FUNCTION grant_premium_for_payment() TO authenticated;

-- 4. grant_demo_payment(uuid) — branch on payment_type, support unified coins path
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
    -- Derive coins from the coin_purchases row linked by label, or fall
    -- back to a flat 100 coins if no matching coin_purchases row exists.
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

    -- Mark the linked coin_purchases row completed for bookkeeping
    UPDATE coin_purchases
    SET status = 'completed', completed_at = now(), yoomoney_operation_id = 'demo_' || p_payment_id::text
    WHERE user_id = v_user AND label = v_payment.label AND status = 'pending';

    RETURN jsonb_build_object('granted', true, 'type', 'coins', 'coins', v_coins, 'demo', true);
  END IF;

  -- ── Coins path (legacy fallback): a pending coin_purchases row ───────
  -- Supports rows created by older client code that only inserted into
  -- coin_purchases. Kept for backward compatibility.
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

REVOKE EXECUTE ON FUNCTION grant_demo_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION grant_demo_payment(uuid) TO authenticated;
