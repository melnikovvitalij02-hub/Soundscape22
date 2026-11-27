import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cccoflivuzxzujieuhvo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjY29mbGl2dXp4enVqaWV1aHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4ODk3MDcsImV4cCI6MjEwNDQ2NTcwN30.-suTh6a9r7yQOPacLl7Ez8mrFIw7kKrepkqNT964bNI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  detectSessionInUrl: true,
  storage: window.localStorage,
  storageKey: 'soundscape-auth',
  debug: false,
  },
  global: {
    headers: { 'X-Client-Info': 'soundscape-pro' },
  },
});

const requestTimestamps = new Map<string, number[]>();
const MAX_REQUESTS_PER_MINUTE = 60;

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = requestTimestamps.get(key) || [];
  const recent = timestamps.filter((t) => now - t < 60_000);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) return false;
  recent.push(now);
  requestTimestamps.set(key, recent);
  return true;
}

export type Profile = {
  dm_privacy?: 'everyone' | 'friends' | 'nobody' | 'specific';
  friend_request_privacy?: 'everyone' | 'nobody' | 'specific';
  call_privacy?: 'everyone' | 'friends' | 'nobody' | 'specific';
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  xp: number;
  level: number;
  coins: number;
  donate_coins?: number;
  earned_coins?: number;
  total_donate_purchased?: number;
  created_at: string;
  updated_at: string;
  is_online: boolean;
  last_seen: string;
  is_premium?: boolean;
  premium_expires_at?: string | null;
  yoomoney_payment_label?: string | null;
};

export type PrivateMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read: boolean;
  voice_path: string | null;
  voice_duration: number | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
  is_premium?: boolean;
  coins_spent?: number;
  sticker_id?: string | null;
  voice_path?: string | null;
  voice_duration?: number | null;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  data: Record<string, unknown>;
  genre: string;
  bpm: number;
  created_at: string;
  updated_at: string;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
  coin_reward: number;
  requirement_type: string;
  requirement_value: number;
};

export type UserAchievement = {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: string;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  accepted_at: string | null;
};

export type GameScore = {
  id: string;
  user_id: string;
  game_name: string;
  score: number;
  played_at: string;
};

export type Beat = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  bpm: number;
  audio_url: string | null;
  cover_url: string | null;
  play_count: number;
  created_at: string;
  data?: Record<string, unknown> | null;
  is_public?: boolean;
  download_price?: number;
  is_free?: boolean;
};

export type BeatLike = {
  id: string;
  beat_id: string;
  user_id: string;
  created_at: string;
};

export type BeatComment = {
  id: string;
  beat_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
};

export type VoiceComment = {
  id: string;
  beat_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  audio_url: string;
  duration: number;
  created_at: string;
};

export type Clan = {
  id: string;
  name: string;
  description: string;
  leader_id: string;
  tag: string;
  created_at: string;
};

export type ClanMember = {
  id: string;
  clan_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

export type PvPBattle = {
  id: string;
  beat_a_id: string;
  beat_b_id: string;
  creator_a_id: string;
  creator_b_id: string | null;
  votes_a: number;
  votes_b: number;
  status: string;
  winner_id: string | null;
  created_at: string;
  ends_at: string;
};

export type Story = {
  id: string;
  user_id: string;
  track_title: string;
  audio_url: string | null;
  image_url: string | null;
  created_at: string;
  expires_at: string;
};

export type CollabPlaylist = {
  id: string;
  name: string;
  creator_id: string;
  created_at: string;
};

export type DailyReward = {
  id: string;
  user_id: string;
  last_claimed_date: string | null;
  streak_days: number;
  total_coins_earned: number;
  created_at: string;
};

export type SeasonalEvent = {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  theme: string;
  bonus_xp_multiplier: number;
  is_active: boolean;
};

export type Subscription = {
  id: string;
  user_id: string;
  status: string;
  plan: string;
  tier: string;
  started_at: string | null;
  expires_at: string | null;
};

export type AvatarShopItem = {
  id: string;
  name: string;
  image_url: string;
  price: number;
  price_gems: number;
  rarity: string;
  created_at: string;
};

export type Community = {
  id: string;
  name: string;
  description: string;
  genre: string;
  icon: string;
  member_count: number;
  created_at: string;
};

export type ListeningStat = {
  id: string;
  user_id: string;
  date: string;
  minutes_listened: number;
  created_at: string;
};

export type SupportDonation = {
  id: string;
  supporter_id: string;
  creator_id: string;
  amount: number;
  message: string;
  created_at: string;
};

export type Remix = {
  id: string;
  original_beat_id: string;
  remixer_id: string;
  title: string;
  audio_url: string | null;
  created_at: string;
};

export type Sticker = {
  id: string;
  name: string;
  emoji: string;
  image_url: string | null;
  price_coins: number;
  category: string;
  rarity: string;
};

export type ProfileComment = {
  id: string;
  profile_user_id: string;
  author_id: string;
  content: string;
  coins_spent: number;
  created_at: string;
};

export type CoinTransaction = {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number | null;
  transaction_type: string;
  description: string | null;
  created_at: string;
};

export type BeatPurchase = {
  id: string;
  beat_id: string;
  buyer_id: string;
  price_paid: number;
  created_at: string;
};

export const MESSAGE_COST_COINS = 0;
export const PROFILE_COMMENT_COST_COINS = 10;
export const COINS_PER_RUBLE = 100;
export const ARTIST_PAYOUT_PERCENT = 70;
export const PLATFORM_COMMISSION_PERCENT = 30;

export const XP_PER_LEVEL = 500;

export function xpForLevel(level: number): number {
  return (level - 1) * XP_PER_LEVEL;
}

export function levelFromXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function xpProgress(xp: number): { current: number; needed: number; percent: number } {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const current = xp - base;
  const needed = XP_PER_LEVEL;
  return { current, needed, percent: Number(((current / needed) * 100).toFixed(1)) };
}
