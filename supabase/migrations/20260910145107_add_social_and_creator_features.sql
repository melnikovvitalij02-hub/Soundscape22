/*
# Soundscape Pro - Social & Creator Features Schema

## Overview
Adds tables for: beats feed (shared beats with likes/comments), clans (teams), PvP battles (voting), stories (24h), collaborative playlists, voice comments, daily rewards/streaks, seasonal events, subscriptions, avatar shop, communities (genre groups), listening stats, and support donations.

## New Tables

1. **beats** - Published beats in the feed
   - id, user_id, title, genre, bpm, audio_url, cover_url, play_count, created_at

2. **beat_likes** - Likes on beats
   - id, beat_id, user_id, created_at

3. **beat_comments** - Text comments on beats
   - id, beat_id, user_id, username, avatar_url, content, created_at

4. **voice_comments** - Voice comments on beats
   - id, beat_id, user_id, username, avatar_url, audio_url, duration, created_at

5. **clans** - Clan/team definitions
   - id, name, description, leader_id, tag, created_at

6. **clan_members** - Membership in clans
   - id, clan_id, user_id, role (leader/member), joined_at

7. **pvp_battles** - PvP beat battles
   - id, beat_a_id, beat_b_id, creator_a_id, creator_b_id, votes_a, votes_b, status, winner_id, created_at, ends_at

8. **pvp_votes** - Individual votes in battles
   - id, battle_id, user_id, choice (a/b), created_at

9. **stories** - 24h stories with tracks
   - id, user_id, track_title, audio_url, image_url, created_at, expires_at

10. **collab_playlists** - Collaborative playlists
    - id, name, creator_id, created_at

11. **collab_playlist_tracks** - Tracks in collaborative playlists
    - id, playlist_id, user_id, title, added_by, added_at

12. **daily_rewards** - Daily login rewards
    - id, user_id, last_claimed_date, streak_days, total_coins_earned, created_at

13. **seasonal_events** - Seasonal/holiday events
    - id, name, description, start_date, end_date, theme, bonus_xp_multiplier, is_active

14. **subscriptions** - Premium subscription status
    - id, user_id, status, plan, started_at, expires_at

15. **avatar_shop_items** - purchasable avatars
    - id, name, image_url, price, rarity, created_at

16. **user_avatars** - owned avatars
    - id, user_id, avatar_shop_item_id, purchased_at

17. **communities** - Genre-based communities
    - id, name, description, genre, icon, member_count, created_at

18. **community_members** - Community membership
    - id, community_id, user_id, joined_at

19. **listening_stats** - Daily listening time tracking
    - id, user_id, date, minutes_listened, created_at

20. **support_donations** - Support donations to creators
    - id, supporter_id, creator_id, amount, message, created_at

21. **remixes** - Remix of someone else's beat
    - id, original_beat_id, remixer_id, title, audio_url, created_at

## Security
- RLS enabled on all tables
- Owner-scoped CRUD where appropriate
- Public read for feed, communities, battles, stories
- Authenticated insert for interactions (likes, comments, votes)
*/

-- BEATS (published feed)
CREATE TABLE IF NOT EXISTS beats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  genre text DEFAULT '',
  bpm integer DEFAULT 120,
  audio_url text,
  cover_url text,
  play_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE beats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beats_select_all" ON beats;
CREATE POLICY "beats_select_all" ON beats FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "beats_insert_own" ON beats;
CREATE POLICY "beats_insert_own" ON beats FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "beats_update_own" ON beats;
CREATE POLICY "beats_update_own" ON beats FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "beats_delete_own" ON beats;
CREATE POLICY "beats_delete_own" ON beats FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_beats_created ON beats(created_at DESC);

-- BEAT LIKES
CREATE TABLE IF NOT EXISTS beat_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(beat_id, user_id)
);
ALTER TABLE beat_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beat_likes_select_all" ON beat_likes;
CREATE POLICY "beat_likes_select_all" ON beat_likes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "beat_likes_insert_own" ON beat_likes;
CREATE POLICY "beat_likes_insert_own" ON beat_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "beat_likes_delete_own" ON beat_likes;
CREATE POLICY "beat_likes_delete_own" ON beat_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_beat_likes_beat ON beat_likes(beat_id);

-- BEAT COMMENTS (text)
CREATE TABLE IF NOT EXISTS beat_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  avatar_url text,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE beat_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beat_comments_select_all" ON beat_comments;
CREATE POLICY "beat_comments_select_all" ON beat_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "beat_comments_insert_own" ON beat_comments;
CREATE POLICY "beat_comments_insert_own" ON beat_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "beat_comments_delete_own" ON beat_comments;
CREATE POLICY "beat_comments_delete_own" ON beat_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_beat_comments_beat ON beat_comments(beat_id, created_at DESC);

-- VOICE COMMENTS
CREATE TABLE IF NOT EXISTS voice_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  avatar_url text,
  audio_url text NOT NULL,
  duration real DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE voice_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_comments_select_all" ON voice_comments;
CREATE POLICY "voice_comments_select_all" ON voice_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "voice_comments_insert_own" ON voice_comments;
CREATE POLICY "voice_comments_insert_own" ON voice_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "voice_comments_delete_own" ON voice_comments;
CREATE POLICY "voice_comments_delete_own" ON voice_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_voice_comments_beat ON voice_comments(beat_id, created_at DESC);

-- CLANS
CREATE TABLE IF NOT EXISTS clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  leader_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tag text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE clans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clans_select_all" ON clans;
CREATE POLICY "clans_select_all" ON clans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "clans_insert_own" ON clans;
CREATE POLICY "clans_insert_own" ON clans FOR INSERT TO authenticated WITH CHECK (auth.uid() = leader_id);
DROP POLICY IF EXISTS "clans_update_own" ON clans;
CREATE POLICY "clans_update_own" ON clans FOR UPDATE TO authenticated USING (auth.uid() = leader_id) WITH CHECK (auth.uid() = leader_id);
DROP POLICY IF EXISTS "clans_delete_own" ON clans;
CREATE POLICY "clans_delete_own" ON clans FOR DELETE TO authenticated USING (auth.uid() = leader_id);

-- CLAN MEMBERS
CREATE TABLE IF NOT EXISTS clan_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(clan_id, user_id)
);
ALTER TABLE clan_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clan_members_select_all" ON clan_members;
CREATE POLICY "clan_members_select_all" ON clan_members FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "clan_members_insert_own" ON clan_members;
CREATE POLICY "clan_members_insert_own" ON clan_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "clan_members_delete_own" ON clan_members;
CREATE POLICY "clan_members_delete_own" ON clan_members FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);

-- PVP BATTLES
CREATE TABLE IF NOT EXISTS pvp_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_a_id uuid REFERENCES beats(id) ON DELETE CASCADE,
  beat_b_id uuid REFERENCES beats(id) ON DELETE CASCADE,
  creator_a_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_b_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  votes_a integer NOT NULL DEFAULT 0,
  votes_b integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  winner_id uuid,
  created_at timestamptz DEFAULT now(),
  ends_at timestamptz DEFAULT now() + interval '24 hours'
);
ALTER TABLE pvp_battles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pvp_battles_select_all" ON pvp_battles;
CREATE POLICY "pvp_battles_select_all" ON pvp_battles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pvp_battles_insert_own" ON pvp_battles;
CREATE POLICY "pvp_battles_insert_own" ON pvp_battles FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_a_id);
DROP POLICY IF EXISTS "pvp_battles_update_own" ON pvp_battles;
CREATE POLICY "pvp_battles_update_own" ON pvp_battles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pvp_active ON pvp_battles(status, created_at DESC);

-- PVP VOTES
CREATE TABLE IF NOT EXISTS pvp_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES pvp_battles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('a','b')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(battle_id, user_id)
);
ALTER TABLE pvp_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pvp_votes_select_all" ON pvp_votes;
CREATE POLICY "pvp_votes_select_all" ON pvp_votes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pvp_votes_insert_own" ON pvp_votes;
CREATE POLICY "pvp_votes_insert_own" ON pvp_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_pvp_votes_battle ON pvp_votes(battle_id);

-- STORIES (24h)
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  track_title text NOT NULL,
  audio_url text,
  image_url text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours'
);
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stories_select_all" ON stories;
CREATE POLICY "stories_select_all" ON stories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "stories_insert_own" ON stories;
CREATE POLICY "stories_insert_own" ON stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "stories_delete_own" ON stories;
CREATE POLICY "stories_delete_own" ON stories FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(expires_at);

-- COLLAB PLAYLISTS
CREATE TABLE IF NOT EXISTS collab_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  creator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE collab_playlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "collab_playlists_select_all" ON collab_playlists;
CREATE POLICY "collab_playlists_select_all" ON collab_playlists FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "collab_playlists_insert_own" ON collab_playlists;
CREATE POLICY "collab_playlists_insert_own" ON collab_playlists FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
DROP POLICY IF EXISTS "collab_playlists_update_own" ON collab_playlists;
CREATE POLICY "collab_playlists_update_own" ON collab_playlists FOR UPDATE TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
DROP POLICY IF EXISTS "collab_playlists_delete_own" ON collab_playlists;
CREATE POLICY "collab_playlists_delete_own" ON collab_playlists FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- COLLAB PLAYLIST TRACKS
CREATE TABLE IF NOT EXISTS collab_playlist_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES collab_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  added_by text,
  added_at timestamptz DEFAULT now()
);
ALTER TABLE collab_playlist_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "collab_playlist_tracks_select_all" ON collab_playlist_tracks;
CREATE POLICY "collab_playlist_tracks_select_all" ON collab_playlist_tracks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "collab_playlist_tracks_insert_own" ON collab_playlist_tracks;
CREATE POLICY "collab_playlist_tracks_insert_own" ON collab_playlist_tracks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "collab_playlist_tracks_delete_own" ON collab_playlist_tracks;
CREATE POLICY "collab_playlist_tracks_delete_own" ON collab_playlist_tracks FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_collab_tracks_playlist ON collab_playlist_tracks(playlist_id, added_at DESC);

-- DAILY REWARDS
CREATE TABLE IF NOT EXISTS daily_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  last_claimed_date date,
  streak_days integer NOT NULL DEFAULT 0,
  total_coins_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE daily_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_rewards_select_own" ON daily_rewards;
CREATE POLICY "daily_rewards_select_own" ON daily_rewards FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "daily_rewards_insert_own" ON daily_rewards;
CREATE POLICY "daily_rewards_insert_own" ON daily_rewards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "daily_rewards_update_own" ON daily_rewards;
CREATE POLICY "daily_rewards_update_own" ON daily_rewards FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SEASONAL EVENTS
CREATE TABLE IF NOT EXISTS seasonal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  start_date date NOT NULL,
  end_date date NOT NULL,
  theme text DEFAULT '',
  bonus_xp_multiplier real DEFAULT 1.0,
  is_active boolean DEFAULT true
);
ALTER TABLE seasonal_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seasonal_events_select_all" ON seasonal_events;
CREATE POLICY "seasonal_events_select_all" ON seasonal_events FOR SELECT TO authenticated USING (true);

-- SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active','inactive','expired')),
  plan text DEFAULT 'premium',
  started_at timestamptz,
  expires_at timestamptz,
  UNIQUE(user_id)
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "subscriptions_insert_own" ON subscriptions;
CREATE POLICY "subscriptions_insert_own" ON subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "subscriptions_update_own" ON subscriptions;
CREATE POLICY "subscriptions_update_own" ON subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AVATAR SHOP ITEMS
CREATE TABLE IF NOT EXISTS avatar_shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text NOT NULL,
  price integer NOT NULL DEFAULT 100,
  rarity text DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE avatar_shop_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "avatar_shop_select_all" ON avatar_shop_items;
CREATE POLICY "avatar_shop_select_all" ON avatar_shop_items FOR SELECT TO authenticated USING (true);

-- USER AVATARS (owned)
CREATE TABLE IF NOT EXISTS user_avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_shop_item_id uuid NOT NULL REFERENCES avatar_shop_items(id) ON DELETE CASCADE,
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, avatar_shop_item_id)
);
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_avatars_select_own" ON user_avatars;
CREATE POLICY "user_avatars_select_own" ON user_avatars FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_avatars_insert_own" ON user_avatars;
CREATE POLICY "user_avatars_insert_own" ON user_avatars FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_avatars_delete_own" ON user_avatars;
CREATE POLICY "user_avatars_delete_own" ON user_avatars FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- COMMUNITIES
CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  genre text NOT NULL,
  icon text DEFAULT '',
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communities_select_all" ON communities;
CREATE POLICY "communities_select_all" ON communities FOR SELECT TO authenticated USING (true);

-- COMMUNITY MEMBERS
CREATE TABLE IF NOT EXISTS community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(community_id, user_id)
);
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_members_select_all" ON community_members;
CREATE POLICY "community_members_select_all" ON community_members FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "community_members_insert_own" ON community_members;
CREATE POLICY "community_members_insert_own" ON community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "community_members_delete_own" ON community_members;
CREATE POLICY "community_members_delete_own" ON community_members FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_comm ON community_members(community_id);

-- LISTENING STATS
CREATE TABLE IF NOT EXISTS listening_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  minutes_listened integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);
ALTER TABLE listening_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listening_stats_select_own" ON listening_stats;
CREATE POLICY "listening_stats_select_own" ON listening_stats FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "listening_stats_insert_own" ON listening_stats;
CREATE POLICY "listening_stats_insert_own" ON listening_stats FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "listening_stats_update_own" ON listening_stats;
CREATE POLICY "listening_stats_update_own" ON listening_stats FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_listening_stats_user_date ON listening_stats(user_id, date DESC);

-- SUPPORT DONATIONS
CREATE TABLE IF NOT EXISTS support_donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL DEFAULT 0,
  message text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE support_donations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_donations_select_all" ON support_donations;
CREATE POLICY "support_donations_select_all" ON support_donations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "support_donations_insert_own" ON support_donations;
CREATE POLICY "support_donations_insert_own" ON support_donations FOR INSERT TO authenticated WITH CHECK (auth.uid() = supporter_id);

-- REMIXES
CREATE TABLE IF NOT EXISTS remixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  remixer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  audio_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE remixes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "remixes_select_all" ON remixes;
CREATE POLICY "remixes_select_all" ON remixes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "remixes_insert_own" ON remixes;
CREATE POLICY "remixes_insert_own" ON remixes FOR INSERT TO authenticated WITH CHECK (auth.uid() = remixer_id);
DROP POLICY IF EXISTS "remixes_delete_own" ON remixes;
CREATE POLICY "remixes_delete_own" ON remixes FOR DELETE TO authenticated USING (auth.uid() = remixer_id);
CREATE INDEX IF NOT EXISTS idx_remixes_original ON remixes(original_beat_id);

-- SEED DATA: Communities
INSERT INTO communities (name, description, genre, icon) VALUES
  ('Lo-Fi Lounge', 'Расслабляющие биты для учёбы и отдыха', 'Lo-Fi', 'Coffee'),
  ('Trap Nation', 'Тяжёлые 808 и агрессивные биты', 'Трэп', 'Zap'),
  ('Rock Forge', 'Гитарные риффы и мощная энергетика', 'Рок', 'Guitar'),
  ('House Heads', 'Четыре-на-пол и глубокий грув', 'House', 'Disc3'),
  ('Techno Underground', 'Тёмный и индустриальный звук', 'Техно', 'Radio'),
  ('Hip-Hop Central', 'Классика и новый школьный хип-хоп', 'Хип-Хоп', 'Mic')
ON CONFLICT DO NOTHING;

-- SEED DATA: Avatar Shop Items
INSERT INTO avatar_shop_items (name, image_url, price, rarity) VALUES
  ('Астронавт', '/avatar-astronaut.webp', 100, 'common'),
  ('Кот', '/avatar-cat.webp', 150, 'common'),
  ('Дракон', '/avatar-dragon.webp', 300, 'rare'),
  ('Лис', '/avatar-fox.webp', 200, 'common'),
  ('Призрак', '/avatar-ghost.webp', 250, 'rare'),
  ('Музыка', '/avatar-music.webp', 350, 'rare'),
  ('Панда', '/avatar-panda.webp', 500, 'epic'),
  ('Робот', '/avatar-robot.webp', 750, 'legendary')
ON CONFLICT DO NOTHING;

-- SEED DATA: Seasonal Events
INSERT INTO seasonal_events (name, description, start_date, end_date, theme, bonus_xp_multiplier, is_active) VALUES
  ('Новый Год', 'Праздничный сезон! Бонус XP за все действия', '2026-12-20', '2027-01-10', 'newyear', 2.0, true),
  ('Хэллоуин', 'Жуткие биты и мрачная атмосфера', '2026-10-25', '2026-11-02', 'halloween', 1.5, true),
  ('День рождения Soundscape', '6 декабря — день рождения платформы! Тройной XP!', '2026-12-06', '2026-12-07', 'birthday', 3.0, true),
  ('Масленица', 'Широкая масленица — биты с размахом!', '2027-02-20', '2027-02-27', 'maslenitsa', 1.5, true),
  ('8 Марта', 'Весенний праздник — двойной XP весь день', '2027-03-08', '2027-03-08', 'spring', 2.0, true),
  ('День Победы', '9 мая — память и уважение', '2027-05-09', '2027-05-09', 'victory', 1.5, true)
ON CONFLICT DO NOTHING;

-- SEED DATA: Fake beats for feed with reviews
INSERT INTO beats (user_id, title, genre, bpm, cover_url, play_count)
SELECT id, 'Тестовый бит', 'Lo-Fi', 85, '/cover-baram.webp', 42
FROM profiles LIMIT 1
ON CONFLICT DO NOTHING;

-- SEED DATA: Fake comments (5 reviews)
INSERT INTO beat_comments (beat_id, user_id, username, avatar_url, content)
SELECT b.id, p.id, 'DJ_Smooth', '/avatar-fox.webp', 'Огонь! Этот бит прямо в душу залезает 🔥'
FROM beats b, profiles p
WHERE b.title = 'Тестовый бит'
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO beat_comments (beat_id, user_id, username, avatar_url, content)
SELECT b.id, p.id, 'BeatMaster99', '/avatar-dragon.webp', '808 на месте, микс чистый. Уважение!'
FROM beats b, profiles p
WHERE b.title = 'Тестовый бит'
LIMIT 1
ON CONFLICT DO NOTHING;