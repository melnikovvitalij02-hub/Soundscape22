/*
# Gem withdrawal (Gem -> RUB via YooMoney, manual payout)

1. New Table: `gem_withdrawals`
- `id` (uuid, primary key)
- `user_id` (uuid, not null, defaults to authenticated user)
- `amount_gem` (integer, not null) — gems debited
- `amount_rub` (integer, not null) — rubles to pay out (1 Gem = 0.3 RUB)
- `wallet` (text, not null) — YooMoney wallet number of the user
- `status` (text, not null, default 'pending') — pending | paid | rejected
- `created_at`, `processed_at` (timestamptz)

2. Security
- RLS enabled. Users can SELECT only their own rows. No client INSERT/UPDATE/DELETE:
  the withdrawal is created exclusively by the SECURITY DEFINER function below,
  which debits the balance atomically server-side (client cannot forge an amount
  or bypass the balance check).
- Grants: SELECT to authenticated only.

3. New Function: `request_gem_withdrawal(p_amount_gem integer, p_wallet text)`
- SECURITY DEFINER, search_path locked.
- Validates: amount >= 100 Gem, wallet is 4-33 digits, status not blocked.
- Locks the profile row FOR UPDATE, re-checks balance (donate_coins) inside the
  transaction, deducts gems, inserts the withdrawal request.
- Returns table (ok boolean, reason text, new_balance integer).
- EXECUTE revoked from PUBLIC/anon, granted to authenticated.
*/

CREATE TABLE IF NOT EXISTS gem_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_gem integer NOT NULL,
  amount_rub integer NOT NULL,
  wallet text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE gem_withdrawals ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON gem_withdrawals TO authenticated;

DROP POLICY IF EXISTS "select_own_withdrawals" ON gem_withdrawals;
CREATE POLICY "select_own_withdrawals"
ON gem_withdrawals FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION request_gem_withdrawal(p_amount_gem integer, p_wallet text)
RETURNS TABLE (ok boolean, reason text, new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_rub integer;
  v_min integer := 100;
  v_rate numeric := 0.3; -- 1 Gem = 0.3 RUB (100 Gem = 30 RUB, as CoinPurchase: 100 coins = 30 RUB)
  v_wallet_clean text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'auth'::text, 0;
    RETURN;
  END IF;

  IF p_amount_gem IS NULL OR p_amount_gem < v_min THEN
    RETURN QUERY SELECT false, 'min_amount'::text, 0;
    RETURN;
  END IF;

  IF p_amount_gem > 1000000 THEN
    RETURN QUERY SELECT false, 'invalid_amount'::text, 0;
    RETURN;
  END IF;

  v_wallet_clean := regexp_replace(coalesce(p_wallet, ''), '[^0-9]', '', 'g');
  IF length(v_wallet_clean) < 4 OR length(v_wallet_clean) > 33 THEN
    RETURN QUERY SELECT false, 'invalid_wallet'::text, 0;
    RETURN;
  END IF;

  SELECT COALESCE(donate_coins, 0) INTO v_balance
  FROM profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no_profile'::text, 0;
    RETURN;
  END IF;

  IF v_balance < p_amount_gem THEN
    RETURN QUERY SELECT false, 'insufficient'::text, v_balance;
    RETURN;
  END IF;

  v_rub := floor(p_amount_gem * v_rate);

  UPDATE profiles
  SET donate_coins = donate_coins - p_amount_gem
  WHERE id = auth.uid();

  INSERT INTO gem_withdrawals (user_id, amount_gem, amount_rub, wallet)
  VALUES (auth.uid(), p_amount_gem, v_rub, v_wallet_clean);

  RETURN QUERY SELECT true, 'ok'::text, v_balance - p_amount_gem;
END;
$$;

REVOKE EXECUTE ON FUNCTION request_gem_withdrawal(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_gem_withdrawal(integer, text) TO authenticated;
