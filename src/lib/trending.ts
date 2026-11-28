import { supabase } from '@/lib/supabase';
import type { SavedTrack } from '@/lib/beatPlayback';

export type PromotionKind = 'boost_basic' | 'boost_plus' | 'boost_max' | 'top3';

export type PromotionOption = {
  kind: PromotionKind;
  price: number;
  durationHours: number | null;
  boostPoints: number;
};

export const PROMOTION_OPTIONS: PromotionOption[] = [
  { kind: 'boost_basic', price: 300, durationHours: 24, boostPoints: 100 },
  { kind: 'boost_plus', price: 750, durationHours: 24, boostPoints: 300 },
  { kind: 'boost_max', price: 1800, durationHours: 24, boostPoints: 900 },
  { kind: 'top3', price: 5500, durationHours: 24, boostPoints: 0 },
];

export const TOP3_SLOTS = 3;

export type TrendingBeat = {
  rank_position: number;
  beat_id: string;
  creator_id: string;
  title: string;
  genre: string;
  bpm: number;
  cover_url: string | null;
  audio_url: string | null;
  data: { tracks?: SavedTrack[]; bpm?: number; bars?: number } | null;
  play_count: number;
  likes_count: number;
  boost_points: number;
  score: number;
  top3_until: string | null;
  boost_until: string | null;
  is_eternal: boolean;
  creator: { username: string; avatar_url: string | null } | null;
};

type TrendingRow = Omit<TrendingBeat, 'creator'>;

export async function fetchTrendingBeats(limit = 50): Promise<TrendingBeat[]> {
  const { data, error } = await supabase.rpc('get_trending_beats', { p_limit: limit });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as TrendingRow[];

  const creatorIds = [...new Set(rows.map((row) => row.creator_id))];
  const creatorMap = new Map<string, { username: string; avatar_url: string | null }>();
  if (creatorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', creatorIds);
    if (profilesError) throw profilesError;
    for (const profile of (profiles ?? []) as { id: string; username: string; avatar_url: string | null }[]) {
      creatorMap.set(profile.id, { username: profile.username, avatar_url: profile.avatar_url });
    }
  }

  return rows.map((row) => ({ ...row, creator: creatorMap.get(row.creator_id) ?? null }));
}

// Verified play: counts only after a real 30s listen, once per listener
// per beat per day (server enforces both, see count_verified_play).
export async function recordBeatPlay(beatId: string, listenedSec: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('count_verified_play', {
    p_beat_id: beatId,
    p_listened_sec: Math.round(listenedSec),
  });
  if (error) throw error;
  return data === true;
}

// Anonymous visitors still bump the public play counter (no rewards attached).
export async function recordAnonPlay(beatId: string): Promise<void> {
  const { error } = await supabase.rpc('count_anon_play', { p_beat_id: beatId });
  if (error) throw error;
}
