import { usePlayer } from '@/context/PlayerContext';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useState } from 'react';

function formatTime(s: number): string {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function MiniPlayer() {
  const { currentTrack, isPlaying, progress, duration, volume, toggle, seek, setVolume, next, prev, stop } = usePlayer();
  const [muted, setMuted] = useState(false);
  const [showVol, setShowVol] = useState(false);

  if (!currentTrack) return null;

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:left-64">
      <div className="glass-surface bg-theme-surface/95 backdrop-blur-xl border-t border-theme-border">
        {/* Progress bar */}
        <div className="h-1 w-full bg-theme-surface2 cursor-pointer group" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seek(ratio * duration);
        }}>
          <div className="h-full bg-gradient-to-r from-theme-warning to-theme-primary transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          {/* Track info */}
          <div className="flex items-center gap-3 min-w-0 flex-1 max-w-[280px]">
            {currentTrack.cover ? (
              <img src={currentTrack.cover} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-theme-warning to-theme-primary flex items-center justify-center shrink-0">
                <Play className="w-5 h-5 text-white" fill="white" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-theme-text text-sm font-medium truncate">{currentTrack.title}</p>
              <p className="text-theme-muted text-xs truncate">{currentTrack.artist}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={prev} className="p-2 text-theme-muted hover:text-theme-text transition-colors">
              <SkipBack className="w-4 h-4" fill="currentColor" />
            </button>
            <button
              onClick={toggle}
              className="w-10 h-10 rounded-full bg-theme-warning text-white flex items-center justify-center hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause className="w-5 h-5" fill="white" /> : <Play className="w-5 h-5 ml-0.5" fill="white" />}
            </button>
            <button onClick={next} className="p-2 text-theme-muted hover:text-theme-text transition-colors">
              <SkipForward className="w-4 h-4" fill="currentColor" />
            </button>
            <button
              onClick={stop}
              className="p-2 text-theme-muted hover:text-theme-danger transition-colors"
              aria-label="Close player"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Time + volume */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <span className="text-xs text-theme-muted tabular-nums">{formatTime(progress)}</span>
            <span className="text-xs text-theme-muted">/</span>
            <span className="text-xs text-theme-muted tabular-nums">{formatTime(duration)}</span>

            <div className="relative flex items-center" onMouseEnter={() => setShowVol(true)} onMouseLeave={() => setShowVol(false)}>
              <button
                onClick={() => {
                  setMuted(!muted);
                  setVolume(muted ? 0.8 : 0);
                }}
                className="p-2 text-theme-muted hover:text-theme-text transition-colors"
              >
                {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              {showVol && (
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 w-24 accent-theme-warning"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
