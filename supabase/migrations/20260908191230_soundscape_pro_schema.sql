/*
# Soundscape Pro - Complete Database Schema

## Overview
Creates the full schema for the Soundscape Pro music social platform: user profiles with gamification (XP, levels, currency), real-time global chat, friend system, saved music projects, and achievements.

## New Tables

1. **profiles** - Extended user data linked to auth.users
   - id (uuid, FK to auth.users)
   - username (text, unique)
   - avatar_url (text)
   - bio (text)
   - xp (integer, default 0)
   - level (integer, default 1)
   - coins (integer, default 100)
   - created_at, updated_at

2. **chat_messages** - Global real-time chat
   - id, user_id, username, avatar_url, content, created_at

3. **projects** - Saved beat/music projects
   - id, user_id, name, data (jsonb), genre, bpm, created_at, updated_at

4. **friendships** - Friend relationships
   - id, requester_id, addressee_id, status (pending/accepted/blocked), created_at, accepted_at

5. **achievements** - Achievement definitions
   - id, name, description, icon, xp_reward, coin_reward, requirement_type, requirement_value

6. **user_achievements** - Earned achievements
   - id, user_id, achievement_id, earned_at

7. **game_scores** - High scores for built-in games
   - id, user_id, game_name, score, played_at

## Security
- RLS enabled on all tables
- Profiles: users can read all, update own only
- Chat: authenticated can read all, insert own
- Projects: owner-scoped CRUD
- Friendships: users can see their own friendships, create/update their own
- Achievements: readable by all authenticated, user_achievements owner-scoped
- Game scores: insert own, read all
- All owner columns default to auth.uid()
*/

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  avatar_url text,
  bio text DEFAULT '',
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  coins integer NOT NULL DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- CHAT MESSAGES
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  avatar_url text,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_select_all" ON chat_messages;
CREATE POLICY "chat_select_all" ON chat_messages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "chat_insert_own" ON chat_messages;
CREATE POLICY "chat_insert_own" ON chat_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "chat_delete_own" ON chat_messages;
CREATE POLICY "chat_delete_own" ON chat_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- PROJECTS
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  genre text DEFAULT '',
  bpm integer DEFAULT 120,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_own" ON projects;
CREATE POLICY "projects_select_own" ON projects FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_insert_own" ON projects;
CREATE POLICY "projects_insert_own" ON projects FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_update_own" ON projects;
CREATE POLICY "projects_update_own" ON projects FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_delete_own" ON projects;
CREATE POLICY "projects_delete_own" ON projects FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- FRIENDSHIPS
CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked')),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT no_self_friend CHECK (requester_id <> addressee_id)
);
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_select_own" ON friendships;
CREATE POLICY "friendships_select_own" ON friendships FOR SELECT
  TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_insert_own" ON friendships;
CREATE POLICY "friendships_insert_own" ON friendships FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "friendships_update_own" ON friendships;
CREATE POLICY "friendships_update_own" ON friendships FOR UPDATE
  TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_delete_own" ON friendships;
CREATE POLICY "friendships_delete_own" ON friendships FOR DELETE
  TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ACHIEVEMENTS (definitions)
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  xp_reward integer NOT NULL DEFAULT 50,
  coin_reward integer NOT NULL DEFAULT 25,
  requirement_type text NOT NULL,
  requirement_value integer NOT NULL DEFAULT 1
);
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achievements_select_all" ON achievements;
CREATE POLICY "achievements_select_all" ON achievements FOR SELECT
  TO authenticated USING (true);

-- USER ACHIEVEMENTS
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_achievements_select_own" ON user_achievements;
CREATE POLICY "user_achievements_select_own" ON user_achievements FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_achievements_insert_own" ON user_achievements;
CREATE POLICY "user_achievements_insert_own" ON user_achievements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- GAME SCORES
CREATE TABLE IF NOT EXISTS game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  game_name text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  played_at timestamptz DEFAULT now()
);
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scores_select_all" ON game_scores;
CREATE POLICY "scores_select_all" ON game_scores FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "scores_insert_own" ON game_scores;
CREATE POLICY "scores_insert_own" ON game_scores FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_req ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addr ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_scores_game ON game_scores(game_name, score DESC);

-- SEED ACHIEVEMENTS
INSERT INTO achievements (name, description, icon, xp_reward, coin_reward, requirement_type, requirement_value)
VALUES
  ('First Beat', 'Create your first beat', 'Music', 50, 25, 'beats_created', 1),
  ('Beat Maker', 'Create 10 beats', 'Drum', 150, 75, 'beats_created', 10),
  ('Studio Rat', 'Record 5 audio clips', 'Mic', 100, 50, 'recordings', 5),
  ('Social Butterfly', 'Send 50 chat messages', 'MessageCircle', 200, 100, 'chat_messages', 50),
  ('Game On', 'Play any game', 'Gamepad2', 50, 25, 'games_played', 1),
  ('High Scorer', 'Score 100+ in any game', 'Trophy', 100, 50, 'game_score', 100),
  ('Rising Star', 'Reach level 5', 'Star', 300, 150, 'level', 5),
  ('Make Friends', 'Add 3 friends', 'Users', 100, 50, 'friends', 3)
ON CONFLICT DO NOTHING;

-- FUNCTION: update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();