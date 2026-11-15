import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  Image as ImageIcon,
  Wand2,
  Film,
  Music,
  Loader2,
  Download,
  Play,
  Pause,
  Sparkles,
  Volume2,
  Sliders,
  Clock,
  Check,
  AlertCircle,
} from 'lucide-react';

const SAD_GENRES = ['Sad Lo-Fi', 'Sad Trap', 'Sad Piano', 'Sad Strings'];

const SAD_PATTERNS: Record<string, boolean[][]> = {
  'Sad Lo-Fi': [
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  ],
  'Sad Trap': [
    [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  ],
  'Sad Piano': [
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [true, false, false, true, false, false, true, false, true, false, false, true, false, false, true, false],
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  ],
  'Sad Strings': [
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
    [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
  ],
};

const SAD_TRACK_NAMES = ['Кик', 'Снейр', 'Хай-Хэт', 'Пиано'];
const SAD_TRACK_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-indigo-500'];

const COVER_GRADIENTS = [
  'from-purple-600 via-pink-500 to-orange-400',
  'from-blue-600 via-cyan-400 to-green-400',
  'from-indigo-600 via-purple-500 to-pink-400',
  'from-red-600 via-orange-500 to-yellow-400',
  'from-green-600 via-teal-500 to-cyan-400',
  'from-violet-600 via-fuchsia-500 to-rose-400',
];

const CLIP_DURATIONS = [15, 30, 60];

const SCENE_TYPES = [
  { label: 'Интро', color: 'bg-theme-primary' },
  { label: 'Куплет', color: 'bg-theme-accent' },
  { label: 'Припев', color: 'bg-theme-warning' },
  { label: 'Бридж', color: 'bg-theme-success' },
  { label: 'Аутро', color: 'bg-theme-danger' },
];

export default function AIStudioEnhancedPage() {
  const { addXp } = useAuth();
  const [activeTab, setActiveTab] = useState<'cover' | 'sad'>('cover');

  // Cover generation state
  const [generatingCover, setGeneratingCover] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverGradient, setCoverGradient] = useState<string>(COVER_GRADIENTS[0]);
  const [coverPattern, setCoverPattern] = useState<number>(0);

  // Audio enhancement state
  const [enhancing, setEnhancing] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [beforeBars, setBeforeBars] = useState<number[]>(Array(32).fill(20));
  const [afterBars, setAfterBars] = useState<number[]>(Array(32).fill(20));
  const [isPlayingBars, setIsPlayingBars] = useState(false);
  const barAnimRef = useRef<number | null>(null);

  // Clip generation state
  const [generatingClip, setGeneratingClip] = useState(false);
  const [clipGenerated, setClipGenerated] = useState(false);
  const [clipDuration, setClipDuration] = useState(15);
  const [clipScenes, setClipScenes] = useState<{ type: number; start: number; end: number }[]>([]);

  // Sad beat state
  const [sadGenre, setSadGenre] = useState('Sad Lo-Fi');
  const [sadBpm, setSadBpm] = useState(70);
  const [generatingSad, setGeneratingSad] = useState(false);
  const [sadPattern, setSadPattern] = useState<boolean[][]>([]);
  const [sadPlaying, setSadPlaying] = useState(false);
  const [sadCurrentStep, setSadCurrentStep] = useState(-1);
  const sadStepRef = useRef(0);
  const sadIntervalRef = useRef<number | null>(null);
  const sadBpmRef = useRef(sadBpm);
  const sadPatternRef = useRef<boolean[][]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    sadBpmRef.current = sadBpm;
  }, [sadBpm]);

  useEffect(() => {
    sadPatternRef.current = sadPattern;
  }, [sadPattern]);

  const generateCover = async () => {
    setGeneratingCover(true);
    setCoverUrl(null);
    setCoverError(null);
    try {
      const prompts = [
        'Abstract music album cover, dark cosmic nebula with vibrant teal and magenta accents, professional digital art, no text',
        'Abstract music album cover, neon synthwave grid landscape at sunset, purple and cyan, professional digital art, no text',
        'Abstract music album cover, moody lo-fi aesthetic, warm sunset over city skyline, soft grain, professional digital art, no text',
        'Abstract music album cover, geometric minimal design, deep blue and gold, clean shapes, professional digital art, no text',
        'Abstract music album cover, organic flowing waves of sound, emerald and amber, professional digital art, no text',
        'Abstract music album cover, dark techno industrial aesthetic, metallic textures with red accent, professional digital art, no text',
      ];
      const prompt = prompts[Math.floor(Math.random() * prompts.length)];
      const resp = await fetch(`https://cccoflivuzxzujieuhvo.supabase.co/functions/v1/generate-cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!resp.ok) throw new Error('edge function failed');
      const blob = await resp.blob();
      if (blob.size < 1000) throw new Error('too small');
      setCoverUrl(URL.createObjectURL(blob));
    } catch {
      const idx = Math.floor(Math.random() * COVER_GRADIENTS.length);
      const patternId = Math.floor(Math.random() * 6);
      setCoverGradient(COVER_GRADIENTS[idx]);
      setCoverPattern(patternId);
      setCoverUrl(`gradient-${idx}-${patternId}`);
      setCoverError('AI-генерация недоступна. Показан запасной градиент.');
    }
    setGeneratingCover(false);
    await addXp(20);
  };

  const enhanceAudio = async () => {
    setEnhancing(true);
    setEnhanced(false);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Generate "before" bars (uneven, quiet)
    const before = Array.from({ length: 32 }, (_, i) =>
      15 + Math.sin(i * 0.3) * 10 + Math.random() * 15
    );
    // Generate "after" bars (normalized, louder, more balanced)
    const after = Array.from({ length: 32 }, (_, i) =>
      40 + Math.sin(i * 0.5) * 25 + Math.cos(i * 0.2) * 15 + Math.random() * 10
    );

    setBeforeBars(before);
    setAfterBars(after);
    setEnhanced(true);
    setEnhancing(false);
    await addXp(15);
  };

  const animateBars = useCallback(() => {
    const tick = () => {
      setBeforeBars((prev) => prev.map((v) => Math.max(10, v + (Math.random() - 0.5) * 15)));
      setAfterBars((prev) => prev.map((v) => Math.max(20, v + (Math.random() - 0.5) * 20)));
    };
    barAnimRef.current = window.setInterval(tick, 150);
  }, []);

  useEffect(() => {
    if (isPlayingBars) {
      animateBars();
    } else {
      if (barAnimRef.current) {
        clearInterval(barAnimRef.current);
        barAnimRef.current = null;
      }
    }
    return () => {
      if (barAnimRef.current) clearInterval(barAnimRef.current);
    };
  }, [isPlayingBars, animateBars]);

  const generateClip = async () => {
    setGeneratingClip(true);
    setClipGenerated(false);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Generate scenes based on duration
    const sceneCount = Math.max(3, Math.floor(clipDuration / 10));
    const sceneLength = clipDuration / sceneCount;
    const scenes: { type: number; start: number; end: number }[] = [];
    for (let i = 0; i < sceneCount; i++) {
      scenes.push({
        type: i % SCENE_TYPES.length,
        start: i * sceneLength,
        end: (i + 1) * sceneLength,
      });
    }
    setClipScenes(scenes);
    setClipGenerated(true);
    setGeneratingClip(false);
    await addXp(25);
  };

  const makeSadSound = (ctx: AudioContext, trackIdx: number, time: number, bpm: number) => {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (trackIdx === 0) {
      // Kick - softer for sad beats
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.4);
      gain.gain.setValueAtTime(0.6, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.4);
    } else if (trackIdx === 1) {
      // Snare
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, 4410, 44100);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < 4410; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      noise.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      noise.start(time);
      noise.stop(time + 0.2);
    } else if (trackIdx === 2) {
      // Hihat - soft
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, 2205, 44100);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < 2205; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      noise.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
      noise.start(time);
      noise.stop(time + 0.05);
    } else if (trackIdx === 3) {
      // Piano - minor key, melancholic
      const freqs = [220, 246.94, 261.63, 293.66]; // A3, B3, C4, D4 (minor feel)
      const freq = freqs[Math.floor(time / (60000 / bpm / 4)) % freqs.length];
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      osc.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0.25, time);
      gain.gain.linearRampToValueAtTime(0.25, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.6);
      osc.start(time);
      osc.stop(time + 0.6);
    } else if (trackIdx === 4) {
      // Violin - sad, melancholic with vibrato
      const freqs = [196, 220, 246.94, 261.63]; // G3, A3, B3, C4
      const freq = freqs[Math.floor(time / (60000 / bpm / 4)) % freqs.length];
      const vibratoLFO = ctx.createOscillator();
      vibratoLFO.frequency.value = 4;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = 3;
      vibratoLFO.connect(vibratoGain);
      const vFilter = ctx.createBiquadFilter();
      vFilter.type = 'lowpass';
      vFilter.frequency.value = 2500;
      vFilter.Q.value = 1;
      const vGain = ctx.createGain();
      vGain.gain.setValueAtTime(0.0001, time);
      vGain.gain.linearRampToValueAtTime(0.2, time + 0.1);
      vGain.gain.linearRampToValueAtTime(0.15, time + 0.3);
      vGain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
      vFilter.connect(vGain);
      vGain.connect(gain);
      const vOsc = ctx.createOscillator();
      vOsc.type = 'sawtooth';
      vOsc.frequency.setValueAtTime(freq, time);
      vibratoGain.connect(vOsc.frequency);
      vOsc.connect(vFilter);
      vOsc.start(time); vOsc.stop(time + 0.8);
      vibratoLFO.start(time); vibratoLFO.stop(time + 0.8);
    } else if (trackIdx === 5) {
      // Voice - soft "ah" sound, female range for sadness
      const freqs = [220, 246.94, 261.63]; // A3, B3, C4
      const freq = freqs[Math.floor(time / (60000 / bpm / 4)) % freqs.length];
      const formants = [900, 1400, 3300];
      const vocGain = ctx.createGain();
      vocGain.gain.setValueAtTime(0.0001, time);
      vocGain.gain.linearRampToValueAtTime(0.15, time + 0.08);
      vocGain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
      vocGain.connect(gain);
      const vocOsc = ctx.createOscillator();
      vocOsc.type = 'sawtooth';
      vocOsc.frequency.setValueAtTime(freq, time);
      formants.forEach((f) => {
        const fFilter = ctx.createBiquadFilter();
        fFilter.type = 'bandpass';
        fFilter.frequency.value = f;
        fFilter.Q.value = 8;
        vocOsc.connect(fFilter); fFilter.connect(vocGain);
      });
      vocOsc.start(time); vocOsc.stop(time + 0.6);
    }
  };

  const stopSadBeat = useCallback(() => {
    if (sadIntervalRef.current) {
      clearInterval(sadIntervalRef.current);
      sadIntervalRef.current = null;
    }
    setSadPlaying(false);
    setSadCurrentStep(-1);
    sadStepRef.current = 0;
  }, []);

  const playSadBeat = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const stepDuration = 60000 / sadBpmRef.current / 4;
    sadStepRef.current = 0;
    setSadPlaying(true);

    const tick = () => {
      const step = sadStepRef.current;
      setSadCurrentStep(step);
      const time = ctx.currentTime;
      sadPatternRef.current.forEach((track, trackIdx) => {
        if (track[step]) {
          makeSadSound(ctx, trackIdx, time, sadBpmRef.current);
        }
      });
      sadStepRef.current = (step + 1) % 16;
    };

    tick();
    sadIntervalRef.current = window.setInterval(tick, stepDuration);
  }, []);

  const generateSadBeat = async () => {
    setGeneratingSad(true);
    setSadPattern([]);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const pattern = SAD_PATTERNS[sadGenre] || SAD_PATTERNS['Sad Lo-Fi'];
    setSadPattern(pattern.map((t) => [...t]));
    setGeneratingSad(false);
    await addXp(20);
  };

  useEffect(() => {
    return () => {
      stopSadBeat();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, [stopSadBeat]);

  const tabs = [
    { id: 'cover' as const, label: 'AI Обложки', icon: ImageIcon },
    { id: 'sad' as const, label: 'Sad Beats', icon: Music },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Wand2 className="w-6 h-6 text-theme-accent" />
          ИИ Студия Pro
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          AI генерация обложек и грустных битов
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-theme-primary to-theme-accent text-white shadow-lg'
                : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* AI Cover Generation */}
      {activeTab === 'cover' && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface">
          <h3 className="text-sm font-medium text-theme-text mb-4 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-theme-accent" />
            AI генерация обложек
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Preview area */}
            <div className="aspect-square rounded-2xl overflow-hidden border border-theme-border relative bg-theme-surface2">
              {generatingCover ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-10 h-10 text-theme-primary animate-spin" />
                  <p className="text-theme-muted text-sm">Генерация обложки...</p>
                </div>
              ) : coverUrl ? (
                coverUrl.startsWith('gradient-') ? (
                  <div className={`w-full h-full bg-gradient-to-br ${coverGradient} relative flex items-center justify-center`}>
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage: `radial-gradient(circle at ${20 + coverPattern * 15}% ${30 + coverPattern * 10}%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at ${70 - coverPattern * 10}% ${70 + coverPattern * 5}%, rgba(0,0,0,0.3) 0%, transparent 40%)`,
                      }}
                    />
                    <div className="relative z-10 text-center">
                      <Sparkles className="w-12 h-12 text-white/80 mx-auto mb-2" />
                      <p className="text-white/90 text-sm font-medium">AI Generated</p>
                    </div>
                  </div>
                ) : (
                  <img src={coverUrl} alt="AI Generated cover" className="w-full h-full object-cover" />
                )
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-theme-muted">
                  <ImageIcon className="w-12 h-12" />
                  <p className="text-sm">Обложка появится здесь</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-col justify-center gap-4">
              <div>
                <p className="text-theme-muted text-sm mb-2">
                  Нажмите кнопку ниже, чтобы AI сгенерировал уникальную обложку для вашего трека. Каждая обложка — уникальный градиент с узором.
                </p>
              </div>

              <button
                onClick={generateCover}
                disabled={generatingCover}
                className="px-5 py-3 bg-gradient-to-r from-theme-accent to-theme-primary text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generatingCover ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    Сгенерировать обложку
                  </>
                )}
              </button>

              {coverUrl && !generatingCover && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-theme-success">
                    <Check className="w-4 h-4" />
                    <span>Обложка сгенерирована!</span>
                  </div>
                  {coverError && (
                    <div className="flex items-center gap-2 text-sm text-theme-warning">
                      <AlertCircle className="w-4 h-4" />
                      <span>{coverError}</span>
                    </div>
                  )}
                  <button
                    className="px-4 py-2 bg-theme-surface2 text-theme-text border border-theme-border rounded-lg text-sm font-medium hover:bg-theme-border transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Скачать обложку
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sad Beat Generator */}
      {activeTab === 'sad' && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface">
          <h3 className="text-sm font-medium text-theme-text mb-4 flex items-center gap-2">
            <Music className="w-4 h-4 text-theme-warning" />
            Генератор грустных битов
          </h3>

          <div className="space-y-4">
            {/* Genre selector */}
            <div>
              <label className="text-xs text-theme-muted uppercase tracking-wider mb-2 block">Жанр</label>
              <div className="flex flex-wrap gap-2">
                {SAD_GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => { setSadGenre(g); setSadPattern([]); stopSadBeat(); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      sadGenre === g
                        ? 'bg-theme-warning text-white'
                        : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* BPM slider */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-theme-muted uppercase tracking-wider">BPM</label>
              <input
                type="range"
                min={60}
                max={80}
                value={sadBpm}
                onChange={(e) => setSadBpm(Number(e.target.value))}
                className="flex-1 accent-theme-warning"
              />
              <span className="text-theme-text text-sm font-mono w-10">{sadBpm}</span>
            </div>

            <button
              onClick={generateSadBeat}
              disabled={generatingSad}
              className="px-5 py-3 bg-gradient-to-r from-theme-warning to-theme-danger text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {generatingSad ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Генерация бита...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  Сгенерировать грустный бит
                </>
              )}
            </button>

            {/* Beat grid */}
            {sadPattern.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={sadPlaying ? stopSadBeat : playSadBeat}
                    className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all ${
                      sadPlaying
                        ? 'bg-theme-danger text-white'
                        : 'bg-theme-success text-white hover:bg-theme-success/90'
                    }`}
                  >
                    {sadPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {sadPlaying ? 'Стоп' : 'Играть'}
                  </button>
                  <div className="flex items-center gap-1.5 text-xs text-theme-muted">
                    <Volume2 className="w-3.5 h-3.5" />
                    {sadGenre} · {sadBpm} BPM · минорная тональность
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[560px] space-y-2">
                    {/* Step indicators */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-24 shrink-0" />
                      <div className="flex gap-1">
                        {Array.from({ length: 16 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-7 h-5 rounded flex items-center justify-center text-[10px] font-mono ${
                              i % 4 === 0 ? 'text-theme-warning' : 'text-theme-muted'
                            } ${sadCurrentStep === i ? 'bg-theme-warning/20' : ''}`}
                          >
                            {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tracks */}
                    {sadPattern.map((track, trackIdx) => (
                      <div key={trackIdx} className="flex items-center gap-2">
                        <div className="w-24 shrink-0 text-xs font-medium text-theme-text">
                          {SAD_TRACK_NAMES[trackIdx]}
                        </div>
                        <div className="flex gap-1">
                          {track.map((active, stepIdx) => (
                            <div
                              key={stepIdx}
                              className={`w-7 h-7 rounded-md transition-all ${
                                active
                                  ? `${SAD_TRACK_COLORS[trackIdx]} shadow-lg`
                                  : 'bg-theme-surface2'
                              } ${sadCurrentStep === stepIdx && active ? 'ring-2 ring-white/50' : ''}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 text-sm text-theme-success">
                  <Check className="w-4 h-4" />
                  <span>Грустный бит сгенерирован в минорной тональности с медленным темпом.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
