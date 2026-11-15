export type DrumSound = 'kick' | 'snare' | 'hihat' | 'openhat' | 'clap' | 'tom' | 'rim';

export const BEAT_STEPS = 16;

export const DRUM_SOUNDS: { id: DrumSound; label: string; color: string }[] = [
  { id: 'kick', label: 'Бочка', color: '#f97316' },
  { id: 'snare', label: 'Снэйр', color: '#06b6d4' },
  { id: 'hihat', label: 'Хай-хэт', color: '#10b981' },
  { id: 'openhat', label: 'Открытый хэт', color: '#84cc16' },
  { id: 'clap', label: 'Хлопок', color: '#ef4444' },
  { id: 'tom', label: 'Том', color: '#eab308' },
  { id: 'rim', label: 'Рим-шот', color: '#ec4899' },
];

export type DrumTrack = {
  id: string;
  name: string;
  sound: DrumSound;
  steps: boolean[];
  volume: number;
  decay: number;
  cutoff: number;
  offset: number;
  muted: boolean;
};

export function soundColor(sound: DrumSound): string {
  return DRUM_SOUNDS.find((s) => s.id === sound)?.color ?? DRUM_SOUNDS[0].color;
}

export function createDrumTrack(sound: DrumSound, steps: boolean[], name?: string): DrumTrack {
  const label = DRUM_SOUNDS.find((s) => s.id === sound)?.label ?? sound;
  return {
    id: crypto.randomUUID(),
    name: name ?? label,
    sound,
    steps,
    volume: 1,
    decay: 1,
    cutoff: 20000,
    offset: 0,
    muted: false,
  };
}

const every = (n: number, r = 0) => (i: number) => i % n === r;

const PRESET_PATTERNS: Record<string, Partial<Record<DrumSound, (i: number) => boolean>>> = {
  'Базовый': { kick: every(4), snare: (i) => i % 8 === 4, hihat: every(2) },
  'Рок': { kick: (i) => i % 8 === 0 || i % 8 === 6, snare: (i) => i % 8 === 4, hihat: every(2) },
  'Хип-хоп': {
    kick: (i) => i % 8 === 0 || i % 16 === 10,
    snare: (i) => i % 8 === 4,
    hihat: () => true,
    clap: (i) => i % 8 === 4,
  },
  'Диско': { kick: every(4), snare: (i) => i % 8 === 4, hihat: (i) => i % 2 === 1, clap: (i) => i % 4 === 2 },
  'Нет': {},
};

export const DRUM_PRESET_NAMES = Object.keys(PRESET_PATTERNS);

const BASE_SOUNDS: DrumSound[] = ['kick', 'snare', 'hihat', 'clap'];

export function buildDrumPreset(name: string): DrumTrack[] {
  const pattern = PRESET_PATTERNS[name] ?? {};
  return BASE_SOUNDS.map((sound) =>
    createDrumTrack(sound, Array.from({ length: BEAT_STEPS }, (_, i) => pattern[sound]?.(i) ?? false)),
  );
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  startTime: number,
  duration: number,
  peak: number,
  filterType: BiquadFilterType,
  frequency: number,
  q: number,
) {
  const source = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  source.start(startTime);
  source.stop(startTime + duration);
}

function toneSweep(
  ctx: AudioContext,
  dest: AudioNode,
  startTime: number,
  type: OscillatorType,
  fromHz: number,
  toHz: number,
  duration: number,
  peak: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromHz, startTime);
  osc.frequency.exponentialRampToValueAtTime(toHz, startTime + duration);
  gain.gain.setValueAtTime(peak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

export function scheduleDrumHit(
  ctx: AudioContext,
  track: Pick<DrumTrack, 'sound' | 'volume' | 'decay' | 'cutoff'>,
  startTime: number,
  masterVolume: number,
) {
  const bus = ctx.createBiquadFilter();
  bus.type = 'lowpass';
  bus.frequency.value = track.cutoff;
  bus.connect(ctx.destination);

  const vol = masterVolume * track.volume;
  const d = track.decay;

  switch (track.sound) {
    case 'kick':
      toneSweep(ctx, bus, startTime, 'sine', 150, 40, 0.15 * d, vol);
      break;
    case 'snare':
      noiseBurst(ctx, bus, startTime, 0.1 * d, vol * 0.7, 'highpass', 1500, 1);
      break;
    case 'hihat':
      noiseBurst(ctx, bus, startTime, 0.05 * d, vol * 0.3, 'highpass', 6000, 1);
      break;
    case 'openhat':
      noiseBurst(ctx, bus, startTime, 0.3 * d, vol * 0.3, 'highpass', 6000, 1);
      break;
    case 'clap':
      for (let tap = 0; tap < 3; tap++) {
        noiseBurst(ctx, bus, startTime + tap * 0.01, 0.05 * d, vol * 0.4, 'bandpass', 1200, 2);
      }
      break;
    case 'tom':
      toneSweep(ctx, bus, startTime, 'sine', 180, 90, 0.25 * d, vol * 0.8);
      break;
    case 'rim':
      toneSweep(ctx, bus, startTime, 'triangle', 1700, 1600, 0.03 * d, vol * 0.5);
      break;
  }
}
