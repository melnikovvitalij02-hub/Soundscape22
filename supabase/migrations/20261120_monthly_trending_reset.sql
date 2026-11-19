-- 1. Убедимся, что у лайков есть дата создания (если её нет)
ALTER TABLE beat_likes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_beat_likes_month ON beat_likes (beat_id, created_at);

-- 2. Индекс для быстрых подсчётов прослушиваний по месяцам
CREATE INDEX IF NOT EXISTS idx_beat_listens_month ON beat_listens (beat_id, listened_at);

-- 3. Перезаписываем функцию получения горящих треков
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
  WITH MonthlyStats AS (
    -- Считаем прослушивания ТОЛЬКО за текущий месяц
    SELECT 
      bl.beat_id, 
      COUNT(bl.id)::int as m_plays
    FROM beat_listens bl
    WHERE DATE_TRUNC('month', bl.listened_at)::date = v_current_month
    GROUP BY bl.beat_id
  ),
  MonthlyLikes AS (
    -- Считаем лайки ТОЛЬКО за текущий месяц
    SELECT 
      bl.beat_id, 
      COUNT(bl.id)::int as m_likes
    FROM beat_likes bl
    WHERE DATE_TRUNC('month', bl.created_at)::date = v_current_month
    GROUP BY bl.beat_id
  ),
  ActiveBoosts AS (
    -- Суммируем очки активных бустов (они НЕ обнуляются, пока не истечёт срок)
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
      ORDER BY (COALESCE(ms.m_plays, 0) + (COALESCE(ml.m_likes, 0) * 3) + COALESCE(ab.total_boost, 0)) DESC, b.created_at DESC
    )::int as rank_position,
    b.id as beat_id,
    b.user_id as creator_id,
    b.title,
    b.genre,
    b.bpm,
    b.cover_url,
    b.audio_url,
    b.data,
    COALESCE(ms.m_plays, 0) as play_count,
    COALESCE(ml.m_likes, 0) as likes_count,
    COALESCE(ab.total_boost, 0) as boost_points,
    (COALESCE(ms.m_plays, 0) + (COALESCE(ml.m_likes, 0) * 3) + COALESCE(ab.total_boost, 0)) as score,
    ab.top3_until,
    ab.boost_until,
    COALESCE(ab.is_eternal, false) as is_eternal
  FROM beats b
  LEFT JOIN MonthlyStats ms ON b.id = ms.beat_id
  LEFT JOIN MonthlyLikes ml ON b.id = ml.beat_id
  LEFT JOIN ActiveBoosts ab ON b.id = ab.beat_id
  WHERE b.is_public = true
  ORDER BY score DESC, b.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_trending_beats(int) TO authenticated;