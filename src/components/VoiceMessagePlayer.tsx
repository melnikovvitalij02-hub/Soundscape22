import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatClock } from '@/lib/formatClock';
import { useLocale } from '@/context/LocaleContext';

const BAR_COUNT = 28;
const SIGNED_URL_TTL_SECONDS = 3600;

function buildWaveform(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return Array.from({ length: BAR_COUNT }, () => {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    return 0.25 + ((h >>> 8) % 75) / 100;
  });
}

type Props = {
  path: string;
  duration: number | null;
  isMine: boolean;
};

export default function VoiceMessagePlayer({ path, duration, isMine }: Props) {
  const { t } = useLocale();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const waveform = useMemo(() => buildWaveform(path), [path]);
  const total = duration ?? 0;
  const progress = total > 0 ? Math.min(1, current / total) : 0;

  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from('voice-messages')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) setFailed(true);
        else setSrc(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || total <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * total;
    setCurrent(audio.currentTime);
  };

  if (failed) {
    return (
      <div className={`flex items-center gap-2 text-xs ${isMine ? 'text-white/80' : 'text-theme-muted'}`}>
        <AlertCircle className="w-4 h-4 shrink-0" />
        {t('Не удалось загрузить голосовое сообщение')}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? t('Пауза') : t('Воспроизвести')}
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50 ${
          isMine ? 'bg-white text-theme-primary' : 'bg-theme-primary text-white'
        }`}
      >
        {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div onClick={seek} className="flex items-center gap-[2px] h-8 cursor-pointer">
          {waveform.map((height, i) => {
            const filled = (i + 1) / BAR_COUNT <= progress;
            const color = filled
              ? isMine ? 'bg-white' : 'bg-theme-primary'
              : isMine ? 'bg-white/40' : 'bg-theme-muted/50';
            return (
              <span
                key={i}
                className={`w-[3px] rounded-full transition-colors duration-200 ${color}`}
                style={{ height: `${height * 100}%` }}
              />
            );
          })}
        </div>
        <span className={`text-[11px] tabular-nums ${isMine ? 'text-white/70' : 'text-theme-muted'}`}>
          {formatClock(current > 0 ? current : total)}
        </span>
      </div>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
          }}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
