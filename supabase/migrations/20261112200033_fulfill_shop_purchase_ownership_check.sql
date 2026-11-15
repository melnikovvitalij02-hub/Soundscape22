/*
# Enforce caller ownership in fulfill_shop_purchase

1. Plain-English explanation
   `fulfill_shop_purchase` claimed any pending 'shop' payment row, no matter
   who called it. A signed-in user could pass another user's pending payment
   id (the payment-success page takes the id from the URL) and complete that
   payment before money was actually received. The function now verifies the
   caller is the payment's owner when called as an authenticated user;
   service_role (the YooMoney webhook) may still fulfill any payment.

2. Modified functions
   - `fulfill_shop_purchase`: ownership check between the caller (auth.uid())
     and the payment row's user_id.

3. Security changes
   - None beyond the new check; grants unchanged.
*/

CREATE OR REPLACE FUNCTION public.fulfill_shop_purchase(p_payment_id uuid, p_operation_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_user uuid;
  v_label text;
  v_parts text[];
  v_type text;
  v_item_id uuid;
  v_kind text;
  v_beat_id uuid;
  v_sticker stickers%ROWTYPE;
  v_expires timestamptz;
  v_message text;
BEGIN
  IF auth.uid() IS NULL THEN
    IF coalesce(auth.role(), '') <> 'service_role' THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'not_authorized');
    END IF;
  END IF;

  SELECT * INTO v_payment FROM payments
  WHERE id = p_payment_id AND status = 'pending' AND payment_type = 'shop'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'not_pending_shop');
  END IF;

  IF auth.uid() IS NOT NULL AND v_payment.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'not_authorized');
  END IF;

  v_user := v_payment.user_id;
  v_label := v_payment.label;

  IF v_label IS NULL OR left(v_label, 5) <> 'shop_' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
  END IF;

  v_parts := string_to_array(substring(v_label from 6), '_');
  IF v_parts IS NULL OR array_length(v_parts, 1) < 2 THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
  END IF;

  IF v_parts[array_length(v_parts, 1)] <> v_user::text THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'user_mismatch');
  END IF;

  v_type := v_parts[1];

  IF v_type = 'chest' THEN
    SELECT * INTO v_sticker FROM stickers ORDER BY random() LIMIT 1;
    IF v_sticker.id IS NULL THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'no_stickers');
    END IF;
    INSERT INTO user_stickers (user_id, sticker_id) VALUES (v_user, v_sticker.id)
    ON CONFLICT (user_id, sticker_id) DO NOTHING;
    v_message := 'Стикер: ' || v_sticker.emoji || ' ' || v_sticker.name;
  ELSIF v_type = 'promo' THEN
    IF array_length(v_parts, 1) < 4 THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END IF;
    BEGIN
      v_beat_id := v_parts[2]::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END;
    v_kind := array_to_string(v_parts[3:array_length(v_parts, 1) - 1], '_');
    v_expires := grant_trending_promotion(v_user, v_beat_id, v_kind);
    v_message := 'Продвижение трека активно';
  ELSE
    IF array_length(v_parts, 1) <> 3 THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END IF;
    BEGIN
      v_item_id := v_parts[2]::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END;
    IF v_type = 'sample' THEN
      IF EXISTS (SELECT 1 FROM user_sample_packs WHERE user_id = v_user AND sample_pack_id = v_item_id) THEN
        v_message := 'Сэмпл-пак уже куплен';
      ELSE
        INSERT INTO user_sample_packs (user_id, sample_pack_id, purchased_at) VALUES (v_user, v_item_id, now());
        v_message := 'Сэмпл-пак куплен';
      END IF;
    ELSIF v_type = 'cosmetic' THEN
      IF EXISTS (SELECT 1 FROM user_cosmetics WHERE user_id = v_user AND cosmetic_id = v_item_id) THEN
        v_message := 'Предмет уже куплен';
      ELSE
        INSERT INTO user_cosmetics (user_id, cosmetic_id, is_equipped, purchased_at) VALUES (v_user, v_item_id, false, now());
        v_message := 'Предмет куплен';
      END IF;
    ELSIF v_type = 'boost' THEN
      IF EXISTS (SELECT 1 FROM user_boosts WHERE user_id = v_user AND boost_id = v_item_id) THEN
        v_message := 'Ускорение уже активно';
      ELSE
        INSERT INTO user_boosts (user_id, boost_id, expires_at, created_at)
        SELECT v_user, v_item_id, now() + (b.duration_hours || ' hours')::interval, now()
        FROM boost_items b WHERE b.id = v_item_id;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('granted', false, 'reason', 'item_not_found');
        END IF;
        v_message := 'Ускорение активировано';
      END IF;
    ELSIF v_type = 'avatar' THEN
      IF EXISTS (SELECT 1 FROM user_avatars WHERE user_id = v_user AND avatar_shop_item_id = v_item_id) THEN
        v_message := 'Аватар уже куплен';
      ELSE
        INSERT INTO user_avatars (user_id, avatar_shop_item_id, purchased_at) VALUES (v_user, v_item_id, now());
        v_message := 'Аватар куплен';
      END IF;
    ELSE
      RETURN jsonb_build_object('granted', false, 'reason', 'bad_label');
    END IF;
  END IF;

  UPDATE payments
  SET status = 'succeeded',
      yoomoney_operation_id = coalesce(p_operation_id, 'demo_' || p_payment_id::text)
  WHERE id = p_payment_id;

  RETURN jsonb_build_object('granted', true, 'type', 'shop', 'item_type', v_type, 'message', v_message);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fulfill_shop_purchase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fulfill_shop_purchase(uuid, text) TO authenticated, service_role;
