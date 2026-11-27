/*
# Fix Gem rewards for unique listens of premium authors' beats

## Problem
The 3-argument version of `record_beat_listen_and_reward` writes a 0.5 Gem
reward into `profiles.donate_coins` and `beat_reward_ledger.amount`, but both
columns are `integer`. Every 0.5 Gem was rounded by Postgres to 1 (or could be
dropped), so the "0.5 Gem per unique monthly listener" rule never worked
transparently and the ledger logged a wrong amount (1 instead of 0.5).

## Changes
1. `beat_reward_ledger.amount` changed from int to numeric(10,2) so 0.5 Gem
   rewards are stored exactly (type widening, no data loss).
2. `profiles.donate_coins` changed from int to numeric(10,2) so fractional Gem
   balances accumulate correctly. Existing integer balances keep their values.
3. Consolidated `record_beat_listen_and_reward`: the obsolete 2-argument
   overload is removed; the remaining (uuid, numeric, numeric) version:
   - rejects unauthenticated calls (auth.uid() must exist),
   - keeps the creator-premium check and the once-per-month uniqueness rule
     (one reward per listener+author pair per month, any of their beats),
   - credits exactly 0.5 Gem and logs 0.5 in the ledger.
4. Grants: EXECUTE granted to authenticated only; PUBLIC/anon revoked.

## Notes
- No rows are deleted; existing balances and ledger rows are preserved and
  only reinterpreted with decimal precision.
- The client already calls the (uuid, numeric, numeric) signature, so no
  frontend change is needed for this fix.
*/

ALTER TABLE beat_reward_ledger
  ALTER COLUMN amount TYPE numeric(10,2);

ALTER TABLE profiles
  ALTER COLUMN donate_coins TYPE numeric(10,2);

DROP FUNCTION IF EXISTS public.record_beat_listen_and_reward(uuid, numeric);

CREATE OR REPLACE FUNCTION public.record_beat_listen_and_reward(
  p_beat_id UUID,
  p_track_duration_sec NUMERIC,
  p_listened_sec NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_creator_id UUID;
  v_has_premium BOOLEAN;
  v_current_month DATE;
  v_already_rewarded BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_creator_id FROM beats WHERE id = p_beat_id;
  IF v_creator_id IS NULL OR v_creator_id = auth.uid() THEN
    RETURN;
  END IF;

  SELECT (is_premium = true AND (premium_expires_at IS NULL OR premium_expires_at > NOW()))
  INTO v_has_premium
  FROM profiles
  WHERE id = v_creator_id;
  IF v_has_premium IS NOT TRUE THEN
    RETURN;
  END IF;

  v_current_month := DATE_TRUNC('month', NOW())::DATE;

  SELECT EXISTS (
    SELECT 1
    FROM beat_listens bl
    JOIN beats b ON b.id = bl.beat_id
    WHERE bl.listener_id = auth.uid()
      AND b.user_id = v_creator_id
      AND DATE_TRUNC('month', bl.listened_at)::DATE = v_current_month
  ) INTO v_already_rewarded;

  IF v_already_rewarded THEN
    RETURN;
  END IF;

  INSERT INTO beat_listens (beat_id, listener_id, listened_at)
  VALUES (p_beat_id, auth.uid(), NOW());

  UPDATE profiles
  SET donate_coins = donate_coins + 0.5
  WHERE id = v_creator_id;

  INSERT INTO beat_reward_ledger (beat_id, creator_id, listener_id, amount, listen_date, created_at)
  VALUES (p_beat_id, v_creator_id, auth.uid(), 0.5, NOW()::DATE, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.record_beat_listen_and_reward(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_beat_listen_and_reward(UUID, NUMERIC, NUMERIC) TO authenticated;
