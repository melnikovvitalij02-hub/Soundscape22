import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, type SeasonalEvent } from '@/lib/supabase';
import { Calendar, Gift, Sparkles, Clock, PartyPopper, Star } from 'lucide-react';

const THEME_GRADIENTS: Record<string, string> = {
  newyear: 'from-blue-400 via-white to-blue-300',
  halloween: 'from-orange-500 via-purple-500 to-orange-600',
  birthday: 'from-pink-400 via-yellow-300 to-pink-500',
  maslenitsa: 'from-yellow-400 via-amber-400 to-orange-400',
  spring: 'from-emerald-300 via-green-300 to-teal-300',
  victory: 'from-red-500 via-orange-400 to-red-600',
  default: 'from-theme-primary via-theme-accent to-theme-primary',
};

const THEME_ICONS: Record<string, string> = {
  newyear: '🎄',
  halloween: '🎃',
  birthday: '🎂',
  maslenitsa: '🥞',
  spring: '🌸',
  victory: '🎖️',
};

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isEventActive(event: SeasonalEvent): boolean {
  const now = new Date();
  const start = new Date(event.start_date);
  const end = new Date(event.end_date);
  return now >= start && now <= end;
}

export default function SeasonalEventsPage() {
  const { addXp } = useAuth();
  const { t } = useLocale();
  const [events, setEvents] = useState<SeasonalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const [celebrateMessage, setCelebrateMessage] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('seasonal_events')
      .select('*')
      .order('start_date', { ascending: true });
    if (error) {
      console.error('Error fetching events:', error);
      setEvents([]);
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Find next upcoming event
  const nextEvent = events
    .filter((e) => getDaysUntil(e.start_date) > 0)
    .sort((a, b) => getDaysUntil(a.start_date) - getDaysUntil(b.start_date))[0];

  const daysUntilNext = nextEvent ? getDaysUntil(nextEvent.start_date) : null;

  const handleCelebrate = async (event: SeasonalEvent) => {
    setCelebrating(event.id);
    setCelebrateMessage(null);
    // Simulate celebration
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const bonusXp = Math.round(50 * (event.bonus_xp_multiplier || 1));
    await addXp(bonusXp);
    setCelebrating(null);
    setCelebrateMessage(t('Получено') + ' ' + bonusXp + ' XP ' + t('за участие в «') + event.name + t('»!'));
    setTimeout(() => setCelebrateMessage(null), 3000);
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
          <PartyPopper className="w-6 h-6 text-theme-accent" />
          {t('Сезонные события')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          {t('Праздники, события и бонусы в течение года')}
        </p>
      </div>

      {/* Countdown to next event */}
      {nextEvent && daysUntilNext !== null && (
        <div className="bg-gradient-to-r from-theme-primary/20 via-theme-accent/20 to-theme-warning/20 border border-theme-primary-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center shrink-0">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-theme-muted text-xs uppercase tracking-wider">{t('Следующее событие')}</p>
            <p className="text-theme-text font-medium text-lg">{nextEvent.name}</p>
            <p className="text-theme-muted text-sm">
              {daysUntilNext === 0 ? t('Сегодня!') : daysUntilNext === 1 ? t('Завтра!') : `${t('Через')} ${daysUntilNext} ${t('дней')}`}
            </p>
          </div>
          <div className="text-3xl">
            {THEME_ICONS[nextEvent.theme] || '🎉'}
          </div>
        </div>
      )}

      {/* Celebrate message */}
      {celebrateMessage && (
        <div className="bg-theme-success/20 border border-theme-success/30 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <Gift className="w-5 h-5 text-theme-success" />
          <p className="text-theme-success text-sm font-medium">{celebrateMessage}</p>
        </div>
      )}

      {/* Events grid */}
      {events.length === 0 ? (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center glass-surface">
          <Calendar className="w-12 h-12 text-theme-muted mx-auto mb-3" />
          <p className="text-theme-muted">{t('Сезонные события скоро появятся')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => {
            const active = isEventActive(event);
            const daysUntil = getDaysUntil(event.start_date);
            const gradient = THEME_GRADIENTS[event.theme] || THEME_GRADIENTS.default;
            const icon = THEME_ICONS[event.theme] || '🎉';

            return (
              <div
                key={event.id}
                className={`relative bg-theme-surface/50 border rounded-2xl overflow-hidden glass-surface transition-all ${
                  active
                    ? 'border-theme-primary border-2 shadow-lg'
                    : 'border-theme-border hover:border-theme-primary/50'
                }`}
              >
                {/* Animated glow for active events */}
                {active && (
                  <div className={`absolute -inset-0.5 bg-gradient-to-r ${gradient} rounded-2xl blur-sm opacity-30 animate-pulse -z-10`} />
                )}

                {/* Theme gradient header */}
                <div className={`h-24 bg-gradient-to-r ${gradient} relative overflow-hidden`}>
                  <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-90">
                    {icon}
                  </div>
                  {active && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-theme-success text-white text-xs font-medium rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      {t('Активно')}
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-theme-text font-bold text-lg">{event.name}</h3>
                    {event.bonus_xp_multiplier > 1 && (
                      <span className="px-2 py-0.5 bg-theme-warning/20 text-theme-warning text-xs font-bold rounded-full flex items-center gap-1 shrink-0">
                        <Star className="w-3 h-3" />
                        x{event.bonus_xp_multiplier}
                      </span>
                    )}
                  </div>

                  <p className="text-theme-muted text-sm mb-3">{event.description}</p>

                  <div className="flex items-center gap-2 text-xs text-theme-muted mb-4">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {new Date(event.start_date).toLocaleDateString('ru-RU')} — {new Date(event.end_date).toLocaleDateString('ru-RU')}
                    </span>
                  </div>

                  {active ? (
                    <button
                      onClick={() => handleCelebrate(event)}
                      disabled={celebrating === event.id}
                      className="w-full py-2.5 bg-gradient-to-r from-theme-primary to-theme-accent text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {celebrating === event.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {t('Празднуем...')}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          {t('Праздновать')} (+{Math.round(50 * (event.bonus_xp_multiplier || 1))} XP)
                        </>
                      )}
                    </button>
                  ) : daysUntil > 0 ? (
                    <div className="w-full py-2.5 bg-theme-surface2 text-theme-muted rounded-xl text-sm font-medium text-center flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4" />
                      {t('Через')} {daysUntil} {daysUntil === 1 ? t('день') : t('дней')}
                    </div>
                  ) : (
                    <div className="w-full py-2.5 bg-theme-surface2 text-theme-muted rounded-xl text-sm font-medium text-center">
                      {t('Завершено')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
