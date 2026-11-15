import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, type ListeningStat } from '@/lib/supabase';
import { BarChart3, Clock, Flame, Music, Plus, TrendingUp, Calendar, Headphones } from 'lucide-react';

const GENRE_COLORS: Record<string, string> = {
  'Хип-Хоп': '#f59e0b',
  Трэп: '#ef4444',
  House: '#06b6d4',
  Техно: '#8b5cf6',
  'Lo-Fi': '#10b981',
  Rock: '#f97316',
  Pop: '#ec4899',
  Other: '#64748b',
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

  const dayLabel = (d: Date): string => {
    const days = [t('Вс'), t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб')];
    return days[d.getDay()];
  };

export default function StatsPage() {
  const { profile, isGuest } = useAuth();
  const { t } = useLocale();
  const [stats, setStats] = useState<ListeningStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [addingTime, setAddingTime] = useState(false);

  const today = formatDate(new Date());

  const fetchStats = useCallback(async () => {
    if (isGuest) {
      setLoading(false);
      return;
    }
    if (!profile) return;
    setLoading(true);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data, error } = await supabase
      .from('listening_stats')
      .select('*')
      .eq('user_id', profile.id)
      .gte('date', formatDate(sevenDaysAgo))
      .order('date', { ascending: true });
    if (error) {
      console.error('Error fetching stats:', error);
      setStats([]);
    } else {
      setStats(data || []);
      const todayStat = (data || []).find((s) => s.date === today);
      setTodayMinutes(todayStat?.minutes_listened ?? 0);
    }
    setLoading(false);
  }, [profile, today, isGuest]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Build last 7 days data
  const last7Days: { date: string; label: string; minutes: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const stat = stats.find((s) => s.date === dateStr);
    last7Days.push({
      date: dateStr,
      label: dayLabel(d),
      minutes: stat?.minutes_listened ?? 0,
    });
  }

  const totalMinutes = last7Days.reduce((sum, d) => sum + d.minutes, 0);
  const maxMinutes = Math.max(...last7Days.map((d) => d.minutes), 1);

  // Streak calculation
  const streak = (() => {
    let count = 0;
    for (let i = last7Days.length - 1; i >= 0; i--) {
      if (last7Days[i].minutes > 0) {
        count++;
      } else {
        break;
      }
    }
    return count;
  })();

  // Genre breakdown (simulated from stats - derive from total listening)
  const genreBreakdown = [
    { genre: 'Хип-Хоп', percent: 35, minutes: Math.round(totalMinutes * 0.35) },
    { genre: 'Lo-Fi', percent: 25, minutes: Math.round(totalMinutes * 0.25) },
    { genre: 'House', percent: 20, minutes: Math.round(totalMinutes * 0.2) },
    { genre: 'Трэп', percent: 12, minutes: Math.round(totalMinutes * 0.12) },
    { genre: 'Other', percent: 8, minutes: Math.round(totalMinutes * 0.08) },
  ].filter((g) => g.minutes > 0);

  // Build conic-gradient for pie chart
  const pieGradient = (() => {
    let cumulative = 0;
    const stops: string[] = [];
    genreBreakdown.forEach((g) => {
      const color = GENRE_COLORS[g.genre] || GENRE_COLORS.Other;
      stops.push(`${color} ${cumulative}% ${cumulative + g.percent}%`);
      cumulative += g.percent;
    });
    if (stops.length === 0) {
      stops.push(`${GENRE_COLORS.Other} 0% 100%`);
    }
    return `conic-gradient(${stops.join(', ')})`;
  })();

  const formatTime = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h > 0) return `${h}${t('ч')} ${m}${t('м')}`;
    return `${m}${t('м')}`;
  };

  const addListeningTime = async (minutes: number) => {
    if (isGuest || !profile) return;
    setAddingTime(true);
    const existing = stats.find((s) => s.date === today);
    if (existing) {
      const { error } = await supabase
        .from('listening_stats')
        .update({ minutes_listened: existing.minutes_listened + minutes })
        .eq('id', existing.id);
      if (error) {
        console.error('Error updating stats:', error);
      }
    } else {
      const { error } = await supabase
        .from('listening_stats')
        .insert({
          user_id: profile.id,
          date: today,
          minutes_listened: minutes,
        });
      if (error) {
        console.error('Error inserting stats:', error);
      }
    }
    setTodayMinutes((prev) => prev + minutes);
    setStats((prev) => {
      const idx = prev.findIndex((s) => s.date === today);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], minutes_listened: updated[idx].minutes_listened + minutes };
        return updated;
      }
      return [...prev, { id: crypto.randomUUID(), user_id: profile.id, date: today, minutes_listened: minutes, created_at: new Date().toISOString() }];
    });
    setAddingTime(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-theme-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-theme-primary" />
          {t('Статистика прослушиваний')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          {t('Аналитика вашей музыкальной активности за 7 дней')}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total listening time */}
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <TrendingUp className="w-4 h-4 text-theme-success" />
          </div>
          <p className="text-theme-muted text-xs uppercase tracking-wider">{t('Всего за 7 дней')}</p>
          <p className="text-2xl font-bold text-theme-text mt-1">{formatTime(totalMinutes)}</p>
          <p className="text-theme-muted text-xs mt-1">{totalMinutes} {t('минут')}</p>
        </div>

        {/* Streak counter */}
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-theme-warning to-theme-danger flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            {streak >= 3 && (
              <span className="text-xs text-theme-warning font-medium animate-pulse">🔥 {t('На огне!')}</span>
            )}
          </div>
          <p className="text-theme-muted text-xs uppercase tracking-wider">{t('Серия дней')}</p>
          <p className="text-2xl font-bold text-theme-text mt-1">{streak} {streak === 1 ? t('день') : t('дней')}</p>
          <p className="text-theme-muted text-xs mt-1">{t('Подряд с прослушиванием')}</p>
        </div>

        {/* Today's listening */}
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-theme-accent to-theme-primary flex items-center justify-center">
              <Headphones className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-theme-muted text-xs uppercase tracking-wider">{t('Сегодня прослушано')}</p>
          <p className="text-2xl font-bold text-theme-text mt-1">{formatTime(todayMinutes)}</p>
          <p className="text-theme-muted text-xs mt-1">{t('из')} {formatTime(totalMinutes)} {t('за неделю')}</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface">
        <h3 className="text-sm font-medium text-theme-text mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-theme-primary" />
          {t('Минут прослушивания по дням')}
        </h3>
        <div className="flex items-end justify-between gap-3 h-48">
          {last7Days.map((day) => {
            const heightPercent = (day.minutes / maxMinutes) * 100;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-theme-muted font-mono">
                  {day.minutes > 0 ? day.minutes : ''}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-theme-primary via-theme-accent to-theme-accent hover:opacity-80 transition-all relative group"
                    style={{ height: `${Math.max(heightPercent, day.minutes > 0 ? 8 : 2)}%` }}
                  >
                    <div className="absolute inset-0 rounded-t-lg bg-gradient-to-t from-theme-primary to-theme-accent opacity-60 blur-sm" />
                  </div>
                </div>
                <span className="text-xs text-theme-muted">{day.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Genre breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface">
          <h3 className="text-sm font-medium text-theme-text mb-4 flex items-center gap-2">
            <Music className="w-4 h-4 text-theme-accent" />
            {t('Жанры прослушивания')}
          </h3>
          {genreBreakdown.length > 0 ? (
            <div className="flex items-center gap-6">
              <div
                className="w-32 h-32 rounded-full shrink-0"
                style={{ background: pieGradient }}
              />
              <div className="space-y-2 flex-1">
                {genreBreakdown.map((g) => (
                  <div key={g.genre} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: GENRE_COLORS[g.genre] || GENRE_COLORS.Other }}
                    />
                    <span className="text-sm text-theme-text flex-1">{t(g.genre)}</span>
                    <span className="text-xs text-theme-muted">{g.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-theme-muted text-sm">{t('Нет данных. Добавьте время прослушивания.')}</p>
          )}
        </div>

        {/* Add listening time */}
        {!isGuest && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface">
          <h3 className="text-sm font-medium text-theme-text mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-theme-success" />
            {t('Добавить время')} ({t('демо')})
          </h3>
          <p className="text-theme-muted text-sm mb-4">
            {t('Вручную добавьте минуты прослушивания для тестирования статистики')}
          </p>
          <div className="flex flex-wrap gap-2">
            {[10, 30, 60, 120].map((mins) => (
              <button
                key={mins}
                onClick={() => addListeningTime(mins)}
                disabled={addingTime}
                className="px-4 py-2 bg-gradient-to-r from-theme-primary to-theme-accent text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                {mins} {t('мин')}
              </button>
            ))}
          </div>
          {addingTime && (
            <p className="text-xs text-theme-muted mt-3">{t('Добавляем...')}</p>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
