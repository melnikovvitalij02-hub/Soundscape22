/*
# Separate earned coins from donation coins

1. New Columns
- Add `profiles.earned_coins` as the balance users earn from selling beats, likes, views, and other platform activity.
- The new balance starts at 0 for existing and new profiles. Existing `donate_coins` balances are preserved.

2. Modified Withdrawal Behavior
- `request_withdrawal` now checks and deducts `earned_coins`, never `donate_coins`.
- The existing minimum remains 500 coins, valued at 100 RUB using the 5:1 exchange rate.
- The existing `withdrawal_requests.coins_amount` field continues to record the number of earned coins requested, avoiding data loss or table renaming.

3. Security
- The withdrawal operation remains a SECURITY DEFINER function with a fixed public search path.
- The balance is locked while the request is created, preventing concurrent withdrawals from spending the same earned coins twice.
- Only authenticated users can execute the function.

4. Important Notes
- Purchased `donate_coins` are intentionally non-withdrawable and remain available for platform purchases.
- This migration does not convert or delete any existing balances.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS earned_coins integer NOT NULL DEFAULT 0;

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

  IF p_payment_details IS NULL OR btrim(p_payment_details) = '' THEN
    RAISE EXCEPTION 'Payment details are required';
  END IF;

  SELECT earned_coins
  INTO v_balance
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_balance < p_coins_amount THEN
    RAISE EXCEPTION 'Insufficient earned coins';
  END IF;

  v_rub_amount := p_coins_amount / 5.0;

  UPDATE profiles
  SET earned_coins = earned_coins - p_coins_amount
  WHERE id = v_user_id;

  INSERT INTO withdrawal_requests (user_id, coins_amount, rub_amount, status, payment_details)
  VALUES (v_user_id, p_coins_amount, v_rub_amount, 'pending', p_payment_details)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION request_withdrawal(integer, text) TO authenticated;