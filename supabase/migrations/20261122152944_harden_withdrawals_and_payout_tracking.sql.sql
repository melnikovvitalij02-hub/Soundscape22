/*
# Harden withdrawal requests and add payout tracking

1. Plain-English explanation
   Users can convert their earned Gem currency into real rubles. A request
   is created through the `request_withdrawal` database function, which
   checks the balance, debits the Gems and inserts a row into
   `withdrawal_requests`. This migration makes that flow safer and prepares
   the table for automatic payouts through the YooMoney API:

   - The client previously could insert rows into `withdrawal_requests`
     directly. Direct inserts are now blocked (no INSERT grant for the
     anon/authenticated roles); only the SECURITY DEFINER function can
     create requests, so every request is guaranteed to have a matching,
     verified Gem debit.
   - New columns track the automated payout: an external operation id from
     YooMoney, how many times the payout was attempted, and a human-readable
     failure reason. Existing rows keep their data.

2. Modified Tables
   - `withdrawal_requests`
     - new column `yoomoney_operation_id` (text, nullable) — id of the
       outgoing YooMoney transfer, filled when the payout succeeds.
     - new column `attempts` (integer, not null, default 0) — payout retry
       counter for the automatic worker.
     - new column `last_error` (text, nullable) — last payout failure
       reason, shown to the operator.
   - `request_withdrawal(p_coins_amount, p_payment_details)` is re-created
     with identical behavior plus balance-decrement guarded by an atomic
     conditional UPDATE (no negative balances under concurrent requests).

3. Security
   - REVOKE INSERT on `withdrawal_requests` from anon and authenticated —
     users must go through the RPC, which validates balance and the
     one-pending-request rule server-side.
   - SELECT/UPDATE on own rows remain as configured by earlier migrations
     (status of grants is not loosened here).
   - The function stays SECURITY DEFINER, executable by authenticated only.

4. Important notes
   - Idempotent: column additions are conditional, grants/policies are
     dropped-then-created, function uses CREATE OR REPLACE.
   - No data is deleted or modified; all existing requests are preserved.
*/

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS yoomoney_operation_id text;
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS last_error text;

REVOKE INSERT ON public.withdrawal_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_coins_amount integer, p_payment_details text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_balance INT;
  v_rub_amount NUMERIC;
BEGIN
  IF p_coins_amount < 300 THEN
    RETURN json_build_object('error', 'Минимум 300 Gem для вывода');
  END IF;

  IF p_payment_details IS NULL OR length(trim(p_payment_details)) < 5 THEN
    RETURN json_build_object('error', 'Укажите реквизиты для выплаты');
  END IF;

  -- Atomic debit: only succeeds when the balance is sufficient, so two
  -- concurrent requests can never overdraw the wallet.
  UPDATE profiles
  SET donate_coins = donate_coins - p_coins_amount
  WHERE id = auth.uid()
    AND donate_coins >= p_coins_amount;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Недостаточно Gem на балансе');
  END IF;

  IF EXISTS (SELECT 1 FROM withdrawal_requests WHERE user_id = auth.uid() AND status = 'pending') THEN
    UPDATE profiles SET donate_coins = donate_coins + p_coins_amount WHERE id = auth.uid();
    RETURN json_build_object('error', 'У вас уже есть активная заявка на вывод');
  END IF;

  v_rub_amount := ROUND(p_coins_amount * 0.7, 2);

  INSERT INTO withdrawal_requests (user_id, coins_amount, rub_amount, payment_details, status)
  VALUES (auth.uid(), p_coins_amount, v_rub_amount, trim(p_payment_details), 'pending');

  RETURN json_build_object('success', true, 'rub_amount', v_rub_amount);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(integer, text) TO authenticated;
