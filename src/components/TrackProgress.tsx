import { useRef } from 'react';
import { Repeat } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

type Props = {
  progress: number; // 0..1
  onSeek: (ratio: number) => void;
  loop: boolean;
  onToggleLoop: () => void;
  timeLabel?: string;
};

export default function TrackProgress({ progress, onSeek, loop, onToggleLoop, timeLabel }: Props) {
  const { t } = useLocale();
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const seekTo = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio);
  };

  const pct = Math.min(100, Math.max(0, progress * 100));

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div
        ref={barRef}
        className="relative flex-1 h-2 bg-theme-surface2 rounded-full cursor-pointer touch-none group"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) seekTo(e.clientX);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        <div
          className="h-full bg-gradient-to-r from-theme-warning to-theme-primary rounded-full pointer-events-none"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow ring-2 ring-theme-primary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `${pct}%` }}
        />
      </div>
      {timeLabel && (
        <span className="text-[11px] font-mono text-theme-muted tabular-nums shrink-0">{timeLabel}</span>
      )}
      <button
        onClick={onToggleLoop}
        title={t('Циклическое воспроизведение')}
        className={`p-1 rounded-lg transition-colors shrink-0 ${
          loop ? 'text-theme-warning bg-theme-warning/10' : 'text-theme-muted hover:text-theme-text'
        }`}
      >
        <Repeat className="w-4 h-4" />
      </button>
    </div>
  );
}
