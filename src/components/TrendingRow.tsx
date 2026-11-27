import { Clock, Flame, Heart, Music, Pause, Play, Zap, Megaphone } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import type { TrendingBeat } from '@/lib/trending';

type Props = {
  beat: TrendingBeat;
  index: number;
  now: number;
  playing: boolean;
  isOwn: boolean;
  onTogglePlay: (beat: TrendingBeat) => void;
  onBoost: (beatId: string) => void;
};

function formatRemaining(until: string | null, now: number, t: (key: string) => string): string | null {
  if (!until) return null;
  const diff = Date.parse(until) - now;
  if (!(diff > 0)) return null;
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return hours > 0 ? `${hours} ${t('ч')} ${minutes} ${t('мин')}` : `${minutes} ${t('мин')}`;
}

export default function TrendingRow({ beat, index, now, playing, isOwn, onTogglePlay, onBoost }: Props) {
  const { t } = useLocale();
  const top3Left = formatRemaining(beat.top3_until, now, t);
  const boostLeft = formatRemaining(beat.boost_until, now, t);
  const hot = Boolean(top3Left || boostLeft || beat.rank_position <= 3);
  const isTopRank = beat.rank_position === 1;
  const creatorName = beat.creator?.username ?? t('Автор неизвестен');

  return (
    <li
      className={`group flex items-center gap-3 sm:gap-4 rounded-2xl border p-3 sm:p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg animate-[fadeIn_0.4s_ease-out_both] ${
        hot ? 'trending-row-hot border-theme-border' : 'border-theme-border bg-theme-surface'
      } ${playing ? 'ring-2 ring-theme-primary' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="w-9 sm:w-10 flex flex-col items-center gap-1 flex-shrink-0">
        <span
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-sm font-semibold ${
            isTopRank ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-text'
          }`}
        >
          {beat.rank_position}
        </span>
        {hot && <Flame className="trending-flame w-4 h-4" aria-hidden="true" />}
      </div>

      <button
        type="button"
        onClick={() => onTogglePlay(beat)}
        aria-label={playing ? t('Пауза') : t('Слушать')}
        className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-theme-surface2 overflow-hidden flex-shrink-0 flex items-center justify-center"
      >
        {beat.cover_url ? (
          <img src={beat.cover_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Music className="w-5 h-5 text-theme-muted" />
        )}
        <span
          className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity ${
            playing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 translate-x-px" />}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm sm:text-base font-semibold text-theme-text">{beat.title}</p>
        <p className="truncate text-xs sm:text-sm text-theme-muted">
          {creatorName} · {beat.genre} · {beat.bpm} BPM
        </p>
        {(top3Left || boostLeft) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(top3Left || boostLeft) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-theme-warning/15 text-theme-warning px-2 py-0.5 text-xs font-semibold">
                <Megaphone className="w-3 h-3" /> {t('Спонсорское продвижение')}
              </span>
            )}
            {top3Left && (
              <span className="inline-flex items-center gap-1 rounded-full border border-theme-border bg-theme-surface2 px-2 py-0.5 text-xs text-theme-text">
                <Clock className="w-3 h-3 text-orange-500" /> {t('Топ-3')} · {top3Left}
              </span>
            )}
            {boostLeft && (
              <span className="inline-flex items-center gap-1 rounded-full border border-theme-border bg-theme-surface2 px-2 py-0.5 text-xs text-theme-text">
                <Zap className="w-3 h-3 text-orange-500" /> {t('Буст')} · {boostLeft}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 text-xs text-theme-muted flex-shrink-0">
        <span className="text-base font-semibold text-theme-text">{beat.score}</span>
        <span className="hidden sm:inline">{t('рейтинг')}</span>
        <span className="flex items-center gap-2">
          <span>{beat.play_count} {t('прослуш.')}</span>
          <span className="flex items-center gap-0.5">
            <Heart className="w-3 h-3" /> {beat.likes_count}
          </span>
        </span>
      </div>

      {isOwn && (
        <button
          type="button"
          onClick={() => onBoost(beat.beat_id)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-theme-primary px-2.5 py-2 text-xs sm:text-sm font-medium text-theme-primary transition-colors hover:bg-theme-primary hover:text-white"
        >
          <Zap className="w-4 h-4" />
          <span className="hidden md:inline">{t('Продвинуть')}</span>
        </button>
      )}
    </li>
  );
}
