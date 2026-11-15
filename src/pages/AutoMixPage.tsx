import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Wand2,
  Play,
  Pause,
  Loader2,
  Volume2,
  Music,
} from 'lucide-react';

type ChartTrack = {
  id: number;
  title: string;
  artist: string;
  url: string;
  cover: string;
  duration?: string;
};

const CHART_TRACKS: ChartTrack[] = [
  {
    id: 1,
    title: 'I GOT U',
    artist: 'Toxi$',
    url: '/audio/igotu.wav',
    cover: '/cover-igotu.webp',
    duration: '2:48',
  },
  {
    id: 2,
    title: 'Мало',
    artist: 'EGOR KRID',
    url: '/audio/malo.wav',
    cover: '/cover-malo.webp',
    duration: '2:35',
  },
  {
    id: 3,
    title: 'Тону',
    artist: 'HOLLYFLAME',
    url: '/audio/tonu.wav',
    cover: '/cover-tonu.webp',
    duration: '3:12',
  },
  {
    id: 4,
    title: 'Малиновая Лада',
    artist: 'GAYAZOV BROTHER',
    url: '/audio/lada.wav',
    cover: '/cover-lada.webp',
    duration: '2:22',
  },
  {
    id: 5,
    title: 'По барам',
    artist: 'ANNA ASTI',
    url: '/audio/baram.wav',
    cover: '/cover-baram.webp',
    duration: '2:58',
  },
];

type CurveType = 'linear' | 'equal-power' | 's-curve';

const CURVES: { id: CurveType; label: string; desc: string }[] = [
  { id: 'linear', label: 'Линейная', desc: 'Равномерный переход' },
  { id: 'equal-power', label: 'Equal Power', desc: 'Постоянная громкость' },
  { id: 's-curve', label: 'S-кривая', desc: 'Плавный вход/выход' },
];

export default function AutoMixPage() {
  const [trackA, setTrackA] = useState<ChartTrack | null>(null);
  const [trackB, setTrackB] = useState<ChartTrack | null>(null);
  const [crossfadeDuration, setCrossfadeDuration] = useState(15);
  const [curve, setCurve] = useState<CurveType>('equal-power');
  const [isPlaying, setIsPlaying] = useState(false);
  const [mixing, setMixing] = useState(false);
  const [mixProgress, setMixProgress] = useState(0);
  const [volA, setVolA] = useState(1);
  const [volB, setVolB] = useState(0);
  const [status, setStatus] = useState<string>('Готов к миксу');
  const [loadingTrack, setLoadingTrack] = useState<'A' | 'B' | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferARef = useRef<AudioBuffer | null>(null);
  const bufferBRef = useRef<AudioBuffer | null>(null);
  const sourceARef = useRef<AudioBufferSourceNode | null>(null);
  const sourceBRef = useRef<AudioBufferSourceNode | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const mixStartRef = useRef<number>(0);
  const crossfadeStartRef = useRef<number>(0);
  const trackADurationRef = useRef<number>(0);

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  }, []);

  const fetchBuffer = useCallback(async (track: ChartTrack, slot: 'A' | 'B') => {
    setLoadingTrack(slot);
    try {
      const res = await fetch(track.url);
      const arr = await res.arrayBuffer();
      const ctx = getCtx();
      const buffer = await ctx.decodeAudioData(arr);
      if (slot === 'A') bufferARef.current = buffer;
      else bufferBRef.current = buffer;
    } catch (e) {
      console.error('decode error', e);
      setStatus(`Не удалось загрузить трек ${slot}`);
    } finally {
      setLoadingTrack(null);
    }
  }, [getCtx]);

  useEffect(() => {
    if (trackA) fetchBuffer(trackA, 'A');
  }, [trackA, fetchBuffer]);

  useEffect(() => {
    if (trackB) fetchBuffer(trackB, 'B');
  }, [trackB, fetchBuffer]);

  const stopMix = useCallback(() => {
    if (sourceARef.current) {
      try { sourceARef.current.stop(); } catch { /* already stopped */ }
      sourceARef.current = null;
    }
    if (sourceBRef.current) {
      try { sourceBRef.current.stop(); } catch { /* already stopped */ }
      sourceBRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
    setMixing(false);
    setMixProgress(0);
    setVolA(1);
    setVolB(0);
  }, []);

  useEffect(() => () => stopMix(), [stopMix]);

  // crossfade curve functions: given t in [0,1] return (gainA, gainB)
  const curveGains = (t: number, type: CurveType): [number, number] => {
    const clamped = Math.max(0, Math.min(1, t));
    switch (type) {
      case 'linear':
        return [1 - clamped, clamped];
      case 'equal-power': {
        const a = Math.cos(clamped * Math.PI * 0.5);
        const b = Math.sin(clamped * Math.PI * 0.5);
        return [a, b];
      }
      case 's-curve': {
        const s = clamped * clamped * (3 - 2 * clamped); // smoothstep
        return [1 - s, s];
      }
      default:
        return [1 - clamped, clamped];
    }
  };

  const startMix = () => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (!bufferARef.current || !bufferBRef.current) {
      setStatus('Дождитесь загрузки обоих треков');
      return;
    }

    // stop any existing
    if (sourceARef.current) { try { sourceARef.current.stop(); } catch { /* noop */ } }
    if (sourceBRef.current) { try { sourceBRef.current.stop(); } catch { /* noop */ } }

    const gainA = ctx.createGain();
    const gainB = ctx.createGain();
    gainA.connect(ctx.destination);
    gainB.connect(ctx.destination);
    gainA.gain.value = 1;
    gainB.gain.value = 0;
    gainARef.current = gainA;
    gainBRef.current = gainB;

    const srcA = ctx.createBufferSource();
    srcA.buffer = bufferARef.current;
    srcA.connect(gainA);
    sourceARef.current = srcA;

    const now = ctx.currentTime;
    srcA.start(now);
    setIsPlaying(true);
    setMixing(false);
    setMixProgress(0);
    setStatus('Играет трек A');

    const trackADur = bufferARef.current.duration;
    trackADurationRef.current = trackADur;
    const crossfadeStart = Math.max(0, trackADur - crossfadeDuration);
    crossfadeStartRef.current = crossfadeStart;
    mixStartRef.current = now;

    // animation loop
    const tick = () => {
      const elapsed = ctx.currentTime - now;
      setMixProgress(elapsed);

      if (elapsed >= crossfadeStart && !sourceBRef.current && bufferBRef.current) {
        // start track B
        setMixing(true);
        setStatus('Mixing...');
        const srcB = ctx.createBufferSource();
        srcB.buffer = bufferBRef.current;
        srcB.connect(gainB);
        sourceBRef.current = srcB;
        srcB.start(ctx.currentTime);
      }

      if (elapsed >= crossfadeStart) {
        const fadeT = (elapsed - crossfadeStart) / crossfadeDuration;
        const [gA, gB] = curveGains(fadeT, curve);
        gainA.gain.value = gA;
        gainB.gain.value = gB;
        setVolA(gA);
        setVolB(gB);
        if (fadeT >= 1) {
          setStatus('Микс завершён — играет трек B');
          setMixing(false);
        }
      }

      // stop when track B would end (approx: crossfadeStart + crossfadeDuration + bufferB duration)
      const totalDur = crossfadeStart + crossfadeDuration + (bufferBRef.current?.duration || 0);
      if (elapsed >= totalDur) {
        stopMix();
        setStatus('Микс завершён');
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Wand2 className="w-6 h-6 text-theme-primary" />
          AI Авто-Микс
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          Кроссфейд двух треков в одно плавное переключение
        </p>
      </div>

      {/* Track selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Track A */}
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded-md bg-theme-primary text-white text-xs font-bold">A</span>
            <h3 className="text-sm font-medium text-theme-text">Трек A</h3>
            {loadingTrack === 'A' && <Loader2 className="w-4 h-4 text-theme-muted animate-spin" />}
          </div>
          {trackA ? (
            <div className="flex items-center gap-3">
              <img src={trackA.cover} alt={trackA.title} className="w-12 h-12 rounded-lg object-cover" />
              <div className="min-w-0">
                <p className="text-sm text-theme-text truncate">{trackA.title}</p>
                <p className="text-xs text-theme-muted truncate">{trackA.artist}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-theme-muted">Выберите трек ниже</p>
          )}
          <div className="mt-3 space-y-1">
            {CHART_TRACKS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTrackA(t)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  trackA?.id === t.id ? 'bg-theme-primary-bg' : 'hover:bg-theme-surface2'
                }`}
              >
                <img src={t.cover} alt="" className="w-6 h-6 rounded object-cover" />
                <span className="text-xs text-theme-text truncate flex-1">{t.title}</span>
                <span className="text-[10px] text-theme-muted">{t.duration}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Track B */}
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded-md bg-theme-accent text-white text-xs font-bold">B</span>
            <h3 className="text-sm font-medium text-theme-text">Трек B</h3>
            {loadingTrack === 'B' && <Loader2 className="w-4 h-4 text-theme-muted animate-spin" />}
          </div>
          {trackB ? (
            <div className="flex items-center gap-3">
              <img src={trackB.cover} alt={trackB.title} className="w-12 h-12 rounded-lg object-cover" />
              <div className="min-w-0">
                <p className="text-sm text-theme-text truncate">{trackB.title}</p>
                <p className="text-xs text-theme-muted truncate">{trackB.artist}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-theme-muted">Выберите трек ниже</p>
          )}
          <div className="mt-3 space-y-1">
            {CHART_TRACKS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTrackB(t)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  trackB?.id === t.id ? 'bg-theme-primary-bg' : 'hover:bg-theme-surface2'
                }`}
              >
                <img src={t.cover} alt="" className="w-6 h-6 rounded object-cover" />
                <span className="text-xs text-theme-text truncate flex-1">{t.title}</span>
                <span className="text-[10px] text-theme-muted">{t.duration}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4 space-y-4">
        <div>
          <label className="text-xs text-theme-muted uppercase tracking-wider flex items-center justify-between">
            <span>Длительность кроссфейда</span>
            <span className="text-theme-text font-mono">{crossfadeDuration} сек</span>
          </label>
          <input
            type="range"
            min={5}
            max={30}
            value={crossfadeDuration}
            onChange={(e) => setCrossfadeDuration(Number(e.target.value))}
            className="w-full accent-theme-primary mt-2"
          />
        </div>

        <div>
          <label className="text-xs text-theme-muted uppercase tracking-wider">Кривая кроссфейда</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {CURVES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCurve(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  curve === c.id
                    ? 'bg-theme-primary text-white'
                    : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
                }`}
                title={c.desc}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={isPlaying ? stopMix : startMix}
            disabled={!trackA || !trackB || loadingTrack !== null}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 ${
              isPlaying ? 'bg-theme-danger text-white' : 'bg-theme-success text-white hover:bg-theme-success/90'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Стоп' : 'Запустить микс'}
          </button>
          <span className={`text-sm font-medium ${mixing ? 'text-theme-warning animate-pulse' : 'text-theme-muted'}`}>
            {status}
          </span>
        </div>
      </div>

      {/* Visual crossfade */}
      <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between text-xs text-theme-muted">
          <span>Прогресс: {mixProgress.toFixed(1)} сек</span>
          <span>{mixing ? '🔀 Переход' : isPlaying ? '▶ Воспроизведение' : '⏸ Остановлено'}</span>
        </div>

        {/* Track A bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-theme-text flex items-center gap-1">
              <Music className="w-3 h-3" /> Трек A
            </span>
            <span className="text-theme-muted font-mono">{Math.round(volA * 100)}%</span>
          </div>
          <div className="h-8 bg-theme-surface2 rounded-lg overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-theme-primary to-theme-primary/60 rounded-lg transition-all duration-100"
              style={{ width: `${volA * 100}%` }}
            />
          </div>
        </div>

        {/* Track B bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-theme-text flex items-center gap-1">
              <Music className="w-3 h-3" /> Трек B
            </span>
            <span className="text-theme-muted font-mono">{Math.round(volB * 100)}%</span>
          </div>
          <div className="h-8 bg-theme-surface2 rounded-lg overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-theme-accent to-theme-accent/60 rounded-lg transition-all duration-100"
              style={{ width: `${volB * 100}%` }}
            />
          </div>
        </div>

        {/* Crossfade visualization */}
        <div className="pt-2">
          <div className="relative h-16 bg-theme-surface2 rounded-lg overflow-hidden">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
              {/* A curve */}
              <path
                d={`M 0 40 ${Array.from({ length: 50 }, (_, i) => {
                  const t = i / 49;
                  const [gA] = curveGains(t, curve);
                  return `L ${(t * 100).toFixed(2)} ${(40 - gA * 40).toFixed(2)}`;
                }).join(' ')} L 100 40 Z`}
                fill="var(--theme-primary)"
                opacity="0.5"
              />
              {/* B curve */}
              <path
                d={`M 0 40 ${Array.from({ length: 50 }, (_, i) => {
                  const t = i / 49;
                  const [, gB] = curveGains(t, curve);
                  return `L ${(t * 100).toFixed(2)} ${(40 - gB * 40).toFixed(2)}`;
                }).join(' ')} L 100 40 Z`}
                fill="var(--theme-accent)"
                opacity="0.5"
              />
            </svg>
            {/* playhead */}
            {isPlaying && trackA && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-theme-text"
                style={{ left: `${Math.min(100, (mixProgress / Math.max(1, trackADurationRef.current)) * 100)}%` }}
              />
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-theme-muted mt-1">
            <span>Трек A</span>
            <span>Кроссфейд</span>
            <span>Трек B</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-theme-muted text-center flex items-center justify-center gap-1">
        <Volume2 className="w-3 h-3" />
        Кроссфейд использует Web Audio API с GainNodes для плавного перехода громкости
      </p>
    </div>
  );
}
