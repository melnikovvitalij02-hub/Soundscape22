import { BarChart3, BadgeCheck, Pause, Play, Music, Megaphone } from 'lucide-react';
import { usePlayer } from '@/context/PlayerContext';
import { CHART_TRACKS } from '@/lib/charts';

// «Авторские» — треки разработчиков Soundscape, «Спонсорский» — размещение по договорённости.
const SPONSORED_IDS = new Set(['chart-track-5']);

export default function ChartsPage() {
  const { currentTrack, isPlaying, playQueue, toggle } = usePlayer();

  const handleRowClick = (index: number) => {
    const track = CHART_TRACKS[index];
    if (currentTrack?.id === track.id) {
      toggle();
      return;
    }
    playQueue(CHART_TRACKS, index);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-theme-primary" />
          Чарты
        </h1>
        <p className="text-theme-muted text-sm mt-1">Треки разработчиков Soundscape — не только одного автора. Слушайте целиком прямо в Soundscape.</p>
      </div>

      <ol className="space-y-3">
        {CHART_TRACKS.map((track, index) => {
          const isCurrent = currentTrack?.id === track.id;
          const isActivelyPlaying = isCurrent && isPlaying;
          return (
            <li key={track.id}>
              <button
                onClick={() => handleRowClick(index)}
                className={`group w-full flex items-center gap-4 p-3 md:p-4 rounded-2xl border text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
                  isCurrent
                    ? 'bg-theme-primary/10 border-theme-primary'
                    : 'bg-theme-surface/50 border-theme-border hover:border-theme-primary-border'
                } glass-surface`}
              >
                <span className="w-8 text-center text-lg font-bold text-theme-muted tabular-nums">{index + 1}</span>
                <div className="relative w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-xl overflow-hidden bg-theme-surface2">
                  {track.cover ? (
                    <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-6 h-6 text-theme-muted" />
                    </div>
                  )}
                  <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {isActivelyPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white" />}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className={`font-semibold truncate ${isCurrent ? 'text-theme-primary' : 'text-theme-text'}`}>{track.title}</p>
                    {SPONSORED_IDS.has(track.id) ? (
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-theme-warning/15 text-theme-warning px-1.5 py-0.5 text-[10px] font-semibold">
                        <Megaphone className="w-3 h-3" /> Спонсорский
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-theme-primary/15 text-theme-primary px-1.5 py-0.5 text-[10px] font-semibold">
                        <BadgeCheck className="w-3 h-3" /> Авторский
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-theme-muted truncate">{track.artist}</p>
                </div>
                {isActivelyPlaying && (
                  <span className="hidden sm:flex items-end gap-0.5 h-4" aria-label="Playing">
                    <span className="w-1 bg-theme-primary rounded-full animate-pulse h-2" />
                    <span className="w-1 bg-theme-primary rounded-full animate-pulse h-4" />
                    <span className="w-1 bg-theme-primary rounded-full animate-pulse h-3" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
