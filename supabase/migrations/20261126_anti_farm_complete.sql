-- ============================================================
-- ПОЛНАЯ МИГРАЦИЯ: Защита от накрутки XP, уникальные счётчики,
-- поддержка авторов, безопасная смена аватарки, косметика
-- ============================================================

-- ============================================================
-- 1. Таблица учёта XP за прослушивание/лайк бита
-- ============================================================
CREATE TABLE IF NOT EXISTS beat_xp_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  beat_id UUID NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL DEFAULT 'listen' CHECK (claim_type IN ('listen', 'like')),
  claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, beat_id, claim_type)
);

CREATE INDEX IF NOT EXISTS idx_xp_claims_user ON beat_xp_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_claims_beat ON beat_xp_claims(beat_id);
CREATE INDEX IF NOT EXISTS idx_xp_claims_type ON beat_xp_claims(user_id, beat_id, claim_type);

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
      WHERE user_id = v_user 
        AND beat_id = p_beat_id
        AND claim_type = 'listen'
        AND claimed_at >= DATE_TRUNC('day', NOW())
    ) INTO v_already;
  ELSE
    -- Уникальность навсегда
    SELECT EXISTS (
      SELECT 1 FROM beat_xp_claims
      WHERE user_id = v_user 
        AND beat_id = p_beat_id
        AND claim_type = 'listen'
    ) INTO v_already;
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- Фиксируем факт получения XP
  INSERT INTO beat_xp_claims (user_id, beat_id, claim_type, claimed_at)
  VALUES (v_user, p_beat_id, 'listen', NOW())
  ON CONFLICT (user_id, beat_id, claim_type) DO UPDATE
    SET claimed_at = NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM beat_xp_claims
      WHERE user_id = v_user 
        AND beat_id = p_beat_id
        AND claim_type = 'listen'
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
  v_already BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Проверяем, лайкнул ли пользователь этот бит
  SELECT EXISTS (
    SELECT 1 FROM beat_likes 
    WHERE beat_id = p_beat_id AND user_id = v_user
  ) INTO v_liked;

  IF NOT v_liked THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_liked');
  END IF;

  -- Проверяем, получал ли уже XP за лайк этого бита
  SELECT EXISTS (
    SELECT 1 FROM beat_xp_claims
    WHERE user_id = v_user 
      AND beat_id = p_beat_id
      AND claim_type = 'like'
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- Фиксируем факт получения XP за лайк
  INSERT INTO beat_xp_claims (user_id, beat_id, claim_type, claimed_at)
  VALUES (v_user, p_beat_id, 'like', NOW())
  ON CONFLICT (user_id, beat_id, claim_type) DO NOTHING;

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
-- 6. Функция get_unique_play_count_batch — массовое получение
--    уникальных счётчиков прослушиваний
-- ============================================================
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

-- ============================================================
-- 7. Функция get_trending_beats — с УНИКАЛЬНЫМ счётчиком
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
    -- УНИКАЛЬНЫЕ прослушивания за 30 дней
    SELECT 
      bl.beat_id, 
      COUNT(DISTINCT bl.listener_id)::int as unique_plays
    FROM beat_listens bl
    WHERE bl.listened_at >= NOW() - INTERVAL '30 days'
    GROUP BY bl.beat_id
  ),
  MonthlyLikes AS (
    -- Лайки за текущий месяц
    SELECT 
      bl.beat_id, 
      COUNT(bl.id)::int as m_likes
    FROM beat_likes bl
    WHERE DATE_TRUNC('month', bl.created_at)::date = v_current_month
    GROUP BY bl.beat_id
  ),
  ActiveBoosts AS (
    -- Активные бусты
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
    COALESCE(up.unique_plays, 0) as play_count,
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
-- 8. Таблица поддержки авторов (донаты)
-- ============================================================
CREATE TABLE IF NOT EXISTS support_donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INT NOT NULL CHECK (amount >= 10),
  currency TEXT NOT NULL CHECK (currency IN ('coin', 'gem')),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_donations_supporter ON support_donations(supporter_id);
CREATE INDEX IF NOT EXISTS idx_support_donations_creator ON support_donations(creator_id);
CREATE INDEX IF NOT EXISTS idx_support_donations_created ON support_donations(created_at DESC);

ALTER TABLE support_donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_donations_select"
ON support_donations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "support_donations_insert"
ON support_donations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = supporter_id);

-- ============================================================
-- 9. Функция equip_avatar_from_shop — безопасная смена аватарки
-- ============================================================
CREATE OR REPLACE FUNCTION equip_avatar_from_shop(p_avatar_shop_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_item RECORD;
  v_owned BOOLEAN;
  v_safe_url TEXT;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Получаем данные аватарки из магазина
  SELECT * INTO v_item FROM avatar_shop_items WHERE id = p_avatar_shop_item_id;
  IF v_item IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'item_not_found');
  END IF;

  -- Проверяем, что пользователь купил эту аватарку
  SELECT EXISTS (
    SELECT 1 FROM user_avatars
    WHERE user_id = v_user AND avatar_shop_item_id = p_avatar_shop_item_id
  ) INTO v_owned;

  IF NOT v_owned THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owned');
  END IF;

  -- Валидация URL
  v_safe_url := v_item.image_url;
  IF v_safe_url IS NULL
    OR v_safe_url !~ '^https://'
    OR v_safe_url ~* '(javascript:|data:|vbscript:)'
    OR length(v_safe_url) > 2048
  THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_url');
  END IF;

  -- Обновляем аватарку
  UPDATE profiles
  SET avatar_url = v_safe_url, updated_at = NOW()
  WHERE id = v_user;

  RETURN jsonb_build_object('ok', true, 'avatar_url', v_safe_url);
END;
$$;

GRANT EXECUTE ON FUNCTION equip_avatar_from_shop(UUID) TO authenticated;

-- ============================================================
-- 10. RLS-политика для profiles — запрет прямого изменения avatar_url
-- ============================================================
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "users_can_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_safe" ON profiles;

CREATE POLICY "profiles_update_own_no_avatar"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND OLD.avatar_url = avatar_url
  AND OLD.coins = coins
  AND OLD.donate_coins = donate_coins
  AND OLD.is_premium = is_premium
  AND OLD.premium_expires_at = premium_expires_at
  AND OLD.level = level
  AND OLD.xp = xp
);

-- ============================================================
-- 11. Таблица косметических предметов
-- ============================================================
CREATE TABLE IF NOT EXISTS cosmetic_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('skin', 'frame', 'theme', 'effect')),
  price_gems INT NOT NULL DEFAULT 0,
  price_coins INT NOT NULL DEFAULT 0,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  preview_url TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 12. Таблица купленных косметических предметов пользователя
-- ============================================================
CREATE TABLE IF NOT EXISTS user_cosmetics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES cosmetic_items(id) ON DELETE CASCADE,
  is_equipped BOOLEAN DEFAULT FALSE,
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, cosmetic_id)
);

CREATE INDEX IF NOT EXISTS idx_user_cosmetics_user ON user_cosmetics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_cosmetic ON user_cosmetics(cosmetic_id);

ALTER TABLE user_cosmetics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_cosmetics_select"
ON user_cosmetics FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "user_cosmetics_insert"
ON user_cosmetics FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_cosmetics_update"
ON user_cosmetics FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 13. Функция purchase_cosmetic — покупка косметики
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_cosmetic(
  p_cosmetic_id UUID,
  p_currency TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_item RECORD;
  v_balance INT;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Получаем данные предмета
  SELECT * INTO v_item FROM cosmetic_items WHERE id = p_cosmetic_id;
  IF v_item IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'item_not_found');
  END IF;

  -- Проверяем, не куплен ли уже
  IF EXISTS (SELECT 1 FROM user_cosmetics WHERE user_id = v_user AND cosmetic_id = p_cosmetic_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_owned');
  END IF;

  -- Определяем валюту и баланс
  IF p_currency = 'gem' THEN
    SELECT donate_coins INTO v_balance FROM profiles WHERE id = v_user;
    IF v_balance < v_item.price_gems THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'insufficient');
    END IF;
    UPDATE profiles SET donate_coins = donate_coins - v_item.price_gems WHERE id = v_user;
  ELSIF p_currency = 'coin' THEN
    SELECT coins INTO v_balance FROM profiles WHERE id = v_user;
    IF v_balance < v_item.price_coins THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'insufficient');
    END IF;
    UPDATE profiles SET coins = coins - v_item.price_coins WHERE id = v_user;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_currency');
  END IF;

  -- Добавляем предмет пользователю
  INSERT INTO user_cosmetics (user_id, cosmetic_id, is_equipped)
  VALUES (v_user, p_cosmetic_id, FALSE);

  RETURN jsonb_build_object('ok', true, 'cosmetic_id', p_cosmetic_id);
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_cosmetic(UUID, TEXT) TO authenticated;

-- ============================================================
-- 14. Функция equip_cosmetic — экипировка косметики
-- ============================================================
CREATE OR REPLACE FUNCTION equip_cosmetic(p_cosmetic_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_item RECORD;
  v_owned BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Получаем данные предмета
  SELECT * INTO v_item FROM cosmetic_items WHERE id = p_cosmetic_id;
  IF v_item IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'item_not_found');
  END IF;

  -- Проверяем, что пользователь купил этот предмет
  SELECT EXISTS (
    SELECT 1 FROM user_cosmetics
    WHERE user_id = v_user AND cosmetic_id = p_cosmetic_id
  ) INTO v_owned;

  IF NOT v_owned THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owned');
  END IF;

  -- Снимаем экипировку со всех предметов того же типа
  UPDATE user_cosmetics
  SET is_equipped = FALSE
  WHERE user_id = v_user
    AND cosmetic_id IN (
      SELECT id FROM cosmetic_items WHERE type = v_item.type
    );

  -- Экипируем выбранный предмет
  UPDATE user_cosmetics
  SET is_equipped = TRUE
  WHERE user_id = v_user AND cosmetic_id = p_cosmetic_id;

  RETURN jsonb_build_object('ok', true, 'cosmetic_id', p_cosmetic_id, 'type', v_item.type);
END;
$$;

GRANT EXECUTE ON FUNCTION equip_cosmetic(UUID) TO authenticated;

-- ============================================================
-- 15. Индексы для производительности
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_beat_listens_recent
ON beat_listens (beat_id, listener_id, listened_at)
WHERE listened_at >= NOW() - INTERVAL '30 days';

CREATE INDEX IF NOT EXISTS idx_beat_likes_month
ON beat_likes (beat_id, created_at)
WHERE DATE_TRUNC('month', created_at)::date = DATE_TRUNC('month', NOW())::date;