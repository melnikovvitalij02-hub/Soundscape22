/*
# Monetization: Beat Marketplace, Coin Purchases, Subscription Tiers

## Overview
Adds database tables for the full monetization layer:
1. Beat marketplace — users list beats for sale, others buy with coins, platform takes 15% commission
2. Coin purchase packages — ruble-to-coin exchange rates
3. Sample packs — exclusive producer packs purchasable with coins
4. Cosmetic items — profile skins, sequencer themes, frames
5. Boost purchases — instant export, priority feed, etc.
6. Subscription tiers updated — Free / Pro (399₽) / Studio (999₽)

## New Tables

1. `beat_listings` — beats listed for sale in the marketplace
   - beat_id, seller_id, price_coins, price_rub, status (active/sold/delisted)
   - buyer_id, sold_at, platform_fee (15% commission)

2. `coin_purchases` — track ruble-to-coin purchases
   - user_id, package_id, coins_amount, rub_amount, status

3. `sample_packs` — exclusive producer sample packs
   - name, producer_name, genre, price_coins, description, cover_url, tracks info

4. `user_sample_packs` — ownership records for sample packs

5. `cosmetic_items` — profile skins, frames, sequencer themes
   - name, type (skin/frame/theme), price_coins, rarity, preview_url

6. `user_cosmetics` — ownership records for cosmetics

7. `boost_items` — accelerations and priority features
   - name, type, price_coins, duration_hours, description

8. `user_boosts` — active boost records with expiry

## Modified Tables
- `subscriptions` table: add `tier` column (free/pro/studio) to distinguish plans

## Security
- RLS enabled on all new tables
- Public read for marketplace listings, sample packs, cosmetics, boosts (shop catalog)
- Owner-scoped insert/update for purchases and ownership records
*/

-- ============================================================
-- Add tier column to subscriptions
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'tier') THEN
    ALTER TABLE subscriptions ADD COLUMN tier text DEFAULT 'free';
  END IF;
END $$;

-- ============================================================
-- BEAT MARKETPLACE
-- ============================================================
CREATE TABLE IF NOT EXISTS beat_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  price_coins integer NOT NULL DEFAULT 0,
  price_rub integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','delisted')),
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sold_at timestamptz,
  platform_fee_coins integer DEFAULT 0,
  platform_fee_rub integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(beat_id)
);

ALTER TABLE beat_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listings_select_all" ON beat_listings;
CREATE POLICY "listings_select_all" ON beat_listings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "listings_insert_own" ON beat_listings;
CREATE POLICY "listings_insert_own" ON beat_listings FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
DROP POLICY IF EXISTS "listings_update_own" ON beat_listings;
CREATE POLICY "listings_update_own" ON beat_listings FOR UPDATE TO authenticated USING (auth.uid() = seller_id OR auth.uid() = buyer_id) WITH CHECK (true);
DROP POLICY IF EXISTS "listings_delete_own" ON beat_listings;
CREATE POLICY "listings_delete_own" ON beat_listings FOR DELETE TO authenticated USING (auth.uid() = seller_id);

CREATE INDEX IF NOT EXISTS idx_listings_active ON beat_listings(status, created_at DESC);

-- ============================================================
-- COIN PURCHASES (tracking ruble payments)
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id text NOT NULL,
  coins_amount integer NOT NULL DEFAULT 0,
  rub_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coin_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_purchases_select_own" ON coin_purchases;
CREATE POLICY "coin_purchases_select_own" ON coin_purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "coin_purchases_insert_own" ON coin_purchases;
CREATE POLICY "coin_purchases_insert_own" ON coin_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SAMPLE PACKS (exclusive producer packs)
-- ============================================================
CREATE TABLE IF NOT EXISTS sample_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  producer_name text NOT NULL,
  genre text NOT NULL,
  price_coins integer NOT NULL DEFAULT 100,
  description text DEFAULT '',
  cover_url text,
  track_count integer DEFAULT 10,
  is_exclusive boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sample_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sample_packs_select_all" ON sample_packs;
CREATE POLICY "sample_packs_select_all" ON sample_packs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sample_packs_insert_own" ON sample_packs;
CREATE POLICY "sample_packs_insert_own" ON sample_packs FOR INSERT TO authenticated WITH CHECK (true);

-- Seed sample packs
INSERT INTO sample_packs (name, producer_name, genre, price_coins, description, track_count)
SELECT 'Trap Galaxy', 'DJ Cosmos', 'Трэп', 200, '50 жестких трэп-сэмплов с глубоким 808 басом', 50
WHERE NOT EXISTS (SELECT 1 FROM sample_packs WHERE name = 'Trap Galaxy');

INSERT INTO sample_packs (name, producer_name, genre, price_coins, description, track_count)
SELECT 'House Vibes', 'Mike Wave', 'House', 150, '40 хаус-лупов с тёплым винтажным звучанием', 40
WHERE NOT EXISTS (SELECT 1 FROM sample_packs WHERE name = 'House Vibes');

INSERT INTO sample_packs (name, producer_name, genre, price_coins, description, track_count)
SELECT 'Lo-Fi Dreams', 'ChillBear', 'Lo-Fi', 120, '30 лоу-фай сэмплов для расслабляющих битов', 30
WHERE NOT EXISTS (SELECT 1 FROM sample_packs WHERE name = 'Lo-Fi Dreams');

INSERT INTO sample_packs (name, producer_name, genre, price_coins, description, track_count)
SELECT 'Phonk Underground', 'DarkMode', 'Фонк', 250, '25 дарк-фонк сэмплов с агрессивным вайбом', 25
WHERE NOT EXISTS (SELECT 1 FROM sample_packs WHERE name = 'Phonk Underground');

INSERT INTO sample_packs (name, producer_name, genre, price_coins, description, track_count)
SELECT 'Hip-Hop Classic', 'BeatMaker Pro', 'Хип-Хоп', 180, '60 классических хип-хоп сэмплов и лупов', 60
WHERE NOT EXISTS (SELECT 1 FROM sample_packs WHERE name = 'Hip-Hop Classic');

-- ============================================================
-- USER SAMPLE PACK OWNERSHIP
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sample_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sample_pack_id uuid NOT NULL REFERENCES sample_packs(id) ON DELETE CASCADE,
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, sample_pack_id)
);

ALTER TABLE user_sample_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_sample_packs_select_own" ON user_sample_packs;
CREATE POLICY "user_sample_packs_select_own" ON user_sample_packs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_sample_packs_insert_own" ON user_sample_packs;
CREATE POLICY "user_sample_packs_insert_own" ON user_sample_packs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- COSMETIC ITEMS (skins, frames, themes)
-- ============================================================
CREATE TABLE IF NOT EXISTS cosmetic_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('skin','frame','theme','effect')),
  price_coins integer NOT NULL DEFAULT 50,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  preview_url text,
  css_class text,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cosmetic_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cosmetics_select_all" ON cosmetic_items;
CREATE POLICY "cosmetics_select_all" ON cosmetic_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cosmetics_insert_own" ON cosmetic_items;
CREATE POLICY "cosmetics_insert_own" ON cosmetic_items FOR INSERT TO authenticated WITH CHECK (true);

-- Seed cosmetics
INSERT INTO cosmetic_items (name, type, price_coins, rarity, description)
SELECT 'Неоновая рамка', 'frame', 80, 'rare', 'Светящаяся неоновая рамка для аватара'
WHERE NOT EXISTS (SELECT 1 FROM cosmetic_items WHERE name = 'Неоновая рамка');

INSERT INTO cosmetic_items (name, type, price_coins, rarity, description)
SELECT 'Золотой профиль', 'skin', 200, 'epic', 'Золотой градиент для профиля'
WHERE NOT EXISTS (SELECT 1 FROM cosmetic_items WHERE name = 'Золотой профиль');

INSERT INTO cosmetic_items (name, type, price_coins, rarity, description)
SELECT 'Тёмная тема секвенсора', 'theme', 100, 'rare', 'Тёмная тема для бит-секвенсора'
WHERE NOT EXISTS (SELECT 1 FROM cosmetic_items WHERE name = 'Тёмная тема секвенсора');

INSERT INTO cosmetic_items (name, type, price_coins, rarity, description)
SELECT 'Алмазная рамка', 'frame', 500, 'legendary', 'Роскошная алмазная рамка с анимацией'
WHERE NOT EXISTS (SELECT 1 FROM cosmetic_items WHERE name = 'Алмазная рамка');

INSERT INTO cosmetic_items (name, type, price_coins, rarity, description)
SELECT 'Эффект конфетти', 'effect', 150, 'epic', 'Конфетти при достижениях'
WHERE NOT EXISTS (SELECT 1 FROM cosmetic_items WHERE name = 'Эффект конфетти');

INSERT INTO cosmetic_items (name, type, price_coins, rarity, description)
SELECT 'Ретро скин', 'skin', 120, 'rare', 'Ретро стиль профиля 80-х'
WHERE NOT EXISTS (SELECT 1 FROM cosmetic_items WHERE name = 'Ретро скин');

-- ============================================================
-- USER COSMETICS OWNERSHIP
-- ============================================================
CREATE TABLE IF NOT EXISTS user_cosmetics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_id uuid NOT NULL REFERENCES cosmetic_items(id) ON DELETE CASCADE,
  is_equipped boolean DEFAULT false,
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, cosmetic_id)
);

ALTER TABLE user_cosmetics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_cosmetics_select_own" ON user_cosmetics;
CREATE POLICY "user_cosmetics_select_own" ON user_cosmetics FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_cosmetics_insert_own" ON user_cosmetics;
CREATE POLICY "user_cosmetics_insert_own" ON user_cosmetics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_cosmetics_update_own" ON user_cosmetics;
CREATE POLICY "user_cosmetics_update_own" ON user_cosmetics FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- BOOST ITEMS (accelerations)
-- ============================================================
CREATE TABLE IF NOT EXISTS boost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('instant_export','priority_feed','double_xp','priority_load')),
  price_coins integer NOT NULL DEFAULT 50,
  duration_hours integer NOT NULL DEFAULT 24,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE boost_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boosts_select_all" ON boost_items;
CREATE POLICY "boosts_select_all" ON boost_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "boosts_insert_own" ON boost_items;
CREATE POLICY "boosts_insert_own" ON boost_items FOR INSERT TO authenticated WITH CHECK (true);

-- Seed boosts
INSERT INTO boost_items (name, type, price_coins, duration_hours, description)
SELECT 'Мгновенный экспорт', 'instant_export', 50, 24, 'Экспорт битов без ожидания на 24 часа'
WHERE NOT EXISTS (SELECT 1 FROM boost_items WHERE name = 'Мгновенный экспорт');

INSERT INTO boost_items (name, type, price_coins, duration_hours, description)
SELECT 'Приоритет в ленте', 'priority_feed', 100, 72, 'Твои биты повыше в ленте на 3 дня'
WHERE NOT EXISTS (SELECT 1 FROM boost_items WHERE name = 'Приоритет в ленте');

INSERT INTO boost_items (name, type, price_coins, duration_hours, description)
SELECT 'Двойной XP', 'double_xp', 80, 24, '2x XP за все действия на 24 часа'
WHERE NOT EXISTS (SELECT 1 FROM boost_items WHERE name = 'Двойной XP');

INSERT INTO boost_items (name, type, price_coins, duration_hours, description)
SELECT 'Приоритетная загрузка', 'priority_load', 30, 24, 'Быстрая загрузка сэмплов и битов'
WHERE NOT EXISTS (SELECT 1 FROM boost_items WHERE name = 'Приоритетная загрузка');

-- ============================================================
-- USER BOOSTS (active boost records)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  boost_id uuid NOT NULL REFERENCES boost_items(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_boosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_boosts_select_own" ON user_boosts;
CREATE POLICY "user_boosts_select_own" ON user_boosts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_boosts_insert_own" ON user_boosts;
CREATE POLICY "user_boosts_insert_own" ON user_boosts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_boosts_delete_own" ON user_boosts;
CREATE POLICY "user_boosts_delete_own" ON user_boosts FOR DELETE TO authenticated USING (auth.uid() = user_id);
