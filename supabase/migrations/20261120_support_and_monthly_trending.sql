-- 1. Донат автору с коэффициентом 0.9 (атомарно)
CREATE OR REPLACE FUNCTION support_beat_author(
  p_beat_id uuid, p_amount int, p_currency text, p_message text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_supporter_balance int;
  v_received int;
BEGIN
  IF p_amount < 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'min_amount'); END IF;

  SELECT user_id INTO v_creator FROM beats WHERE id = p_beat_id;
  IF v_creator IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'beat_not_found'); END IF;
  IF v_creator = auth.uid() THEN RETURN jsonb_build_object('ok', false, 'reason', 'own_beat'); END IF;

  SELECT coins, donate_coins INTO v_supporter_balance FROM profiles WHERE id = auth.uid();
  IF p_currency = 'gem' THEN
    IF donate_coins < p_amount THEN RETURN jsonb_build_object('ok', false, 'reason', 'insufficient'); END IF;
    v_received := FLOOR(p_amount * 0.9);
    UPDATE profiles SET donate_coins = donate_coins - p_amount WHERE id = auth.uid();
    UPDATE profiles SET donate_coins = donate_coins + v_received WHERE id = v_creator;
  ELSE
    IF coins < p_amount THEN RETURN jsonb_build_object('ok', false, 'reason', 'insufficient'); END IF;
    v_received := FLOOR(p_amount * 0.9);
    UPDATE profiles SET coins = coins - p_amount WHERE id = auth.uid();
    UPDATE profiles SET coins = coins + v_received WHERE id = v_creator;
  END IF;

  INSERT INTO support_donations (supporter_id, creator_id, amount, currency, message)
  VALUES (auth.uid(), v_creator, p_amount, p_currency, p_message);

  RETURN jsonb_build_object('ok', true, 'creator_received', v_received);
END;
$$;
GRANT EXECUTE ON FUNCTION support_beat_author(uuid, int, text, text) TO authenticated;

-- 2. Месячные прослушивания (сброс 1-го числа — автоматически)
CREATE TABLE IF NOT EXISTS beat_monthly_plays (
  beat_id uuid REFERENCES beats(id) ON DELETE CASCADE,
  month_key date NOT NULL,
  plays int NOT NULL DEFAULT 0,
  PRIMARY KEY (beat_id, month_key)
);

CREATE OR REPLACE FUNCTION increment_beat_play(p_beat_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE beats SET play_count = play_count + 1 WHERE id = p_beat_id;
  INSERT INTO beat_monthly_plays (beat_id, month_key, plays)
  VALUES (p_beat_id, DATE_TRUNC('month', NOW())::date, 1)
  ON CONFLICT (beat_id, month_key) DO UPDATE SET plays = beat_monthly_plays.plays + 1;
$$;
GRANT EXECUTE ON FUNCTION increment_beat_play(uuid) TO authenticated;