/*
# Rework boost items and add feed priority system

1. Changes to boost_items table
- Drop the old check constraint and add a new one allowing publish_boost type
- Remove "instant_export" / "priority_load" boost types (no longer needed)
- Update "double_xp" price to 50 coins (was 10), duration stays 24h
- Update "priority_feed" price to 100 coins (was 15), duration stays 72h (3 days)
- Add new boost type "publish_boost" - costs 80 coins, 24h duration

2. New table: beat_promotions
- Tracks which beats are promoted to priority feed
- beat_id, user_id, promoted_at, expires_at

3. beats table: add is_promoted + promoted_until columns

4. Security
- beat_promotions has RLS, owner-scoped CRUD for authenticated users
*/

-- Drop old check constraint and add new one with publish_boost
ALTER TABLE boost_items DROP CONSTRAINT IF EXISTS boost_items_type_check;
ALTER TABLE boost_items ADD CONSTRAINT boost_items_type_check
  CHECK (type IN ('instant_export', 'priority_feed', 'double_xp', 'priority_load', 'publish_boost'));

-- Update existing boost items: increase prices
UPDATE boost_items SET price_coins = 50 WHERE type = 'double_xp';
UPDATE boost_items SET price_coins = 100, duration_hours = 72 WHERE type = 'priority_feed';

-- Remove unwanted boosts
DELETE FROM boost_items WHERE type IN ('instant_export', 'priority_load');

-- Add publish boost if it doesn't exist
INSERT INTO boost_items (name, type, price_coins, duration_hours, description)
SELECT 'Буст публикации', 'publish_boost', 80, 24, 'Публикация треков без ожидания 6 часов на 24 часа'
WHERE NOT EXISTS (SELECT 1 FROM boost_items WHERE type = 'publish_boost');

-- Create beat_promotions table
CREATE TABLE IF NOT EXISTS beat_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  promoted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '3 days')
);

ALTER TABLE beat_promotions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON beat_promotions TO authenticated;

DROP POLICY IF EXISTS "select_own_promotions" ON beat_promotions;
CREATE POLICY "select_own_promotions" ON beat_promotions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_promotions" ON beat_promotions;
CREATE POLICY "insert_own_promotions" ON beat_promotions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_promotions" ON beat_promotions;
CREATE POLICY "delete_own_promotions" ON beat_promotions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add is_promoted and promoted_until columns to beats
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'beats' AND column_name = 'is_promoted') THEN
    ALTER TABLE beats ADD COLUMN is_promoted boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'beats' AND column_name = 'promoted_until') THEN
    ALTER TABLE beats ADD COLUMN promoted_until timestamptz;
  END IF;
END $$;

GRANT UPDATE (is_promoted, promoted_until) ON beats TO authenticated;
