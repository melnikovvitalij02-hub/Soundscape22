-- ============================================================
-- Открытие сундука стикеров за 1000 монет (рандом)
-- ============================================================
CREATE OR REPLACE FUNCTION open_sticker_chest()
RETURNS JSON AS $$
DECLARE
  v_balance INT;
  v_sticker RECORD;
  v_is_duplicate BOOLEAN;
  v_existing_count INT;
BEGIN
  -- 1. Проверяем баланс монет
  SELECT coins INTO v_balance FROM profiles WHERE id = auth.uid();
  IF v_balance < 1000 THEN
    RETURN json_build_object('error', 'Недостаточно монет. Нужно 1000');
  END IF;

  -- 2. Списываем 1000 монет
  UPDATE profiles SET coins = coins - 1000 WHERE id = auth.uid();

  -- 3. Выбираем случайный стикер (взвешенно по редкости, если есть поле rarity)
  SELECT * INTO v_sticker
  FROM stickers
  ORDER BY RANDOM()
  LIMIT 1;

  IF v_sticker IS NULL THEN
    -- Откатываем списание, если стикеров нет
    UPDATE profiles SET coins = coins + 1000 WHERE id = auth.uid();
    RETURN json_build_object('error', 'Стикеры закончились');
  END IF;

  -- 4. Проверяем, есть ли уже такой стикер у пользователя
  SELECT COUNT(*) INTO v_existing_count
  FROM user_stickers
  WHERE user_id = auth.uid() AND sticker_id = v_sticker.id;

  v_is_duplicate := v_existing_count > 0;

  -- 5. Если это НЕ дубликат — добавляем в коллекцию
  IF NOT v_is_duplicate THEN
    INSERT INTO user_stickers (user_id, sticker_id, obtained_at)
    VALUES (auth.uid(), v_sticker.id, NOW());
  END IF;

  -- 6. Возвращаем результат
  RETURN json_build_object(
    'success', true,
    'sticker_id', v_sticker.id,
    'sticker_name', v_sticker.name,
    'sticker_url', v_sticker.image_url,
    'is_duplicate', v_is_duplicate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION open_sticker_chest() TO authenticated;