import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import {
  ACTIVITY_GOAL_SECONDS,
  ACTIVITY_HEARTBEAT_MS,
  claimActivityReward,
  fetchActivityStatus,
  type ActivityClaimResult,
  type ActivityStatus,
} from '@/lib/activityRewards';
import { Check, Clock, Flame, Gift, Loader2, Sparkles } from 'lucide-react';

const TIERS = [
  { minutes: 5, coins: 20 },
  { minutes: 15, coins: 40 },
  { minutes: 30, coins: 75 },
  { minutes: 60, coins: 150 },
];

const STREAK_BONUSES = [
  { day: 3, coins: 30 },
  { day: 7, coins: 150 },
  { day: 14, coins: 400 },
  { day: 30, coins: 1000 },
];

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ActivityRewardCard() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLocale();
  const userId = profile?.id;

  const [status, setStatus] = useState<ActivityStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimFailed, setClaimFailed] = useState(false);
  const [result, setResult] = useState<ActivityClaimResult | null>(null);

  const loadStatus = useCallback(async () => {
    if (!userId) return;
    try {
      setStatus(await fetchActivityStatus(userId));
      setLoadFailed(false);
    } catch (err) {
      console.error('Failed to load activity status:', err);
      setLoadFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    loadStatus();
    const intervalId = window.setInterval(loadStatus, ACTIVITY_HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [loadStatus]);

  if (!profile) return null;

  const handleClaim = async () => {
    setClaiming(true);
    setClaimFailed(false);
    try {
      const claimed = await claimActivityReward();
      setResult(claimed);
      await refreshProfile();
      await loadStatus();
    } catch (err) {
      console.error('Failed to claim activity reward:', err);
      setClaimFailed(true);
    } finally {
      setClaiming(false);
    }
  };

  const secondsToday = status?.secondsToday ?? 0;
  const goalReached = secondsToday >= ACTIVITY_GOAL_SECONDS;
  const claimed = result !== null || status?.claimedToday === true;
  const progressPercent = Math.min(100, (secondsToday / ACTIVITY_GOAL_SECONDS) * 100);
  const streak = result?.streak ?? status?.streak ?? 0;

  return (
    <section className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 md:p-6 glass-surface space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center">
          <Clock className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-theme-text">{t('Награда за активность')}</h2>
          <p className="text-theme-muted text-sm mt-1">
            {t('Проведите в Soundscape 5 минут за день и получите монеты. Чем дольше вы здесь, тем больше награда.')}
          </p>
        </div>
      </div>

      {!status && !loadFailed && (
        <div className="flex items-center gap-2 text-theme-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('Загружаем прогресс')}
        </div>
      )}

      {!status && loadFailed && (
        <p className="text-sm text-theme-danger">{t('Не удалось загрузить прогресс активности')}</p>
      )}

      {status && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-muted">{t('Сегодня в приложении')}</span>
              <span className="font-semibold text-theme-text tabular-nums">
                {formatClock(Math.min(secondsToday, ACTIVITY_GOAL_SECONDS))} / {formatClock(ACTIVITY_GOAL_SECONDS)}
              </span>
            </div>
            <div className="h-3 rounded-full bg-theme-surface2 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-theme-primary to-theme-accent transition-all duration-700 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-theme-muted">
              {goalReached
                ? t('Цель выполнена')
                : `${t('Осталось')} ${formatClock(ACTIVITY_GOAL_SECONDS - secondsToday)}`}
            </p>
          </div>

          {claimed ? (
            <div className="rounded-xl border border-theme-success/30 bg-theme-success/10 p-4 flex items-start gap-3">
              <Check className="w-5 h-5 text-theme-success shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-theme-text">
                  {result
                    ? `${t('Получено')} +${result.coins} ${t('монет')}`
                    : t('Награда за сегодня получена')}
                </p>
                {result?.jackpot && (
                  <p className="text-sm font-semibold text-theme-warning flex items-center gap-1">
                    <Sparkles className="w-4 h-4" /> {t('ДЖЕКПОТ! Награда утроена')}
                  </p>
                )}
                <p className="text-xs text-theme-muted">{t('Вернитесь завтра, чтобы продолжить серию')}</p>
              </div>
            </div>
          ) : goalReached ? (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-3.5 bg-gradient-to-r from-theme-warning via-theme-primary to-theme-accent text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {claiming ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> {t('Получаем награду...')}
                </>
              ) : (
                <>
                  <Gift className="w-5 h-5" /> {t('Забрать награду')}
                </>
              )}
            </button>
          ) : (
            <p className="text-sm text-theme-muted text-center">
              {t('Еще немного! Проведите в Soundscape 5 минут, чтобы получить награду')}
            </p>
          )}

          {claimFailed && (
            <p className="text-sm text-theme-danger">{t('Не удалось получить награду. Попробуйте еще раз')}</p>
          )}

          <div className="flex items-center gap-2 text-sm text-theme-text">
            <Flame className="w-4 h-4 text-theme-warning" />
            <span>{t('Серия')}: {streak} {t('дней')}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-theme-border">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-theme-muted">{t('Время в день')}</p>
              {TIERS.map((tier) => (
                <div key={tier.minutes} className="flex items-center justify-between text-sm">
                  <span className="text-theme-text">{tier.minutes} {t('мин')}</span>
                  <span className="flex items-center gap-1 text-theme-text"><span className="coin coin-sm" /> {tier.coins}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-theme-muted">{t('Бонус за серию')}</p>
              {STREAK_BONUSES.map((bonus) => (
                <div key={bonus.day} className="flex items-center justify-between text-sm">
                  <span className="text-theme-text">{t('День')} {bonus.day}</span>
                  <span className="flex items-center gap-1 text-theme-text"><span className="coin coin-sm" /> +{bonus.coins}</span>
                </div>
              ))}
              <p className="text-xs text-theme-muted pt-1">{t('Шанс на джекпот x3: 10% каждый день')}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
