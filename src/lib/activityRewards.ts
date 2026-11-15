import { supabase } from '@/lib/supabase';

export const ACTIVITY_GOAL_SECONDS = 300;
export const ACTIVITY_HEARTBEAT_MS = 30_000;

export type ActivityStatus = {
  secondsToday: number;
  claimedToday: boolean;
  streak: number;
};

export type ActivityClaimResult = {
  coins: number;
  minutes: number;
  streak: number;
  jackpot: boolean;
  balance: number;
};

type ClaimRow = {
  reward_coins: number;
  reward_minutes: number;
  reward_streak: number;
  reward_jackpot: boolean;
  reward_balance: number;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function previousDayUtc(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function sendActivityHeartbeat(): Promise<void> {
  const { error } = await supabase.rpc('record_activity_heartbeat');
  if (error) throw error;
}

export async function fetchActivityStatus(userId: string): Promise<ActivityStatus> {
  const today = todayUtc();

  const [activityRes, lastClaimRes] = await Promise.all([
    supabase
      .from('daily_activity')
      .select('seconds_active')
      .eq('user_id', userId)
      .eq('activity_date', today)
      .maybeSingle(),
    supabase
      .from('activity_reward_claims')
      .select('claim_date, streak_days')
      .eq('user_id', userId)
      .order('claim_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (activityRes.error) throw activityRes.error;
  if (lastClaimRes.error) throw lastClaimRes.error;

  const lastClaim = lastClaimRes.data as { claim_date: string; streak_days: number } | null;
  const claimedToday = lastClaim?.claim_date === today;
  const streakAlive = lastClaim
    ? lastClaim.claim_date === today || lastClaim.claim_date === previousDayUtc(today)
    : false;

  return {
    secondsToday: (activityRes.data as { seconds_active: number } | null)?.seconds_active ?? 0,
    claimedToday,
    streak: streakAlive && lastClaim ? lastClaim.streak_days : 0,
  };
}

export async function claimActivityReward(): Promise<ActivityClaimResult> {
  const { data, error } = await supabase.rpc('claim_activity_reward');
  if (error) throw error;

  const row = Array.isArray(data) ? (data[0] as ClaimRow | undefined) : undefined;
  if (!row || typeof row.reward_coins !== 'number') {
    throw new Error('Unexpected reward response');
  }

  return {
    coins: row.reward_coins,
    minutes: row.reward_minutes,
    streak: row.reward_streak,
    jackpot: row.reward_jackpot,
    balance: row.reward_balance,
  };
}
