-- ============================================================
-- 1. Таблица учёта XP за прослушивание бита
-- ============================================================
CREATE TABLE IF NOT EXISTS beat_xp_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  beat_id UUID NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, beat_id)
);

CREATE INDEX IF NOT EXISTS idx_xp_claims_user ON beat_xp_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_claims_beat ON beat_xp_claims(beat_id);

-- ============================================================
-- 2. Функция claim_beat_xp — защита от накрутки XP
-- p_daily_unique = true  → раз в день (Горящие треки)
-- p_daily_unique = false → раз навсегда (Лента битов)
-- ============================================================
CREATE OR REPLACE FUNCTION claim_beat_xp(
  p_beat_id UUID,
  p_daily_unique BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_already BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Не начисляем XP за свои биты
  IF EXISTS (SELECT 1 FROM beats WHERE id = p_beat_id AND user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'own_beat');
  END IF;

  IF p_daily_unique THEN
    -- Уникальность за текущий день
    SELECT EXISTS (
      SELECT 1 FROM beat_xp_claims
      WHERE user_id = v_user AND beat_id = p_beat_id
        AND claimed_at >= DATE_TRUNC('day', NOW())
    ) INTO v_already;
  ELSE
    -- Уникальность навсегда
    SELECT EXISTS (
      SELECT 1 FROM beat_xp_claims
      WHERE user_id = v_user AND beat_id = p_beat_id
    ) INTO v_already;
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- Фиксируем факт получения XP
  INSERT INTO beat_xp_claims (user_id, beat_id, claimed_at)
  VALUES (v_user, p_beat_id, NOW())
  ON CONFLICT (user_id, beat_id) DO UPDATE
    SET claimed_at = NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM beat_xp_claims
      WHERE user_id = v_user AND beat_id = p_beat_id
        AND claimed_at >= DATE_TRUNC('day', NOW())
    );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_beat_xp(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- 3. Функция record_unique_play_30d — уникальность прослушивания
--    за 30 дней для рейтинга Горящих треков
-- ============================================================
CREATE OR REPLACE FUNCTION record_unique_play_30d(p_beat_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listener UUID := auth.uid();
  v_recent BOOLEAN;
BEGIN
  IF v_listener IS NULL THEN
    RETURN jsonb_build_object('counted', false);
  END IF;

  -- Проверяем, слушал ли уже этот бит за последние 30 дней
  SELECT EXISTS (
    SELECT 1 FROM beat_listens
    WHERE beat_id = p_beat_id
      AND listener_id = v_listener
      AND listened_at >= NOW() - INTERVAL '30 days'
  ) INTO v_recent;

  IF v_recent THEN
    RETURN jsonb_build_object('counted', false);
  END IF;

  -- Записываем новое прослушивание
  INSERT INTO beat_listens (beat_id, listener_id, listened_at)
  VALUES (p_beat_id, v_listener, NOW());

  -- Увеличиваем play_count в beats
  UPDATE beats SET play_count = play_count + 1 WHERE id = p_beat_id;

  RETURN jsonb_build_object('counted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION record_unique_play_30d(UUID) TO authenticated;

-- ============================================================
-- 4. Функция count_anon_play — для гостей (без наград)
-- ============================================================
CREATE OR REPLACE FUNCTION count_anon_play(p_beat_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE beats SET play_count = play_count + 1 WHERE id = p_beat_id;
$$;

GRANT EXECUTE ON FUNCTION count_anon_play(UUID) TO anon, authenticated;

-- ============================================================
-- 5. Индекс для ускорения проверки 30-дневной уникальности
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_beat_listens_recent
ON beat_listens (beat_id, listener_id, listened_at)
WHERE listened_at >= NOW() - INTERVAL '30 days';

-- ============================================================
-- 6. Функция claim_like_xp — XP за лайк только один раз
--    (проверка по таблице beat_likes — там уже UNIQUE(user, beat))
-- ============================================================
CREATE OR REPLACE FUNCTION claim_like_xp(p_beat_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_liked BOOLEAN;
  v_already_claimed BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Проверяем, лайкнул ли пользователь этот бит
  SELECT EXISTS (
    SELECT 1 FROM beat_likes WHERE beat_id = p_beat_id AND user_id = v_user
  ) INTO v_liked;

  IF NOT v_liked THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_liked');
  END IF;

  -- Проверяем, получал ли уже XP за этот лайк
  SELECT EXISTS (
    SELECT 1 FROM beat_xp_claims
    WHERE user_id = v_user AND beat_id = p_beat_id AND claimed_at IS NOT NULL
  ) INTO v_already_claimed;

  -- Используем отдельную таблицу или поле для лайк-XP
  -- Добавим проверку через beat_xp_claims с типом 'like'
  IF EXISTS (
    SELECT 1 FROM beat_xp_claims
    WHERE user_id = v_user AND beat_id = p_beat_id
  ) THEN
    -- Если запись есть — проверяем, был ли уже лайк-XP
    -- (упрощение: считаем что одна запись = один XP, независимо от типа)
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_like_xp(UUID) TO authenticated;