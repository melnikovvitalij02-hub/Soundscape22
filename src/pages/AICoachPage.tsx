import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, xpProgress, levelFromXp } from '@/lib/supabase';
import {
  Brain,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  Lightbulb,
  RefreshCw,
  ArrowRight,
  Music,
  Play,
  Square,
  Plus,
  Trash2,
  Save,
  Sparkles,
  GraduationCap,
  X,
} from 'lucide-react';

/* ------------------------------- Types ------------------------------- */

type Severity = 'error' | 'warning' | 'info';

type FixAction = {
  trackType: string;
  stepIndex: number;
  newValue: boolean;
};

type Msg = { key: string; vars?: Record<string, string | number> };

type Issue = {
  id: string;
  severity: Severity;
  title: Msg;
  description: Msg;
  fix?: Msg;
  fixAction?: FixAction;
};

type TrackType = 'kick' | 'snare' | 'hihat' | 'openhat' | 'clap' | 'tom' | 'bass' | 'synth' | 'pad';

type CoachTrack = {
  id: string;
  type: TrackType;
  name: string;
  color: string;
  volume: number;
  steps: boolean[];
  muted: boolean;
};

type SavedTrack = {
  type: string;
  steps: boolean[];
  volume: number;
  [key: string]: unknown;
};

type BeatData = {
  tracks?: SavedTrack[];
  bpm?: number;
  genre?: string;
};

type Beat = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  bpm: number;
  data: BeatData | null;
};

type Analysis = { issues: Issue[]; score: number };

type CoachStyle = 'teacher' | 'strict' | 'friendly' | 'critic' | 'motivator';

const COACH_STYLES: { id: CoachStyle; label: string }[] = [
  { id: 'teacher', label: 'Преподаватель' },
  { id: 'strict', label: 'Строгий наставник' },
  { id: 'friendly', label: 'Дружелюбный помощник' },
  { id: 'critic', label: 'Критик' },
  { id: 'motivator', label: 'Мотиватор' },
];

const STYLE_LABELS: Record<CoachStyle, string> = {
  teacher: 'Комментарий преподавателя',
  strict: 'Комментарий наставника',
  friendly: 'Совет помощника',
  critic: 'Замечания критика',
  motivator: 'Слова мотиватора',
};

/* --------------------------- Track presets --------------------------- */

const COACH_PRESETS: { type: TrackType; name: string; color: string; volume: number }[] = [
  { type: 'kick', name: 'Кик', color: 'bg-red-500', volume: 0.8 },
  { type: 'snare', name: 'Снейр', color: 'bg-orange-500', volume: 0.7 },
  { type: 'hihat', name: 'Хай-Хэт', color: 'bg-amber-500', volume: 0.5 },
  { type: 'openhat', name: 'Отк. хэт', color: 'bg-yellow-500', volume: 0.5 },
  { type: 'clap', name: 'Хлопок', color: 'bg-lime-500', volume: 0.6 },
  { type: 'tom', name: 'Том', color: 'bg-green-500', volume: 0.7 },
  { type: 'bass', name: 'Бас', color: 'bg-emerald-500', volume: 0.7 },
  { type: 'synth', name: 'Синт', color: 'bg-cyan-500', volume: 0.5 },
  { type: 'pad', name: 'Пэд', color: 'bg-blue-500', volume: 0.4 },
];

const GENRES = ['Хип-Хоп', 'Трэп', 'House', 'Техно', 'Lo-Fi', 'Драм-н-Бейс', 'Дабстеп', 'Рэгги', 'Рок', 'Поп', 'R&B', 'Фонк'];
const STEPS = 16;

/* --------------------------- Genre BPM ranges --------------------------- */

const GENRE_BPM: Record<string, [number, number]> = {
  'Хип-Хоп': [70, 90],
  'Трэп': [130, 160],
  House: [120, 130],
  'Техно': [120, 135],
  'Lo-Fi': [70, 95],
  'Драм-н-Бейс': [160, 180],
  'Дабстеп': [140, 150],
  'Рэгги': [70, 90],
  'Рок': [100, 140],
  'Поп': [100, 130],
  'R&B': [60, 80],
  'Фонк': [130, 160],
};

const KICK_FLOOR = [0, 4, 8, 12];
const SNARE_BACKBEAT = [4, 12];
const NO_FOUR_ON_FLOOR_GENRES = ['Трэп', 'Дабстеп', 'Драм-н-Бейс', 'Рэгги'];
const NO_BACKBEAT_GENRES = ['Трэп', 'Рэгги'];

let issueCounter = 0;
const mk = (
  severity: Severity, title: string | Msg, description: string | Msg, fix?: string | Msg, fixAction?: FixAction,
): Issue => ({
  id: `issue-${++issueCounter}`, severity, title: toMsg(title), description: toMsg(description),
  fix: fix === undefined ? undefined : toMsg(fix), fixAction,
});
const nums = (arr: number[]) => arr.map((i) => i + 1).join(', ');
const toMsg = (m: string | Msg): Msg => (typeof m === 'string' ? { key: m } : m);
const fillVars = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : text;
const msgText = (translate: (key: string) => string, m: Msg) => fillVars(translate(m.key), m.vars);

/* ----------------------- Pure analysis function ----------------------- */

export function analyzeBeat(data: BeatData): Analysis {
  issueCounter = 0;
  const issues: Issue[] = [];
  const tracks = data.tracks ?? [];
  const bpm = data.bpm ?? 120;
  const genre = data.genre ?? '';
  const find = (t: string) => tracks.find((x) => x.type === t);
  const count = (s: boolean[]) => s.filter(Boolean).length;
  const kick = find('kick'), snare = find('snare'), hihat = find('hihat'), bass = find('bass');

  const checkKickFloor = !NO_FOUR_ON_FLOOR_GENRES.includes(genre);
  const checkBackbeat = !NO_BACKBEAT_GENRES.includes(genre);

  // 1. Kick four-on-the-floor
  if (kick && checkKickFloor) {
    const m = KICK_FLOOR.filter((i) => !kick.steps[i]);
    if (m.length)
      issues.push(mk('error', 'Кик не на четыре доли',
        { key: 'Бочка должна стоять на долях 1, 5, 9, 13 (four-on-the-floor). Пропущены: {steps}.', vars: { steps: nums(m) } },
        { key: 'Поставьте кик на шаг {step}', vars: { step: m[0] + 1 } }, { trackType: 'kick', stepIndex: m[0], newValue: true }));
  } else issues.push(mk('warning', 'Нет дорожки кика', 'Добавьте дорожку кика — это основа любого бита.'));

  // 2. Snare backbeat
  if (snare && checkBackbeat) {
    const m = SNARE_BACKBEAT.filter((i) => !snare.steps[i]);
    if (m.length)
      issues.push(mk('error', 'Снейр не на бэкбите',
        { key: 'Снейр обычно стоит на долях 5 и 13 (бэкбит). Пропущены: {steps}.', vars: { steps: nums(m) } },
        { key: 'Добавьте снейр на шаг {step}', vars: { step: m[0] + 1 } }, { trackType: 'snare', stepIndex: m[0], newValue: true }));
  }

  // 3. Hihat density
  if (hihat) {
    const c = count(hihat.steps);
    if (c === 0) issues.push(mk('warning', 'Хай-хэт пустой', 'Нет активных шагов. Добавьте хотя бы восьмые ноты.'));
    else if (c <= 3) issues.push(mk('info', 'Хай-хэт слишком редкий', { key: 'Активно {count} шагов — звучит пусто. Попробуйте 8 (восьмые) или 16 (шестнадцатые).', vars: { count: c } }));
    else if (c >= 15) issues.push(mk('info', 'Хай-хэт слишком плотный', { key: 'Активно {count} из 16 — звучит монотонно. Уберите часть шагов для динамики.', vars: { count: c } }));
  }

  // 4. Bass follows kick
  if (bass && kick) {
    const m = KICK_FLOOR.filter((i) => kick.steps[i] && !bass.steps[i]);
    if (m.length)
      issues.push(mk('warning', 'Бас не следует за киком',
        { key: 'Бас обычно повторяет бочку. На долях {steps} кик есть, а баса нет.', vars: { steps: nums(m) } },
        { key: 'Добавьте бас на шаг {step}', vars: { step: m[0] + 1 } }, { trackType: 'bass', stepIndex: m[0], newValue: true }));
  }

  // 5. BPM vs genre
  const r = GENRE_BPM[genre];
  if (r) {
    const [lo, hi] = r;
    const tempoVars = { genre, lo, hi, bpm };
    if (bpm < lo) issues.push(mk('warning', 'Темп ниже нормы для жанра', { key: 'Для «{genre}» типичный темп {lo}–{hi} BPM. Сейчас {bpm}.', vars: tempoVars }));
    else if (bpm > hi) issues.push(mk('warning', 'Темп выше нормы для жанра', { key: 'Для «{genre}» типичный темп {lo}–{hi} BPM. Сейчас {bpm}.', vars: tempoVars }));
  }

  // 6. Empty tracks
  tracks.forEach((t) => { if (count(t.steps) === 0)
    issues.push(mk('info', { key: 'Дорожка «{track}» пустая', vars: { track: t.type } }, { key: 'В дорожке {track} нет активных шагов. Удалите её или добавьте ноты.', vars: { track: t.type } })); });

  // 7. Overall groove check — constructive feedback
  const totalSteps = tracks.reduce((sum, t) => sum + count(t.steps), 0);
  if (totalSteps === 0) {
    issues.push(mk('error', 'Бит полностью пустой', 'На сетке нет ни одной ноты. Начните с кика на долях 1, 5, 9, 13.'));
  } else if (totalSteps < 8) {
    issues.push(mk('info', 'Слишком мало нот', { key: 'Всего {count} активных шагов. Бит звучит пусто — добавьте хай-хэт и перкуссию для плотности.', vars: { count: totalSteps } }));
  }

  const e = issues.filter((i) => i.severity === 'error').length;
  const w = issues.filter((i) => i.severity === 'warning').length;
  const n = issues.filter((i) => i.severity === 'info').length;
  const score = Math.max(0, Math.min(100, 100 - e * 25 - w * 12 - n * 5));
  return { issues, score };
}

/* -------------------- Teacher-style verbal feedback -------------------- */

type FeedbackTier = 'great' | 'good' | 'ok' | 'bad';

const OPENERS: Record<CoachStyle, Record<FeedbackTier, string[]>> = {
  teacher: {
    great: ['Хороший бит, ритмическая основа собрана правильно.', 'Бит звучит уверенно, структура выстроена грамотно.'],
    good: ['Неплохо, фундамент есть, но кое-что стоит подтянуть.', 'Ритм в целом держится, осталось поправить несколько мест.'],
    ok: ['Бит пока сыроват: опорные доли стоят не везде.', 'Groove хромает, потому что базовые удары расставлены неточно.'],
    bad: ['Ритм пока не сложился, начнём с базы.', 'Бит пока не держит пульс. Через этот этап проходят все, и это нормально.'],
  },
  strict: {
    great: ['Неплохо, но расслабляться рано: точность ещё не идеальна.', 'Структура выдержана, однако от работы я жду большего.'],
    good: ['Работа посредственная, я ожидаю большего.', 'Ритм местами плывёт, перепроверьте каждую долю.'],
    ok: ['Так не годится: базовые принципы ритма нарушены.', 'Основа бита не соблюдена. Исправляйте по порядку.'],
    bad: ['Работа не принята: без опорного ритма двигаться дальше нельзя.', 'Начните заново и опирайтесь на сильные доли.'],
  },
  friendly: {
    great: ['Отличный бит, ты хорошо чувствуешь ритм!', 'Классная работа, звучит сбалансированно!'],
    good: ['Здорово, почти идеально, осталось чуть доработать.', 'Уже звучит живо, пара штрихов, и будет супер!'],
    ok: ['Не переживай, это нормальный этап. Давай поправим основу.', 'Бит уже что-то, поправим пару мест, и он заиграет!'],
    bad: ['Ничего страшного, начнём с простого, и бит оживёт!', 'У всех так бывает. Давай соберём базу по шагам.'],
  },
  critic: {
    great: ['Технически грамотно, но без изюминки.', 'Чисто, аккуратно и немного скучно.'],
    good: ['Середнячок: ритм есть, характера пока нет.', 'Бит не цепляет, хотя структура в порядке.'],
    ok: ['Слабо. Ошибки бросаются в глаза.', 'Ритмически бит шатается, и это слышно сразу.'],
    bad: ['Это пока не бит, а набор нот.', 'Структуры почти нет, слушать такое сложно.'],
  },
  motivator: {
    great: ['Огонь! Бит качает, структура железобетонная!', 'Мощно! Ты чувствуешь ритм, так держать!'],
    good: ['Почти разрыв! Ещё чуть-чуть, и зал рванёт!', 'Ты на грани крутого результата, дожми детали!'],
    ok: ['Не сдавайся! Каждый профи начинал с этого.', 'Поправь основу, и бит сразу оживёт!'],
    bad: ['Старт с нуля — это начало, а не конец!', 'Сейчас всё исправим шаг за шагом. Ты справишься!'],
  },
};

const CLEAN_FOCUS = ['Кик, снейр и хай-хэт стоят на своих местах.', 'Сетка выдержана, грубых ошибок в ритме не найдено.'];

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function teacherFeedback(analysis: Analysis, style: CoachStyle = 'teacher'): Msg[] {
  const { score, issues } = analysis;
  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarning = issues.some((i) => i.severity === 'warning');

  const tier: FeedbackTier =
    hasError ? (score >= 50 ? 'ok' : 'bad') :
    hasWarning ? (score >= 70 ? 'good' : 'ok') :
    score >= 85 ? 'great' : 'good';

  const seed = score + issues.length * 7 + issues.reduce((sum, i) => sum + i.description.key.length, 0);
  const openers = OPENERS[style][tier];
  const focus = [...issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0];
  const focusText: Msg = focus ? focus.description : { key: CLEAN_FOCUS[seed % CLEAN_FOCUS.length] };

  return [{ key: openers[seed % openers.length] }, focusText];
}


/* ------------------------- Web Audio synthesis ------------------------- */

function makeCoachSound(ctx: AudioContext, type: TrackType, time: number, volume: number) {
  const out = ctx.createGain();
  out.connect(ctx.destination);

  switch (type) {
    case 'kick': {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(30, time + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume, time);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
      osc.connect(g); g.connect(out);
      osc.start(time); osc.stop(time + 0.5);
      break;
    }
    case 'snare': {
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume * 0.7, time);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
      noise.connect(filter); filter.connect(g); g.connect(out);
      noise.start(time); noise.stop(time + 0.15);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, time);
      const og = ctx.createGain();
      og.gain.setValueAtTime(volume * 0.3, time);
      og.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      osc.connect(og); og.connect(out);
      osc.start(time); osc.stop(time + 0.1);
      break;
    }
    case 'hihat': {
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      noise.connect(filter); filter.connect(g); g.connect(out);
      noise.start(time); noise.stop(time + 0.05);
      break;
    }
    case 'openhat': {
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      noise.connect(filter); filter.connect(g); g.connect(out);
      noise.start(time); noise.stop(time + 0.3);
      break;
    }
    case 'clap': {
      for (let k = 0; k < 3; k++) {
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noise.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = 1500; filter.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(volume * 0.5, time + k * 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, time + k * 0.01 + 0.03);
        noise.connect(filter); filter.connect(g); g.connect(out);
        noise.start(time + k * 0.01); noise.stop(time + k * 0.01 + 0.03);
      }
      break;
    }
    case 'tom': {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(80, time + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume * 0.7, time);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      osc.connect(g); g.connect(out);
      osc.start(time); osc.stop(time + 0.2);
      break;
    }
    case 'bass': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, time);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume * 0.6, time);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
      osc.connect(filter); filter.connect(g); g.connect(out);
      osc.start(time); osc.stop(time + 0.3);
      break;
    }
    case 'synth': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, time);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 2000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume * 0.4, time);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
      osc.connect(filter); filter.connect(g); g.connect(out);
      osc.start(time); osc.stop(time + 0.4);
      break;
    }
    case 'pad': {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine'; osc2.type = 'sine';
      osc1.frequency.setValueAtTime(220, time);
      osc2.frequency.setValueAtTime(277, time);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(volume * 0.3, time + 0.1);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.8);
      osc1.connect(g); osc2.connect(g); g.connect(out);
      osc1.start(time); osc2.start(time);
      osc1.stop(time + 0.8); osc2.stop(time + 0.8);
      break;
    }
  }
}

/* ------------------------------ Component ------------------------------ */

const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; color: string; ring: string }> = {
  error: { icon: AlertTriangle, color: 'text-theme-danger', ring: 'border-theme-danger/30' },
  warning: { icon: Lightbulb, color: 'text-theme-warning', ring: 'border-theme-warning/30' },
  info: { icon: Info, color: 'text-theme-primary', ring: 'border-theme-primary/30' },
};

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="panel p-10 text-center text-theme-muted flex flex-col items-center">
      {icon}
      {text}
    </div>
  );
}

function Badge({ cls, label }: { cls: string; label: string }) {
  return <span className={`px-2 py-1 rounded-lg ${cls}`}>{label}</span>;
}

let trackIdCounter = 0;
function newTrackId() { return `coach-track-${++trackIdCounter}`; }

function createCoachTrack(type: TrackType): CoachTrack {
  const preset = COACH_PRESETS.find((p) => p.type === type)!;
  return { id: newTrackId(), type, name: preset.name, color: preset.color, volume: preset.volume, steps: Array(STEPS).fill(false), muted: false };
}

export default function AICoachPage({ onExit }: { onExit?: () => void }) {
  const { session, isGuest, profile } = useAuth();
  const { t } = useLocale();
  const [mode, setMode] = useState<'create' | 'library'>('create');
  const [beats, setBeats] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [libraryData, setLibraryData] = useState<BeatData | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  // Inline sequencer state
  const [tracks, setTracks] = useState<CoachTrack[]>(() => [
    createCoachTrack('kick'),
    createCoachTrack('snare'),
    createCoachTrack('hihat'),
  ]);
  const [bpm, setBpm] = useState(120);
  const [genre, setGenre] = useState('Хип-Хоп');
  const [beatTitle, setBeatTitle] = useState(t('Мой бит'));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [savingBeat, setSavingBeat] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [coachStyle, setCoachStyle] = useState<CoachStyle>('teacher');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const tracksRef = useRef(tracks);
  const bpmRef = useRef(bpm);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const loadBeats = useCallback(async () => {
    if (!session?.user || isGuest) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: rows } = await supabase
      .from('beats')
      .select('id, user_id, title, genre, bpm, data')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setBeats((rows as Beat[]) ?? []);
    setLoading(false);
  }, [session, isGuest]);

  useEffect(() => {
    loadBeats();
  }, [loadBeats]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  /* ---- Playback ---- */

  const ensureCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
    setCurrentStep(-1);
    stepRef.current = 0;
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    const ctx = ensureCtx();
    const stepDuration = 60 / bpmRef.current / 4;
    setIsPlaying(true);
    stepRef.current = 0;

    intervalRef.current = setInterval(() => {
      const step = stepRef.current;
      const time = ctx.currentTime + 0.05;
      const currentTracks = tracksRef.current;
      currentTracks.forEach((track) => {
        if (!track.muted && track.steps[step]) {
          makeCoachSound(ctx, track.type, time, track.volume);
        }
      });
      setCurrentStep(step);
      stepRef.current = (step + 1) % STEPS;
    }, stepDuration * 1000);
  };

  /* ---- Step editing ---- */

  const toggleStep = (trackId: string, stepIndex: number) => {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== trackId) return t;
      const steps = [...t.steps];
      steps[stepIndex] = !steps[stepIndex];
      return { ...t, steps };
    }));
  };

  const addTrack = (type: TrackType) => {
    setTracks((prev) => [...prev, createCoachTrack(type)]);
  };

  const removeTrack = (trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const toggleMute = (trackId: string) => {
    setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, muted: !t.muted } : t));
  };

  /* ---- Real-time analysis for inline sequencer ---- */

  const inlineBeatData: BeatData = {
    tracks: tracks.map((t) => ({ type: t.type, steps: t.steps, volume: t.volume })),
    bpm,
    genre,
  };
  const inlineAnalysis = analyzeBeat(inlineBeatData);

  /* ---- Library analysis ---- */

  const selected = beats.find((b) => b.id === selectedId) ?? null;
  const libraryAnalysis = libraryData ? analyzeBeat(libraryData) : null;

  const selectBeat = (beat: Beat) => {
    setSelectedId(beat.id);
    setLibraryData(beat.data ?? { tracks: [], bpm: beat.bpm, genre: beat.genre });
    setAppliedIds(new Set());
  };

  const applyFix = async (issue: Issue) => {
    if (!issue.fixAction || !selected) return;
    const { trackType, stepIndex, newValue } = issue.fixAction;
    const tracksArr = (libraryData?.tracks ?? []).map((t) => {
      if (t.type !== trackType) return t;
      const steps = [...t.steps];
      while (steps.length <= stepIndex) steps.push(false);
      steps[stepIndex] = newValue;
      return { ...t, steps };
    });
    const newData: BeatData = { ...(libraryData as BeatData), tracks: tracksArr };
    setLibraryData(newData);
    setAppliedIds((prev) => new Set(prev).add(issue.id));
    setSavingId(issue.id);
    await supabase
      .from('beats')
      .update({ data: newData, bpm: newData.bpm, genre: newData.genre })
      .eq('id', selected.id);
    setSavingId(null);
  };

  /* ---- Save beat to database ---- */

  const saveBeat = async () => {
    if (!session?.user || isGuest) return;
    setSavingBeat(true);
    setSaveMsg(null);
    const beatData: BeatData = {
      tracks: tracks.map((t) => ({ type: t.type, steps: t.steps, volume: t.volume })),
      bpm,
      genre,
    };
    const { error } = await supabase.from('beats').insert({
      user_id: session.user.id,
      title: beatTitle || t('Без названия'),
      genre,
      bpm,
      is_public: false,
      data: beatData,
    });
    setSavingBeat(false);
    if (error) {
      setSaveMsg(t('Ошибка:') + ' ' + error.message);
    } else {
      setSaveMsg(t('Бит сохранён в библиотеку!'));
      setTimeout(() => setSaveMsg(null), 3000);
      loadBeats();
    }
  };

  const scoreColor = (score: number) =>
    score >= 80 ? 'text-theme-success' : score >= 50 ? 'text-theme-warning' : 'text-theme-danger';

  const userXp = profile?.xp ?? 0;
  const userLevel = profile?.level ?? levelFromXp(userXp);
  const xpProg = xpProgress(userXp);

  const R = 52;
  const CIRC = 2 * Math.PI * R;

  const renderAnalysis = (analysis: Analysis, title: string, subtitle: string, scoreOverride?: number) => {
    const score = scoreOverride ?? analysis.score;
    return (
      <>
        {/* Score circle */}
        <div className="ai-coach-score-row panel p-6 flex items-center gap-6">
          <div className="relative shrink-0">
            <svg viewBox="0 0 120 120" className="w-24 h-24 md:w-32 md:h-32">
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="text-theme-border" stroke="currentColor" />
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" strokeLinecap="round" className={scoreColor(score)} stroke="currentColor" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - score / 100)} transform="rotate(-90 60 60)" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${scoreColor(score)}`}>{score}</span>
              <span className="text-[10px] uppercase text-theme-muted">{t('из 100')}</span>
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{title}</h2>
            <p className="text-sm text-theme-muted mb-3">{subtitle}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge cls="bg-theme-danger/15 text-theme-danger" label={`${analysis.issues.filter((i) => i.severity === 'error').length} ${t('ошибок')}`} />
              <Badge cls="bg-theme-warning/15 text-theme-warning" label={`${analysis.issues.filter((i) => i.severity === 'warning').length} ${t('замечаний')}`} />
              <Badge cls="bg-theme-primary/15 text-theme-primary" label={`${analysis.issues.filter((i) => i.severity === 'info').length} ${t('советов')}`} />
            </div>
          </div>
        </div>

        {/* Teacher feedback */}
        <div className="rounded-2xl bg-gradient-to-br from-theme-primary/10 to-theme-accent/10 border border-theme-primary/20 p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-theme-primary/20 flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6 text-theme-primary" />
          </div>
          <div>
            <h3 className="font-medium text-theme-text flex items-center gap-2 mb-1">
              {t(STYLE_LABELS[coachStyle])}
            </h3>
            <p className="text-sm text-theme-muted leading-relaxed">{teacherFeedback(analysis, coachStyle).map((m) => msgText(t, m)).join(' ')}</p>
          </div>
        </div>

        {/* Issues */}
        <div className="space-y-3">
          {analysis.issues.length === 0 ? (
            <div className="rounded-2xl bg-theme-success/10 border border-theme-success/30 p-6 flex items-center gap-3 text-theme-success">
              <CheckCircle className="w-6 h-6" />
              {t('Отличный бит! Проблем не найдено — продолжайте в том же духе.')}
            </div>
          ) : (
            analysis.issues.map((issue) => {
              const S = SEVERITY_STYLE[issue.severity];
              const Icon = S.icon;
              const applied = mode === 'library' && appliedIds.has(issue.id);
              return (
                <div key={issue.id} className={`rounded-2xl bg-theme-surface/50 border ${S.ring} p-4`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${S.color}`} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{msgText(t, issue.title)}</h3>
                      <p className="text-sm text-theme-muted mt-1">{msgText(t, issue.description)}</p>
                      {issue.fix && mode === 'library' && issue.fixAction && (
                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                          <span className="text-sm text-theme-text flex items-center gap-1.5">
                            <ArrowRight className="w-4 h-4 text-theme-primary" />
                            {msgText(t, issue.fix)}
                          </span>
                          <button
                            onClick={() => applyFix(issue)}
                            disabled={applied || savingId === issue.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                              applied ? 'bg-theme-success/20 text-theme-success cursor-default' : 'bg-theme-primary text-white hover:opacity-90 disabled:opacity-60'
                            }`}
                          >
                            {savingId === issue.id ? <Loader2 className="w-4 h-4 animate-spin" /> : applied ? <CheckCircle className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                            {applied ? t('Применено') : t('Применить')}
                          </button>
                        </div>
                      )}
                      {issue.fix && mode === 'create' && (
                        <div className="mt-2 text-sm text-theme-text flex items-center gap-1.5">
                          <ArrowRight className="w-4 h-4 text-theme-primary" />
                          {msgText(t, issue.fix)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen p-4 md:p-8 text-theme-text">
      <div className="max-w-2xl md:max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="w-12 h-12 rounded-2xl bg-theme-primary/15 flex items-center justify-center shrink-0">
            <Brain className="w-7 h-7 text-theme-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              {t('ИИ-Тренер')}
              <button
                onClick={onExit ?? (() => window.history.back())}
                className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-lg bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-danger transition"
                aria-label={t('Закрыть')}
              >
                <X className="w-4 h-4" />
              </button>
            </h1>
            <p className="text-theme-muted text-sm">{t('Создавайте биты и получайте разбор как у преподавателя')}</p>
          </div>
          <button
            onClick={loadBeats}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-theme-surface/50 border border-theme-border hover:bg-theme-surface transition text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Обновить')}
          </button>
        </div>

        {/* Style selector + skill bar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <label className="text-xs text-theme-muted whitespace-nowrap">{t('Стиль тренера')}</label>
            <select
              value={coachStyle}
              onChange={(e) => setCoachStyle(e.target.value as CoachStyle)}
              className="px-3 py-1.5 bg-theme-surface2 border border-theme-border rounded-lg text-sm text-theme-text"
            >
              {COACH_STYLES.map((s) => (
                <option key={s.id} value={s.id}>{t(s.label)}</option>
              ))}
            </select>
          </div>
          {profile && !isGuest && (
            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="text-xs text-theme-muted whitespace-nowrap">{t('Уровень')} {userLevel}</span>
              <div className="w-32 h-2 bg-theme-surface2 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-theme-primary to-theme-accent rounded-full transition-all" style={{ width: `${xpProg.percent}%` }} />
              </div>
              <span className="text-xs text-theme-muted tabular-nums whitespace-nowrap">{xpProg.current}/{xpProg.needed} XP</span>
            </div>
          )}
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setMode('create'); stopPlayback(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              mode === 'create' ? 'bg-theme-primary text-white' : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {t('Создать бит')}
          </button>
          <button
            onClick={() => { setMode('library'); stopPlayback(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              mode === 'library' ? 'bg-theme-primary text-white' : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text'
            }`}
          >
            <Music className="w-4 h-4" />
            {t('Мои биты')}
          </button>
        </div>

        {isGuest ? (
          <EmptyState icon={<Music className="w-10 h-10 mb-3 opacity-50" />} text={t('Войдите в аккаунт, чтобы ИИ-тренер разобрал ваши биты.')} />
        ) : mode === 'create' ? (
          /* ---- Create mode: inline sequencer + real-time analysis ---- */
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            {/* Sequencer */}
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="panel p-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={togglePlay}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition ${
                    isPlaying ? 'bg-theme-danger text-white' : 'bg-theme-primary text-white hover:opacity-90'
                  }`}
                >
                  {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {isPlaying ? t('Стоп') : t('Играть')}
                </button>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-theme-muted">BPM</label>
                  <input
                    type="number"
                    min={40}
                    max={220}
                    value={bpm}
                    onChange={(e) => setBpm(Number(e.target.value) || 120)}
                    className="w-20 px-2 py-1.5 bg-theme-surface2 border border-theme-border rounded-lg text-sm text-center"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-theme-muted">{t('Жанр')}</label>
                  <select
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="px-2 py-1.5 bg-theme-surface2 border border-theme-border rounded-lg text-sm"
                  >
                    {GENRES.map((g) => <option key={g} value={g}>{t(g)}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    type="text"
                    value={beatTitle}
                    onChange={(e) => setBeatTitle(e.target.value)}
                    placeholder={t('Название')}
                    className="w-32 px-2 py-1.5 bg-theme-surface2 border border-theme-border rounded-lg text-sm"
                  />
                  <button
                    onClick={saveBeat}
                    disabled={savingBeat}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-success text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    {savingBeat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('Сохранить')}
                  </button>
                </div>
              </div>

              {saveMsg && (
                <div className={`rounded-xl p-3 text-sm ${saveMsg.startsWith(t('Ошибка:')) ? 'bg-theme-danger/15 text-theme-danger' : 'bg-theme-success/15 text-theme-success'}`}>
                  {saveMsg}
                </div>
              )}

              {/* Step grid */}
              <div className="panel p-4 overflow-x-auto">
                <div className="min-w-[600px] space-y-2">
                  {/* Step numbers */}
                  <div className="flex gap-1 pl-20 mb-1">
                    {Array.from({ length: STEPS }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-9 text-center text-[10px] ${i % 4 === 0 ? 'text-theme-primary font-bold' : 'text-theme-muted/50'}`}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {tracks.map((track) => (
                    <div key={track.id} className="flex items-center gap-1">
                      <div className="w-20 flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleMute(track.id)}
                          className={`w-2 h-2 rounded-full shrink-0 ${track.muted ? 'bg-theme-muted/30' : track.color}`}
                        />
                        <span className={`text-xs truncate ${track.muted ? 'text-theme-muted/50 line-through' : 'text-theme-text'}`}>
                          {t(track.name)}
                        </span>
                        <button
                          onClick={() => removeTrack(track.id)}
                          className="text-theme-muted hover:text-theme-danger transition shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      {track.steps.map((on, i) => (
                        <button
                          key={i}
                          onClick={() => toggleStep(track.id, i)}
                          className={`w-9 h-7 rounded-md transition-all ${
                            on
                              ? `${track.color} opacity-100 shadow-sm`
                              : i % 4 === 0
                                ? 'bg-theme-surface2 hover:bg-theme-surface2/70'
                                : 'bg-theme-surface2/50 hover:bg-theme-surface2'
                          } ${currentStep === i && isPlaying ? 'ring-2 ring-theme-primary' : ''}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add track */}
              <div className="flex flex-wrap gap-2">
                {COACH_PRESETS.map((p) => {
                  const exists = tracks.some((t) => t.type === p.type);
                  return (
                    <button
                      key={p.type}
                      onClick={() => addTrack(p.type)}
                      disabled={exists}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-surface/50 border border-theme-border text-xs text-theme-muted hover:text-theme-text hover:bg-theme-surface transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3" />
                      {t(p.name)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Real-time analysis panel */}
            <div className="space-y-4">
              {renderAnalysis(inlineAnalysis, beatTitle, `${t(genre)} · ${bpm} BPM · ${tracks.length} ${t('дорожек')}`)}
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20 text-theme-muted">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> {t('Загрузка битов…')}
          </div>
        ) : beats.length === 0 ? (
          <EmptyState icon={<Music className="w-10 h-10 mb-3 opacity-50" />} text={t('У вас пока нет сохранённых битов. Перейдите во вкладку «Создать бит».')} />
        ) : (
          <div className="grid md:grid-cols-[280px_1fr] gap-6">
            {/* Beat list */}
            <div className="space-y-2">
              <h2 className="text-xs uppercase tracking-wider text-theme-muted mb-2">{t('Ваши биты')}</h2>
              {beats.map((b) => (
                <button
                  key={b.id}
                  onClick={() => selectBeat(b)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    selectedId === b.id
                      ? 'bg-theme-primary/15 border-theme-primary'
                      : 'bg-theme-surface/50 border-theme-border hover:bg-theme-surface'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium truncate">
                    <Music className="w-4 h-4 shrink-0 text-theme-primary" />
                    <span className="truncate">{b.title}</span>
                  </div>
                  <div className="text-xs text-theme-muted mt-1">
                    {b.genre || '—'} · {b.bpm} BPM
                  </div>
                </button>
              ))}
            </div>

            {/* Analysis panel */}
            <div className="space-y-6">
              {!libraryAnalysis ? (
                <EmptyState icon={<Brain className="w-10 h-10 mb-3 opacity-50" />} text={t('Выберите бит слева, чтобы получить разбор.')} />
              ) : (
                renderAnalysis(
                  libraryAnalysis,
                  selected?.title ?? '',
                  `${t(selected?.genre ?? '')} · ${selected?.bpm} BPM · ${(libraryData?.tracks ?? []).length} ${t('дорожек')}`,
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
