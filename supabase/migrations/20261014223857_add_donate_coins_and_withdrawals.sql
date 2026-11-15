/*
# Add donation currency (donate_coins) and withdrawal requests

1. New Columns
- `profiles.donate_coins` (integer, default 0): separate premium currency
  purchased with real money via YooMoney. Withdrawable to rubles at 5:1.
- `profiles.total_donate_purchased` (integer, default 0): lifetime total purchased.

2. New Tables
- `coin_purchases`: records each real-money coin purchase transaction.
- `withdrawal_requests`: user requests to convert donate_coins to rubles.
  Minimum withdrawal: 500 coins (100₽ at 5:1).

3. Security
- RLS enabled on both new tables, owner-scoped.
- SECURITY DEFINER functions for balance changes.

4. Notes
- donate_coins is separate from existing `coins` (earned in-game).
- Exchange rate: 5 donate_coins = 1₽.
- Packages: 100=99₽, 300=249₽, 500=399₽, 1000=749₽, 2500=1499₽.
*/

-- 1. Add donate_coins column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS donate_coins integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_donate_purchased integer NOT NULL DEFAULT 0;

-- 2. Create coin_purchases table
CREATE TABLE IF NOT EXISTS coin_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_rub numeric NOT NULL,
  coins_granted integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  label text,
  yoomoney_operation_id text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE coin_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_coin_purchases" ON coin_purchases;
CREATE POLICY "select_own_coin_purchases" ON coin_purchases FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_coin_purchases" ON coin_purchases;
CREATE POLICY "insert_own_coin_purchases" ON coin_purchases FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_coin_purchases" ON coin_purchases;
CREATE POLICY "update_own_coin_purchases" ON coin_purchases FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_coin_purchases" ON coin_purchases;
CREATE POLICY "delete_own_coin_purchases" ON coin_purchases FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 3. Create withdrawal_requests table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  coins_amount integer NOT NULL,
  rub_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_details text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "select_own_withdrawals" ON withdrawal_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "insert_own_withdrawals" ON withdrawal_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "update_own_withdrawals" ON withdrawal_requests FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "delete_own_withdrawals" ON withdrawal_requests FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 4. SECURITY DEFINER function to change donate_coins balance
CREATE OR REPLACE FUNCTION change_donate_coins(p_amount integer, p_reason text DEFAULT '')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_balance integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE profiles
  SET donate_coins = GREATEST(0, donate_coins + p_amount)
  WHERE id = v_user_id
  RETURNING donate_coins INTO v_new_balance;

  IF p_amount > 0 THEN
    UPDATE profiles SET total_donate_purchased = total_donate_purchased + p_amount WHERE id = v_user_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION change_donate_coins(integer, text) TO authenticated;

-- 5. SECURITY DEFINER function to create withdrawal request
CREATE OR REPLACE FUNCTION request_withdrawal(p_coins_amount integer, p_payment_details text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_balance integer;
  v_rub_amount numeric;
  v_request_id uuid;
  v_min_withdrawal integer := 500;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_coins_amount < v_min_withdrawal THEN
    RAISE EXCEPTION 'Minimum withdrawal is % coins', v_min_withdrawal;
  END IF;

  SELECT donate_coins INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_balance < p_coins_amount THEN
    RAISE EXCEPTION 'Insufficient donate coins';
  END IF;

  v_rub_amount := p_coins_amount / 5.0;

  UPDATE profiles SET donate_coins = donate_coins - p_coins_amount WHERE id = v_user_id;

  INSERT INTO withdrawal_requests (user_id, coins_amount, rub_amount, status, payment_details)
  VALUES (v_user_id, p_coins_amount, v_rub_amount, 'pending', p_payment_details)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION request_withdrawal(integer, text) TO authenticated;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_coin_purchases_user_id ON coin_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
