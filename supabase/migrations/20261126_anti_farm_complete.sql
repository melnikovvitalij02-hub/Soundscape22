-- ============================================================
-- ПОЛНАЯ МИГРАЦИЯ: Защита от накрутки XP и рейтинга
-- + Уникальный счётчик прослушиваний
-- ============================================================

-- ============================================================
-- 1. Таблица учёта XP за прослушивание/лайк бита
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
-- 2. Функция claim_beat_xp — защита от накрутки XP за прослушивание
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
-- 3. Функция claim_like_xp — XP за лайк только один раз
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

  -- Проверяем, получал ли уже XP за лайк этого бита
  -- Используем отдельное поле claim_type или проверяем через beat_xp_claims
  -- Упрощение: если запись есть в beat_xp_claims — XP уже был выдан
  SELECT EXISTS (
    SELECT 1 FROM beat_xp_claims
    WHERE user_id = v_user AND beat_id = p_beat_id
  ) INTO v_already_claimed;

  IF v_already_claimed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- Фиксируем факт получения XP за лайк
  INSERT INTO beat_xp_claims (user_id, beat_id, claimed_at)
  VALUES (v_user, p_beat_id, NOW())
  ON CONFLICT (user_id, beat_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_like_xp(UUID) TO authenticated;

-- ============================================================
-- 4. Функция record_unique_play_30d — уникальность прослушивания
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

  -- Увеличиваем play_count в beats (для отображения)
  UPDATE beats SET play_count = play_count + 1 WHERE id = p_beat_id;

  RETURN jsonb_build_object('counted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION record_unique_play_30d(UUID) TO authenticated;

-- ============================================================
-- 5. Функция count_anon_play — для гостей (без наград)
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
-- 6. Функция get_trending_beats — с УНИКАЛЬНЫМ счётчиком прослушиваний
--    (COUNT DISTINCT listener_id за 30 дней вместо play_count)
-- ============================================================
CREATE OR REPLACE FUNCTION get_trending_beats(p_limit int DEFAULT 50)
RETURNS TABLE (
  rank_position int,
  beat_id uuid,
  creator_id uuid,
  title text,
  genre text,
  bpm int,
  cover_url text,
  audio_url text,
  data jsonb,
  play_count int,
  likes_count int,
  boost_points int,
  score int,
  top3_until timestamptz,
  boost_until timestamptz,
  is_eternal boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_month date := DATE_TRUNC('month', NOW())::date;
BEGIN
  RETURN QUERY
  WITH UniquePlays AS (
    -- УНИКАЛЬНЫЕ прослушивания за 30 дней (COUNT DISTINCT listener_id)
    SELECT 
      bl.beat_id, 
      COUNT(DISTINCT bl.listener_id)::int as unique_plays
    FROM beat_listens bl
    WHERE bl.listened_at >= NOW() - INTERVAL '30 days'
    GROUP BY bl.beat_id
  ),
  MonthlyLikes AS (
    -- Лайки за текущий месяц (для ежемесячного рейтинга)
    SELECT 
      bl.beat_id, 
      COUNT(bl.id)::int as m_likes
    FROM beat_likes bl
    WHERE DATE_TRUNC('month', bl.created_at)::date = v_current_month
    GROUP BY bl.beat_id
  ),
  ActiveBoosts AS (
    -- Активные бусты (не обнуляются)
    SELECT 
      beat_id,
      COALESCE(SUM(boost_points), 0)::int as total_boost,
      MAX(CASE WHEN boost_type = 'top3' THEN expires_at END) as top3_until,
      MAX(CASE WHEN boost_type != 'top3' THEN expires_at END) as boost_until,
      BOOL_OR(is_eternal) as is_eternal
    FROM beat_boosts
    WHERE expires_at > NOW() OR is_eternal = true
    GROUP BY beat_id
  )
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY (COALESCE(up.unique_plays, 0) + (COALESCE(ml.m_likes, 0) * 3) + COALESCE(ab.total_boost, 0)) DESC, b.created_at DESC
    )::int as rank_position,
    b.id as beat_id,
    b.user_id as creator_id,
    b.title,
    b.genre,
    b.bpm,
    b.cover_url,
    b.audio_url,
    b.data,
    COALESCE(up.unique_plays, 0) as play_count,  -- УНИКАЛЬНЫЕ прослушивания
    COALESCE(ml.m_likes, 0) as likes_count,
    COALESCE(ab.total_boost, 0) as boost_points,
    (COALESCE(up.unique_plays, 0) + (COALESCE(ml.m_likes, 0) * 3) + COALESCE(ab.total_boost, 0)) as score,
    ab.top3_until,
    ab.boost_until,
    COALESCE(ab.is_eternal, false) as is_eternal
  FROM beats b
  LEFT JOIN UniquePlays up ON b.id = up.beat_id
  LEFT JOIN MonthlyLikes ml ON b.id = ml.beat_id
  LEFT JOIN ActiveBoosts ab ON b.id = ab.beat_id
  WHERE b.is_public = true
  ORDER BY score DESC, b.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_trending_beats(int) TO authenticated;

-- ============================================================
-- 7. Индексы для производительности
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_beat_listens_recent
ON beat_listens (beat_id, listener_id, listened_at)
WHERE listened_at >= NOW() - INTERVAL '30 days';

CREATE INDEX IF NOT EXISTS idx_beat_likes_month
ON beat_likes (beat_id, created_at)
WHERE DATE_TRUNC('month', created_at)::date = DATE_TRUNC('month', NOW())::date;

-- Массовое получение уникальных счётчиков прослушиваний
CREATE OR REPLACE FUNCTION get_unique_play_count_batch(p_beat_ids UUID[])
RETURNS TABLE(beat_id UUID, unique_plays INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bl.beat_id, COUNT(DISTINCT bl.listener_id)::INT as unique_plays
  FROM beat_listens bl
  WHERE bl.beat_id = ANY(p_beat_ids)
  GROUP BY bl.beat_id;
$$;

GRANT EXECUTE ON FUNCTION get_unique_play_count_batch(UUID[]) TO authenticated;