import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Loader2, RefreshCw, Trophy, Upload, Zap, Lock, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { makeSound, type TrackType } from '@/pages/BeatComposerPage';
import { STEPS, buildPattern, trackEffects } from '@/lib/beatPlayback';
import { fetchTrendingBeats, recordBeatPlay, recordAnonPlay, type TrendingBeat } from '@/lib/trending';
import TrendingBoostModal from '@/components/TrendingBoostModal';
import TrackProgress from '@/components/TrackProgress';
import TrendingRow from '@/components/TrendingRow';
//import UploadBeatModal from '@/components/UploadBeatModal';

const REFRESH_MS = 60_000;
const CLOCK_MS = 30_000;
// Minimum real listening time before a play counts (anti-autoclicker)
const MIN_LISTEN_SEC = 30;

export default function TrendingPage() {
  const { profile, isGuest, addXp } = useAuth();
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
  const listenTimerRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const playingRef = useRef<TrendingBeat | null>(null);
  const loopOnRef = useRef(false);
  const [loopOn, setLoopOn] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [seqPos, setSeqPos] = useState(0);
  const [seqTotal, setSeqTotal] = useState(0);

  const [likedBeats, setLikedBeats] = useState<Set<string>>(new Set());

  const toggleLoop = useCallback(() => {
    setLoopOn((prev) => {
      const next = !prev;
      loopOnRef.current = next;
      if (audioElRef.current) audioElRef.current.loop = next;
      return next;
    });
  }, []);

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
    if (!profile || isGuest || beats.length === 0) return;
    const beatIds = beats.map((b) => b.beat_id);
    (async () => {
      const { data } = await supabase
        .from('beat_likes')
        .select('beat_id')
        .eq('user_id', profile.id)
        .in('beat_id', beatIds);
      if (data) {
        setLikedBeats(new Set(data.map((l) => l.beat_id)));
      }
    })();
  }, [profile, isGuest, beats]);
  
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
    playingRef.current = null;
    if (listenTimerRef.current) {
      window.clearTimeout(listenTimerRef.current);
      listenTimerRef.current = null;
    }
    setSeqPos(0);
    setSeqTotal(0);
    setAudioProgress(0);
    setAudioDuration(0);
    setPlayingId(null);
  }, []);

  // Counts the play only after the beat really played for MIN_LISTEN_SEC.
  // + anti-farm: XP only once per day per beat (server-enforced).
  const schedulePlayCount = useCallback((beatId: string) => {
    if (!profile || isGuest) {
      // guests/visitors: simple counter without rewards
      listenTimerRef.current = window.setTimeout(() => {
        recordAnonPlay(beatId).catch(() => undefined);
      }, MIN_LISTEN_SEC * 1000);
      return;
    }
    listenTimerRef.current = window.setTimeout(async () => {
      if (playingRef.current?.beat_id !== beatId) return;

      // 1. Уникальное прослушивание для рейтинга (30 дней)
      try {
        const { counted } = await recordBeatPlay(beatId);
        if (counted) {
          setBeats((prev) =>
            prev.map((item) =>
              item.beat_id === beatId ? { ...item, play_count: item.play_count + 1 } : item
            )
          );
        }
      } catch {}

      // 2. XP за прослушивание — уникальность за день (server-enforced)
      try {
        const { data } = await supabase.rpc('claim_beat_xp', {
          p_beat_id: beatId,
          p_daily_unique: true,
        });
        if (data?.ok) addXp(2);
      } catch {}
    }, MIN_LISTEN_SEC * 1000);
  }, [profile, isGuest, addXp]);

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
      audio.loop = loopOnRef.current;
      audio.ontimeupdate = () => {
        setAudioProgress(audio.currentTime);
        setAudioDuration(audio.duration || 0);
      };
      audio.onended = stopPlayback;
      audioElRef.current = audio;
      setAudioProgress(0);
      setAudioDuration(0);
      setPlayingId(beat.beat_id);
      audio.play().catch(stopPlayback);
      schedulePlayCount(beat.beat_id);
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
        const next = step + 1;
        if (next >= STEPS) {
          if (loopOnRef.current) stepRef.current = 0; else { stopPlayback(); return; }
        } else {
          stepRef.current = next;
        }
      } else {
        savedTracks.forEach((track) => {
          if (track.steps[step]) {
            const note = typeof track.steps[step] === 'number' ? (track.steps[step] as number) : undefined;
            makeSound(ctx, null, track.type, time, track.volume * 0.7, trackEffects(track), bpm, step, note);
          }
        });
        const next = step + 1;
        if (next >= totalSteps) {
          if (loopOnRef.current) stepRef.current = 0; else { stopPlayback(); return; }
        } else {
          stepRef.current = next;
        }
      }
      setSeqPos(stepRef.current);
    };

    stepRef.current = 0;
    setSeqPos(0);
    setSeqTotal(pattern ? STEPS : totalSteps);
    setPlayingId(beat.beat_id);
    tick();
    intervalRef.current = window.setInterval(tick, 60000 / bpm / 4);
    schedulePlayCount(beat.beat_id);
  }, [playingId, stopPlayback, schedulePlayCount]);

  const toggleLike = useCallback(async (beatId: string) => {
    if (!profile || isGuest) return;
    const isLiked = likedBeats.has(beatId);

    if (isLiked) {
      const { error } = await supabase.from('beat_likes').delete().eq('beat_id', beatId).eq('user_id', profile.id);
      if (error) return;
      setLikedBeats((prev) => {
        const next = new Set(prev);
        next.delete(beatId);
        return next;
      });
      setBeats((prev) =>
        prev.map((item) =>
          item.beat_id === beatId ? { ...item, likes_count: Math.max(0, item.likes_count - 1) } : item
        )
      );
    } else {
      const { error } = await supabase.from('beat_likes').insert({ beat_id: beatId, user_id: profile.id });
      if (error) return;
      setLikedBeats((prev) => new Set(prev).add(beatId));
      setBeats((prev) =>
       prev.map((item) =>
          item.beat_id === beatId ? { ...item, likes_count: item.likes_count + 1 } : item
        )
      );

      // XP за лайк — только один раз навсегда
      const { data } = await supabase.rpc('claim_like_xp', { p_beat_id: beatId });
      if (data?.ok) {
        addXp(1);
      }
    }
  }, [profile, isGuest, likedBeats, addXp]);

  const openBoost = (beatId: string | null) => {
    setBoostBeatId(beatId);
    setBoostOpen(true);
  };

  const canBoost = Boolean(profile && !isGuest && profile.is_premium);
  const playingBeat = useMemo(
    () => beats.find((b) => b.beat_id === playingId) ?? null,
    [beats, playingId]
  );

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

      <div className="mb-6 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
          <p className="font-medium text-theme-text">{t('Как считается рейтинг')}</p>
          <p className="text-theme-muted mt-1">{t('Прослушивания + лайки x3 + очки буста')}</p>
        </div>
        <div className="rounded-xl border border-theme-primary/30 bg-theme-primary/10 p-4 flex items-start gap-3">
          <Calendar className="w-5 h-5 text-theme-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-theme-text">{t('🗓 Рейтинг без сброса')}</p>
            <p className="text-theme-muted mt-1">
              {t('Рейтинг строится на прослушиваниях, лайках и бустах за всё время и обнуляется только вместе с треком. Продвижение топ-3 действует ограниченный срок, а вечные слоты — бессрочно.')}
            </p>
          </div>
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
              isLiked={likedBeats.has(beat.beat_id)}
              onTogglePlay={togglePlay}
              onToggleLike={toggleLike}
              onBoost={openBoost}
            />
          ))}
        </ol>
      )}
      {playingId && (
        <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface p-4">
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={stopPlayback}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-danger text-white"
            >
              <Flame className="w-3.5 h-3.5" /> Стоп
            </button>
          </div>
          <TrackProgress
            progress={
              playingBeat?.audio_url
                ? audioDuration > 0
                  ? audioProgress / audioDuration
                  : 0
                : seqTotal > 0
                ? seqPos / seqTotal
                : 0
            }
            onSeek={(ratio) => {
              if (playingBeat?.audio_url) {
                const audio = audioElRef.current;
                if (audio && audioDuration > 0) {
                  const newTime = ratio * audioDuration;
                  audio.currentTime = newTime;
                  setAudioProgress(newTime);
                }
              } else if (seqTotal > 0) {
                stepRef.current = Math.round(ratio * seqTotal) % seqTotal;
                setSeqPos(stepRef.current);
              }
            }}
            loop={loopOn}
            onToggleLoop={toggleLoop}
            timeLabel={
              playingBeat?.audio_url
                ? `${Math.floor(audioProgress / 60)}:${String(Math.floor(audioProgress % 60)).padStart(2, '0')} / ${Math.floor(audioDuration / 60)}:${String(Math.floor(audioDuration % 60)).padStart(2, '0')}`
                : `${seqPos + 1}/${seqTotal}`
            }
          />
        </div>
      )}

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
