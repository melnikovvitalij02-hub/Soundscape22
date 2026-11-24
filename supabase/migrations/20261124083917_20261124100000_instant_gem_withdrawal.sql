/*
# Instant Gem withdrawal via YooMoney (no stored card details, no pending queue)

1. Plain-English explanation
- The old flow stored the user's card/phone details in the database and created a
  "pending" withdrawal request, which a scheduled job later paid out. That flow is
  removed: card details were stored on our side and payouts never actually ran
  (the payout credential was never configured).
- New flow: when the user presses "Вывести через ЮMoney", the server claims a
  withdrawal atomically (validates amount, debits Gems), calls YooMoney to send
  the money, and either completes the claim or refunds the Gems. Card details are
  passed through to YooMoney and are NEVER written to the database — the user
  enters them on the YooMoney side / they exist only in memory during the payout.
- The scheduled 10-minute payout job is removed; payouts happen only at the
  moment of the user's request.

2. Modified tables
- `withdrawal_requests`: existing card details are masked (data minimisation);
  new columns `paid_out_at` (when money left) and `refund_issued_at` (when Gems
  were returned after a failed payout). Column `payment_details` stays only for
  masking history, new rows write a masked placeholder, never real details.

3. New functions (SECURITY DEFINER, search_path pinned, EXECUTE granted to
   authenticated only)
- `claim_gem_withdrawal(p_coins_amount int, p_payment_details text)` → returns
  table(id uuid, rub_amount numeric). Validates the caller, minimum 300 Gem,
  rate 1 Gem = 0.7 ₽, atomically debits the Gems and records a 'paid'-pending
  claim row with masked details. Raises exceptions in Russian on failure.
- `refund_gem_withdrawal(p_withdrawal_id uuid, p_reason text)` → void. Refunds
  the Gems for a claim that is still in the 'paid'-pending state (called by the
  payout function when YooMoney rejects the transfer) and marks the row 'failed'
  with the reason. Refund is idempotent: only the first call for a row acts.

4. Dropped functions
- `request_withdrawal` (old create-a-request flow) — replaced by
  `claim_gem_withdrawal`.

5. Security changes
- Card details are no longer accepted for storage: the claim function masks them
  before insert, and old pending rows are masked.
- The pg_cron job `yoomoney-payout-10min` is unscheduled.
- EXECUTE on the new functions: only `authenticated` (revoked from PUBLIC/anon).
- Existing table grants unchanged (service_role still reads/writes for the
  payout edge function; authenticated can still read own withdrawal history).
*/

-- 1. Remove the scheduled payout job: payouts are instant now.
DO $$
BEGIN
  PERFORM cron.unschedule('yoomoney-payout-10min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Mask any previously stored payment details (data minimisation).
UPDATE withdrawal_requests
SET payment_details = 'masked'
WHERE payment_details IS NOT NULL AND payment_details <> 'masked';

-- 3. New columns for the instant flow.
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS paid_out_at timestamptz;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS refund_issued_at timestamptz;

-- 4. Replace the request flow with the instant claim flow.
DROP FUNCTION IF EXISTS request_withdrawal(int, text);

CREATE OR REPLACE FUNCTION claim_gem_withdrawal(
  p_coins_amount int,
  p_payment_details text
)
RETURNS TABLE (id uuid, rub_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_gems int := p_coins_amount;
  v_rub numeric;
  v_details text := btrim(coalesce(p_payment_details, ''));
  v_withdrawal_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в аккаунт';
  END IF;

  -- Server-side bound on the amount: positive integers within a sane range.
  IF v_gems IS NULL OR v_gems < 300 OR v_gems > 1000000 THEN
    RAISE EXCEPTION 'Минимальная сумма вывода — 300 Gem';
  END IF;

  -- The recipient identifier is passed straight to YooMoney at payout time and
  -- is never stored; keep a basic sanity bound only.
  IF char_length(v_details) < 5 OR char_length(v_details) > 200 THEN
    RAISE EXCEPTION 'Укажите номер карты, счёт или телефон получателя';
  END IF;

  v_rub := round(v_gems * 0.7, 2);

  -- Atomic debit: only succeeds if the balance is sufficient.
  UPDATE profiles
  SET donate_coins = donate_coins - v_gems
  WHERE id = v_user AND donate_coins >= v_gems;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Недостаточно Gem на балансе';
  END IF;

  INSERT INTO withdrawal_requests (user_id, coins_amount, rub_amount, status, payment_details)
  VALUES (v_user, v_gems, v_rub, 'pending', 'masked')
  RETURNING withdrawal_requests.id INTO v_withdrawal_id;

  RETURN QUERY SELECT v_withdrawal_id, v_rub;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_gem_withdrawal(int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_gem_withdrawal(int, text) TO authenticated;

CREATE OR REPLACE FUNCTION refund_gem_withdrawal(
  p_withdrawal_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_gems int;
BEGIN
  -- Idempotent refund: claim the row out of the refundable state in one
  -- statement so concurrent retries cannot double-refund.
  UPDATE withdrawal_requests
  SET status = 'failed',
      refund_issued_at = now(),
      last_error = btrim(coalesce(p_reason, 'unknown'))
  WHERE id = p_withdrawal_id
    AND status = 'pending'
    AND refund_issued_at IS NULL
  RETURNING user_id, coins_amount INTO v_user, v_gems;

  IF v_user IS NULL THEN
    RETURN; -- already refunded/completed; nothing to do
  END IF;

  UPDATE profiles
  SET donate_coins = donate_coins + v_gems
  WHERE id = v_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION refund_gem_withdrawal(uuid, text) FROM PUBLIC, anon;
