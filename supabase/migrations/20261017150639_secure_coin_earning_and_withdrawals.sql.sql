/*
# Secure coin earning from games + withdrawal age gate

## Summary

This migration closes two security gaps in the in-app economy:

1. Game coin rewards previously went through the generic `change_coins` RPC,
   which has no per-day or per-game-type cap. A user could replay a game
   endlessly (or script the client) to mint unlimited coins. We add a
   dedicated `earn_coins_from_game` SECURITY DEFINER function that enforces a
   **daily limit of 500 coins per game type per user**, records every award in
   `coin_transactions`, and updates both `coins` and `earned_coins`.

2. Withdrawals already required a 500-coin minimum, but did not verify the
   account's age. We replace `request_withdrawal` (same signature, so existing
   callers keep working) with a version that also requires the profile to be
   **at least 7 days old** before any coins can be withdrawn.

## New Columns

- `coin_transactions.game_type` (text, nullable) — the game slug
  (e.g. `snake`, `shooter`) that awarded the coins. NULL for non-game
  transactions, so existing rows and the existing `change_coins` insert path
  are unaffected.

## New / Changed Functions

### `earn_coins_from_game(p_game_type text, p_amount int)` — NEW, SECURITY DEFINER
- Verifies the caller is authenticated (`auth.uid() IS NOT NULL`).
- Rejects non-positive or absurd (>500) amounts.
- Sums the positive `game_reward` transactions already recorded today for this
  user + game type and rejects the award if it would push the day's total past
  500 coins (`max 500 coins per day per game type`).
- Atomically increments `profiles.coins` (clamped to the 0–100000 check
  constraint) and `profiles.earned_coins`, returning the new balance.
- Records a single `coin_transactions` row with `transaction_type='game_reward'`,
  the `game_type`, the amount, and `balance_after`.

### `request_withdrawal(p_coins_amount integer, p_payment_details text)` — REPLACED
- Same signature as before so no caller breaks.
- Existing rules kept: authenticated, minimum 500 coins, non-empty payment
  details, sufficient `earned_coins` balance, atomic deduction + pending
  `withdrawal_requests` row.
- NEW rule: the profile's `created_at` must be at least 7 days in the past.
  Otherwise raises `'Account must be at least 7 days old to withdraw'`.

## Security

- Both functions are `SECURITY DEFINER` with `SET search_path TO 'public'` so
  they run with the table owner's privileges and a safe search path, letting us
  keep `coin_transactions` and `profiles` RLS-locked while still allowing the
  authenticated caller to mutate their own row through the function.
- `earn_coins_from_game` is granted EXECUTE to `authenticated` only (games
  require sign-in; guests earn nothing in the DB).
- `request_withdrawal` keeps its existing EXECUTE grant to `authenticated`.
- `coin_transactions` RLS policies are unchanged: users can SELECT and INSERT
  only their own rows (`auth.uid() = user_id`). The function writes the
  transaction as the table owner (definer), which is the intended privileged
  path; direct client inserts are still scoped to the owner's own user_id.
- A helper index on `coin_transactions(user_id, game_type, created_at)` makes
  the daily-limit lookup fast.

## Important notes

1. The migration is idempotent: `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF
   EXISTS` before re-creating, and `CREATE OR REPLACE FUNCTION`.
2. No data is deleted or transformed. Existing `coin_transactions` rows simply
   get `game_type = NULL`.
3. The `profiles.coins` column has a `CHECK (coins >= 0 AND coins <= 100000)`
  constraint; the function uses `RETURNING coins` so an overflow is rejected
  atomically (the update matches zero rows and the function raises).
4. `request_withdrawal` keeps the exact same parameter names and types, so any
   existing `supabase.rpc('request_withdrawal', { p_coins_amount, p_payment_details })`
   call continues to work.
*/

-- 1. Add game_type column to coin_transactions (idempotent)
ALTER TABLE coin_transactions
  ADD COLUMN IF NOT EXISTS game_type text;

-- 2. Index for the daily-limit lookup in earn_coins_from_game
CREATE INDEX IF NOT EXISTS coin_transactions_user_game_created_idx
  ON coin_transactions (user_id, game_type, created_at);

-- 3. earn_coins_from_game: secure, capped game reward function
CREATE OR REPLACE FUNCTION public.earn_coins_from_game(p_game_type text, p_amount int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id       uuid  := auth.uid();
  v_balance       integer;
  v_earned_today  integer := 0;
  v_max_per_day   integer := 500;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate inputs
  IF p_game_type IS NULL OR btrim(p_game_type) = '' THEN
    RAISE EXCEPTION 'Game type is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF p_amount > v_max_per_day THEN
    RAISE EXCEPTION 'Single reward cannot exceed % coins', v_max_per_day;
  END IF;

  -- Sum coins already awarded for this game type today
  SELECT COALESCE(SUM(amount), 0)
    INTO v_earned_today
    FROM coin_transactions
   WHERE user_id = v_user_id
     AND game_type = p_game_type
     AND transaction_type = 'game_reward'
     AND created_at >= date_trunc('day', now());

  IF v_earned_today + p_amount > v_max_per_day THEN
    RAISE EXCEPTION 'Daily limit of % coins reached for game %',
      v_max_per_day, p_game_type;
  END IF;

  -- Atomically add coins (CHECK constraint 0..100000 enforced by the table)
  UPDATE profiles
     SET coins = coins + p_amount,
         earned_coins = earned_coins + p_amount
   WHERE id = v_user_id
     AND coins + p_amount BETWEEN 0 AND 100000
   RETURNING coins INTO v_balance;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Failed to credit coins (profile missing or balance overflow)';
  END IF;

  -- Record the audit row
  INSERT INTO coin_transactions
    (user_id, amount, balance_after, transaction_type, description, game_type)
  VALUES
    (v_user_id, p_amount, v_balance, 'game_reward',
     'Игра: ' || p_game_type, p_game_type);

  RETURN v_balance;
END;
$function$;

-- Revoke default access and grant only to authenticated users
REVOKE ALL ON FUNCTION public.earn_coins_from_game(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.earn_coins_from_game(text, int) TO authenticated;

-- 4. request_withdrawal: same signature, add 7-day account age gate
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_coins_amount integer, p_payment_details text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid    := auth.uid();
  v_balance      integer;
  v_rub_amount   numeric;
  v_request_id   uuid;
  v_min_withdrawal integer := 500;
  v_created_at   timestamptz;
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

  -- Lock the profile row and read balance + creation date
  SELECT earned_coins, created_at
    INTO v_balance, v_created_at
    FROM profiles
   WHERE id = v_user_id
   FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Account must be at least 7 days old
  IF v_created_at IS NULL OR v_created_at > now() - interval '7 days' THEN
    RAISE EXCEPTION 'Account must be at least 7 days old to withdraw';
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
$function$;

-- Keep request_withdrawal scoped to authenticated only
REVOKE ALL ON FUNCTION public.request_withdrawal(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(integer, text) TO authenticated;

-- 5. coin_transactions RLS policies (idempotent: drop then recreate)
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_coin_transactions" ON coin_transactions;
CREATE POLICY "select_own_coin_transactions"
  ON coin_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_coin_transactions" ON coin_transactions;
CREATE POLICY "insert_own_coin_transactions"
  ON coin_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
