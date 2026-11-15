import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, type DailyReward } from '@/lib/supabase';
import ActivityRewardCard from '@/components/ActivityRewardCard';
import { Gift, Flame, Check, Calendar, Star, Loader2, Sparkles } from 'lucide-react';

const DAILY_REWARDS = [
  { day: 1, coins: 50, xp: 0 },
  { day: 2, coins: 50, xp: 0 },
  { day: 3, coins: 50, xp: 0 },
  { day: 4, coins: 50, xp: 0 },
  { day: 5, coins: 50, xp: 0 },
  { day: 6, coins: 50, xp: 0 },
  { day: 7, coins: 200, xp: 500 },
];

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDaysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DailyRewardsPage() {
  const { profile, addCoins, addXp, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [reward, setReward] = useState<DailyReward | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  const today = getTodayStr();

  const fetchReward = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('daily_rewards')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();
    if (error) {
      console.error('Error fetching daily reward:', error);
    } else {
      setReward(data as DailyReward | null);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchReward();
  }, [fetchReward]);

  const alreadyClaimedToday = reward?.last_claimed_date === today;

  // Determine current streak day (0-indexed: 0 = day 1 not yet claimed)
  const currentStreakDay = reward?.streak_days ?? 0;

  // Calculate which day will be claimed next
  const nextDayIndex = alreadyClaimedToday ? currentStreakDay : currentStreakDay;

  // Determine if streak will reset (missed a day)
  const willResetStreak = (() => {
    if (!reward?.last_claimed_date) return false;
    const daysSince = getDaysBetween(reward.last_claimed_date, today);
    return daysSince > 1;
  })();

  const handleClaim = async () => {
    if (!profile || alreadyClaimedToday) return;
    setClaiming(true);
    setClaimMessage(null);

    // Calculate new streak
    let newStreak: number;
    if (!reward?.last_claimed_date) {
      newStreak = 1;
    } else if (willResetStreak) {
      newStreak = 1;
    } else {
      newStreak = currentStreakDay + 1;
    }

    // Get reward for current day (1-indexed)
    const dayNum = ((newStreak - 1) % 7) + 1;
    const dayReward = DAILY_REWARDS[dayNum - 1];
    const coinsEarned = dayReward.coins;
    const xpEarned = dayReward.xp;

    const newTotalCoins = (reward?.total_coins_earned ?? 0) + coinsEarned;

    if (reward) {
      const { error } = await supabase
        .from('daily_rewards')
        .update({
          last_claimed_date: today,
          streak_days: newStreak,
          total_coins_earned: newTotalCoins,
        })
        .eq('id', reward.id);
      if (error) {
        console.error('Error updating daily reward:', error);
        setClaiming(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from('daily_rewards')
        .insert({
          user_id: profile.id,
          last_claimed_date: today,
          streak_days: newStreak,
          total_coins_earned: coinsEarned,
        });
      if (error) {
        console.error('Error creating daily reward:', error);
        setClaiming(false);
        return;
      }
    }

    // Add coins
    await addCoins(coinsEarned);

    // Add XP bonus on 7-day streak completion
    if (dayNum === 7 && xpEarned > 0) {
      await addXp(xpEarned);
    }

    await refreshProfile();
    await fetchReward();
    setClaiming(false);

    let msg = t('Получено') + ' ' + coinsEarned + ' ' + t('монет') + '!';
    if (dayNum === 7 && xpEarned > 0) {
      msg = `🎉 ${t('7-дневная серия! Получено')} ${coinsEarned} ${t('монет')} + ${xpEarned} XP!`;
    }
    setClaimMessage(msg);
    setTimeout(() => setClaimMessage(null), 4000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-theme-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // For display: show which days are "filled" based on streak
  const filledDays = alreadyClaimedToday
    ? currentStreakDay % 7 === 0
      ? 7
      : currentStreakDay % 7
    : nextDayIndex % 7;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Gift className="w-6 h-6 text-theme-warning" />
          {t('Ежедневные награды')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          {t('Заходите каждый день и получайте монеты. 7-й день — бонус 500 XP!')}
        </p>
      </div>

      {/* Activity reward */}
      <ActivityRewardCard />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-theme-warning to-theme-danger flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-theme-muted text-xs uppercase tracking-wider">{t('Текущая серия')}</p>
              <p className="text-2xl font-bold text-theme-text">{currentStreakDay} {t('дней')}</p>
            </div>
          </div>
        </div>

        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 flex items-center justify-center">
              <span className="coin coin-md" />
            </div>
            <div>
              <p className="text-theme-muted text-xs uppercase tracking-wider">{t('Донат-монеты')}</p>
              <p className="text-2xl font-bold text-theme-text">{profile?.coins ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Claim message */}
      {claimMessage && (
        <div className="bg-theme-success/20 border border-theme-success/30 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <Sparkles className="w-5 h-5 text-theme-success" />
          <p className="text-theme-success text-sm font-medium">{claimMessage}</p>
        </div>
      )}

      {/* 7-day streak visualization */}
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface">
        <h3 className="text-sm font-medium text-theme-text mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-theme-primary" />
          {t('Награды за 7 дней')}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {DAILY_REWARDS.map((d, i) => {
            const isFilled = i < filledDays;
            const isCurrentDay = i === filledDays && !alreadyClaimedToday;
            const isDay7 = d.day === 7;

            return (
              <div
                key={d.day}
                className={`relative flex flex-col items-center p-3 rounded-2xl border transition-all ${
                  isFilled
                    ? isDay7
                      ? 'bg-gradient-to-br from-theme-warning/20 to-theme-primary/20 border-theme-warning'
                      : 'bg-theme-primary/10 border-theme-primary-border'
                    : isCurrentDay
                    ? 'border-theme-primary border-2 animate-pulse'
                    : 'bg-theme-surface2 border-theme-border'
                }`}
              >
                <span className="text-xs text-theme-muted uppercase tracking-wider mb-2">
                  {t('День')} {d.day}
                </span>

                {/* Circle */}
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 ${
                    isFilled
                      ? isDay7
                        ? 'bg-gradient-to-br from-theme-warning to-theme-primary shadow-lg'
                        : 'bg-gradient-to-br from-theme-primary to-theme-accent shadow-lg'
                      : 'bg-theme-surface border-2 border-theme-border'
                  }`}
                >
                  {isFilled ? (
                    isDay7 ? (
                      <Star className="w-6 h-6 text-white" fill="white" />
                    ) : (
                      <Check className="w-6 h-6 text-white" />
                    )
                  ) : (
                    <span className="text-lg font-bold text-theme-muted">{d.day}</span>
                  )}
                </div>

                {/* Reward amount */}
                <div className="flex items-center gap-1 text-xs">
                  <span className="coin coin-sm" />
                  <span className={isFilled ? 'text-theme-text font-medium' : 'text-theme-muted'}>
                    {d.coins}
                  </span>
                </div>
                {isDay7 && (
                  <div className="flex items-center gap-1 text-xs mt-0.5">
                    <Sparkles className="w-3 h-3 text-theme-accent" />
                    <span className="text-theme-accent font-medium">+{d.xp} XP</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Claim button or come back tomorrow */}
        {alreadyClaimedToday ? (
          <div className="w-full py-3.5 bg-theme-surface2 text-theme-muted rounded-xl font-medium text-center flex items-center justify-center gap-2">
            <Check className="w-5 h-5 text-theme-success" />
            {t('Награда за сегодня получена. Возвращайтесь завтра!')}
          </div>
        ) : (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="w-full py-3.5 bg-gradient-to-r from-theme-warning via-theme-primary to-theme-accent text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {claiming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('Получаем награду...')}
              </>
            ) : (
              <>
                <Gift className="w-5 h-5" />
                {t('Получить ежедневную награду')}
              </>
            )}
          </button>
        )}

        {/* Streak reset warning */}
        {willResetStreak && !alreadyClaimedToday && currentStreakDay > 0 && (
          <p className="text-xs text-theme-warning mt-3 text-center">
            ⚠️ {t('Вы пропустили день. Серия начнётся заново!')}
          </p>
        )}
      </div>
    </div>
  );
}
