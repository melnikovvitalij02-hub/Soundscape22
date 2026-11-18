-- ============================================================
-- Монетизация прослушиваний: 0.5 Gem за первый трек автора
-- в текущем месяце (уникальность по паре слушатель+автор)
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
  v_current_month DATE;
  v_already_rewarded BOOLEAN;
BEGIN
  -- 1. Находим создателя бита
  SELECT user_id INTO v_creator_id FROM beats WHERE id = p_beat_id;
  IF v_creator_id IS NULL OR v_creator_id = auth.uid() THEN
    RETURN;
  END IF;

  -- 2. Проверяем активный премиум у создателя
  SELECT (is_premium = true AND (premium_expires_at IS NULL OR premium_expires_at > NOW()))
  INTO v_has_premium
  FROM profiles
  WHERE id = v_creator_id;
  IF v_has_premium IS NOT TRUE THEN
    RETURN;
  END IF;

  v_current_month := DATE_TRUNC('month', NOW())::DATE;

  -- 3. Проверяем: слушал ли этот пользователь ЛЮБОЙ трек этого автора в этом месяце
  SELECT EXISTS (
    SELECT 1
    FROM beat_listens bl
    JOIN beats b ON b.id = bl.beat_id
    WHERE bl.listener_id = auth.uid()
      AND b.user_id = v_creator_id
      AND DATE_TRUNC('month', bl.listened_at)::DATE = v_current_month
  ) INTO v_already_rewarded;

  -- Если уже слушал в этом месяце — не начисляем
  IF v_already_rewarded THEN
    RETURN;
  END IF;

  -- 4. Записываем прослушивание
  INSERT INTO beat_listens (beat_id, listener_id, listened_at)
  VALUES (p_beat_id, auth.uid(), NOW());

  -- 5. Начисляем фиксированные 0.5 Gem
  UPDATE profiles
  SET donate_coins = donate_coins + 0.5
  WHERE id = v_creator_id;

  -- 6. Пишем в журнал начислений
  INSERT INTO beat_reward_ledger (beat_id, creator_id, listener_id, amount, listen_date, created_at)
  VALUES (p_beat_id, v_creator_id, auth.uid(), 0.5, NOW()::DATE, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_beat_listen_and_reward(UUID, NUMERIC, NUMERIC) TO authenticated;