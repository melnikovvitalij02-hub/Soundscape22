import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Loader2,
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
    artist: 'Toxi',
    url: 'https://cdn13.deliciousoranges.com/s3/get/music/20240608/Toxi_-_I_GOT_U_77936633.mp3',
    cover: '/cover-igotu.webp',
    duration: '2:48',
  },
  {
    id: 2,
    title: 'Мало',
    artist: 'EGOR KRID',
    url: 'https://cdn15.deliciousoranges.com/s1/get/music/20260703/EGOR_KRID_-_Malo_20_81826468.mp3',
    cover: '/cover-malo.webp',
    duration: '2:35',
  },
  {
    id: 3,
    title: 'Тону',
    artist: 'HOLLYFLAME',
    url: 'https://cdn1.deliciousoranges.com/s1/get/music/20260206/HOLLYFLAME_-_Tonu_80790537.mp3',
    cover: '/cover-tonu.webp',
    duration: '3:12',
  },
  {
    id: 4,
    title: 'Малиновая Лада',
    artist: 'GAYAZOV BROTHER',
    url: 'https://cdn14.deliciousoranges.com/s3/get/music/20211024/GAYAZOV_BROTHER_-_MALINOVAYA_LADA_73214200.mp3',
    cover: '/cover-lada.webp',
    duration: '2:22',
  },
  {
    id: 5,
    title: 'По барам',
    artist: 'ANNA ASTI',
    url: 'https://cdn1.deliciousoranges.com/s3/get/music/20220603/ANNA_ASTI_-_Po_baram_74376135.mp3',
    cover: '/cover-baram.webp',
    duration: '2:58',
  },
];

type LyricLine = { time: number; text: string };

const LYRICS: Record<number, LyricLine[]> = {
  1: [
    { time: 0, text: '♪ Интро ♪' },
    { time: 8, text: 'Я нашёл тебя там, где свет' },
    { time: 16, text: 'Ты танцуешь, ты горишь' },
    { time: 24, text: 'I got u, I got u tonight' },
    { time: 34, text: 'Не отпускай, держи меня крепко' },
    { time: 44, text: 'Эта ночь только наша с тобой' },
    { time: 54, text: 'I got u, I got u tonight' },
    { time: 64, text: '♪ Припев ♪' },
    { time: 74, text: 'Ты мой свет, ты мой ритм' },
    { time: 84, text: 'Сердце бьётся, ты со мной' },
    { time: 94, text: 'I got u, I got u tonight' },
    { time: 104, text: '♪ Аутро ♪' },
    { time: 120, text: 'До утра, до рассвета...' },
    { time: 140, text: '♪ Конец ♪' },
  ],
  2: [
    { time: 0, text: '♪ Интро ♪' },
    { time: 6, text: 'Мне тебя мало, мало' },
    { time: 14, text: 'Ты как воздух, ты как небо' },
    { time: 22, text: 'Без тебя так пусто, пусто' },
    { time: 32, text: 'Мало, мало, мало тебя' },
    { time: 42, text: 'Каждый миг хочу быть рядом' },
    { time: 52, text: '♪ Припев ♪' },
    { time: 62, text: 'Мне тебя мало, мало' },
    { time: 72, text: 'Ты мой воздух, ты мой свет' },
    { time: 82, text: 'Без тебя так пусто, пусто' },
    { time: 92, text: 'Мало, мало, мало тебя' },
    { time: 102, text: '♪ Аутро ♪' },
    { time: 120, text: 'Только ты, только ты...' },
    { time: 140, text: '♪ Конец ♪' },
  ],
  3: [
    { time: 0, text: '♪ Интро ♪' },
    { time: 8, text: 'Тону в твоих глазах глубоко' },
    { time: 18, text: 'Волна накрывает меня с головой' },
    { time: 28, text: 'Не спасай, не тяни на берег' },
    { time: 38, text: 'Я хочу тонуть в тебе' },
    { time: 48, text: '♪ Припев ♪' },
    { time: 58, text: 'Тону, тону, тону в тебе' },
    { time: 68, text: 'Глубоко, до самого дна' },
    { time: 78, text: 'Не спасай, не тяни на берег' },
    { time: 88, text: 'Я хочу тонуть в тебе' },
    { time: 98, text: '♪ Аутро ♪' },
    { time: 120, text: 'Тону... тону...' },
    { time: 160, text: '♪ Конец ♪' },
  ],
  4: [
    { time: 0, text: '♪ Интро ♪' },
    { time: 7, text: 'Малиновая лада, малиновая лада' },
    { time: 15, text: 'По дворам, по дворам' },
    { time: 23, text: 'Ты садишься рядом, ты смотришь в глаза' },
    { time: 33, text: 'Малиновая лада моя' },
    { time: 43, text: '♪ Припев ♪' },
    { time: 53, text: 'Малиновая лада, малиновая лада' },
    { time: 63, text: 'По дворам, по дворам' },
    { time: 73, text: 'Ты садишься рядом, ты смотришь в глаза' },
    { time: 83, text: 'Малиновая лада моя' },
    { time: 93, text: '♪ Аутро ♪' },
    { time: 110, text: 'Малиновая лада...' },
    { time: 140, text: '♪ Конец ♪' },
  ],
  5: [
    { time: 0, text: '♪ Интро ♪' },
    { time: 8, text: 'По барам, по барам, по барам' },
    { time: 16, text: 'Мы с тобой опять по барам' },
    { time: 24, text: 'Наливай, не жалей, выпьем до дна' },
    { time: 34, text: 'По барам, по барам, по барам' },
    { time: 44, text: '♪ Припев ♪' },
    { time: 54, text: 'По барам, по барам, по барам' },
    { time: 64, text: 'Мы с тобой опять по барам' },
    { time: 74, text: 'Наливай, не жалей, выпьем до дна' },
    { time: 84, text: 'По барам, по барам, по барам' },
    { time: 94, text: '♪ Аутро ♪' },
    { time: 120, text: 'По барам... по барам...' },
    { time: 160, text: '♪ Конец ♪' },
  ],
};

export default function KaraokePage() {
  const [currentTrack, setCurrentTrack] = useState<ChartTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [activeLine, setActiveLine] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lyricScrollRef = useRef<HTMLDivElement | null>(null);

  const lyrics = currentTrack ? LYRICS[currentTrack.id] || [] : [];

  const playTrack = useCallback((track: ChartTrack) => {
    if (currentTrack?.id === track.id && isPlaying) {
      audioRef.current?.pause();
      return;
    }
    setLoading(true);
    setCurrentTrack(track);
    setProgress(0);
    setDuration(0);
    setActiveLine(0);
    if (audioRef.current) {
      audioRef.current.src = track.url;
      audioRef.current.volume = volume;
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [currentTrack, isPlaying, volume]);

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const playNext = () => {
    if (!currentTrack) return;
    const idx = CHART_TRACKS.findIndex((t) => t.id === currentTrack.id);
    playTrack(CHART_TRACKS[(idx + 1) % CHART_TRACKS.length]);
  };

  const playPrev = () => {
    if (!currentTrack) return;
    const idx = CHART_TRACKS.findIndex((t) => t.id === currentTrack.id);
    playTrack(CHART_TRACKS[(idx - 1 + CHART_TRACKS.length) % CHART_TRACKS.length]);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setProgress(t);
    setDuration(audioRef.current.duration || 0);
    // find active lyric line
    let idx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (t >= lyrics[i].time) idx = i;
      else break;
    }
    setActiveLine(idx);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setProgress(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  };

  // auto-scroll to active line
  useEffect(() => {
    const node = lyricRefs.current[activeLine];
    const container = lyricScrollRef.current;
    if (node && container) {
      const top = node.offsetTop - container.clientHeight / 2 + node.clientHeight / 2;
      container.scrollTo({ top, behavior: 'smooth' });
    }
  }, [activeLine]);

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Mic className="w-6 h-6 text-theme-primary" />
          Караоке
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          Выбери трек и пой в караоке — текст подсвечивается в такт музыке
        </p>
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={playNext}
        onLoadedMetadata={handleTimeUpdate}
      />

      {/* Track selection */}
      <div className="flex flex-wrap gap-2">
        {CHART_TRACKS.map((track) => {
          const isActive = currentTrack?.id === track.id;
          return (
            <button
              key={track.id}
              onClick={() => playTrack(track)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                isActive
                  ? 'bg-theme-primary-bg border-theme-primary-border'
                  : 'bg-theme-surface/50 border-theme-border hover:border-theme-primary'
              }`}
            >
              <img src={track.cover} alt={track.title} className="w-8 h-8 rounded-lg object-cover" />
              <div className="text-left">
                <p className={`text-xs font-medium truncate ${isActive ? 'text-theme-primary-text' : 'text-theme-text'}`}>
                  {track.title}
                </p>
                <p className="text-[10px] text-theme-muted truncate">{track.artist}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Lyric panel */}
      {currentTrack ? (
        <div className="glass-surface bg-gradient-to-b from-theme-surface/80 to-theme-surface/40 border border-theme-border rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-4 p-4 border-b border-theme-border">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-theme-surface2">
              <img src={currentTrack.cover} alt={currentTrack.title} className="w-full h-full object-cover" />
              {loading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-theme-text font-semibold truncate">{currentTrack.title}</h2>
              <p className="text-theme-muted text-sm truncate">{currentTrack.artist}</p>
            </div>
          </div>

          {/* Lyrics */}
          <div
            ref={lyricScrollRef}
            className="h-80 overflow-y-auto px-6 py-10 space-y-3 scroll-smooth"
            style={{ maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)' }}
          >
            {lyrics.length === 0 ? (
              <p className="text-center text-theme-muted">Текст для этого трека скоро появится</p>
            ) : (
              lyrics.map((line, i) => {
                const isActive = i === activeLine;
                const isPast = i < activeLine;
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      lyricRefs.current[i] = el;
                    }}
                    className={`text-center text-lg font-medium transition-all duration-300 ${
                      isActive
                        ? 'text-theme-primary scale-105'
                        : isPast
                        ? 'text-theme-muted/50'
                        : 'text-theme-muted'
                    }`}
                  >
                    {line.text}
                  </div>
                );
              })
            )}
          </div>

          {/* Player controls */}
          <div className="p-4 border-t border-theme-border space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-theme-muted font-mono w-10">{formatTime(progress)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={progress}
                onChange={handleSeek}
                className="flex-1 accent-theme-primary"
              />
              <span className="text-xs text-theme-muted font-mono w-10 text-right">{formatTime(duration)}</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={playPrev} className="p-2 text-theme-muted hover:text-theme-text transition-colors">
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={togglePlay}
                className="p-4 bg-theme-primary text-white rounded-full hover:bg-theme-primary-hover transition-colors"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </button>
              <button onClick={playNext} className="p-2 text-theme-muted hover:text-theme-text transition-colors">
                <SkipForward className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 ml-2">
                <Volume2 className="w-4 h-4 text-theme-muted" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={handleVolume}
                  className="w-16 accent-theme-primary"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-12 text-center">
          <Mic className="w-12 h-12 text-theme-muted mx-auto mb-3" />
          <p className="text-theme-muted">Выбери трек выше, чтобы начать караоке</p>
        </div>
      )}
    </div>
  );
}
