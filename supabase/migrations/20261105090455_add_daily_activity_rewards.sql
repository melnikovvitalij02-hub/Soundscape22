/*
# Daily activity rewards (5+ minutes in Soundscape per day)

1. What it does
- While a signed-in user has Soundscape open and visible, the app sends a small heartbeat about every 30 seconds.
- The server adds the time between heartbeats to today's active time for that user.
- Each heartbeat adds at most 60 seconds, so a closed or hidden tab cannot pile up time.
- Once a day, after 5 minutes of active time, the user can claim a coin reward.

2. New tables
- `daily_activity`: one row per user per UTC day with `seconds_active` and `last_heartbeat_at`.
- `activity_reward_claims`: one row per user per day that was claimed, with minutes, coins paid, streak length and whether a jackpot hit.

3. Reward rules
- Base coins by active time: 5 to 14 minutes = 20, 15 to 29 = 40, 30 to 59 = 75, 60 or more = 150.
- Streak bonus for consecutive claim days: day 3 = +30, day 7 = +150, day 14 = +400, day 30 = +1000.
- Jackpot: a 10% chance that the whole reward is tripled.
- Coins are paid through the existing server coin function, so balance limits and the coin history still apply.

4. Security
- Both tables have row level security enabled. Signed-in users can only read their own rows.
- Clients cannot write to either table directly. All writes go through the two functions below.
- `record_activity_heartbeat()` and `claim_activity_reward()` are SECURITY DEFINER, bound to `auth.uid()`, and callable only by signed-in users. EXECUTE is revoked from PUBLIC and anon.
- Each user is locked with an advisory lock during a heartbeat or claim, so parallel tabs cannot double-count time or claim twice.

5. Important notes
- Time is counted per UTC day.
- The heartbeat counts any time the tab is visible while signed in. A user who leaves a visible tab open without interacting is still counted.
*/

CREATE TABLE IF NOT EXISTS public.daily_activity (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  seconds_active integer NOT NULL DEFAULT 0 CHECK (seconds_active >= 0),
  last_heartbeat_at timestamptz,
  PRIMARY KEY (user_id, activity_date)
);

CREATE TABLE IF NOT EXISTS public.activity_reward_claims (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  minutes integer NOT NULL,
  coins integer NOT NULL,
  streak_days integer NOT NULL,
  jackpot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, claim_date)
);

ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_reward_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.daily_activity FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.activity_reward_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.daily_activity TO authenticated;
GRANT SELECT ON public.activity_reward_claims TO authenticated;

DROP POLICY IF EXISTS "select_own_daily_activity" ON public.daily_activity;
CREATE POLICY "select_own_daily_activity" ON public.daily_activity FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_activity_reward_claims" ON public.activity_reward_claims;
CREATE POLICY "select_own_activity_reward_claims" ON public.activity_reward_claims FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_activity_heartbeat()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_last timestamptz;
  v_delta integer := 0;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('activity:' || v_uid::text, 0));

  SELECT a.last_heartbeat_at INTO v_last
  FROM public.daily_activity a
  WHERE a.user_id = v_uid
  ORDER BY a.activity_date DESC
  LIMIT 1;

  IF v_last IS NOT NULL THEN
    v_delta := least(60, greatest(0, floor(extract(epoch FROM now() - v_last))::integer));
  END IF;

  INSERT INTO public.daily_activity AS da (user_id, activity_date, seconds_active, last_heartbeat_at)
  VALUES (v_uid, v_today, v_delta, now())
  ON CONFLICT (user_id, activity_date) DO UPDATE
    SET seconds_active = da.seconds_active + excluded.seconds_active,
        last_heartbeat_at = excluded.last_heartbeat_at
  RETURNING da.seconds_active INTO v_total;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_activity_reward()
RETURNS TABLE (
  reward_coins integer,
  reward_minutes integer,
  reward_streak integer,
  reward_jackpot boolean,
  reward_balance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_seconds integer;
  v_minutes integer;
  v_prev_streak integer;
  v_streak integer;
  v_base integer;
  v_bonus integer;
  v_jackpot boolean;
  v_coins integer;
  v_balance integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('activity:' || v_uid::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.activity_reward_claims c
    WHERE c.user_id = v_uid AND c.claim_date = v_today
  ) THEN
    RAISE EXCEPTION 'Already claimed today';
  END IF;

  SELECT a.seconds_active INTO v_seconds
  FROM public.daily_activity a
  WHERE a.user_id = v_uid AND a.activity_date = v_today;

  IF coalesce(v_seconds, 0) < 300 THEN
    RAISE EXCEPTION 'Not enough activity today';
  END IF;

  SELECT c.streak_days INTO v_prev_streak
  FROM public.activity_reward_claims c
  WHERE c.user_id = v_uid AND c.claim_date = v_today - 1;

  v_streak := coalesce(v_prev_streak, 0) + 1;
  v_minutes := v_seconds / 60;

  v_base := CASE
    WHEN v_minutes >= 60 THEN 150
    WHEN v_minutes >= 30 THEN 75
    WHEN v_minutes >= 15 THEN 40
    ELSE 20
  END;

  v_bonus := CASE
    WHEN v_streak % 30 = 0 THEN 1000
    WHEN v_streak % 14 = 0 THEN 400
    WHEN v_streak % 7 = 0 THEN 150
    WHEN v_streak % 3 = 0 THEN 30
    ELSE 0
  END;

  v_jackpot := random() < 0.1;
  v_coins := (v_base + v_bonus) * CASE WHEN v_jackpot THEN 3 ELSE 1 END;

  INSERT INTO public.activity_reward_claims (user_id, claim_date, minutes, coins, streak_days, jackpot)
  VALUES (v_uid, v_today, v_minutes, v_coins, v_streak, v_jackpot);

  v_balance := public.change_coins(v_coins, 'activity_reward');

  RETURN QUERY SELECT v_coins, v_minutes, v_streak, v_jackpot, v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_activity_heartbeat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_activity_heartbeat() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_activity_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_activity_reward() TO authenticated;
