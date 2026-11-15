/*
# Economy rework: dual Gem/Coin prices, boost rework, Gem withdrawal, publish settings

1. Plain-English explanation
   Reworks the shop economy so everything except stickers is bought with two
   currencies: donate coins (Gem) or game coins (Coin), where the Coin price
   is higher. Stickers stay Coin-only. Boost prices are updated, "eternal
   boost" is removed from the trending promotion kinds, the Gem withdrawal
   minimum drops to 100 Gem at 0.3 RUB per Gem, and the dark sequencer theme
   becomes free for everyone. Adds publish settings to beats (description,
   who may download, who may comment) and a server-side "buy with balance"
   RPC that debits Gem or Coin and records the purchase in payments history.

2. Schema changes
   - `sample_packs`, `cosmetic_items`, `boost_items`, `avatar_shop_items`:
     new column `price_gems integer not null default 0`.
   - `beats`: new columns `description text`, `download_access text
     not null default 'premium'` (check: 'premium' | 'nobody'),
     `comment_access text not null default 'all'` (check: 'all' | 'premium' | 'nobody').

3. Data updates
   - Sample packs (gem/coin): Lo-Fi Dreams 70/7000, House Vibes 100/10000,
     Hip-Hop Classic 200/20000, Trap Galaxy 150/15000, Phonk Underground 50/5000.
   - Cosmetics: Неоновая рамка 30/3000, Тёмная тема секвенсора 0/0 (free),
     Ретро скин 40/4000, Эффект конфетти 50/5000, Золотой профиль 100/10000,
     Алмазная рамка 250/25000.
   - Boosts: Двойной XP 50/5000, Буст публикации 100/10000, Приоритет в ленте 300/30000.
   - Stickers: 1000 coins (Coin-only).
   - Avatars: scaled to 10..150 gem range (10/20/40/60/100/150).

4. New functions
   - `purchase_with_balance(p_type text, p_item_id uuid, p_currency text)`:
     server-side purchase debiting donate_coins ('gem') or coins ('coin'),
     inserting the ownership row and a succeeded payments row for history.
     Zero-price items are granted free. Beat promotion kinds are handled by
     grant_trending_promotion (gem-only), not this function.

5. Modified functions
   - `grant_trending_promotion`: gem-only pricing 300/750/1800/5500;
     'eternal' kind removed (raises 'Unknown promotion').
   - `request_withdrawal`: minimum 100, debits donate_coins (Gem),
     rate 0.3 RUB per Gem. Account-age rule kept.

6. Security changes
   - New columns inherit existing table grants; RLS unchanged.
   - `purchase_with_balance` EXECUTE to authenticated only.
*/

-- ── 2. New columns ──────────────────────────────────────────────────────
ALTER TABLE public.sample_packs ADD COLUMN IF NOT EXISTS price_gems integer NOT NULL DEFAULT 0;
ALTER TABLE public.cosmetic_items ADD COLUMN IF NOT EXISTS price_gems integer NOT NULL DEFAULT 0;
ALTER TABLE public.boost_items ADD COLUMN IF NOT EXISTS price_gems integer NOT NULL DEFAULT 0;
ALTER TABLE public.avatar_shop_items ADD COLUMN IF NOT EXISTS price_gems integer NOT NULL DEFAULT 0;

ALTER TABLE public.beats ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.beats ADD COLUMN IF NOT EXISTS download_access text NOT NULL DEFAULT 'premium'
  CHECK (download_access IN ('premium', 'nobody'));
ALTER TABLE public.beats ADD COLUMN IF NOT EXISTS comment_access text NOT NULL DEFAULT 'all'
  CHECK (comment_access IN ('all', 'premium', 'nobody'));

-- ── 3. Prices ───────────────────────────────────────────────────────────
UPDATE public.sample_packs SET price_gems = CASE name
  WHEN 'Lo-Fi Dreams' THEN 70
  WHEN 'House Vibes' THEN 100
  WHEN 'Hip-Hop Classic' THEN 200
  WHEN 'Trap Galaxy' THEN 150
  WHEN 'Phonk Underground' THEN 50
ELSE price_gems END,
price_coins = CASE name
  WHEN 'Lo-Fi Dreams' THEN 7000
  WHEN 'House Vibes' THEN 10000
  WHEN 'Hip-Hop Classic' THEN 20000
  WHEN 'Trap Galaxy' THEN 15000
  WHEN 'Phonk Underground' THEN 5000
ELSE price_coins END;

UPDATE public.cosmetic_items SET price_gems = CASE name
  WHEN 'Неоновая рамка' THEN 30
  WHEN 'Тёмная тема секвенсора' THEN 0
  WHEN 'Ретро скин' THEN 40
  WHEN 'Эффект конфетти' THEN 50
  WHEN 'Золотой профиль' THEN 100
  WHEN 'Алмазная рамка' THEN 250
ELSE price_gems END,
price_coins = CASE name
  WHEN 'Неоновая рамка' THEN 3000
  WHEN 'Тёмная тема секвенсора' THEN 0
  WHEN 'Ретро скин' THEN 4000
  WHEN 'Эффект конфетти' THEN 5000
  WHEN 'Золотой профиль' THEN 10000
  WHEN 'Алмазная рамка' THEN 25000
ELSE price_coins END;

UPDATE public.boost_items SET price_gems = CASE type
  WHEN 'double_xp' THEN 50
  WHEN 'publish_boost' THEN 100
  WHEN 'priority_feed' THEN 300
ELSE price_gems END,
price_coins = CASE type
  WHEN 'double_xp' THEN 5000
  WHEN 'publish_boost' THEN 10000
  WHEN 'priority_feed' THEN 30000
ELSE price_coins END;

UPDATE public.stickers SET price_coins = 1000 WHERE price_coins < 1000;

-- Avatars: gem/coin ladder 10/1000 … 150/15000 by current price order.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY price ASC) AS rn,
         count(*) OVER () AS total
  FROM public.avatar_shop_items
)
UPDATE public.avatar_shop_items a
SET price_gems = CASE
      WHEN r.total <= 6 THEN (ARRAY[10, 20, 40, 60, 100, 150])[r.rn]
      ELSE 10 + (r.rn - 1) * 140 / GREATEST(r.total - 1, 1)
    END,
    price = CASE
      WHEN r.total <= 6 THEN (ARRAY[1000, 2000, 4000, 6000, 10000, 15000])[r.rn]
      ELSE 1000 + (r.rn - 1) * 14000 / GREATEST(r.total - 1, 1)
    END
FROM ranked r WHERE a.id = r.id;

-- ── 4. Buy with balance (Gem or Coin) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_with_balance(p_type text, p_item_id uuid, p_currency text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_gem_cost integer;
  v_coin_cost integer;
  v_message text;
  v_payment_id uuid;
  v_price integer;
  v_balance integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_currency NOT IN ('gem', 'coin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_currency');
  END IF;

  CASE p_type
    WHEN 'sample' THEN
      SELECT price_gems, price_coins INTO v_gem_cost, v_coin_cost FROM sample_packs WHERE id = p_item_id;
    WHEN 'cosmetic' THEN
      SELECT price_gems, price_coins INTO v_gem_cost, v_coin_cost FROM cosmetic_items WHERE id = p_item_id;
    WHEN 'boost' THEN
      SELECT price_gems, price_coins INTO v_gem_cost, v_coin_cost FROM boost_items WHERE id = p_item_id;
    WHEN 'avatar' THEN
      SELECT price_gems, price INTO v_gem_cost, v_coin_cost FROM avatar_shop_items WHERE id = p_item_id;
    WHEN 'sticker' THEN
      SELECT price_coins, price_coins INTO v_gem_cost, v_coin_cost FROM stickers WHERE id = p_item_id;
    ELSE
      RETURN jsonb_build_object('ok', false, 'reason', 'bad_type');
  END CASE;

  IF v_gem_cost IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'item_not_found');
  END IF;

  -- Stickers are Coin-only.
  IF p_type = 'sticker' AND p_currency = 'gem' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'coin_only');
  END IF;

  v_price := CASE p_currency WHEN 'gem' THEN v_gem_cost ELSE v_coin_cost END;

  SELECT CASE p_currency WHEN 'gem' THEN donate_coins ELSE coins END
  INTO v_balance
  FROM profiles WHERE id = v_user FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_profile');
  END IF;
  IF v_balance < v_price THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient');
  END IF;

  UPDATE profiles
  SET donate_coins = CASE WHEN p_currency = 'gem' THEN donate_coins - v_price ELSE donate_coins END,
      coins = CASE WHEN p_currency = 'coin' THEN coins - v_price ELSE coins END,
      updated_at = now()
  WHERE id = v_user;

  IF p_type = 'sample' THEN
    INSERT INTO user_sample_packs (user_id, sample_pack_id, purchased_at)
    VALUES (v_user, p_item_id, now())
    ON CONFLICT DO NOTHING;
    v_message := 'Сэмпл-пак куплен';
  ELSIF p_type = 'cosmetic' THEN
    INSERT INTO user_cosmetics (user_id, cosmetic_id, is_equipped, purchased_at)
    VALUES (v_user, p_item_id, false, now())
    ON CONFLICT DO NOTHING;
    v_message := 'Предмет куплен';
  ELSIF p_type = 'boost' THEN
    INSERT INTO user_boosts (user_id, boost_id, expires_at, created_at)
    SELECT v_user, p_item_id, now() + (b.duration_hours || ' hours')::interval, now()
    FROM boost_items b WHERE b.id = p_item_id;
    v_message := 'Ускорение активировано';
  ELSIF p_type = 'avatar' THEN
    INSERT INTO user_avatars (user_id, avatar_shop_item_id, purchased_at)
    VALUES (v_user, p_item_id, now())
    ON CONFLICT DO NOTHING;
    v_message := 'Аватар куплен';
  ELSIF p_type = 'sticker' THEN
    INSERT INTO user_stickers (user_id, sticker_id)
    VALUES (v_user, p_item_id)
    ON CONFLICT DO NOTHING;
    v_message := 'Стикер куплен';
  END IF;

  INSERT INTO payments (user_id, amount, status, label, payment_type, yoomoney_operation_id)
  VALUES (
    v_user,
    0,
    'succeeded',
    'balance_' || p_type || '_' || coalesce(p_item_id::text, 'none') || '_' || v_user::text || '_r0',
    'shop',
    'balance_' || p_currency
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('ok', true, 'message', v_message, 'payment_id', v_payment_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_with_balance(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_with_balance(text, uuid, text) TO authenticated;

-- ── 5a. Trending promotions: gem-only, new prices, no eternal ───────────
CREATE OR REPLACE FUNCTION public.grant_trending_promotion(p_user_id uuid, p_beat_id uuid, p_kind text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_points integer := 0;
v_price integer := 0;
v_duration interval;
v_expires timestamptz;
v_active_top3 integer;
BEGIN
IF p_user_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF auth.uid() IS NULL THEN
IF coalesce(auth.role(), '') <> 'service_role' THEN
RAISE EXCEPTION 'Not authorized';
END IF;
ELSIF auth.uid() <> p_user_id THEN
RAISE EXCEPTION 'Not authorized';
END IF;

CASE p_kind
WHEN 'boost_basic' THEN v_price := 300; v_points := 100; v_duration := interval '24 hours';
WHEN 'boost_plus' THEN v_price := 750; v_points := 250; v_duration := interval '24 hours';
WHEN 'boost_max' THEN v_price := 1800; v_points := 600; v_duration := interval '24 hours';
WHEN 'top3' THEN v_price := 5500; v_duration := interval '24 hours';
ELSE RAISE EXCEPTION 'Unknown promotion';
END CASE;

PERFORM pg_advisory_xact_lock(hashtext('trending_promotions'));

IF NOT EXISTS (SELECT 1 FROM beats WHERE id = p_beat_id AND user_id = p_user_id AND is_public) THEN
RAISE EXCEPTION 'Beat not found';
END IF;

IF p_kind = 'top3' THEN
IF EXISTS (SELECT 1 FROM trending_promotions WHERE beat_id = p_beat_id AND kind = 'top3' AND expires_at > now()) THEN
RAISE EXCEPTION 'Already in top-3';
END IF;
SELECT count(*) INTO v_active_top3 FROM trending_promotions WHERE kind = 'top3' AND expires_at > now();
IF v_active_top3 >= 3 THEN RAISE EXCEPTION 'Top-3 slots are full'; END IF;
END IF;

v_expires := CASE WHEN v_duration IS NULL THEN NULL ELSE now() + v_duration END;

INSERT INTO trending_promotions (beat_id, user_id, kind, price_coins, boost_points, expires_at)
VALUES (p_beat_id, p_user_id, p_kind, v_price, v_points, v_expires);

RETURN v_expires;
END;
$function$;

-- ── 5b. Gem withdrawal: min 100, 0.3 RUB per Gem, debits donate_coins ───
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_coins_amount integer, p_payment_details text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_user_id        uuid := auth.uid();
v_balance        integer;
v_created_at     timestamptz;
v_rub_amount     numeric;
v_request_id     uuid;
v_min_withdrawal integer := 100;
BEGIN
IF v_user_id IS NULL THEN
RAISE EXCEPTION 'Not authenticated';
END IF;

IF p_coins_amount < v_min_withdrawal THEN
RAISE EXCEPTION 'Minimum withdrawal is % gems', v_min_withdrawal;
END IF;

IF p_payment_details IS NULL OR btrim(p_payment_details) = '' THEN
RAISE EXCEPTION 'Payment details are required';
END IF;

SELECT donate_coins, created_at
INTO v_balance, v_created_at
FROM profiles
WHERE id = v_user_id
FOR UPDATE;

IF v_balance IS NULL THEN
RAISE EXCEPTION 'Profile not found';
END IF;

IF v_created_at IS NULL OR v_created_at > now() - interval '7 days' THEN
RAISE EXCEPTION 'Account must be at least 7 days old to withdraw';
END IF;

IF v_balance < p_coins_amount THEN
RAISE EXCEPTION 'Insufficient gems';
END IF;

v_rub_amount := round(p_coins_amount * 0.3, 2);

UPDATE profiles
SET donate_coins = donate_coins - p_coins_amount
WHERE id = v_user_id;

INSERT INTO withdrawal_requests (user_id, coins_amount, rub_amount, status, payment_details)
VALUES (v_user_id, p_coins_amount, v_rub_amount, 'pending', p_payment_details)
RETURNING id INTO v_request_id;

RETURN v_request_id;
END;
$function$;
