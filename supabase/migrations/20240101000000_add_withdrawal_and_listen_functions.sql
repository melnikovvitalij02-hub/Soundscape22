-- ============================================================
-- Функция запроса на вывод (минимум 300 Gem, курс 0.7)
-- ============================================================
CREATE OR REPLACE FUNCTION request_withdrawal(
  p_coins_amount INT,
  p_payment_details TEXT
)
RETURNS JSON AS $$
DECLARE
  v_balance INT;
  v_rub_amount NUMERIC;
BEGIN
  -- 1. Проверка минимума
  IF p_coins_amount < 300 THEN
    RETURN json_build_object('error', 'Минимум 300 Gem для вывода');
  END IF;

  -- 2. Проверка баланса
  SELECT donate_coins INTO v_balance FROM profiles WHERE id = auth.uid();
  IF v_balance < p_coins_amount THEN
    RETURN json_build_object('error', 'Недостаточно Gem на балансе');
  END IF;

  -- 3. Проверка на активную заявку
  IF EXISTS (SELECT 1 FROM withdrawal_requests WHERE user_id = auth.uid() AND status = 'pending') THEN
    RETURN json_build_object('error', 'У вас уже есть активная заявка на вывод');
  END IF;

  -- 4. Расчёт рублей (курс 0.7)
  v_rub_amount := ROUND(p_coins_amount * 0.7, 2);

  -- 5. Списываем гемы
  UPDATE profiles SET donate_coins = donate_coins - p_coins_amount WHERE id = auth.uid();

  -- 6. Создаём заявку
  INSERT INTO withdrawal_requests (user_id, gem_amount, rub_amount, payout_details, status)
  VALUES (auth.uid(), p_coins_amount, v_rub_amount, p_payment_details, 'pending');

  RETURN json_build_object('success', true, 'rub_amount', v_rub_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION request_withdrawal(INT, TEXT) TO authenticated;


-- ============================================================
-- Функция монетизации прослушиваний (уникальность раз в месяц)
-- ============================================================
CREATE OR REPLACE FUNCTION record_beat_listen_and_reward(
  p_beat_id UUID,
  p_track_duration_sec NUMERIC,
  p_listened_sec NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_creator_id UUID;
  v_has_premium BOOLEAN;
  v_reward NUMERIC;
  v_current_month DATE;
  v_last_listen_month DATE;
BEGIN
  SELECT user_id INTO v_creator_id FROM beats WHERE id = p_beat_id;
  IF v_creator_id IS NULL OR v_creator_id = auth.uid() THEN RETURN; END IF;

  SELECT (is_premium = true AND (premium_expires_at IS NULL OR premium_expires_at > NOW()))
  INTO v_has_premium FROM profiles WHERE id = v_creator_id;
  IF v_has_premium IS NOT TRUE THEN RETURN; END IF;

  v_current_month := DATE_TRUNC('month', NOW())::DATE;

  -- Проверяем, слушал ли уже в этом месяце
  SELECT (DATE_TRUNC('month', listened_at))::DATE INTO v_last_listen_month
  FROM beat_listens
  WHERE beat_id = p_beat_id AND listener_id = auth.uid()
  ORDER BY listened_at DESC LIMIT 1;

  IF v_last_listen_month = v_current_month THEN RETURN; END IF;

  -- Записываем прослушивание
  INSERT INTO beat_listens (beat_id, listener_id, listened_at)
  VALUES (p_beat_id, auth.uid(), NOW());

  -- Считаем награду: (0.5 / n) * прослушанные_секунды, округление вниз до 2 знаков
  v_reward := FLOOR(((0.5 / NULLIF(p_track_duration_sec, 0)) * p_listened_sec) * 100) / 100;
  IF v_reward > 0.50 THEN v_reward := 0.50; END IF;

  -- Начисляем
  UPDATE profiles SET donate_coins = donate_coins + v_reward WHERE id = v_creator_id;

  -- Пишем в журнал
  INSERT INTO beat_reward_ledger (beat_id, creator_id, listener_id, amount, listen_date, created_at)
  VALUES (p_beat_id, v_creator_id, auth.uid(), v_reward, NOW()::DATE, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_beat_listen_and_reward(UUID, NUMERIC, NUMERIC) TO authenticated;