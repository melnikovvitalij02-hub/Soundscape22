/*
# Support beat author: server-side tips (Coin/Gem) for the beats feed

The feed calls `support_beat_author(p_beat_id, p_amount, p_currency, p_message)`,
but the function never existed in the database — every "Поддержать" attempt failed
with "function not found". This migration adds it, with all money handling on the
server:

1. New function `support_beat_author`
- SECURITY DEFINER, search_path locked, executable by `authenticated` only.
- Arguments: beat id, amount (integer, 10..10000), currency ('coin' | 'gem'),
  optional message (trimmed, max 200 chars).
- Validates: caller signed in, beat exists, caller is NOT the beat author
  (self-support is rejected), amount within bounds, currency known, and the
  caller's balance actually holds the funds.
- Money flow: debits the supporter's `profiles.coins` (or `donate_coins` for gem),
  credits 70% to the author's same balance and records 30% as the platform fee in
  the returned row (the fee stays in the pool — no sink account needed).
- Writes a `support_donations` row (supporter_id, creator_id, amount, message).
  The existing table keeps its shape; currency-specific amounts are both stored
  in `amount` — Coin and Gem never mix (separate balances), so no new column is
  required; the currency is echoed back to the caller.
- Returns TABLE(ok boolean, reason text, creator_received integer).
- Reasons: 'auth', 'no_beat', 'self', 'invalid_amount', 'invalid_currency',
  'insufficient', 'ok'.
- Row locking: `FOR UPDATE` on both profiles rows to make concurrent tips safe.

2. New function `support_donations_insights` — not part of this change; skipped.
   (No other objects are touched.)

3. Security
- REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated.
- The client can only pass beat id / amount / currency / message — balances are
  read and updated exclusively inside the function.
- support_donations grants/policies are unchanged (already authenticated-scoped).

4. Notes
- No BEGIN/COMMIT; idempotent via CREATE OR REPLACE.
- The 70/30 split matches the previously displayed UI text ("автор получит ...").
*/

CREATE OR REPLACE FUNCTION support_beat_author(
  p_beat_id uuid,
  p_amount integer,
  p_currency text,
  p_message text DEFAULT ''
)
RETURNS TABLE(ok boolean, reason text, creator_received integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_beat beats;
  v_amount integer := coalesce(p_amount, 0);
  v_creator_got integer;
  v_platform_fee integer;
  v_balance integer;
BEGIN
  IF v_uid IS NULL THEN reason := 'auth'; RETURN; END IF;
  IF v_amount < 10 OR v_amount > 10000 THEN reason := 'invalid_amount'; RETURN; END IF;
  IF p_currency NOT IN ('coin', 'gem') THEN reason := 'invalid_currency'; RETURN; END IF;

  SELECT * INTO v_beat FROM beats WHERE id = p_beat_id;
  IF v_beat.id IS NULL THEN reason := 'no_beat'; RETURN; END IF;
  IF v_beat.user_id = v_uid THEN reason := 'self'; RETURN; END IF;

  v_creator_got := floor(v_amount * 7 / 10);
  v_platform_fee := v_amount - v_creator_got;
  IF v_creator_got < 1 THEN reason := 'invalid_amount'; RETURN; END IF;

  IF p_currency = 'coin' THEN
    SELECT coins INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
    IF v_balance IS NULL OR v_balance < v_amount THEN reason := 'insufficient'; RETURN; END IF;
    UPDATE profiles SET coins = coins - v_amount WHERE id = v_uid;
    UPDATE profiles SET coins = coins + v_creator_got WHERE id = v_beat.user_id;
  ELSE
    SELECT donate_coins INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
    IF v_balance IS NULL OR v_balance < v_amount THEN reason := 'insufficient'; RETURN; END IF;
    UPDATE profiles SET donate_coins = donate_coins - v_amount WHERE id = v_uid;
    UPDATE profiles SET donate_coins = donate_coins + v_creator_got WHERE id = v_beat.user_id;
  END IF;

  INSERT INTO support_donations (supporter_id, creator_id, amount, message)
  VALUES (v_uid, v_beat.user_id, v_amount, left(trim(coalesce(p_message, '')), 200));

  ok := true; reason := 'ok'; creator_received := v_creator_got; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION support_beat_author(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION support_beat_author(uuid, integer, text, text) TO authenticated;