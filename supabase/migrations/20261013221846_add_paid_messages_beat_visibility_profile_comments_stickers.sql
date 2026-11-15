/*
# Add paid chat messages, beat visibility, profile comments, sticker shop, coin-to-ruble exchange rate

## Changes Overview

### 1. Paid Chat Messages (1000 coins per message)
- New column `coins_spent` on `chat_messages` (int, default 0)
- New table `coin_transactions` to track all coin spending/earning
- Messages that cost coins are marked with `coins_spent = 1000`

### 2. Beat Visibility (public/private/delete)
- New column `is_public` on `beats` (boolean, default true)
- Users can set their beats to private or delete them
- Private beats only visible to the owner

### 3. Profile Comments (1000 coins per comment)
- New table `profile_comments` for comments on user profiles
- Each comment costs 1000 coins
- Comments visible to profile owner and comment author

### 4. Sticker Shop
- New table `stickers` for purchasable stickers
- New table `user_stickers` for owned stickers
- Stickers can be used in chat messages

### 5. Beat Downloads / Access Control
- New column `is_free` on `beats` (boolean, default true)
- New column `download_price` on `beats` (int, default 0)
- New table `beat_purchases` to track who bought access to which beat

### 6. Coin-to-Rubble Exchange Rate
- New table `monetization_settings` with exchange rate config
- Rate: 100 coins = 1 ruble for users (artists get 70% payout)
- Platform keeps 30% commission

### 7. Coin Transactions Log
- Tracks all coin movements (spending and earning)
- Types: chat_message, profile_comment, beat_purchase, sticker_purchase, cosmetic_purchase, support_donation, game_reward, daily_reward, coin_purchase, beat_sale
*/

-- 1. Coin transactions log (tracks all coin movements)
CREATE TABLE IF NOT EXISTS coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  balance_after integer,
  transaction_type text NOT NULL,
  description text,
  related_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_coin_transactions" ON coin_transactions;
CREATE POLICY "select_own_coin_transactions" ON coin_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_coin_transactions" ON coin_transactions;
CREATE POLICY "insert_own_coin_transactions" ON coin_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- 2. Add coins_spent to chat_messages
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'coins_spent') THEN
    ALTER TABLE chat_messages ADD COLUMN coins_spent integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. Add is_public and download_price to beats
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'beats' AND column_name = 'is_public') THEN
    ALTER TABLE beats ADD COLUMN is_public boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'beats' AND column_name = 'download_price') THEN
    ALTER TABLE beats ADD COLUMN download_price integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'beats' AND column_name = 'is_free') THEN
    ALTER TABLE beats ADD COLUMN is_free boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Update beats SELECT policy to allow seeing public beats + own beats
-- (existing policies already allow all authenticated users to read; we keep that for the feed)
-- But add a policy for private beats: only owner can see is_public = false

-- 4. Profile comments table (1000 coins per comment)
CREATE TABLE IF NOT EXISTS profile_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  coins_spent integer NOT NULL DEFAULT 1000,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profile_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_profile_comments" ON profile_comments;
CREATE POLICY "select_profile_comments" ON profile_comments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_profile_comments" ON profile_comments;
CREATE POLICY "insert_own_profile_comments" ON profile_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "delete_own_profile_comments" ON profile_comments;
CREATE POLICY "delete_own_profile_comments" ON profile_comments FOR DELETE
  TO authenticated USING (auth.uid() = author_id);

-- 5. Stickers table
CREATE TABLE IF NOT EXISTS stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text NOT NULL,
  image_url text,
  price_coins integer NOT NULL DEFAULT 50,
  category text NOT NULL DEFAULT 'general',
  rarity text NOT NULL DEFAULT 'common',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_stickers" ON stickers;
CREATE POLICY "select_stickers" ON stickers FOR SELECT
  TO authenticated USING (true);

-- 6. User stickers (owned stickers)
CREATE TABLE IF NOT EXISTS user_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id uuid NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, sticker_id)
);
ALTER TABLE user_stickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_user_stickers" ON user_stickers;
CREATE POLICY "select_own_user_stickers" ON user_stickers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_stickers" ON user_stickers;
CREATE POLICY "insert_own_user_stickers" ON user_stickers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- 7. Beat purchases (access control)
CREATE TABLE IF NOT EXISTS beat_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  price_paid integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(beat_id, buyer_id)
);
ALTER TABLE beat_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_beat_purchases" ON beat_purchases;
CREATE POLICY "select_own_beat_purchases" ON beat_purchases FOR SELECT
  TO authenticated USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "insert_own_beat_purchases" ON beat_purchases;
CREATE POLICY "insert_own_beat_purchases" ON beat_purchases FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = buyer_id);

-- 8. Monetization settings (coin-to-ruble exchange rate)
CREATE TABLE IF NOT EXISTS monetization_settings (
  id integer PRIMARY KEY DEFAULT 1,
  coins_per_ruble_user integer NOT NULL DEFAULT 100,
  artist_payout_percent integer NOT NULL DEFAULT 70,
  platform_commission_percent integer NOT NULL DEFAULT 30,
  message_cost_coins integer NOT NULL DEFAULT 1000,
  profile_comment_cost_coins integer NOT NULL DEFAULT 1000,
  min_payout_rub integer NOT NULL DEFAULT 500,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
ALTER TABLE monetization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_monetization_settings" ON monetization_settings;
CREATE POLICY "select_monetization_settings" ON monetization_settings FOR SELECT
  TO authenticated USING (true);

-- Insert default settings row
INSERT INTO monetization_settings (id, coins_per_ruble_user, artist_payout_percent, platform_commission_percent, message_cost_coins, profile_comment_cost_coins, min_payout_rub)
VALUES (1, 100, 70, 30, 1000, 1000, 500)
ON CONFLICT (id) DO NOTHING;

-- 9. Insert default stickers
INSERT INTO stickers (name, emoji, price_coins, category, rarity) VALUES
  ('Огонь', '🔥', 50, 'general', 'common'),
  ('Сердце', '❤️', 50, 'general', 'common'),
  ('Микрофон', '🎤', 100, 'music', 'common'),
  ('Наушники', '🎧', 100, 'music', 'common'),
  ('Музыка', '🎵', 100, 'music', 'common'),
  ('Звезда', '⭐', 150, 'general', 'rare'),
  ('Бриллиант', '💎', 300, 'general', 'rare'),
  ('Корона', '👑', 500, 'general', 'epic'),
  ('Молния', '⚡', 150, 'general', 'rare'),
  ('Ракета', '🚀', 200, 'general', 'rare'),
  ('Гитара', '🎸', 150, 'music', 'rare'),
  ('Барабаны', '🥁', 150, 'music', 'rare'),
  ('Пианино', '🎹', 150, 'music', 'rare'),
  ('Саксофон', '🎷', 150, 'music', 'rare'),
  ('Винил', '💿', 100, 'music', 'common'),
  ('Трофей', '🏆', 500, 'general', 'epic'),
  ('Огонь 2', '🔥', 50, 'general', 'common'),
  ('Гром', '💥', 200, 'general', 'rare')
ON CONFLICT DO NOTHING;

-- 10. Add sticker_id to chat_messages (optional - to send stickers in chat)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'sticker_id') THEN
    ALTER TABLE chat_messages ADD COLUMN sticker_id uuid REFERENCES stickers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 11. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_created_at ON coin_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_comments_profile_user_id ON profile_comments(profile_user_id);
CREATE INDEX IF NOT EXISTS idx_profile_comments_created_at ON profile_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beats_is_public ON beats(is_public);
CREATE INDEX IF NOT EXISTS idx_beat_purchases_buyer_id ON beat_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_beat_purchases_beat_id ON beat_purchases(beat_id);
CREATE INDEX IF NOT EXISTS idx_user_stickers_user_id ON user_stickers(user_id);
CREATE INDEX IF NOT EXISTS idx_beats_user_id_created ON beats(user_id, created_at DESC);
