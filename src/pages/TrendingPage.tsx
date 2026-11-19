import { useCallback, useEffect, useRef, useState } from 'react';
import { Flame, Loader2, RefreshCw, Trophy, Upload, Zap, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { makeSound, type TrackType } from '@/pages/BeatComposerPage';
import { STEPS, buildPattern, trackEffects } from '@/lib/beatPlayback';
import { fetchTrendingBeats, recordBeatPlay, type TrendingBeat } from '@/lib/trending';
import TrendingBoostModal from '@/components/TrendingBoostModal';
import TrendingRow from '@/components/TrendingRow';
import UploadBeatModal from '@/components/UploadBeatModal';

const REFRESH_MS = 60_000;
const CLOCK_MS = 30_000;

export default function TrendingPage() {
  const { profile, isGuest } = useAuth();
  const { t } = useLocale();
  const [beats, setBeats] = useState<TrendingBeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [boostOpen, setBoostOpen] = useState(false);
  const [boostBeatId, setBoostBeatId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(0);

  const loadBeats = useCallback(async () => {
    try {
      setBeats(await fetchTrendingBeats());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBeats();
    const refreshId = window.setInterval(loadBeats, REFRESH_MS);
    const clockId = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
    };
  }, [loadBeats]);

  useEffect(() => () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    audioElRef.current?.pause();
  }, []);

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    stepRef.current = 0;
    setPlayingId(null);
  }, []);

  const countPlay = useCallback((beatId: string) => {
    recordBeatPlay(beatId)
      .then(() => {
        setBeats((prev) =>
          prev.map((item) =>
            item.beat_id === beatId ? { ...item, play_count: item.play_count + 1 } : item
          )
        );
      })
      .catch(() => undefined);
  }, []);

  const togglePlay = useCallback(async (beat: TrendingBeat) => {
    if (playingId === beat.beat_id) {
      stopPlayback();
      return;
    }
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }

    if (beat.audio_url) {
      const audio = new Audio(beat.audio_url);
      audio.onended = stopPlayback;
      audioElRef.current = audio;
      setPlayingId(beat.beat_id);
      audio.play().catch(stopPlayback);
      countPlay(beat.beat_id);
      return;
    }

    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const savedTracks = (beat.data?.tracks ?? []).filter((track) => !track.muted);
    const bpm = beat.data?.bpm || beat.bpm || 120;
    const totalSteps = STEPS * (beat.data?.bars || 1);
    const pattern = savedTracks.length > 0 ? null : buildPattern(beat.genre);

    const tick = () => {
      const step = stepRef.current;
      const time = ctx.currentTime;
      if (pattern) {
        pattern.forEach((track) => {
          const hit = track[step];
          if (typeof hit === 'string') makeSound(ctx, null, hit as TrackType, time, 0.5, trackEffects(), bpm);
        });
        stepRef.current = (step + 1) % STEPS;
      } else {
        savedTracks.forEach((track) => {
          if (track.steps[step]) makeSound(ctx, null, track.type, time, track.volume * 0.7, trackEffects(track), bpm);
        });
        stepRef.current = (step + 1) % totalSteps;
      }
    };

    stepRef.current = 0;
    setPlayingId(beat.beat_id);
    tick();
    intervalRef.current = window.setInterval(tick, 60000 / bpm / 4);
    countPlay(beat.beat_id);
  }, [playingId, stopPlayback, countPlay]);

  const openBoost = (beatId: string | null) => {
    setBoostBeatId(beatId);
    setBoostOpen(true);
  };

  const canBoost = Boolean(profile && !isGuest && profile.is_premium);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Flame className="flame w-6 h-6 text-white" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-theme-text">{t('Горящие треки')}</h1>
            <p className="text-sm text-theme-muted mt-1">
              {t('Самые популярные биты по прослушиваниям, лайкам и продвижению')}
            </p>
          </div>
        </div>
      </header>

      {!canUpload && (profile && !isGuest) && (
        <div className="mb-6 rounded-xl border border-theme-warning/30 bg-theme-warning/10 p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-theme-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-theme-text font-medium mb-1">{t('Добавление и продвижение треков — только для Premium')}</p>
            <p className="text-theme-muted">{t('Оформите подписку Premium, чтобы продвигать треки в рейтинге')}</p>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
          <p className="font-medium text-theme-text">{t('Как считается рейтинг')}</p>
          <p className="text-theme-muted mt-1">{t('Прослушивания + лайки x3 + очки буста')}</p>
        </div>
        <div className="rounded-xl border border-theme-primary/30 bg-theme-primary/10 p-3 text-sm">
          <p className="font-medium text-theme-text">{t('🗓 Ежемесячный сброс')}</p>
          <p className="text-theme-muted mt-1">{t('Рейтинг и прослушивания обнуляются 1-го числа каждого месяца. Лайки и бусты остаются.')}</p>
        </div>
        <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
          <p className="font-medium text-theme-text">{t('Топ-3 на сутки')}</p>
          <p className="text-theme-muted mt-1">{t('Три самых заметных места, 500 монет')}</p>
        </div>
        <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
          <p className="font-medium text-theme-text">{t('Вечный буст')}</p>
          <p className="text-theme-muted mt-1">{t('Всегда в топ-10, всего 7 мест, 2000 монет')}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-theme-muted">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('Считаем рейтинг')}
        </div>
      ) : loadFailed ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-theme-danger">{t('Не удалось загрузить рейтинг')}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadBeats();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-sm text-theme-text hover:border-theme-primary transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> {t('Повторить')}
          </button>
        </div>
      ) : beats.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Trophy className="w-8 h-8 text-theme-muted" />
          <p className="text-sm text-theme-muted">{t('Пока нет опубликованных треков. Выложите бит в ленту, и он появится здесь')}</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {beats.map((beat, index) => (
            <TrendingRow
              key={beat.beat_id}
              beat={beat}
              index={index}
              now={now}
              playing={playingId === beat.beat_id}
              isOwn={canBoost && profile?.id === beat.creator_id}
              onTogglePlay={togglePlay}
              onBoost={openBoost}
            />
          ))}
        </ol>
      )}

      {<UploadBeatModal
          onClose={() => setUploadOpen(false)}
          onUploaded={(beatId) => {
            setUploadOpen(false);
            loadBeats();
            openBoost(beatId);
          }}
        />
      }

      {boostOpen && (
        <TrendingBoostModal
          initialBeatId={boostBeatId}
          onClose={() => setBoostOpen(false)}
          onPurchased={loadBeats}
          onUploadNew={() => {
            setBoostOpen(false);
            setUploadOpen(true);
          }}
        />
      )}
    </div>
  );
}
