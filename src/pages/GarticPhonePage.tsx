import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/context/LocaleContext';
import { Music, Users, Plus, LogOut, Check, Loader2, Send, Drum, Play, Pause, Trash2, Volume2, Repeat, Headphones, Bot, User } from 'lucide-react';

type Room = {
  id: string;
  code: string;
  host_id: string;
  status: string;
  max_players: number;
  current_round: number;
  total_rounds: number;
};

type Player = {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  is_ready: boolean;
};

type Chain = {
  id: string;
  room_id: string;
  chain_index: number;
  current_holder_id: string | null;
  current_step: number;
  completed: boolean;
};

type ChainStep = {
  id: string;
  chain_id: string;
  step_index: number;
  type: 'beat' | 'description';
  content: string;
  author_id: string;
  author_name: string;
};

const STEPS = 16;
const TRACK_TYPES = ['kick', 'snare', 'hihat', 'bass'] as const;
type BeatType = (typeof TRACK_TYPES)[number];

type BeatTrack = { type: BeatType; steps: boolean[]; volume: number };
type BeatPattern = BeatTrack[];

const TRACK_COLORS: Record<BeatType, string> = {
  kick: 'bg-red-500',
  snare: 'bg-orange-500',
  hihat: 'bg-amber-500',
  bass: 'bg-emerald-500',
};

const TRACK_NAMES: Record<BeatType, string> = {
  kick: 'Кик',
  snare: 'Снэйр',
  hihat: 'Хай-хэт',
  bass: 'Бас',
};

function emptyPattern(): BeatPattern {
  return TRACK_TYPES.map((type) => ({
    type,
    steps: Array(STEPS).fill(false),
    volume: 0.7,
  }));
}

function patternToJson(p: BeatPattern): string {
  return JSON.stringify(p);
}

function jsonToPattern(json: string): BeatPattern | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0].steps)) {
      return parsed as BeatPattern;
    }
  } catch { /* invalid */ }
  return null;
}

const GENRE_PATTERNS: Record<string, BeatPattern> = {
  'Хип-Хоп': [
    { type: 'kick', steps: [true,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false], volume: 0.8 },
    { type: 'snare', steps: [false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false], volume: 0.7 },
    { type: 'hihat', steps: [true,false,true,false,true,false,true,false,true,false,true,false,true,false,true,false], volume: 0.5 },
    { type: 'bass', steps: [true,false,false,true,false,false,true,false,true,false,false,true,false,false,true,false], volume: 0.7 },
  ],
  'Трэп': [
    { type: 'kick', steps: [true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,false], volume: 0.8 },
    { type: 'snare', steps: [false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false], volume: 0.7 },
    { type: 'hihat', steps: [true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true], volume: 0.5 },
    { type: 'bass', steps: [false,false,true,false,false,false,true,false,false,false,true,false,false,false,true,false], volume: 0.7 },
  ],
  'House': [
    { type: 'kick', steps: [true,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false], volume: 0.8 },
    { type: 'snare', steps: [false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false], volume: 0.7 },
    { type: 'hihat', steps: [false,false,true,false,false,false,true,false,false,false,true,false,false,false,true,false], volume: 0.5 },
    { type: 'bass', steps: [true,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false], volume: 0.7 },
  ],
};

function playBeatSound(ctx: AudioContext, type: BeatType, time: number, volume: number) {
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.value = volume;

  if (type === 'kick') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.08);
    const kickGain = ctx.createGain();
    kickGain.gain.setValueAtTime(volume, time);
    kickGain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    osc.connect(kickGain);
    kickGain.connect(gain);
    osc.start(time);
    osc.stop(time + 0.5);
  } else if (type === 'snare') {
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, 4410, 44100);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < 4410; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(volume * 0.7, time);
    sGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    noise.connect(filter);
    filter.connect(sGain);
    sGain.connect(gain);
    noise.start(time);
    noise.stop(time + 0.2);
  } else if (type === 'hihat') {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(10000, time);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 10000;
    const hGain = ctx.createGain();
    hGain.gain.setValueAtTime(volume * 0.3, time);
    hGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    osc.connect(filter);
    filter.connect(hGain);
    hGain.connect(gain);
    osc.start(time);
    osc.stop(time + 0.03);
  } else if (type === 'bass') {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 8;
    filter.frequency.setValueAtTime(200, time);
    filter.frequency.exponentialRampToValueAtTime(800, time + 0.1);
    filter.frequency.exponentialRampToValueAtTime(200, time + 0.3);
    filter.connect(gain);
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(80, time);
    osc1.connect(filter);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc1.start(time);
    osc1.stop(time + 0.3);
  }
}

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/* ---- Single-player AI guessing game helpers ---- */

const SP_GENRES = Object.keys(GENRE_PATTERNS);

function pickRandomPattern(): { pattern: BeatPattern; genre: string } {
  const genre = SP_GENRES[Math.floor(Math.random() * SP_GENRES.length)];
  const base = GENRE_PATTERNS[genre];
  // Add slight randomization so it's not identical to presets
  const pattern: BeatPattern = base.map((t) => ({
    ...t,
    steps: t.steps.map((s) => (s && Math.random() < 0.15 ? false : s)),
  }));
  return { pattern, genre };
}

const SP_GENRE_HINTS: Record<string, string[]> = {
  'Хип-Хоп': ['качающий бас', 'классический хип-хоп', 'рваный ритм', 'бочка на каждую долю'],
  'Трэп': ['трэп-хай-хэты', 'быстрые трели', 'глубокий 808 бас', 'южный ритм'],
  'House': ['четыре доли', 'танцевальный хаус', 'ровный бит', 'диско-бас'],
};

export default function GarticPhonePage() {
  const { profile, isGuest } = useAuth();
  const { t } = useLocale();
  const [view, setView] = useState<'lobby' | 'room' | 'play' | 'single'>('lobby');
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const createRoom = async () => {
    if (!profile || isGuest) return;
    setCreating(true);
    setError(null);
    const code = genCode();
    const { data: roomData, error: roomErr } = await supabase
      .from('game_rooms')
      .insert({ code, host_id: profile.id, status: 'waiting' })
      .select()
      .single();
    if (roomErr) { setError(t('Не удалось создать комнату')); setCreating(false); return; }
    await supabase.from('game_room_players').insert({
      room_id: roomData.id,
      user_id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      is_ready: true,
    });
    setRoom(roomData);
    setView('room');
    setCreating(false);
  };

  const joinRoom = async () => {
    if (!profile || isGuest || !joinCode.trim()) return;
    setError(null);
    const { data: roomData, error: roomErr } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('code', joinCode.toUpperCase().trim())
      .single();
    if (roomErr || !roomData) { setError(t('Комната не найдена')); return; }
    if (roomData.status !== 'waiting') { setError(t('Игра уже началась')); return; }
    const { count } = await supabase
      .from('game_room_players')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomData.id);
    if ((count ?? 0) >= roomData.max_players) { setError(t('Комната заполнена')); return; }
    const { data: existing } = await supabase
      .from('game_room_players')
      .select('id')
      .eq('room_id', roomData.id)
      .eq('user_id', profile.id)
      .maybeSingle();
    if (!existing) {
      const { error: playerError } = await supabase.from('game_room_players').insert({
        room_id: roomData.id,
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        is_ready: true,
      });
      if (playerError) { setError(t('Не удалось войти в комнату')); return; }
    }
    setRoom(roomData);
    setView('room');
  };

  const leaveRoom = async () => {
    if (!profile || !room) return;
    await supabase.from('game_room_players').delete().eq('room_id', room.id).eq('user_id', profile.id);
    if (room.host_id === profile.id) {
      const { count } = await supabase
        .from('game_room_players')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', room.id);
      if ((count ?? 0) === 0) {
        await supabase.from('game_rooms').delete().eq('id', room.id);
      }
    }
    setRoom(null);
    setPlayers([]);
    setView('lobby');
    setJoinCode('');
  };

  useEffect(() => {
    if (!room) return;
    const fetchPlayers = async () => {
      const { data } = await supabase
        .from('game_room_players')
        .select('*')
        .eq('room_id', room.id)
        .order('joined_at', { ascending: true });
      if (data) setPlayers(data as Player[]);
    };
    const fetchRoom = async () => {
      const { data } = await supabase.from('game_rooms').select('*').eq('id', room.id).maybeSingle();
      if (data) {
        const updatedRoom = data as Room;
        setRoom(updatedRoom);
        if (updatedRoom.status === 'playing' && view === 'room') setView('play');
      }
    };
    fetchPlayers();
    fetchRoom();
    const refreshTimer = window.setInterval(() => {
      fetchPlayers();
      fetchRoom();
    }, 2000);

    const channel = supabase
      .channel(`room-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_room_players', filter: `room_id=eq.${room.id}` }, fetchPlayers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${room.id}` }, (payload) => {
        if (payload.new) {
          const updatedRoom = payload.new as Room;
          setRoom(updatedRoom);
          if (updatedRoom.status === 'playing' && view === 'room') {
            setView('play');
          }
        }
      })
      .subscribe();

    return () => {
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [room?.id, view]);

  if (view === 'lobby') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <Headphones className="w-6 h-6 text-theme-primary" />
            {t('Gartic Sound')}
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            {t('Музыкальный испорченный телефон: создай бит, опиши чужой, угадай что было в начале')}
          </p>
        </div>

        {isGuest && (
          <div className="glass-surface bg-theme-warning/10 border border-theme-warning/30 rounded-xl p-4 text-sm text-theme-warning">
            {t('Нужен аккаунт для игры. Выйдите из гостевого режима и зарегистрируйтесь.')}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Single player */}
          <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-theme-success/20 flex items-center justify-center mb-4">
              <Bot className="w-6 h-6 text-theme-success" />
            </div>
            <h3 className="text-theme-text font-bold mb-2">{t('Одиночная игра')}</h3>
            <p className="text-theme-muted text-xs mb-4">{t('Играй против ИИ: угадай жанр бита, который сгенерировал компьютер')}</p>
            <button
              onClick={() => setView('single')}
              disabled={isGuest}
              className="w-full py-2.5 bg-theme-success text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <User className="w-4 h-4" />
              {t('Играть одному')}
            </button>
          </div>

          <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-theme-primary/20 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-theme-primary" />
            </div>
            <h3 className="text-theme-text font-bold mb-2">{t('Создать комнату')}</h3>
            <p className="text-theme-muted text-xs mb-4">{t('Создай комнату и поделись кодом с друзьями')}</p>
            <button
              onClick={createRoom}
              disabled={isGuest || creating}
              className="w-full py-2.5 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('Создать')}
            </button>
          </div>

          <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-theme-accent/20 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-theme-accent" />
            </div>
            <h3 className="text-theme-text font-bold mb-2">{t('Присоединиться')}</h3>
            <p className="text-theme-muted text-xs mb-4">{t('Введи код комнаты, чтобы присоединиться')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABC123"
                className="flex-1 px-3 py-2.5 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm font-mono uppercase focus:outline-none focus:border-theme-primary transition-colors text-center tracking-widest"
              />
              <button
                onClick={joinRoom}
                disabled={isGuest || !joinCode.trim()}
                className="px-4 py-2.5 bg-theme-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {t('Войти')}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="glass-surface bg-theme-danger/10 border border-theme-danger/30 rounded-xl p-3 text-sm text-theme-danger text-center">
            {error}
          </div>
        )}

        <div className="glass-surface bg-theme-surface/30 border border-theme-border rounded-xl p-4">
          <h3 className="text-theme-text text-sm font-bold mb-2">{t('Как играть')}</h3>
          <ol className="space-y-1.5 text-xs text-theme-muted">
            <li>1. {t('Создай комнату или присоединись по коду')}</li>
            <li>2. {t('Хост нажимает «Начать игру»')}</li>
            <li>3. {t('Создай бит в секвенсоре — следующий игрок будет его слушать')}</li>
            <li>4. {t('Послушай бит и опиши его словами — следующий создаст новый бит по описанию')}</li>
            <li>5. {t('В конце смотрим все цепочки: как бит менялся от игрока к игроку')}</li>
          </ol>
        </div>
      </div>
    );
  }

  if (view === 'room' && room) {
    const isHost = profile?.id === room.host_id;
    const canStart = players.length >= 2 && players.every((p) => p.is_ready);

    const startGame = async () => {
      if (!room || !profile) return;
      const chains: { room_id: string; chain_index: number; current_holder_id: string; current_step: number }[] = [];
      for (let i = 0; i < players.length; i++) {
        const nextPlayer = players[(i + 1) % players.length];
        chains.push({
          room_id: room.id,
          chain_index: i,
          current_holder_id: nextPlayer.user_id,
          current_step: 0,
        });
      }
      setError(null);
      const { error: chainsError } = await supabase.from('game_chains').insert(chains);
      if (chainsError) { setError(t('Не удалось запустить игру')); return; }
      const { error: roomError } = await supabase.from('game_rooms').update({ status: 'playing' }).eq('id', room.id);
      if (roomError) { setError(t('Не удалось запустить игру')); return; }
      setView('play');
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-theme-text">{t('Комната')} {room.code}</h1>
            <p className="text-theme-muted text-sm mt-1">{t('Игроков')}: {players.length}/{room.max_players}</p>
          </div>
          <button
            onClick={leaveRoom}
            className="flex items-center gap-2 px-4 py-2 bg-theme-surface2 text-theme-muted rounded-lg text-sm hover:text-theme-danger transition-colors"
          >
            <LogOut className="w-4 h-4" /> {t('Выйти')}
          </button>
        </div>

        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-6">
          <h3 className="text-theme-text font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-theme-primary" /> {t('Игроки')}
          </h3>
          <div className="space-y-2">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-theme-surface2/50">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-theme-primary/20 flex items-center justify-center text-xs font-bold text-theme-primary">
                    {p.username[0]?.toUpperCase()}
                  </div>
                )}
                <span className="flex-1 text-theme-text text-sm">{p.username}</span>
                {p.user_id === room.host_id && (
                  <span className="text-xs px-2 py-0.5 bg-theme-warning/20 text-theme-warning rounded-full">{t('Хост')}</span>
                )}
                <div className={`w-2 h-2 rounded-full ${p.is_ready ? 'bg-theme-success' : 'bg-theme-muted'}`} />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4 text-center">
          <p className="text-theme-muted text-sm mb-3">
            {t('Поделись кодом')} <span className="font-mono font-bold text-theme-primary text-lg tracking-widest">{room.code}</span> {t('с друзьями')}
          </p>
          {isHost ? (
            <button
              onClick={startGame}
              disabled={!canStart}
              className="px-6 py-3 bg-theme-primary text-white rounded-xl text-sm font-bold hover:bg-theme-primary-hover transition-colors disabled:opacity-50"
            >
              {players.length < 2 ? t('Нужно минимум 2 игрока') : canStart ? t('Начать игру') : t('Ждём готовности всех')}
            </button>
          ) : (
            <p className="text-theme-muted text-xs">{t('Ждём, когда хост начнёт игру')}</p>
          )}
        </div>
      </div>
    );
  }

  if (view === 'single') {
    return <SinglePlayerView profile={profile} onLeave={() => setView('lobby')} />;
  }

  return <PlayView room={room} players={players} profile={profile} onLeave={leaveRoom} />;
}

function PlayView({ room, players, profile, onLeave }: { room: Room | null; players: Player[]; profile: any; onLeave: () => void }) {
  const { t } = useLocale();
  const [chains, setChains] = useState<Chain[]>([]);
  const [myChain, setMyChain] = useState<Chain | null>(null);
  const [steps, setSteps] = useState<ChainStep[]>([]);
  const [descText, setDescText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [revealIndex, setRevealIndex] = useState(0);
  const [allChainsData, setAllChainsData] = useState<ChainStep[][]>([]);

  const fetchMyChain = useCallback(async () => {
    if (!room || !profile) return;
    const { data } = await supabase
      .from('game_chains')
      .select('*')
      .eq('room_id', room.id)
      .eq('current_holder_id', profile.id)
      .eq('completed', false)
      .maybeSingle();
    if (data) {
      setMyChain(data as Chain);
      const { data: stepData } = await supabase
        .from('game_chain_steps')
        .select('*')
        .eq('chain_id', data.id)
        .order('step_index', { ascending: true });
      setSteps((stepData || []) as ChainStep[]);
    } else {
      setMyChain(null);
      const { data: allChains } = await supabase
        .from('game_chains')
        .select('*')
        .eq('room_id', room.id);
      if (allChains && allChains.every((c: any) => c.completed)) {
        setGameFinished(true);
        const chainsWithSteps: ChainStep[][] = [];
        for (const c of allChains) {
          const { data: s } = await supabase
            .from('game_chain_steps')
            .select('*')
            .eq('chain_id', c.id)
            .order('step_index', { ascending: true });
          chainsWithSteps.push((s || []) as ChainStep[]);
        }
        setAllChainsData(chainsWithSteps);
      }
    }
  }, [room, profile]);

  useEffect(() => {
    fetchMyChain();
    if (!room) return;
    const channel = supabase
      .channel(`play-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_chains', filter: `room_id=eq.${room.id}` }, fetchMyChain)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room?.id, fetchMyChain]);

  const submitBeat = async (pattern: BeatPattern) => {
    if (!myChain || !profile) return;
    setSubmitting(true);
    const lastStep = steps[steps.length - 1];
    const stepIndex = lastStep ? lastStep.step_index + 1 : 0;
    await supabase.from('game_chain_steps').insert({
      chain_id: myChain.id,
      step_index: stepIndex,
      type: 'beat',
      content: patternToJson(pattern),
      author_id: profile.id,
      author_name: profile.username,
    });
    const nextStep = myChain.current_step + 1;
    const currentHolderIdx = players.findIndex((p) => p.user_id === myChain.current_holder_id);
    const nextHolder = players[(currentHolderIdx + 1) % players.length];
    const isComplete = nextStep >= (room?.total_rounds ?? 4);
    await supabase.from('game_chains').update({
      current_step: nextStep,
      current_holder_id: isComplete ? null : nextHolder.user_id,
      completed: isComplete,
    }).eq('id', myChain.id);
    setSubmitting(false);
    setMyChain(null);
  };

  const submitDescription = async () => {
    if (!myChain || !profile || !descText.trim()) return;
    setSubmitting(true);
    const lastStep = steps[steps.length - 1];
    const stepIndex = lastStep ? lastStep.step_index + 1 : 0;
    await supabase.from('game_chain_steps').insert({
      chain_id: myChain.id,
      step_index: stepIndex,
      type: 'description',
      content: descText.trim(),
      author_id: profile.id,
      author_name: profile.username,
    });
    const nextStep = myChain.current_step + 1;
    const currentHolderIdx = players.findIndex((p) => p.user_id === myChain.current_holder_id);
    const nextHolder = players[(currentHolderIdx + 1) % players.length];
    const isComplete = nextStep >= (room?.total_rounds ?? 4);
    await supabase.from('game_chains').update({
      current_step: nextStep,
      current_holder_id: isComplete ? null : nextHolder.user_id,
      completed: isComplete,
    }).eq('id', myChain.id);
    setDescText('');
    setSubmitting(false);
    setMyChain(null);
  };

  if (gameFinished) {
    const currentChain = allChainsData[revealIndex];
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-theme-text">{t('Результаты')}</h1>
          <button onClick={onLeave} className="flex items-center gap-2 px-4 py-2 bg-theme-surface2 text-theme-muted rounded-lg text-sm hover:text-theme-danger transition-colors">
            <LogOut className="w-4 h-4" /> {t('Выйти')}
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {allChainsData.map((_, i) => (
            <button
              key={i}
              onClick={() => setRevealIndex(i)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${revealIndex === i ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'}`}
            >
              {t('Цепочка')} {i + 1}
            </button>
          ))}
        </div>
        {currentChain && (
          <div className="space-y-3">
            {currentChain.map((step, i) => (
              <div key={step.id} className="glass-surface bg-theme-surface/50 border border-theme-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-theme-muted">{t('Шаг')} {i + 1}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-theme-primary/15 text-theme-primary">{step.author_name}</span>
                </div>
                {step.type === 'description' ? (
                  <p className="text-theme-text text-lg">{step.content}</p>
                ) : (
                  <BeatReplay json={step.content} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!myChain) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-theme-text">{t('Игра идёт')}</h1>
          <button onClick={onLeave} className="flex items-center gap-2 px-4 py-2 bg-theme-surface2 text-theme-muted rounded-lg text-sm hover:text-theme-danger transition-colors">
            <LogOut className="w-4 h-4" /> {t('Выйти')}
          </button>
        </div>
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-theme-primary animate-spin mx-auto mb-4" />
          <p className="text-theme-muted text-sm">{t('Ждём других игроков или свой ход...')}</p>
        </div>
      </div>
    );
  }

  const isDescriptionStep = myChain.current_step % 2 === 1;
  const lastStep = steps[steps.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-theme-text">
          {isDescriptionStep ? t('Опиши бит') : t('Создай бит')}
        </h1>
        <span className="text-xs text-theme-muted">{t('Шаг')} {myChain.current_step + 1} / {room?.total_rounds}</span>
      </div>

      {!isDescriptionStep && lastStep?.type === 'description' && (
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-xl p-4 text-center">
          <p className="text-xs text-theme-muted mb-1">{t('Создай бит по описанию:')}</p>
          <p className="text-theme-text text-xl font-bold">{lastStep.content}</p>
        </div>
      )}

      {isDescriptionStep && lastStep?.type === 'beat' && (
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-xl p-4">
          <p className="text-xs text-theme-muted mb-2">{t('Послушай бит и опиши его:')}</p>
          <BeatReplay json={lastStep.content} />
        </div>
      )}

      {isDescriptionStep ? (
        <div className="space-y-3">
          <textarea
            value={descText}
            onChange={(e) => setDescText(e.target.value)}
            maxLength={200}
            placeholder={t('Опиши бит: жанр, настроение, ритм, инструменты...')}
            className="w-full px-4 py-3 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary transition-colors resize-none"
            rows={3}
          />
          <button
            onClick={submitDescription}
            disabled={!descText.trim() || submitting}
            className="px-6 py-3 bg-theme-primary text-white rounded-xl text-sm font-bold hover:bg-theme-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t('Отправить')}
          </button>
        </div>
      ) : (
        <BeatComposer onSubmit={submitBeat} submitting={submitting} />
      )}
    </div>
  );
}

function BeatComposer({ onSubmit, submitting }: { onSubmit: (pattern: BeatPattern) => void; submitting: boolean }) {
  const { t } = useLocale();
  const [pattern, setPattern] = useState<BeatPattern>(emptyPattern);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [genre, setGenre] = useState('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const patternRef = useRef(pattern);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);

  const getCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  };

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setIsPlaying(false);
    setCurrentStep(-1);
    stepRef.current = 0;
  }, []);

  const play = () => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const stepDur = 60000 / 120 / 4;
    stepRef.current = 0;
    setIsPlaying(true);
    const tick = () => {
      const step = stepRef.current;
      setCurrentStep(step);
      const time = ctx.currentTime;
      patternRef.current.forEach((track) => {
        if (track.steps[step]) playBeatSound(ctx, track.type, time, track.volume);
      });
      stepRef.current = (step + 1) % STEPS;
    };
    tick();
    intervalRef.current = window.setInterval(tick, stepDur);
  };

  useEffect(() => () => stop(), [stop]);

  const toggleStep = (trackIdx: number, step: number) => {
    setPattern((prev) => prev.map((t, i) =>
      i === trackIdx ? { ...t, steps: t.steps.map((s, j) => j === step ? !s : s) } : t
    ));
  };

  const clearAll = () => setPattern(emptyPattern());

  const loadGenre = (g: string) => {
    setGenre(g);
    setPattern(GENRE_PATTERNS[g].map((t) => ({ ...t, steps: [...t.steps] })));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={isPlaying ? stop : play}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${isPlaying ? 'bg-theme-danger text-white' : 'bg-theme-success text-white'}`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? t('Стоп') : t('Играть')}
        </button>
        <button onClick={clearAll} className="px-3 py-2 bg-theme-surface2 text-theme-muted rounded-lg text-sm flex items-center gap-1 hover:text-theme-danger">
          <Trash2 className="w-4 h-4" /> {t('Очистить')}
        </button>
        <div className="flex items-center gap-1 flex-wrap">
          {Object.keys(GENRE_PATTERNS).map((g) => (
            <button
              key={g}
              onClick={() => loadGenre(g)}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${genre === g ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'}`}
            >
              {t(g)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4 overflow-x-auto">
        <div className="min-w-[400px] space-y-2">
          {pattern.map((track, ti) => (
            <div key={track.type} className="flex items-center gap-2">
              <span className="text-xs text-theme-text w-16 shrink-0">{t(TRACK_NAMES[track.type])}</span>
              <div className="flex gap-px">
                {track.steps.map((s, si) => (
                  <button
                    key={si}
                    onClick={() => toggleStep(ti, si)}
                    className={`w-7 h-7 rounded-sm transition-all ${s ? TRACK_COLORS[track.type] : si % 4 === 0 ? 'bg-theme-surface2 hover:bg-theme-border' : 'bg-theme-surface hover:bg-theme-surface2'} ${currentStep === si && s ? 'ring-1 ring-white/50' : ''}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => onSubmit(pattern)}
        disabled={submitting}
        className="px-6 py-3 bg-theme-primary text-white rounded-xl text-sm font-bold hover:bg-theme-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {t('Готово — отправить')}
      </button>
    </div>
  );
}

function BeatReplay({ json }: { json: string }) {
  const { t } = useLocale();
  const pattern = jsonToPattern(json) || emptyPattern();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const patternRef = useRef(pattern);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);

  const getCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  };

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setIsPlaying(false);
    setCurrentStep(-1);
    stepRef.current = 0;
  }, []);

  const play = () => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const stepDur = 60000 / 120 / 4;
    stepRef.current = 0;
    setIsPlaying(true);
    const tick = () => {
      const step = stepRef.current;
      setCurrentStep(step);
      const time = ctx.currentTime;
      patternRef.current.forEach((track) => {
        if (track.steps[step]) playBeatSound(ctx, track.type, time, track.volume);
      });
      stepRef.current = (step + 1) % STEPS;
    };
    tick();
    intervalRef.current = window.setInterval(tick, stepDur);
  };

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="space-y-3">
      <button
        onClick={isPlaying ? stop : play}
        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${isPlaying ? 'bg-theme-danger text-white' : 'bg-theme-primary text-white'}`}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        {isPlaying ? t('Стоп') : t('Слушать бит')}
      </button>
      <div className="bg-theme-surface2/50 rounded-xl p-3 overflow-x-auto">
        <div className="min-w-[400px] space-y-1.5">
          {pattern.map((track) => (
            <div key={track.type} className="flex items-center gap-2">
              <span className="text-[10px] text-theme-muted w-12 shrink-0">{t(TRACK_NAMES[track.type])}</span>
              <div className="flex gap-px">
                {track.steps.map((s, si) => (
                  <div
                    key={si}
                    className={`w-5 h-5 rounded-sm ${s ? TRACK_COLORS[track.type] : 'bg-theme-surface/60'} ${currentStep === si && s ? 'ring-1 ring-white/50' : ''}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =================== SINGLE PLAYER (vs AI) =================== */

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_CONFIG: Record<Difficulty, { choices: string[]; hideGrid: boolean; label: string }> = {
  easy:   { choices: [...SP_GENRES.slice(0, 2), ...SP_GENRES.slice(0, 1)], hideGrid: false, label: 'Лёгкий' },
  medium: { choices: SP_GENRES, hideGrid: false, label: 'Средний' },
  hard:   { choices: SP_GENRES, hideGrid: true, label: 'Сложный' },
};

function buildChoices(difficulty: Difficulty, correctGenre: string): string[] {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const wrong = SP_GENRES.filter((g) => g !== correctGenre);
  const shuffled = [...wrong].sort(() => Math.random() - 0.5);
  const numChoices = difficulty === 'easy' ? 2 : 3;
  const choices = [correctGenre, ...shuffled.slice(0, numChoices - 1)].sort(() => Math.random() - 0.5);
  return choices;
}

function SinglePlayerView({ profile, onLeave }: { profile: any; onLeave: () => void }) {
  const { t } = useLocale();
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'listen' | 'guess' | 'result'>('intro');
  const [current, setCurrent] = useState<{ pattern: BeatPattern; genre: string } | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [choices, setChoices] = useState<string[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const patternRef = useRef<BeatPattern>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const TOTAL_ROUNDS = 5;

  const getCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  };

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setIsPlaying(false);
    setCurrentStep(-1);
    stepRef.current = 0;
  }, []);

  const playPattern = (pattern: BeatPattern) => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    patternRef.current = pattern;
    const stepDur = 60000 / 120 / 4;
    stepRef.current = 0;
    setIsPlaying(true);
    const tick = () => {
      const step = stepRef.current;
      setCurrentStep(step);
      const time = ctx.currentTime;
      patternRef.current.forEach((track) => {
        if (track.steps[step]) playBeatSound(ctx, track.type, time, track.volume);
      });
      stepRef.current = (step + 1) % STEPS;
    };
    tick();
    intervalRef.current = window.setInterval(tick, stepDur);
  };

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const startRound = () => {
    stopPlayback();
    const next = pickRandomPattern();
    setCurrent(next);
    setSelectedGenre(null);
    setRevealed(false);
    setChoices(buildChoices(difficulty, next.genre));
    setPhase('listen');
    setTimeout(() => playPattern(next.pattern), 300);
  };

  const submitGuess = () => {
    if (!current || !selectedGenre) return;
    stopPlayback();
    const correct = selectedGenre === current.genre;
    if (correct) setScore((s) => s + 1);
    setRevealed(true);
    setPhase('result');
  };

  const nextRound = () => {
    if (round >= TOTAL_ROUNDS) {
      setPhase('intro');
      setRound(1);
      setScore(0);
      onLeave();
      return;
    }
    setRound((r) => r + 1);
    startRound();
  };

  const startGame = () => {
    setRound(1);
    setScore(0);
    startRound();
  };

  if (phase === 'intro') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
              <Bot className="w-6 h-6 text-theme-success" />
              {t('Одиночная игра')}
            </h1>
            <p className="text-theme-muted text-sm mt-1">{t('Угадай жанр бита, который сгенерировал ИИ')}</p>
          </div>
          <button onClick={onLeave} className="flex items-center gap-2 px-4 py-2 bg-theme-surface2 text-theme-muted rounded-lg text-sm hover:text-theme-danger transition-colors">
            <LogOut className="w-4 h-4" /> {t('Выйти')}
          </button>
        </div>
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center">
          <Bot className="w-16 h-16 text-theme-success mx-auto mb-4" />
          <h2 className="text-theme-text text-xl font-bold mb-2">{t('Игра против ИИ')}</h2>
          <p className="text-theme-muted text-sm mb-6 max-w-md mx-auto">
            {t('Компьютер сгенерирует случайный бит. Послушай его и угадай жанр. 5 раундов — сколько угадаешь?')}
          </p>
          <div className="mb-6">
            <p className="text-xs text-theme-muted uppercase tracking-wider mb-3">{t('Сложность')}</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    difficulty === d
                      ? 'bg-theme-success text-white'
                      : 'bg-theme-surface2 text-theme-muted hover:text-theme-text border border-theme-border'
                  }`}
                >
                  {t(DIFFICULTY_CONFIG[d].label)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-theme-muted mt-2">
              {difficulty === 'easy' && t('2 варианта ответа, видна сетка бита')}
              {difficulty === 'medium' && t('3 варианта ответа, видна сетка бита')}
              {difficulty === 'hard' && t('3 варианта ответа, сетка скрыта — только звук')}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
            {SP_GENRES.map((g) => (
              <span key={g} className="px-3 py-1 bg-theme-surface2 text-theme-muted rounded-full text-xs">{t(g)}</span>
            ))}
          </div>
          <button
            onClick={startGame}
            className="px-8 py-3 bg-theme-success text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 mx-auto"
          >
            <Play className="w-5 h-5" /> {t('Начать игру')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'result' && current) {
    const correct = selectedGenre === current.genre;
    const isLast = round >= TOTAL_ROUNDS;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-theme-text">
            {correct ? t('Верно!') : t('Мимо')}
          </h1>
          <span className="text-xs text-theme-muted">{t('Раунд')} {round}/{TOTAL_ROUNDS} · {t('Очки')}: {score}</span>
        </div>
        <div className={`glass-surface rounded-2xl p-6 text-center border ${correct ? 'bg-theme-success/10 border-theme-success/30' : 'bg-theme-danger/10 border-theme-danger/30'}`}>
          <p className="text-theme-muted text-sm mb-2">{t('Правильный жанр')}:</p>
          <p className="text-2xl font-bold text-theme-text mb-4">{t(current.genre)}</p>
          <p className="text-theme-muted text-sm">
            {t('Твой ответ')}: <span className={correct ? 'text-theme-success font-medium' : 'text-theme-danger font-medium'}>{selectedGenre ? t(selectedGenre) : '—'}</span>
          </p>
        </div>
        <button
          onClick={nextRound}
          className="px-6 py-3 bg-theme-primary text-white rounded-xl text-sm font-bold hover:bg-theme-primary-hover transition-colors flex items-center justify-center gap-2 mx-auto"
        >
          {isLast ? <><Check className="w-5 h-5" /> {t('Готово')}</> : <><Play className="w-5 h-5" /> {t('Следующий раунд')}</>}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-theme-text">{t('Угадай жанр')}</h1>
        <span className="text-xs text-theme-muted">{t('Раунд')} {round}/{TOTAL_ROUNDS} · {t('Очки')}: {score}</span>
      </div>

      <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-6">
        <p className="text-theme-muted text-sm mb-4 text-center">{t('Послушай бит и выбери жанр')}:</p>
        <div className="flex justify-center mb-6">
          <button
            onClick={isPlaying ? stopPlayback : () => current && playPattern(current.pattern)}
            className={`px-6 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${isPlaying ? 'bg-theme-danger text-white' : 'bg-theme-primary text-white'}`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {isPlaying ? t('Стоп') : t('Слушать бит')}
          </button>
        </div>

        {current && !DIFFICULTY_CONFIG[difficulty].hideGrid && (
          <div className="bg-theme-surface2/50 rounded-xl p-3 overflow-x-auto mb-6">
            <div className="min-w-[400px] space-y-1.5">
              {current.pattern.map((track) => (
                <div key={track.type} className="flex items-center gap-2">
                  <span className="text-[10px] text-theme-muted w-12 shrink-0">{t(TRACK_NAMES[track.type])}</span>
                  <div className="flex gap-px">
                    {track.steps.map((s, si) => (
                      <div
                        key={si}
                        className={`w-5 h-5 rounded-sm ${s ? TRACK_COLORS[track.type] : 'bg-theme-surface/60'} ${currentStep === si && s ? 'ring-1 ring-white/50' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {current && DIFFICULTY_CONFIG[difficulty].hideGrid && (
          <div className="bg-theme-surface2/50 rounded-xl p-3 mb-6 text-center">
            <Volume2 className="w-8 h-8 text-theme-primary mx-auto mb-2 animate-pulse" />
            <p className="text-xs text-theme-muted">{t('Сетка скрыта — угадай по звуку!')}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {choices.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGenre(g)}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                selectedGenre === g
                  ? 'bg-theme-primary text-white'
                  : 'bg-theme-surface2 text-theme-muted hover:text-theme-text border border-theme-border'
              }`}
            >
              {t(g)}
            </button>
          ))}
        </div>

        <button
          onClick={submitGuess}
          disabled={!selectedGenre}
          className="w-full mt-6 py-3 bg-theme-success text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> {t('Отправить')}
        </button>
      </div>
    </div>
  );
}