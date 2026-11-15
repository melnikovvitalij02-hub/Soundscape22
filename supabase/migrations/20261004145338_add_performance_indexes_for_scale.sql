-- Performance indexes for high-traffic tables (10000+ users)

-- Chat messages: ordered by created_at, filtered by user
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages (user_id);

-- Profiles: online status lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON profiles (is_online);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles (last_seen);

-- Beats: feed ordering
CREATE INDEX IF NOT EXISTS idx_beats_created_at ON beats (created_at DESC);

-- Game scores: leaderboard lookups
CREATE INDEX IF NOT EXISTS idx_game_scores_score ON game_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_user_game ON game_scores (user_id, game_name);

-- Projects: user's projects
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id, created_at DESC);

-- Friendships: lookups by either side
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status);

-- Private messages: conversation lookups
CREATE INDEX IF NOT EXISTS idx_private_messages_recipient ON private_messages (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_messages_sender ON private_messages (sender_id, created_at DESC);

-- Subscriptions: active status check
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions (user_id, status);

-- Rate limits: identifier + action lookup (already has unique constraint, ensure index)
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_action ON rate_limits (identifier, action);

-- User achievements: user lookups
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id);
