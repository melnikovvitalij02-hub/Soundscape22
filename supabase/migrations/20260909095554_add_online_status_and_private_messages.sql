/*
# Add online status and private messages

1. Changes to existing tables
- `profiles`: add `is_online` (boolean, default false) and `last_seen` (timestamptz, default now())
2. New Tables
- `private_messages`
  - `id` (uuid, primary key)
  - `sender_id` (uuid, references auth.users, default auth.uid())
  - `recipient_id` (uuid, references auth.users)
  - `content` (text, not null)
  - `read` (boolean, default false)
  - `created_at` (timestamptz, default now())
3. Security
- RLS enabled on private_messages
- Users can SELECT messages where they are sender or recipient
- Users can INSERT messages where they are the sender
- Users can UPDATE read status of messages sent to them
- Users can UPDATE their own is_online / last_seen on profiles
*/

-- Add online status columns to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_online') THEN
    ALTER TABLE profiles ADD COLUMN is_online boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_seen') THEN
    ALTER TABLE profiles ADD COLUMN last_seen timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Create private messages table
CREATE TABLE IF NOT EXISTS private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;

-- Allow users to read messages they sent or received
DROP POLICY IF EXISTS "select_own_messages" ON private_messages;
CREATE POLICY "select_own_messages"
ON private_messages FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Allow users to send messages as themselves
DROP POLICY IF EXISTS "insert_own_messages" ON private_messages;
CREATE POLICY "insert_own_messages"
ON private_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = sender_id);

-- Allow recipients to mark messages as read
DROP POLICY IF EXISTS "update_read_status" ON private_messages;
CREATE POLICY "update_read_status"
ON private_messages FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

-- Allow users to update their own online status
DROP POLICY IF EXISTS "update_own_online_status" ON profiles;
CREATE POLICY "update_own_online_status"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Index for faster message queries
CREATE INDEX IF NOT EXISTS idx_private_messages_recipient ON private_messages(recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_private_messages_sender ON private_messages(sender_id, created_at);
