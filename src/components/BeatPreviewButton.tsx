import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { makeSound, type ExtendedEffects, type TrackType } from '@/pages/BeatComposerPage';
import { useLocale } from '@/context/LocaleContext';

const STEPS_PER_BAR = 16;
const MAX_BARS = 8;

type PreviewTrack = Partial<ExtendedEffects> & {
  type: TrackType;
  steps: boolean[];
  volume?: number;
  muted?: boolean;
};

type BeatPreview = { tracks: PreviewTrack[]; bpm: number; bars: number };

function parseBeatPreview(raw: unknown): BeatPreview | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { tracks?: unknown; bpm?: unknown; bars?: unknown };
  if (!Array.isArray(r.tracks)) return null;
  const tracks = r.tracks.filter(
    (t): t is PreviewTrack => !!t && typeof t === 'object' && typeof (t as PreviewTrack).type === 'string' && Array.isArray((t as PreviewTrack).steps),
  );
  if (tracks.length === 0) return null;
  const bpm = typeof r.bpm === 'number' && r.bpm > 0 ? r.bpm : 120;
  const bars = typeof r.bars === 'number' && r.bars >= 1 ? Math.min(Math.floor(r.bars), MAX_BARS) : 1;
  return { tracks, bpm, bars };
}

function effectsOf(t: PreviewTrack): ExtendedEffects {
  return {
    reverb: t.reverb ?? 0, delay: t.delay ?? 0, filter: t.filter ?? 0, pitch: t.pitch ?? 0,
    distortion: t.distortion ?? 0, bitcrush: t.bitcrush ?? 0, compressor: t.compressor ?? 0,
    eqLow: t.eqLow ?? 0, eqMid: t.eqMid ?? 0, eqHigh: t.eqHigh ?? 0, pan: t.pan ?? 0,
  };
}

type Props = {
  id: string;
  data: unknown;
  activeId: string | null;
  onActivate: (id: string | null) => void;
};

export default function BeatPreviewButton({ id, data, activeId, onActivate }: Props) {
  const { t } = useLocale();
  const engineRef = useRef<{ ctx: AudioContext; timer: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const beat = useMemo(() => parseBeatPreview(data), [data]);
  const playing = activeId === id;

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    window.clearInterval(engine.timer);
    void engine.ctx.close();
    engineRef.current = null;
  }, []);

  useEffect(() => {
    if (!playing) stop();
  }, [playing, stop]);

  useEffect(() => stop, [stop]);

  const toggle = async () => {
    if (playing) {
      onActivate(null);
      return;
    }
    if (!beat) return;
    setStarting(true);
    const ctx = new AudioContext();
    await ctx.resume();
    setStarting(false);
    const total = STEPS_PER_BAR * beat.bars;
    const stepMs = 60000 / beat.bpm / 4;
    let step = 0;
    const tick = () => {
      const time = ctx.currentTime;
      for (const track of beat.tracks) {
        if (!track.muted && track.steps[step]) {
          makeSound(ctx, null, track.type, time, track.volume ?? 0.8, effectsOf(track), step);
        }
      }
      step = (step + 1) % total;
    };
    tick();
    engineRef.current = { ctx, timer: window.setInterval(tick, stepMs) };
    onActivate(id);
  };

  if (!beat) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={starting}
      aria-label={playing ? t('Остановить бит') : t('Прослушать бит')}
      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-60 ${
        playing ? 'bg-theme-primary text-white border-theme-primary' : 'bg-theme-surface2 text-theme-text border-theme-border hover:border-theme-primary'
      }`}
    >
      {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
    </button>
  );
}
