-- Таблица учёта получения XP за прослушивание бита
CREATE TABLE IF NOT EXISTS beat_xp_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  beat_id UUID NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, beat_id)  -- гарантирует уникальность навсегда на уровне БД
);

CREATE INDEX IF NOT EXISTS idx_xp_claims_user ON beat_xp_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_claims_beat ON beat_xp_claims(beat_id);

-- Функция попытки получить XP за прослушивание бита
-- p_daily_unique = true  → проверка уникальности за текущий день (для Горящих треков)
-- p_daily_unique = false → проверка уникальности навсегда (для Ленты битов)
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

  -- Проверка: не является ли бит своим
  IF EXISTS (SELECT 1 FROM beats WHERE id = p_beat_id AND user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'own_beat');
  END IF;

  IF p_daily_unique THEN
    -- Уникальность за день
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
  INSERT INTO beat_xp_claims (user_id, beat_id)
  VALUES (v_user, p_beat_id)
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

-- Защита таблицы beat_listens от дубликатов (для рейтинга Горящих треков)
-- Уникальность пары (listener, beat) в течение 30 дней enforced на уровне приложения,
-- но добавим частичный индекс для ускорения проверки:
CREATE INDEX IF NOT EXISTS idx_beat_listens_recent
ON beat_listens (beat_id, listener_id, listened_at)
WHERE listened_at >= NOW() - INTERVAL '30 days';