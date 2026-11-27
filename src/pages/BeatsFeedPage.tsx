import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import type { Page } from '@/components/Sidebar';
import {
  Heart,
  MessageCircle,
  Mic,
  Coins,
  Gem,
  GitFork,
  Play,
  Pause,
  Send,
  Loader2,
  X,
  Music,
  TrendingUp,
  Download,
  Lock,
  Search,
  MoreVertical,
  Edit2,
  EyeOff,
  Eye,
  Trash2,
  Star,
  Sliders
} from 'lucide-react';
import { makeSound, type TrackType } from '@/pages/BeatComposerPage';
import { STEPS, buildPattern, trackEffects, type SavedTrack } from '@/lib/beatPlayback';
import { downloadAudioFile, renderSequencerMp3, saveBlob, safeFileName } from '@/lib/beatDownload';
import { reachGoal } from '@/lib/metrika';
import TrackProgress from '@/components/TrackProgress';

type Beat = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  bpm: number;
  audio_url: string | null;
  cover_url: string | null;
  play_count: number;
  created_at: string;
  is_public?: boolean;
  download_price?: number | null;
  is_free?: boolean;
  description?: string | null;
  download_access?: string | null;
  comment_access?: string | null;
  data?: { tracks?: SavedTrack[]; bpm?: number; genre?: string; bars?: number } | null;
  creator?: {
    username: string;
    avatar_url: string | null;
  } | null;
  description?: string | null;
  download_access?: string | null;
  comment_access?: string | null;
  price_gem?: number | null;
  price_coin?: number | null;
  is_hot?: boolean | null;
};

type BeatComment = {
  id: string;
  beat_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
};

type VoiceComment = {
  id: string;
  beat_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  audio_url: string;
  duration: number;
  created_at: string;
};

const PAGE_SIZE = 5;

export default function BeatsFeedPage({ setPage, onNavigateToMessages }: { setPage: (p: Page) => void; onNavigateToMessages?: (userId: string) => void }) {
  const { profile, isGuest, addCoins, addXp, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [beats, setBeats] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPageNum] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [likedBeats, setLikedBeats] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsByBeat, setCommentsByBeat] = useState<Record<string, BeatComment[]>>({});
  const [voiceCommentsByBeat, setVoiceCommentsByBeat] = useState<Record<string, VoiceComment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [recordingBeatId, setRecordingBeatId] = useState<string | null>(null);
  const [recordSecs, setRecordSecs] = useState(0);
  const [supportMsg, setSupportMsg] = useState<Record<string, string>>({});
  const [supportOpenFor, setSupportOpenFor] = useState<string | null>(null);
  const [supportAmount, setSupportAmount] = useState(100);
  const [supportCurrency, setSupportCurrency] = useState<'coin' | 'gem'>('coin');
  const [showRemixFor, setShowRemixFor] = useState<string | null>(null);
  const [remixTitle, setRemixTitle] = useState('');
  const [remixUrl, setRemixUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [ownedBeats, setOwnedBeats] = useState<Set<string>>(new Set());
  const [buyingBeatId, setBuyingBeatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'likes' | 'comments'>('date');
  const [menuOpenBeatId, setMenuOpenBeatId] = useState<string | null>(null);
  const [renamingBeat, setRenamingBeat] = useState<Beat | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Playback progress + looping
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [seqPos, setSeqPos] = useState(0);
  const [seqTotal, setSeqTotal] = useState(0);
  const [loopOn, setLoopOn] = useState(false);
  const loopOnRef = useRef(false);
  useEffect(() => {
    loopOnRef.current = loopOn;
    if (audioElRef.current) audioElRef.current.loop = loopOn;
  }, [loopOn]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const playingPatternRef = useRef<{ pattern: (TrackType | false)[][]; bpm: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recorderStartRef = useRef<number>(0);

  const [editingBeat, setEditingBeat] = useState<Beat | null>(null);
  const [editForm, setEditForm] = useState({ description: '', download_access: 'premium', comment_access: 'all', price_gem: 100, price_coin: 1000, is_hot: false });

  const saveBeatSettings = async () => {
    if (!editingBeat || !profile) return;
    const { error } = await supabase.from('beats').update({
      description: editForm.description.trim() || null,
      download_access: editForm.download_access,
      comment_access: editForm.comment_access,
      price_gem: editForm.download_access === 'paid' ? editForm.price_gem : 0,
      price_coin: editForm.download_access === 'paid' ? editForm.price_coin : 0,
      is_hot: profile.is_premium ? editForm.is_hot : false,
  }).eq('id', editingBeat.id).eq('user_id', profile.id);
    if (!error) {
      setBeats(prev => prev.map(b => b.id === editingBeat.id ? { ...b, ...editForm } : b));
      setEditingBeat(null);
      setStatus(t('Настройки обновлены')); setTimeout(() => setStatus(null), 2000);
    }
  };

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    setPlayingId(null);
    setAudioProgress(0);
    setAudioDuration(0);
    setSeqPos(0);
    setSeqTotal(0);
    stepRef.current = 0;
    playingPatternRef.current = null;
  }, []);

  const playBeat = useCallback(async (beat: Beat) => {
    if (playingId === beat.id) {
      stopPlayback();
      return;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
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
      setPlayingId(beat.id);
      audio.play().catch(stopPlayback);
    } else {
      const ctx = getCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const savedTracks = beat.data?.tracks;
      const effectiveBpm = beat.data?.bpm || beat.bpm || 120;
      const bars = beat.data?.bars || 1;
      const totalSteps = STEPS * bars;

      if (savedTracks && savedTracks.length > 0) {
        const audibleTracks = savedTracks.filter((tr) => !tr.muted);
        stepRef.current = 0;
        setSeqPos(0);
        setSeqTotal(totalSteps);
        setPlayingId(beat.id);

        const stepDuration = 60000 / effectiveBpm / 4;
        const tick = () => {
          const step = stepRef.current;
          const time = ctx.currentTime;
          audibleTracks.forEach((track) => {
            if (track.steps[step]) {
              const note = typeof track.steps[step] === 'number' ? (track.steps[step] as number) : undefined;
              makeSound(ctx, null, track.type, time, track.volume * 0.7, trackEffects(track), effectiveBpm, step, note);
            }
          });
          setSeqPos(step);
          const next = step + 1;
          if (next >= totalSteps) {
            if (loopOnRef.current) {
              stepRef.current = 0;
            } else {
              stopPlayback();
              return;
            }
          } else {
            stepRef.current = next;
          }
        };
        tick();
        intervalRef.current = window.setInterval(tick, stepDuration);
        // монетизация: начислить автору через 30 секунд прослушивания
        if (profile && !isGuest) {
          const trackTotalSec = totalSteps * (60 / effectiveBpm / 4);
          window.setTimeout(() => {
            if (playingId === beat.id) {
              supabase.rpc('record_beat_listen_and_reward', {
                p_beat_id: beat.id,
                p_track_duration_sec: trackTotalSec,
                p_listened_sec: 30, // Фиксируем 30 сек как факт прослушивания
              }).then(({ error }) => error && console.error('reward rpc', error));
            }
          }, 30000);
        }
      } else {
        const pattern = buildPattern(beat.genre);
        stepRef.current = 0;
        setSeqPos(0);
        setSeqTotal(16);
        setPlayingId(beat.id);

        const stepDuration = 60000 / (beat.bpm || 120) / 4;
        const tick = () => {
          const step = stepRef.current;
          const time = ctx.currentTime;
          pattern.forEach((track) => {
            const hit = track[step];
            if (typeof hit === 'string') {
              makeSound(ctx, null, hit as TrackType, time, 0.5, trackEffects(), beat.bpm || 120);
            }
          });
          setSeqPos(step);
          const next = step + 1;
          if (next >= 16) {
            if (loopOnRef.current) {
              stepRef.current = 0;
            } else {
              stopPlayback();
              return;
            }
          } else {
            stepRef.current = next;
          }
        };
        tick();
        intervalRef.current = window.setInterval(tick, stepDuration);
      }
    }

    supabase
      .from('beats')
      .update({ play_count: (beat.play_count || 0) + 1 })
      .eq('id', beat.id)
      .then(() => {
        setBeats((prev) =>
          prev.map((b) => (b.id === beat.id ? { ...b, play_count: (b.play_count || 0) + 1 } : b))
        );
      });
    addXp(2);
  }, [playingId, getCtx, stopPlayback, addXp]);

  useEffect(() => {
    if (!profile || isGuest) return;
    (async () => {
      const { data } = await supabase
        .from('beat_purchases')
        .select('beat_id')
        .eq('buyer_id', profile.id);
      if (data) setOwnedBeats(new Set(data.map((r: { beat_id: string }) => r.beat_id)));
    })();
  }, [profile, isGuest]);

  const handleBuyBeat = async (beat: Beat) => {
    if (!profile || isGuest) return;
    setBuyingBeatId(beat.id);
    const { error } = await supabase.rpc('purchase_beat', { p_beat_id: beat.id });
    if (error) {
      setStatus(t('Не удалось купить бит: проверьте баланс и доступность трека'));
      setBuyingBeatId(null);
      return;
    }
    await refreshProfile();
    setOwnedBeats((prev) => new Set(prev).add(beat.id));
    setBuyingBeatId(null);
    setStatus(t('Бит куплен! Теперь доступен для скачивания') + ': ' + beat.title);
    setTimeout(() => setStatus(null), 3000);
  };

  const fetchBeats = useCallback(async (pageNum: number): Promise<Beat[]> => {
    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('beats')
      .select('id, user_id, title, genre, bpm, audio_url, cover_url, play_count, created_at, data, is_public, description, download_access, comment_access, price_gem, price_coin, is_hot')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) {
      console.error('fetchBeats error', error);
      return [];
    }

    const fetchedBeats = (data || []) as unknown as Beat[];
    const userIds = [...new Set(fetchedBeats.map((beat) => beat.user_id))];
    if (userIds.length === 0) return fetchedBeats;

    const { data: creators, error: creatorsError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);
    if (creatorsError) {
      console.error('fetch beat creators error', creatorsError);
      return fetchedBeats;
    }

    const creatorMap = new Map((creators || []).map((creator) => [creator.id, creator]));
    return fetchedBeats.map((beat) => ({ ...beat, creator: creatorMap.get(beat.user_id) }));
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const next = page + 1;
    const newBeats = await fetchBeats(next);
    if (newBeats.length === 0) {
      setHasMore(false);
    } else {
      setBeats((prev) => [...prev, ...newBeats]);
      setPageNum(next);
    }
    setLoading(false);
  }, [loading, hasMore, page, fetchBeats]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const initial = await fetchBeats(0);
      if (active) {
        setBeats(initial);
        setPageNum(0);
        setHasMore(initial.length === PAGE_SIZE);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchBeats]);

  useEffect(() => {
    if (!profile || beats.length === 0) return;
    const beatIds = beats.map((b) => b.id);
    (async () => {
      const { data: myLikes } = await supabase
        .from('beat_likes')
        .select('beat_id')
        .eq('user_id', profile.id)
        .in('beat_id', beatIds);
      if (myLikes) {
        setLikedBeats((prev) => {
          const next = new Set(prev);
          myLikes.forEach((l) => next.add(l.beat_id));
          return next;
        });
      }
      const { data: counts } = await supabase
        .from('beat_likes')
        .select('beat_id')
        .in('beat_id', beatIds);
      if (counts) {
        const map: Record<string, number> = {};
        counts.forEach((c) => {
          map[c.beat_id] = (map[c.beat_id] || 0) + 1;
        });
        setLikeCounts((prev) => ({ ...prev, ...map }));
      }
      const { data: cc } = await supabase
        .from('beat_comments')
        .select('beat_id')
        .in('beat_id', beatIds);
      if (cc) {
        const ccMap: Record<string, number> = {};
        cc.forEach((c) => {
          ccMap[c.beat_id] = (ccMap[c.beat_id] || 0) + 1;
        });
        setCommentCounts((prev) => ({ ...prev, ...ccMap }));
      }
    })();
  }, [profile, beats]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  useEffect(() => {
    const handleClick = () => setMenuOpenBeatId(null);
    if (menuOpenBeatId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenBeatId]);

  const toggleLike = async (beat: Beat) => {
    if (!profile || isGuest) return;
    const isLiked = likedBeats.has(beat.id);
    if (isLiked) {
      const { error } = await supabase.from('beat_likes').delete().eq('beat_id', beat.id).eq('user_id', profile.id);
      if (error) return;
      setLikedBeats((prev) => {
        const next = new Set(prev);
        next.delete(beat.id);
        return next;
      });
      setLikeCounts((prev) => ({ ...prev, [beat.id]: Math.max(0, (prev[beat.id] || 0) - 1) }));
    } else {
      const { error } = await supabase.from('beat_likes').insert({ beat_id: beat.id, user_id: profile.id });
      if (error) return;
      setLikedBeats((prev) => new Set(prev).add(beat.id));
      setLikeCounts((prev) => ({ ...prev, [beat.id]: (prev[beat.id] || 0) + 1 }));
      addXp(1);
    }
  };

  const toggleComments = async (beatId: string) => {
    if (expandedComments.has(beatId)) {
      setExpandedComments((prev) => {
        const next = new Set(prev);
        next.delete(beatId);
        return next;
      });
      return;
    }
    setExpandedComments((prev) => new Set(prev).add(beatId));
    const [textRes, voiceRes] = await Promise.all([
      supabase
        .from('beat_comments')
        .select('*')
        .eq('beat_id', beatId)
        .order('created_at', { ascending: false }),
      supabase
        .from('voice_comments')
        .select('*')
        .eq('beat_id', beatId)
        .order('created_at', { ascending: false }),
    ]);
    if (textRes.data) setCommentsByBeat((prev) => ({ ...prev, [beatId]: textRes.data as BeatComment[] }));
    if (voiceRes.data) setVoiceCommentsByBeat((prev) => ({ ...prev, [beatId]: voiceRes.data as VoiceComment[] }));
  };

  const submitComment = async (beatId: string) => {
    if (!profile || isGuest) return;
    const content = (commentInputs[beatId] || '').trim();
    if (!content) return;
    const beat = beats.find((b) => b.id === beatId);
    if (beat && profile?.id !== beat.user_id) {
      if (beat.comment_access === 'nobody' || (beat.comment_access === 'premium' && profile?.is_premium !== true)) {
        setStatus(t('Автор ограничил комментарии к этому биту'));
        return;
      }
    }
    const { data, error } = await supabase
      .from('beat_comments')
      .insert({
        beat_id: beatId,
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        content,
      })
      .select('*')
      .maybeSingle();
    if (error) {
      setStatus(t('Ошибка при отправке комментария'));
      return;
    }
    if (data) {
      setCommentsByBeat((prev) => ({
        ...prev,
        [beatId]: [data as BeatComment, ...(prev[beatId] || [])],
      }));
      setCommentCounts((prev) => ({ ...prev, [beatId]: (prev[beatId] || 0) + 1 }));
    }
    setCommentInputs((prev) => ({ ...prev, [beatId]: '' }));
    addXp(2);
  };

  const startRecording = async (beatId: string) => {
    if (!profile || isGuest) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const finalDuration = recordTimerRef.current ? Math.max(1, Math.round((Date.now() - recorderStartRef.current) / 1000)) : recordSecs;
        const fileName = `voice_${profile.id}_${Date.now()}.webm`;
        const { error: upErr } = await supabase.storage
          .from('voice-comments')
          .upload(fileName, blob, { contentType: 'audio/webm' });
        if (upErr) {
          setStatus(t('Ошибка загрузки голосового комментария'));
          return;
        }
        const { data: pub } = supabase.storage.from('voice-comments').getPublicUrl(fileName);
        const { error: insErr } = await supabase.from('voice_comments').insert({
          beat_id: beatId,
          user_id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url,
          audio_url: pub.publicUrl,
          duration: finalDuration,
        });
        if (insErr) {
          setStatus(t('Ошибка сохранения голосового комментария'));
          return;
        }
        const { data: vc } = await supabase
          .from('voice_comments')
          .select('*')
          .eq('beat_id', beatId)
          .order('created_at', { ascending: false });
        if (vc) setVoiceCommentsByBeat((prev) => ({ ...prev, [beatId]: vc as VoiceComment[] }));
        addXp(5);
        setStatus(t('Голосовой комментарий добавлен'));
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      recorderStartRef.current = Date.now();
      setRecordingBeatId(beatId);
      setRecordSecs(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSecs((s) => s + 1);
      }, 1000);
    } catch {
      setStatus(t('Нет доступа к микрофону'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setRecordingBeatId(null);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

    const support = async (beat: Beat) => {
    if (!profile || isGuest) return;
    if (isOwnBeat(beat)) return; // ← было if (isOwnBeat) — вечный return

    const amount = supportAmount;
    const currency = supportCurrency;
    const currentBalance = currency === 'gem' ? (profile.donate_coins ?? 0) : (profile.coins ?? 0);
    if (currentBalance < amount) {
      setStatus(t(`Недостаточно ${currency === 'gem' ? 'Gem' : 'монет'}`));
      return;
    }

    if (amount < 10 || amount > 10000) {
      setStatus(t('Сумма поддержки — от 10 до 10000'));
      return;
    }

    const msg = (supportMsg[beat.id] || '').trim();
    const { data, error } = await supabase.rpc('support_beat_author', {
      p_beat_id: beat.id,
      p_amount: amount,
      p_currency: currency,
      p_message: msg,
    });

    if (error || !data?.ok) {
      const reason = data?.reason;
      setStatus(t(
        reason === 'insufficient' ? 'Недостаточно средств'
        : reason === 'self' ? 'Нельзя поддержать свой бит'
        : reason === 'invalid_amount' ? 'Сумма поддержки — от 10 до 10000'
        : reason === 'no_beat' ? 'Бит не найден'
        : 'Ошибка при поддержке'
      ));
      return;
    }

    await refreshProfile();
    setSupportOpenFor(null);
    setSupportAmount(100);
    setSupportCurrency('coin');
    setSupportMsg((prev) => ({ ...prev, [beat.id]: '' }));
    setStatus(t(`Отправлено ${amount} ${currency === 'gem' ? 'Gem' : 'монет'} · автор получит ${data.creator_received}`));
    setTimeout(() => setStatus(null), 3000);
  };

  const renameBeat = async (beat: Beat) => {
    if (!profile || !renameValue.trim()) return;
    const { error } = await supabase.from('beats').update({ title: renameValue.trim() }).eq('id', beat.id).eq('user_id', profile.id);
    if (!error) {
      setBeats((prev) => prev.map((b) => (b.id === beat.id ? { ...b, title: renameValue.trim() } : b)));
      setStatus(t('Трек переименован'));
      setTimeout(() => setStatus(null), 2000);
    }
    setRenamingBeat(null);
    setRenameValue('');
  };

  const toggleBeatPublic = async (beat: Beat) => {
    if (!profile) return;
    const newPublic = !(beat.is_public !== false);
    const { error } = await supabase.from('beats').update({ is_public: newPublic }).eq('id', beat.id).eq('user_id', profile.id);
    if (!error) {
      setBeats((prev) => prev.map((b) => (b.id === beat.id ? { ...b, is_public: newPublic } : b)));
      setMenuOpenBeatId(null);
    }
  };

  const deleteBeat = async (beat: Beat) => {
    if (!profile) return;
    if (!confirm(t('Удалить трек навсегда?'))) return;
    const { error } = await supabase.from('beats').delete().eq('id', beat.id).eq('user_id', profile.id);
    if (!error) {
      setBeats((prev) => prev.filter((b) => b.id !== beat.id));
      setMenuOpenBeatId(null);
      setStatus(t('Трек удалён'));
      setTimeout(() => setStatus(null), 2000);
    }
  };

  const downloadBeat = async (beat: Beat) => {
    setMenuOpenBeatId(null);
    const isOwner = profile?.id === beat.user_id;
    const owned = ownedBeats.has(beat.id);
    const isPaid = (beat.price_gem ?? 0) > 0;
    if (!isOwner && !owned) {
      if (beat.download_access === 'nobody') { setStatus(t('Автор запретил     скачивание')); setTimeout(() => setStatus(null), 3000); return; }
      if (isPaid) { setStatus(t('Сначала купите этот бит')); setTimeout(()     => setStatus(null), 3000); return; }
      if (profile?.is_premium !== true) { setStatus(t('Скачивание — только для Premium')); setTimeout(() => setStatus(null), 3000); return; }
    }

    const tracks = beat.data?.tracks;
    try {
      if (beat.audio_url) {
        setStatus(t('Скачивание аудиофайла...'));
        await downloadAudioFile(beat.audio_url, beat.title);
        reachGoal('beat_download');
        setStatus(null);
      } else if (tracks && tracks.length > 0) {
        setStatus(t('Рендеринг бита в MP3 (это может занять несколько секунд)...'));
        const mp3 = await renderSequencerMp3(tracks, beat.data?.bpm ||             beat.bpm || 120, beat.data?.bars || 1);
        saveBlob(mp3, `${safeFileName(beat.title)}.mp3`);
        reachGoal('beat_download');
        setStatus(t('Скачивание началось!'));
        setTimeout(() => setStatus(null), 2500);
      } else {
        setStatus(t('Этот бит не имеет данных для скачивания'));
        setTimeout(() => setStatus(null), 2500);
      }
    } catch (err) {
      console.error('❌ Ошибка скачивания бита:', err); // <-- ЭТО ПОКАЖЕТ ТОЧНУЮ ПРИЧИНУ В КОНСОЛИ
      setStatus(t('Не удалось скачать бит.'));
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const coverFor = (b: Beat) => b.cover_url || '/cover-igotu.webp';

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const playingBeat = useMemo(() => beats.find((b) => b.id === playingId) || null, [beats, playingId]);

  const isOwnBeat = (beat: Beat) => profile?.id === beat.user_id;

  const filteredBeats = useMemo(() => {
    let result = [...beats];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.creator?.username || '').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'likes') {
      result.sort((a, b) => (likeCounts[b.id] || 0) - (likeCounts[a.id] || 0));
    } else if (sortBy === 'comments') {
      result.sort((a, b) => (commentCounts[b.id] || 0) - (commentCounts[a.id] || 0));
    }
    return result;
  }, [beats, searchQuery, sortBy, likeCounts, commentCounts]);

  //const isOwnBeat = (beat: Beat) => profile?.id === beat.user_id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <Music className="w-6 h-6 text-theme-primary" />
            {t('Лента битов')}
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            {t('Свежие биты от сообщества — слушай, комментируй, поддерживай')}
          </p>
        </div>
        <button
          onClick={() => setPage('beat')}
          className="px-4 py-2 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors flex items-center gap-2"
        >
          <TrendingUp className="w-4 h-4" /> {t('Создать бит')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('Поиск по названию или автору...')}
            className="w-full pl-10 pr-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {(['date', 'likes', 'comments'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                sortBy === s
                  ? 'bg-theme-primary text-white'
                  : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
              }`}
            >
              {s === 'date' ? t('По дате') : s === 'likes' ? t('По лайкам') : t('По комментариям')}
            </button>
          ))}
        </div>
      </div>

      {status && (
        <div className="px-4 py-2 rounded-lg bg-theme-primary-bg border border-theme-primary-border text-theme-primary-text text-sm">
          {status}
        </div>
      )}

      {beats.length === 0 && !loading && (
        <div className="empty-state spacious glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl text-center">
          <div className="empty-icon"><Music className="w-10 h-10" /></div>
          <p className="empty-title">{t('Пока нет битов. Будь первым!')}</p>
          <p className="empty-text">{t('Создай первый бит в секвенсоре — он появится здесь и в Горящих треках.')}</p>
        </div>
      )}

      {beats.length > 0 && filteredBeats.length === 0 && (
        <div className="empty-state spacious glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl text-center">
          <div className="empty-icon"><Search className="w-10 h-10" /></div>
          <p className="empty-title">{t('Ничего не найдено по запросу')}</p>
          <p className="empty-text">{t('Попробуйте другое название или имя автора.')}</p>
        </div>
      )}

      <div className="space-y-4">
        {filteredBeats.map((beat) => {
          const isLiked = likedBeats.has(beat.id);
          const likeCount = likeCounts[beat.id] || 0;
          const cCount = commentCounts[beat.id] || 0;
          const commentsOpen = expandedComments.has(beat.id);
          const comments = commentsByBeat[beat.id] || [];
          const voiceComments = voiceCommentsByBeat[beat.id] || [];
          const isPlaying = playingId === beat.id;
          const ownBeat = isOwnBeat(beat);
          const isPaid = (beat.price_gem ?? 0) > 0;
          
          return (
            <div
              key={beat.id}
              className="glass-surface bg-theme-surface/60 border border-theme-border rounded-2xl overflow-hidden"
            >
              <div className="flex gap-4 p-4">
                {/* Cover + play */}
                <div className="relative w-28 h-28 rounded-xl overflow-hidden shrink-0 bg-theme-surface2">
                  <img src={coverFor(beat)} alt={beat.title} className="w-full h-full object-cover" />
                  <button
                    onClick={() => playBeat(beat)}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  >
                    {isPlaying ? (
                      <Pause className="w-8 h-8 text-white" />
                    ) : (
                      <Play className="w-8 h-8 text-white" fill="white" />
                    )}
                  </button>
                  {isPlaying && (
                    <div className="absolute bottom-2 right-2 flex gap-0.5 items-end h-4">
                      <div className="w-1 bg-theme-primary rounded-full animate-pulse" style={{ height: '60%' }} />
                      <div className="w-1 bg-theme-primary rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0.1s' }} />
                      <div className="w-1 bg-theme-primary rounded-full animate-pulse" style={{ height: '40%', animationDelay: '0.2s' }} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-theme-text font-semibold break-words leading-snug" title={beat.title}>{beat.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {beat.creator?.avatar_url ? (
                          <img src={beat.creator.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-theme-primary/20 flex items-center justify-center text-theme-primary text-[10px] font-bold">
                            {beat.creator?.username?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <a href={`/profile/${beat.user_id}`} className="text-xs text-theme-muted truncate hover:text-theme-primary">{beat.creator?.username || t('Аноним')}</a>
                        {beat.is_public === false && (
                          <span className="text-[10px] text-theme-warning flex items-center gap-0.5"><Lock className="w-3 h-3" /> {t('Приватный')}</span>
                        )}
                      </div>
                      {beat.description && (
                        <p className="text-xs text-theme-muted mt-1.5 break-words line-clamp-2">{beat.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-2 text-xs text-theme-muted">
                        <span className="px-2 py-0.5 rounded-md bg-theme-surface2">{t(beat.genre)}</span>
                        <span className="font-mono">{beat.bpm} BPM</span>
                        <span>· {beat.play_count || 0} ▶</span>
                      </div>
                      {/* 3-dot menu for own beats */}
                      {ownBeat && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenBeatId(menuOpenBeatId === beat.id ? null : beat.id);
                            }}
                            className="p-1.5 text-theme-muted hover:text-theme-text rounded-lg hover:bg-theme-surface2 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {menuOpenBeatId === beat.id && (
                            <div
                              className="absolute right-0 top-full mt-1 z-30 w-48 bg-theme-surface border border-theme-border rounded-xl shadow-xl py-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => { setRenamingBeat(beat); setRenameValue(beat.title); setMenuOpenBeatId(null); }}
                                className="w-full px-3 py-2 text-left text-sm text-theme-text hover:bg-theme-surface2 flex items-center gap-2"
                              >
                                <Edit2 className="w-4 h-4" /> {t('Переименовать')}
                              </button>
                              <div className="border-t border-theme-border my-1" />
                              <button onClick={() => deleteBeat(beat)} className="w-full px-3 py-2 text-left text-sm text-theme-danger hover:bg-theme-danger/10 flex items-center gap-2">
                                <Trash2 className="w-4 h-4" /> {t('Удалить')}
                              </button>
                              <button
                              onClick={() => toggleBeatPublic(beat)}
                              className="w-full px-3 py-2 text-left text-sm text-theme-text hover:bg-theme-surface2 flex items-center gap-2"
                              >
                                {beat.is_public !== false ? <><EyeOff className="w-4 h-4" /> {t('Сделать приватным')}</> : <><Eye className="w-4 h-4" /> {t('Сделать публичным')}</>}
                              </button>
                              <button
                                onClick={() => downloadBeat(beat)}
                                className="w-full px-3 py-2 text-left text-sm text-theme-text hover:bg-theme-surface2 flex items-center gap-2">
                                <Download className="w-4 h-4" /> {t('Скачать')}
                              </button>
                              <button onClick={() => { setEditingBeat(beat); setEditForm({ description: beat.description || '', download_access: beat.download_access || 'premium', comment_access: beat.comment_access || 'all', price_gem: beat.price_gem || 100, price_coin: beat.price_coin || 1000, is_hot: beat.is_hot || false }); setMenuOpenBeatId(null); }} className="w-full px-3 py-2 text-left text-sm text-theme-text hover:bg-theme-surface2 flex items-center gap-2"><Sliders className="w-4 h-4" /> {t('Настройки доступа')}</button>
                              <div className="border-t border-theme-border my-1" />
                              <button
                                onClick={() => deleteBeat(beat)}
                                className="w-full px-3 py-2 text-left text-sm text-theme-danger hover:bg-theme-danger/10 flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" /> {t('Удалить')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      onClick={() => toggleLike(beat)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isLiked
                          ? 'bg-theme-danger/15 text-theme-danger'
                          : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
                      }`}
                    >
                      <Heart className="w-4 h-4" fill={isLiked ? 'currentColor' : 'none'} />
                      {likeCount}
                    </button>
                    <button
                      onClick={() => toggleComments(beat.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-surface2 text-theme-muted hover:text-theme-text transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {cCount}
                    </button>
                    {!ownBeat && (
                    <button
                      onClick={() => setSupportOpenFor(beat.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-surface2 text-theme-muted hover:text-theme-warning transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
>
                      <Gem className="w-4 h-4" /> {t('Поддержать')}
                    </button>
                    )}
                    {isPaid ? (
                      ownedBeats.has(beat.id) ? (
                      <button onClick={() => downloadBeat(beat)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-success/15 text-theme-success hover:opacity-80">
                          <Download className="w-4 h-4" /> {t('Скачать')}
                        </button>
                      ) : (
                        <button onClick={() => handleBuyBeat(beat)} disabled={buyingBeatId === beat.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-warning/15 text-theme-warning hover:opacity-80 disabled:opacity-50">
                          {buyingBeatId === beat.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                          {t('Купить за')} {beat.price_gem} Gem
                        </button>
                      )
                    ) : beat.download_access !== 'nobody' ? (
                      <button onClick={() => downloadBeat(beat)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-success/15 text-theme-success hover:opacity-80 transition-opacity">
                        <Download className="w-4 h-4" /> {t('Скачать')}
                      </button>
                    ) : null}
                    {isPlaying && (
                      <div className="w-full">
                        <TrackProgress
                          progress={
                            beat.audio_url
                              ? audioDuration > 0
                                ? audioProgress / audioDuration
                                : 0
                              : seqTotal > 0
                              ? seqPos / seqTotal
                              : 0
                          }
                          onSeek={(ratio) => {
                            if (beat.audio_url) {
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
                          onToggleLoop={() => setLoopOn((v) => !v)}
                          timeLabel={
                            beat.audio_url
                              ? `${formatTime(audioProgress)} / ${formatTime(audioDuration)}`
                              : `${seqPos + 1}/${seqTotal}`
                          }
                        />
                        <button
                          onClick={stopPlayback}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-danger text-white transition-colors"
                        >
                          <Pause className="w-4 h-4" /> {t('Стоп')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Support message input */}
                  {!ownBeat && (
                    <input
                      value={supportMsg[beat.id] || ''}
                      onChange={(e) => setSupportMsg((prev) => ({ ...prev, [beat.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') support(beat); }}
                      placeholder={t('Сообщение автору...')}
                      className="mt-2 w-full px-3 py-1.5 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-xs focus:outline-none focus:border-theme-primary"
                    />
                  )}
                </div>
              </div>

              {/* Recording controls */}
              {recordingBeatId === beat.id && (
                <div className="px-4 pb-3 flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-theme-danger">
                    <span className="w-2 h-2 rounded-full bg-theme-danger animate-pulse" />
                    {t('Запись...')} {formatTime(recordSecs)}
                  </div>
                  <button
                    onClick={stopRecording}
                    className="px-3 py-1.5 bg-theme-danger text-white rounded-lg text-xs font-medium"
                  >
                    {t('Остановить')}
                  </button>
                </div>
              )}

              {/* Comments */}
              {commentsOpen && (
                <div className="px-4 pb-4 border-t border-theme-border pt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={commentInputs[beat.id] || ''}
                      onChange={(e) => setCommentInputs((prev) => ({ ...prev, [beat.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitComment(beat.id);
                      }}
                      placeholder={t('Написать комментарий...')}
                      className="flex-1 px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
                    />
                    <button
                      onClick={() => submitComment(beat.id)}
                      className="p-2 bg-theme-primary text-white rounded-lg hover:bg-theme-primary-hover transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>

                  {comments.length > 0 ? (
                    <div className="space-y-2">
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-2 p-2 bg-theme-surface2 rounded-lg">
                          {c.avatar_url ? (
                            <img src={c.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-theme-primary/20 flex items-center justify-center text-theme-primary text-[10px] font-bold shrink-0">
                              {c.username?.[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs text-theme-muted">{c.username}</p>
                            <p className="text-sm text-theme-text break-words">{c.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-theme-muted">{t('Нет комментариев. Будь первым!')}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-10 flex items-center justify-center">
        {loading && <Loader2 className="w-5 h-5 text-theme-muted animate-spin" />}
        {!hasMore && beats.length > 0 && (
          <p className="text-xs text-theme-muted">{t('Это все биты на сегодня')}</p>
        )}
      </div>

      {/* Rename modal */}
      {renamingBeat && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { setRenamingBeat(null); setRenameValue(''); }}
        >
          <div
            className="glass-surface bg-theme-surface border border-theme-border rounded-2xl p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-theme-text font-semibold flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-theme-primary" /> {t('Переименовать трек')}
              </h3>
              <button onClick={() => { setRenamingBeat(null); setRenameValue(''); }} className="text-theme-muted hover:text-theme-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') renameBeat(renamingBeat); }}
              placeholder={t('Новое название')}
              className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
              autoFocus
            />
            <button
              onClick={() => renameBeat(renamingBeat)}
              disabled={!renameValue.trim()}
              className="w-full px-4 py-2 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors disabled:opacity-50"
            >
              {t('Сохранить')}
            </button>
          </div>
        </div>
      )}
      {editingBeat && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingBeat(null)}>
          <div className="bg-theme-surface border border-theme-border rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-theme-text font-semibold flex items-center gap-2"><Sliders className="w-5 h-5 text-theme-primary" /> {t('Настройки трека')}</h3>
              <button onClick={() => setEditingBeat(null)} className="text-theme-muted hover:text-theme-text"><X className="w-5 h-5" /></button>
            </div>
            <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} placeholder={t('Описание')} className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <select value={editForm.download_access} onChange={(e) => setEditForm({ ...editForm, download_access: e.target.value })} className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm">
                <option value="premium">{t('Скачивание: Premium')}</option>
                <option value="paid">{t('Скачивание: За Gem')}</option>
                <option value="nobody">{t('Скачивание: Никто')}</option>
              </select>
              <select value={editForm.comment_access} onChange={(e) => setEditForm({ ...editForm, comment_access: e.target.value })} className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm">
                <option value="all">{t('Комментарии: Все')}</option>
                <option value="premium">{t('Комментарии: Premium')}</option>
                <option value="nobody">{t('Комментарии: Никто')}</option>
              </select>
            </div>
            {editForm.download_access === 'paid' && (
              <input type="number" min={100} value={editForm.price_gem} onChange={(e) => setEditForm({ ...editForm, price_gem: Math.max(100, Number(e.target.value) || 100) })} className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm" placeholder={t('Цена в Gem (мин. 100)')} />
            )}
            {profile?.is_premium && (
              <label className="flex items-center gap-2 text-sm text-theme-primary">
                <input type="checkbox" checked={editForm.is_hot} onChange={(e) => setEditForm({ ...editForm, is_hot: e.target.checked })} className="accent-theme-primary" /> 🔥 {t('Горячий трек')}
              </label>
            )}
            <button onClick={saveBeatSettings} className="w-full py-2.5 bg-theme-primary text-white rounded-xl text-sm font-semibold">{t('Сохранить')}</button>
          </div>
        </div>
      )}
      {playingBeat && (
        <div className="fixed bottom-4 right-4 z-40 glass-surface bg-theme-surface/90 border border-theme-border rounded-xl px-4 py-2 flex items-center gap-3">
          <Music className="w-4 h-4 text-theme-primary animate-pulse" />
          <span className="text-sm text-theme-text truncate max-w-[160px]">{t('Играет')}: {playingBeat.title}</span>
          <button onClick={stopPlayback} className="text-theme-muted hover:text-theme-danger">
            <Pause className="w-4 h-4" />
          </button>
        </div>
      )}
      {supportOpenFor && (() => {
  const beat = beats.find(b => b.id === supportOpenFor);
  if (!beat) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSupportOpenFor(null)}>
      <div className="bg-theme-surface border border-theme-border rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-theme-text font-semibold flex items-center gap-2">
            <Gem className="w-5 h-5 text-theme-warning" /> {t('Поддержать')} {beat.title}
          </h3>
          <button onClick={() => setSupportOpenFor(null)} className="text-theme-muted hover:text-theme-text"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1.5">{t('Валюта')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSupportCurrency('coin')} className={`py-2 rounded-lg text-sm font-medium ${supportCurrency === 'coin' ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted'}`}>
                🪙 {t('Монеты')} ({profile?.coins ?? 0})
              </button>
              <button onClick={() => setSupportCurrency('gem')} className={`py-2 rounded-lg text-sm font-medium ${supportCurrency === 'gem' ? 'bg-theme-warning text-white' : 'bg-theme-surface2 text-theme-muted'}`}>
                💎 Gem ({profile?.donate_coins ?? 0})
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1.5">{t('Сумма')}</label>
            <input type="number" min={10} max={10000} value={supportAmount} onChange={(e) => setSupportAmount(Math.min(10000, Math.max(10, Number(e.target.value) || 0)))} className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary" />
            <div className="flex gap-2 mt-2">
              {[100, 500, 1000, 5000].map(v => (
                <button key={v} onClick={() => setSupportAmount(v)} className="flex-1 py-1 text-xs bg-theme-surface2 rounded hover:bg-theme-border">{v}</button>
              ))}
            </div>
          </div>

          <textarea value={supportMsg[supportOpenFor] || ''} onChange={(e) => setSupportMsg((prev) => ({ ...prev, [supportOpenFor!]: e.target.value }))} placeholder={t('Сообщение автору (необязательно)')} rows={2} className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary resize-none" />
        </div>

        <button onClick={() => support(beat)} disabled={supportAmount < 10} className="w-full py-2.5 bg-gradient-to-r from-theme-warning to-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
          <Gem className="w-4 h-4" /> {t('Отправить')} {supportAmount} {supportCurrency === 'gem' ? 'Gem' : t('монет')}
        </button>
      </div>
    </div>
  );
})()}
    </div>
  );
}
