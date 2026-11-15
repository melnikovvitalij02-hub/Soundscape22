-- Add is_premium column to chat_messages for VIP badge display
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;

-- Backfill existing messages based on profiles
UPDATE chat_messages cm
SET is_premium = p.is_premium
FROM profiles p
WHERE cm.user_id = p.id;
