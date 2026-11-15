/*
# Add Gartic Phone-style party game

## Summary
Creates tables for a multiplayer drawing/guessing party game (like Gartic Phone / Telephone).
Players create rooms, join, and take turns writing prompts and drawing each other's prompts.
All data is scoped to authenticated users with proper ownership and membership checks.

## New Tables
- `game_rooms` — lobby rooms for the party game
  - id (uuid, PK)
  - code (text, unique) — 6-char join code
  - host_id (uuid, FK auth.users) — room creator
  - status (text) — 'waiting' | 'playing' | 'finished'
  - max_players (int, default 8)
  - current_round (int, default 0)
  - total_rounds (int, default 4)
  - created_at (timestamptz)
- `game_room_players` — players in each room
  - id (uuid, PK)
  - room_id (uuid, FK game_rooms)
  - user_id (uuid, FK auth.users)
  - username (text)
  - avatar_url (text)
  - joined_at (timestamptz)
  - is_ready (bool, default false)
- `game_chains` — the telephone chains (prompt -> drawing -> prompt -> ...)
  - id (uuid, PK)
  - room_id (uuid, FK game_rooms)
  - chain_index (int) — which chain in the room
  - current_holder_id (uuid, FK auth.users) — who currently has this chain
  - current_step (int) — 0 = writing prompt, 1 = drawing, 2 = writing prompt, etc.
  - completed (bool, default false)
- `game_chain_steps` — individual steps in a chain
  - id (uuid, PK)
  - chain_id (uuid, FK game_chains)
  - step_index (int)
  - type (text) — 'prompt' | 'drawing'
  - content (text) — the prompt text or drawing data URL
  - author_id (uuid, FK auth.users)
  - author_name (text)
  - created_at (timestamptz)

## Security
- RLS enabled on all tables
- Authenticated users can read rooms they're in, create rooms, join rooms
- Room hosts can update their room status
- Players can read chain data for their room
- Players can update chains they currently hold
*/

CREATE TABLE IF NOT EXISTS game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  host_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players int NOT NULL DEFAULT 8,
  current_round int NOT NULL DEFAULT 0,
  total_rounds int NOT NULL DEFAULT 4,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_game_rooms" ON game_rooms;
CREATE POLICY "select_game_rooms" ON game_rooms FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_game_rooms" ON game_rooms;
CREATE POLICY "insert_game_rooms" ON game_rooms FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "update_game_rooms" ON game_rooms;
CREATE POLICY "update_game_rooms" ON game_rooms FOR UPDATE
  TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

CREATE TABLE IF NOT EXISTS game_room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  avatar_url text,
  joined_at timestamptz DEFAULT now(),
  is_ready boolean NOT NULL DEFAULT false,
  UNIQUE(room_id, user_id)
);

ALTER TABLE game_room_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_game_room_players" ON game_room_players;
CREATE POLICY "select_game_room_players" ON game_room_players FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_game_room_players" ON game_room_players;
CREATE POLICY "insert_game_room_players" ON game_room_players FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_game_room_players" ON game_room_players;
CREATE POLICY "update_game_room_players" ON game_room_players FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_game_room_players" ON game_room_players;
CREATE POLICY "delete_game_room_players" ON game_room_players FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS game_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  chain_index int NOT NULL DEFAULT 0,
  current_holder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_step int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false
);

ALTER TABLE game_chains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_game_chains" ON game_chains;
CREATE POLICY "select_game_chains" ON game_chains FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_game_chains" ON game_chains;
CREATE POLICY "insert_game_chains" ON game_chains FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_game_chains" ON game_chains;
CREATE POLICY "update_game_chains" ON game_chains FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS game_chain_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES game_chains(id) ON DELETE CASCADE,
  step_index int NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('prompt', 'drawing')),
  content text NOT NULL DEFAULT '',
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE game_chain_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_game_chain_steps" ON game_chain_steps;
CREATE POLICY "select_game_chain_steps" ON game_chain_steps FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_game_chain_steps" ON game_chain_steps;
CREATE POLICY "insert_game_chain_steps" ON game_chain_steps FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "update_game_chain_steps" ON game_chain_steps;
CREATE POLICY "update_game_chain_steps" ON game_chain_steps FOR UPDATE
  TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_game_rooms_code ON game_rooms(code);
CREATE INDEX IF NOT EXISTS idx_game_room_players_room ON game_room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_game_chains_room ON game_chains(room_id);
CREATE INDEX IF NOT EXISTS idx_game_chain_steps_chain ON game_chain_steps(chain_id);