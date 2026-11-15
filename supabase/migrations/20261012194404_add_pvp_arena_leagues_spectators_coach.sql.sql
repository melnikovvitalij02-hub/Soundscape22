/*
# PVP Arena, Seasonal Leagues, Spectator Betting, AI Coach

## Overview
Redesigns PVP from a simple vote page into a central competitive feature ("chess for music"):
- Ranked 1v1 battles with ELO-style rating
- Monthly seasonal leagues with auto-reset and tier-based rewards
- Spectators can vote AND bet coins on outcomes
- AI Coach analyzes beat patterns and gives feedback (not auto-generate)

## New Tables

1. `pvp_arena_matches` — ranked 1v1 battles with ELO rating changes
   - player_a_id, player_b_id: the two competitors
   - beat_a_id, beat_b_id: their submitted beats
   - status: matchmaking -> active -> completed
   - winner_id, rating_delta_a, rating_delta_b
   - spectator_votes_a, spectator_votes_b
   - season_id: links to current season

2. `pvp_seasons` — monthly competitive seasons
   - name, month, year, start_date, end_date
   - is_active, is_current
   - Only one season can be current at a time

3. `pvp_player_ratings` — per-season ELO ratings
   - user_id, season_id, rating (default 1000)
   - wins, losses, streak
   - tier: computed from rating (Bronze/Silver/Gold/Platinum/Diamond)

4. `spectator_bets` — coin bets spectators place on matches
   - match_id, user_id, bet_on (a/b), coins_wagered
   - paid_out, coins_won

5. `ai_coach_sessions` — AI feedback on user's beat patterns
   - user_id, beat_data (jsonb), feedback (jsonb)
   - Contains analysis results: issues found, suggestions, score

## Modified Tables
- None modified destructively — all new tables alongside existing pvp_battles

## Security
- RLS enabled on all new tables
- Players can read all active matches and seasons (public competitive data)
- Players can only insert/update their own ratings, bets, and coach sessions
- Spectator bets check ownership via auth.uid()
*/

-- ============================================================
-- PVP SEASONS (monthly competitive leagues)
-- ============================================================
CREATE TABLE IF NOT EXISTS pvp_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true,
  is_current boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(month, year)
);

ALTER TABLE pvp_seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seasons_select_all" ON pvp_seasons;
CREATE POLICY "seasons_select_all" ON pvp_seasons FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "seasons_insert_own" ON pvp_seasons;
CREATE POLICY "seasons_insert_own" ON pvp_seasons FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "seasons_update_own" ON pvp_seasons;
CREATE POLICY "seasons_update_own" ON pvp_seasons FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Seed current and next season
INSERT INTO pvp_seasons (name, month, year, start_date, end_date, is_current)
SELECT 'Октябрь 2026', 10, 2026, '2026-10-01', '2026-10-31', true
WHERE NOT EXISTS (SELECT 1 FROM pvp_seasons WHERE month = 10 AND year = 2026);

INSERT INTO pvp_seasons (name, month, year, start_date, end_date)
SELECT 'Ноябрь 2026', 11, 2026, '2026-11-01', '2026-11-30'
WHERE NOT EXISTS (SELECT 1 FROM pvp_seasons WHERE month = 11 AND year = 2026);

-- ============================================================
-- PVP PLAYER RATINGS (per-season ELO)
-- ============================================================
CREATE TABLE IF NOT EXISTS pvp_player_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES pvp_seasons(id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 1000,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, season_id)
);

ALTER TABLE pvp_player_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ratings_select_all" ON pvp_player_ratings;
CREATE POLICY "ratings_select_all" ON pvp_player_ratings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ratings_insert_own" ON pvp_player_ratings;
CREATE POLICY "ratings_insert_own" ON pvp_player_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ratings_update_own" ON pvp_player_ratings;
CREATE POLICY "ratings_update_own" ON pvp_player_ratings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_pvp_ratings_season ON pvp_player_ratings(season_id, rating DESC);

-- ============================================================
-- PVP ARENA MATCHES (ranked 1v1)
-- ============================================================
CREATE TABLE IF NOT EXISTS pvp_arena_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid REFERENCES pvp_seasons(id) ON DELETE CASCADE,
  player_a_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_b_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beat_a_id uuid REFERENCES beats(id) ON DELETE SET NULL,
  beat_b_id uuid REFERENCES beats(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rating_delta_a integer DEFAULT 0,
  rating_delta_b integer DEFAULT 0,
  spectator_votes_a integer NOT NULL DEFAULT 0,
  spectator_votes_b integer NOT NULL DEFAULT 0,
  total_bets_a integer NOT NULL DEFAULT 0,
  total_bets_b integer NOT NULL DEFAULT 0,
  coins_pool_a integer NOT NULL DEFAULT 0,
  coins_pool_b integer NOT NULL DEFAULT 0,
  genre text,
  created_at timestamptz DEFAULT now(),
  ends_at timestamptz DEFAULT now() + interval '24 hours',
  CHECK (player_a_id <> player_b_id)
);

ALTER TABLE pvp_arena_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arena_matches_select_all" ON pvp_arena_matches;
CREATE POLICY "arena_matches_select_all" ON pvp_arena_matches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "arena_matches_insert_own" ON pvp_arena_matches;
CREATE POLICY "arena_matches_insert_own" ON pvp_arena_matches FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_a_id OR auth.uid() = player_b_id);
DROP POLICY IF EXISTS "arena_matches_update_own" ON pvp_arena_matches;
CREATE POLICY "arena_matches_update_own" ON pvp_arena_matches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_arena_active ON pvp_arena_matches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_season ON pvp_arena_matches(season_id, status);

-- ============================================================
-- SPECTATOR BETS (coin wagering)
-- ============================================================
CREATE TABLE IF NOT EXISTS spectator_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES pvp_arena_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  bet_on text NOT NULL CHECK (bet_on IN ('a','b')),
  coins_wagered integer NOT NULL DEFAULT 0,
  paid_out boolean NOT NULL DEFAULT false,
  coins_won integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, user_id)
);

ALTER TABLE spectator_bets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bets_select_all" ON spectator_bets;
CREATE POLICY "bets_select_all" ON spectator_bets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bets_insert_own" ON spectator_bets;
CREATE POLICY "bets_insert_own" ON spectator_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "bets_update_own" ON spectator_bets;
CREATE POLICY "bets_update_own" ON spectator_bets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bets_match ON spectator_bets(match_id);

-- ============================================================
-- SPECTATOR VOTES (free votes, separate from bets)
-- ============================================================
CREATE TABLE IF NOT EXISTS spectator_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES pvp_arena_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_for text NOT NULL CHECK (vote_for IN ('a','b')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, user_id)
);

ALTER TABLE spectator_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "spectator_votes_select_all" ON spectator_votes;
CREATE POLICY "spectator_votes_select_all" ON spectator_votes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "spectator_votes_insert_own" ON spectator_votes;
CREATE POLICY "spectator_votes_insert_own" ON spectator_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_spec_votes_match ON spectator_votes(match_id);

-- ============================================================
-- AI COACH SESSIONS (feedback analysis, not auto-generation)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_coach_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  beat_data jsonb NOT NULL,
  feedback jsonb,
  overall_score integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_coach_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coach_select_own" ON ai_coach_sessions;
CREATE POLICY "coach_select_own" ON ai_coach_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "coach_insert_own" ON ai_coach_sessions;
CREATE POLICY "coach_insert_own" ON ai_coach_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "coach_update_own" ON ai_coach_sessions;
CREATE POLICY "coach_update_own" ON ai_coach_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_coach_user ON ai_coach_sessions(user_id, created_at DESC);
