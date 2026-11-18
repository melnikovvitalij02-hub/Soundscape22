CREATE OR REPLACE FUNCTION open_sticker_chest()
RETURNS JSON AS $$
DECLARE
  v_balance INT;
  v_sticker RECORD;
  v_is_duplicate BOOLEAN;
BEGIN
  -- Проверяем баланс
  SELECT coins INTO v_balance FROM profiles WHERE id = auth.uid();
  IF v_balance < 1000 THEN
    RETURN json_build_object('error', 'Недостаточно монет');
  END IF;

  -- Списываем 1000 монет
  UPDATE profiles SET coins = coins - 1000 WHERE id = auth.uid();

  -- Выбираем случайный стикер
  SELECT * INTO v_sticker FROM stickers ORDER BY RANDOM() LIMIT 1;
  
  IF v_sticker IS NULL THEN
    UPDATE profiles SET coins = coins + 1000 WHERE id = auth.uid();
    RETURN json_build_object('error', 'Стикеры закончились');
  END IF;

  -- Проверяем, есть ли уже такой стикер
  SELECT EXISTS (
    SELECT 1 FROM user_stickers 
    WHERE user_id = auth.uid() AND sticker_id = v_sticker.id
  ) INTO v_is_duplicate;

  -- Если не дубликат — добавляем
  IF NOT v_is_duplicate THEN
    INSERT INTO user_stickers (user_id, sticker_id)
    VALUES (auth.uid(), v_sticker.id);
  END IF;

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