import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  Play, Pause, Save, Trash2, Plus, Volume2, Disc3, Upload,
  Copy, Square, Crown, Lock, Waves, Sliders, Radio,
  Zap, RotateCcw, Headphones, X, Piano as PianoIcon,
  Activity, AudioWaveform,
} from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import PublishBeatModal from '@/components/PublishBeatModal';

export type TrackType = 'kick' | 'snare' | 'hihat' | 'openhat' | 'clap' | 'tom' | 'bass' | 'synth' | 'pad' | 'crash' | 'rim' | 'perc' | 'piano' | 'violin' | 'guitar' | 'flute' | 'sax' | 'drums';

type Track = {
  id: string;
  name: string;
  type: TrackType;
  steps: boolean[];
  volume: number;
  muted: boolean;
  color: string;
  reverb: number;
  delay: number;
  filter: number;
  pitch: number;
  offset: number;      // Смещение в шагах (0-15)
  length: number;      // Длина звука (множитель длительности, 0.1 - 2.0)
  finePitch: number;   // Тон без фильтра (в полутонах, -12 до 12)
  // Extended pro effects (premium)
  distortion: number;
  bitcrush: number;
  compressor: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  pan: number;
};

const TRACK_PRESETS: Omit<Track, 'id' | 'steps' | 'muted'>[] = [
  { name: 'Кик', type: 'kick', volume: 0.8, color: 'bg-theme-primary', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Снейр', type: 'snare', volume: 0.7, color: 'bg-theme-accent', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Хай-Хэт', type: 'hihat', volume: 0.5, color: 'bg-theme-warning', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Открытый хэт', type: 'openhat', volume: 0.5, color: 'bg-theme-warning', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Хлопок', type: 'clap', volume: 0.6, color: 'bg-theme-success', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Том', type: 'tom', volume: 0.7, color: 'bg-theme-success', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Бас', type: 'bass', volume: 0.7, color: 'bg-theme-accent', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Синт', type: 'synth', volume: 0.5, color: 'bg-theme-accent', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Пэд', type: 'pad', volume: 0.4, color: 'bg-theme-primary', reverb: 0.3, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Крэш', type: 'crash', volume: 0.5, color: 'bg-theme-accent', reverb: 0.2, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Рим', type: 'rim', volume: 0.6, color: 'bg-theme-primary', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Перкуссия', type: 'perc', volume: 0.5, color: 'bg-theme-accent', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Пианино', type: 'piano', volume: 0.6, color: 'bg-theme-primary', reverb: 0.1, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Скрипка', type: 'violin', volume: 0.5, color: 'bg-theme-accent', reverb: 0.2, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Гитара', type: 'guitar', volume: 0.5, color: 'bg-theme-warning', reverb: 0.1, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Флейта', type: 'flute', volume: 0.4, color: 'bg-theme-accent', reverb: 0.2, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Саксофон', type: 'sax', volume: 0.5, color: 'bg-theme-accent', reverb: 0.15, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
  { name: 'Ударные', type: 'drums', volume: 0.7, color: 'bg-theme-muted', reverb: 0, delay: 0, filter: 0, pitch: 0, distortion: 0, bitcrush: 0, compressor: 0, eqLow: 0, eqMid: 0, eqHigh: 0, pan: 0, offset: 0, length: 1.0, finePitch: 0},
];

const GENRES = ['Хип-Хоп', 'Трэп', 'House', 'Техно', 'Lo-Fi', 'Драм-н-Бейс', 'Дабстеп', 'Рэгги', 'Рок', 'Поп', 'R&B', 'Фонк'];
const STEPS = 16;

const PIANO_START = 60;
const PIANO_END = 84;
const WHITE_KEYS: number[] = [];
const BLACK_KEYS: { midi: number; whiteIndex: number }[] = [];
for (let m = PIANO_START; m <= PIANO_END; m++) {
  const isBlack = [1, 3, 6, 8, 10].includes(m % 12);
  if (isBlack) {
    BLACK_KEYS.push({ midi: m, whiteIndex: WHITE_KEYS.length - 1 });
  } else {
    WHITE_KEYS.push(m);
  }
}
const NOTE_NAMES_RU = ['До', 'До#', 'Ре', 'Ре#', 'Ми', 'Фа', 'Фа#', 'Соль', 'Соль#', 'Ля', 'Ля#', 'Си'];
const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const midiToNameRu = (midi: number, t: (key: string) => string) => {
  const octave = Math.floor(midi / 12) - 1;
  return `${t(NOTE_NAMES_RU[midi % 12])}${octave}`;
};

const KEY_MAP: Record<string, number> = {
  'z': 60, 'x': 62, 'c': 64, 'v': 65, 'b': 67, 'n': 69, 'm': 71,
  'q': 72, 'w': 74, 'e': 76, 'r': 77, 't': 79, 'y': 81, 'u': 83,
  's': 61, 'd': 63, 'g': 66, 'h': 68, 'j': 70,
  '2': 73, '3': 75, '5': 78, '6': 80, '7': 82,
};

const MELODIC_TYPES: TrackType[] = ['synth', 'pad', 'piano', 'bass', 'violin', 'guitar', 'flute', 'sax'];
const PENTATONIC_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34, 36];

function createTrack(preset: Omit<Track, 'id' | 'steps' | 'muted'>): Track {
  return {
    ...preset,
    id: crypto.randomUUID(),
    steps: Array(STEPS).fill(false),
    muted: false,
  };
}

function ensureStepsLength(steps: boolean[], length: number): boolean[] {
  if (steps.length >= length) return steps.slice(0, length);
  return [...steps, ...Array(length - steps.length).fill(false)];
}

function normalizeTrack(t: Partial<Track>): Track {
  const preset = TRACK_PRESETS.find((p) => p.type === t.type) || TRACK_PRESETS[0];
  return {
    id: t.id || crypto.randomUUID(),
    name: t.name || preset.name,
    type: (t.type || preset.type) as TrackType,
    steps: Array.isArray(t.steps) ? t.steps.map((s) => !!s) : Array(STEPS).fill(false),
    volume: t.volume ?? preset.volume,
    muted: t.muted ?? false,
    color: t.color || preset.color,
    reverb: t.reverb ?? 0,
    delay: t.delay ?? 0,
    filter: t.filter ?? 0,
    pitch: t.pitch ?? 0,
    distortion: t.distortion ?? 0,
    bitcrush: t.bitcrush ?? 0,
    compressor: t.compressor ?? 0,
    eqLow: t.eqLow ?? 0,
    eqMid: t.eqMid ?? 0,
    eqHigh: t.eqHigh ?? 0,
    pan: t.pan ?? 0,
    offset: t.offset ?? 0,
    length: t.length ?? 1.0,
    finePitch: t.finePitch ?? 0,
  };
}

function createReverbImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function makeDistortionCurve(amount: number): Float32Array {
  const k = amount * 50;
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; ++i) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export type ExtendedEffects = {
  reverb: number; delay: number; filter: number; pitch: number;
  distortion: number; bitcrush: number; compressor: number;
  eqLow: number; eqMid: number; eqHigh: number; pan: number;
  offset: number;      // Сдвиг в шагах (0-15)
  length: number;      // Множитель длительности (0.1 - 2.0)
  finePitch: number;   // Доп. питч без влияния на фильтр (-12 до 12)
};

export function makeSound(
  ctx: AudioContext,
  analyser: AnalyserNode | null,
  type: TrackType,
  time: number,
  volume: number,
  effects: ExtendedEffects,
  bpm: number,
  stepIndex?: number,
) {
    // Вычисляем реальное время старта с учётом offset (сдвиг в шагах)

  const stepDuration = 60 / bpm / 4; // Длительность одного шага в секундах (для 16-х нот)
  const actualTime = time + (effects.offset / 16 || 0) * stepDuration;

    // Защита от NaN
  if (!isFinite(actualTime) || !isFinite(volume)) return;

  // Множитель длины звука
  const lengthMultiplier = effects.length || 1.0;
  
  // Множитель частоты для finePitch
  const finePitchMultiplier = isFinite(Math.pow(2, (effects.finePitch || 0) / 12)) ? Math.pow(2, (effects.finePitch || 0) / 12) : 1;

  const safePitch = isFinite(finePitchMultiplier) ? finePitchMultiplier : 1;
  const safeLength = isFinite(lengthMultiplier) ? lengthMultiplier : 1;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;

  // Connect through optional analyser for visualizer
  if (analyser) {
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
  } else {
    masterGain.connect(ctx.destination);
  }

  // Build a serial effects chain: source → effect1 → effect2 → ... → masterGain → destination
  // Each new effect inserts at the head: effect.connect(chainTail), chainTail = effect
  let chainTail: AudioNode = masterGain;
  let chainInput: AudioNode = masterGain;
  let hasEffects = false;

  // EQ (3-band)
  if (effects.eqLow !== 0 || effects.eqMid !== 0 || effects.eqHigh !== 0) {
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 200;
    eqLow.gain.value = effects.eqLow * 12;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.gain.value = effects.eqMid * 12;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 5000;
    eqHigh.gain.value = effects.eqHigh * 12;

    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(chainTail);
    chainTail = eqLow;
    chainInput = eqLow;
    hasEffects = true;
  }

  // Distortion
  if (effects.distortion > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(effects.distortion);
    shaper.oversample = '4x';
    shaper.connect(chainTail);
    chainTail = shaper;
    chainInput = shaper;
    hasEffects = true;
  }

  // Bitcrush
  if (effects.bitcrush > 0) {
    const bcShaper = ctx.createWaveShaper();
    const bits = Math.max(2, 16 - effects.bitcrush * 14);
    const bcN = 44100;
    const bcCurve = new Float32Array(bcN);
    const levels = Math.pow(2, bits);
    for (let i = 0; i < bcN; ++i) {
      const x = (i * 2) / bcN - 1;
      bcCurve[i] = Math.round(x * levels) / levels;
    }
    bcShaper.curve = bcCurve;
    bcShaper.connect(chainTail);
    chainTail = bcShaper;
    chainInput = bcShaper;
    hasEffects = true;
  }

  // Compressor
  if (effects.compressor > 0) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24 - effects.compressor * 12;
    comp.ratio.value = 2 + effects.compressor * 10;
    comp.knee.value = 10;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(chainTail);
    chainTail = comp;
    chainInput = comp;
    hasEffects = true;
  }

  // Filter
  if (effects.filter > 0) {
    const filterNode = ctx.createBiquadFilter();
    filterNode.type = effects.filter > 0.5 ? 'highpass' : 'lowpass';
    filterNode.frequency.value = effects.filter > 0.5
      ? 200 + effects.filter * 4000
      : 20000 - effects.filter * 18000;
    filterNode.Q.value = 1;
    filterNode.connect(chainTail);
    chainTail = filterNode;
    chainInput = filterNode;
    hasEffects = true;
  }

  // Delay
  if (effects.delay > 0) {
    const delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.value = 0.25 * effects.delay;
    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = 0.3 * effects.delay;
    const wetGain = ctx.createGain();
    wetGain.gain.value = effects.delay * 0.5;
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - effects.delay * 0.5;
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    delayNode.connect(wetGain);
    wetGain.connect(chainTail);
    dryGain.connect(chainTail);
    const mergeGain = ctx.createGain();
    mergeGain.connect(delayNode);
    mergeGain.connect(dryGain);
    chainTail = mergeGain;
    chainInput = mergeGain;
    hasEffects = true;
  }

  // Reverb
  if (effects.reverb > 0) {
    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx, 2 * effects.reverb, 3);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = effects.reverb * 0.6;
    const dryReverbGain = ctx.createGain();
    dryReverbGain.gain.value = 1 - effects.reverb * 0.6;
    convolver.connect(reverbGain);
    reverbGain.connect(chainTail);
    dryReverbGain.connect(chainTail);
    const reverbMerge = ctx.createGain();
    reverbMerge.connect(convolver);
    reverbMerge.connect(dryReverbGain);
    chainTail = reverbMerge;
    chainInput = reverbMerge;
    hasEffects = true;
  }

  // Panning
  if (effects.pan !== 0) {
    const panNode = ctx.createStereoPanner();
    panNode.pan.value = effects.pan;
    panNode.connect(chainTail);
    chainTail = panNode;
    chainInput = panNode;
    hasEffects = true;
  }

  const basePitch = Math.pow(2, effects.pitch / 12);
  const pitchMultiplier = basePitch;

  function connectToChain(node: AudioNode) {
    node.connect(hasEffects ? chainInput : masterGain);
  }

  switch (type) {
    case 'kick': {
      const click = ctx.createOscillator();
      click.type = 'square';
      click.frequency.setValueAtTime(1200 * pitchMultiplier * finePitchMultiplier, actualTime);
      click.frequency.exponentialRampToValueAtTime(40, actualTime + 0.02);
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(volume * 0.4, actualTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.03 * lengthMultiplier);
      click.connect(clickGain);
      connectToChain(clickGain);
      click.start(actualTime);
      click.stop(actualTime + 0.03 * lengthMultiplier);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150 * pitchMultiplier * finePitchMultiplier, actualTime);
      osc.frequency.exponentialRampToValueAtTime(30, actualTime + 0.08);
      osc.frequency.exponentialRampToValueAtTime(30, actualTime + 0.5);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(volume, actualTime);
      oscGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.5 * lengthMultiplier);
      osc.connect(oscGain);
      connectToChain(oscGain);
      osc.start(actualTime);
      osc.stop(actualTime + 0.5 * lengthMultiplier + 0.1);
      break;
    }
    case 'snare': {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, 4410, 44100);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < 4410; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 1000;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(volume * 0.7, actualTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.2 * lengthMultiplier);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      connectToChain(noiseGain);
      noise.start(actualTime);
      noise.stop(actualTime + 0.2 * lengthMultiplier);

      const tone = ctx.createOscillator();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(200 * pitchMultiplier * finePitchMultiplier, actualTime);
      const toneFilter = ctx.createBiquadFilter();
      toneFilter.type = 'bandpass';
      toneFilter.frequency.value = 200;
      toneFilter.Q.value = 2;
      const toneGain = ctx.createGain();
      toneGain.gain.setValueAtTime(volume * 0.4, actualTime);
      toneGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.15 * lengthMultiplier);
      tone.connect(toneFilter);
      toneFilter.connect(toneGain);
      connectToChain(toneGain);
      tone.start(actualTime);
      tone.stop(actualTime + 0.15 * lengthMultiplier);
      break;
    }
    case 'hihat': {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(10000 * pitchMultiplier * finePitchMultiplier, actualTime);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 10000;
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(volume * 0.3, actualTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.03 * lengthMultiplier);
      osc.connect(filter);
      filter.connect(oscGain);
      connectToChain(oscGain);
      osc.start(actualTime);
      osc.stop(actualTime + 0.03 * lengthMultiplier);
      break;
    }
    case 'openhat': {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, 22050, 44100);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < 22050; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      noise.playbackRate.value = basePitch;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      noise.connect(filter);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(volume, actualTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.3 * lengthMultiplier);
      filter.connect(noiseGain);
      connectToChain(noiseGain);
      noise.start(actualTime);
      noise.stop(actualTime + 0.3 * lengthMultiplier);
      break;
    }
    case 'clap': {
      for (let i = 0; i < 3; i++) {
        const noise = ctx.createBufferSource();
        const buffer = ctx.createBuffer(1, 2205, 44100);
        const data = buffer.getChannelData(0);
        for (let j = 0; j < 2205; j++) data[j] = Math.random() * 2 - 1;
        noise.buffer = buffer;
        noise.playbackRate.value = basePitch;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1500 * basePitch;
        noise.connect(filter);
        const clapGain = ctx.createGain();
        clapGain.gain.setValueAtTime(volume, actualTime + i * 0.01);
        clapGain.gain.exponentialRampToValueAtTime(0.01, actualTime + i * 0.01 + 0.1 * lengthMultiplier);
        filter.connect(clapGain);
        connectToChain(clapGain);
        noise.start(actualTime + i * 0.01);
        noise.stop(actualTime + i * 0.01 + 0.1 * lengthMultiplier);
      }
      break;
    }
    case 'tom': {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(200 * pitchMultiplier * finePitchMultiplier, actualTime);
      osc.frequency.exponentialRampToValueAtTime(80, actualTime + 0.3);
      const tomGain = ctx.createGain();
      tomGain.gain.setValueAtTime(volume, actualTime);
      tomGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.3 * lengthMultiplier);
      osc.connect(tomGain);
      connectToChain(tomGain);
      osc.start(actualTime);
      osc.stop(actualTime + 0.3 * lengthMultiplier);
      break;
    }
    case 'bass': {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 8;
      filter.frequency.setValueAtTime(200 * finePitchMultiplier, actualTime);
      filter.frequency.exponentialRampToValueAtTime(800, actualTime + 0.1);
      filter.frequency.exponentialRampToValueAtTime(200, actualTime + 0.3);
      const bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(volume, actualTime);
      bassGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.3 * lengthMultiplier);
      filter.connect(bassGain);
      connectToChain(bassGain);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(80 * pitchMultiplier * finePitchMultiplier, actualTime);
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(80.5 * pitchMultiplier * finePitchMultiplier, actualTime);
      osc1.connect(filter);
      osc2.connect(filter);

      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(40 * pitchMultiplier * finePitchMultiplier, actualTime);
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      sub.connect(subGain);
      subGain.connect(filter);

      osc1.start(actualTime);
      osc1.stop(actualTime + 0.3 * lengthMultiplier);
      osc2.start(actualTime);
      osc2.stop(actualTime + 0.3 * lengthMultiplier);
      sub.start(actualTime);
      sub.stop(actualTime + 0.3 * lengthMultiplier);
      break;
    }
    case 'synth': {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000 * finePitchMultiplier, actualTime);
      filter.frequency.exponentialRampToValueAtTime(800, actualTime + 0.2);
      filter.Q.value = 2;
      const synthGain = ctx.createGain();
      synthGain.gain.setValueAtTime(volume * 0.25, actualTime);
      synthGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.2 * lengthMultiplier);
      filter.connect(synthGain);
      connectToChain(synthGain);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(440 * pitchMultiplier * finePitchMultiplier, actualTime);
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(442 * pitchMultiplier * finePitchMultiplier, actualTime);
      osc1.connect(filter);
      osc2.connect(filter);

      osc1.start(actualTime);
      osc1.stop(actualTime + 0.2 * lengthMultiplier);
      osc2.start(actualTime);
      osc2.stop(actualTime + 0.2 * lengthMultiplier);
      break;
    }
    case 'pad': {
      const padGain = ctx.createGain();
      padGain.gain.setValueAtTime(0.0001, actualTime);
      padGain.gain.linearRampToValueAtTime(volume * 0.2, actualTime + 0.2);
      padGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 1.0 * lengthMultiplier);
      connectToChain(padGain);

      const freqs = [220, 220.5, 277].map((f) => f * pitchMultiplier);
      const types: OscillatorType[] = ['sine', 'triangle', 'sine'];
      freqs.map((f, i) => {
        const o = ctx.createOscillator();
        o.type = types[i];
        o.frequency.setValueAtTime(f * finePitchMultiplier, actualTime);
        o.connect(padGain);
        o.start(actualTime);
        o.stop(actualTime + 1.0 * lengthMultiplier);
        return o;
      });
      break;
    }
    case 'crash': {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, 35280, 44100);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < 35280; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      noise.playbackRate.value = basePitch;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 5000;
      noise.connect(filter);
      const crashGain = ctx.createGain();
      crashGain.gain.setValueAtTime(volume, actualTime);
      crashGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.8 * lengthMultiplier);
      filter.connect(crashGain);
      connectToChain(crashGain);
      noise.start(actualTime);
      noise.stop(actualTime + 0.8 * lengthMultiplier);
      break;
    }
    case 'rim': {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800 * pitchMultiplier * finePitchMultiplier, actualTime);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(volume * 0.5, actualTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.05 * lengthMultiplier);
      osc.connect(oscGain);
      connectToChain(oscGain);
      osc.start(actualTime);
      osc.stop(actualTime + 0.05 * lengthMultiplier);
      break;
    }
    case 'perc': {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, 4410, 44100);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < 4410; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      noise.playbackRate.value = basePitch;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2500 * basePitch;
      filter.Q.value = 2;
      noise.connect(filter);
      const percGain = ctx.createGain();
      percGain.gain.setValueAtTime(volume, actualTime);
      percGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.1 * lengthMultiplier);
      filter.connect(percGain);
      connectToChain(percGain);
      noise.start(actualTime);
      noise.stop(actualTime + 0.1 * lengthMultiplier);
      break;
    }
    case 'piano': {
      const fundamental = 440 * pitchMultiplier;
      const harmonics = [
        { freq: fundamental, gain: 0.6 },
        { freq: fundamental * 2, gain: 0.3 },
        { freq: fundamental * 3, gain: 0.15 },
      ];
      const pianoGain = ctx.createGain();
      pianoGain.gain.setValueAtTime(0.0001, actualTime);
      pianoGain.gain.linearRampToValueAtTime(volume, actualTime + 0.005);
      pianoGain.gain.exponentialRampToValueAtTime(0.01, actualTime + 0.5 * lengthMultiplier);
      connectToChain(pianoGain);

      harmonics.forEach((h) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(h.freq * finePitchMultiplier, actualTime);
        const hGain = ctx.createGain();
        hGain.gain.value = h.gain;
        osc.connect(hGain);
        hGain.connect(pianoGain);
        osc.start(actualTime);
        osc.stop(actualTime + 0.5 * lengthMultiplier);
      });
      break;
    }
    case 'violin': {
      const fundamental = 440 * pitchMultiplier;
      const vibratoLFO = ctx.createOscillator();
      vibratoLFO.frequency.value = 5;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = 3;
      vibratoLFO.connect(vibratoGain);
      const vFilter = ctx.createBiquadFilter();
      vFilter.type = 'lowpass';
      vFilter.frequency.value = 3500;
      vFilter.Q.value = 1;
      const vGain = ctx.createGain();
      vGain.gain.setValueAtTime(0.0001, actualTime);
      vGain.gain.linearRampToValueAtTime(volume * 0.3, actualTime + 0.08);
      vGain.gain.linearRampToValueAtTime(volume * 0.2, actualTime + 0.3);
      vGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.8 * lengthMultiplier);
      vFilter.connect(vGain);
      connectToChain(vGain);
      const bowNoise = ctx.createBufferSource();
      const bowBuf = ctx.createBuffer(1, 4410, 44100);
      const bowData = bowBuf.getChannelData(0);
      for (let i = 0; i < 4410; i++) bowData[i] = (Math.random() * 2 - 1) * 0.05;
      bowNoise.buffer = bowBuf;
      const bowFilter = ctx.createBiquadFilter();
      bowFilter.type = 'bandpass';
      bowFilter.frequency.value = 2000;
      bowNoise.connect(bowFilter);
      bowFilter.connect(vGain);
      const vOsc = ctx.createOscillator();
      vOsc.type = 'sawtooth';
      vOsc.frequency.setValueAtTime(fundamental * finePitchMultiplier, actualTime);
      vibratoGain.connect(vOsc.frequency);
      vOsc.connect(vFilter);
      vOsc.start(actualTime); vOsc.stop(actualTime + 0.8 * lengthMultiplier);
      vibratoLFO.start(actualTime); vibratoLFO.stop(actualTime + 0.8 * lengthMultiplier);
      bowNoise.start(actualTime); bowNoise.stop(actualTime + 0.1 * lengthMultiplier);
      break;
    }
    case 'guitar': {
      const fundamental = 220 * pitchMultiplier;
      const gFilter = ctx.createBiquadFilter();
      gFilter.type = 'lowpass';
      gFilter.frequency.setValueAtTime(4000 * finePitchMultiplier, actualTime);
      gFilter.frequency.exponentialRampToValueAtTime(800, actualTime + 0.4);
      gFilter.Q.value = 2;
      const gGain = ctx.createGain();
      gGain.gain.setValueAtTime(0.0001, actualTime);
      gGain.gain.linearRampToValueAtTime(volume * 0.4, actualTime + 0.003);
      gGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.5 * lengthMultiplier);
      gFilter.connect(gGain);
      connectToChain(gGain);
      const gHarmonics = [
        { freq: fundamental, gain: 0.5, type: 'triangle' as OscillatorType },
        { freq: fundamental * 2, gain: 0.2, type: 'sine' as OscillatorType },
        { freq: fundamental * 3, gain: 0.1, type: 'sine' as OscillatorType },
        { freq: fundamental * 4, gain: 0.05, type: 'sine' as OscillatorType },
      ];
      gHarmonics.forEach((h) => {
        const osc = ctx.createOscillator();
        osc.type = h.type;
        osc.frequency.setValueAtTime(h.freq * finePitchMultiplier, actualTime);
        const hGain = ctx.createGain();
        hGain.gain.value = h.gain;
        osc.connect(hGain); hGain.connect(gFilter);
        osc.start(actualTime); osc.stop(actualTime + 0.5 * lengthMultiplier);
      });
      break;
    }
    case 'flute': {
      const fundamental = 660 * pitchMultiplier;
      const fFilter = ctx.createBiquadFilter();
      fFilter.type = 'bandpass';
      fFilter.frequency.value = fundamental * 2;
      fFilter.Q.value = 5;
      const fGain = ctx.createGain();
      fGain.gain.setValueAtTime(0.0001, actualTime);
      fGain.gain.linearRampToValueAtTime(volume * 0.3, actualTime + 0.15);
      fGain.gain.linearRampToValueAtTime(volume * 0.25, actualTime + 0.4);
      fGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.7 * lengthMultiplier);
      fFilter.connect(fGain);
      connectToChain(fGain);
      const breathNoise = ctx.createBufferSource();
      const breathBuf = ctx.createBuffer(1, 22050, 44100);
      const breathData = breathBuf.getChannelData(0);
      for (let i = 0; i < 22050; i++) breathData[i] = Math.random() * 2 - 1;
      breathNoise.buffer = breathBuf;
      const breathFilter = ctx.createBiquadFilter();
      breathFilter.type = 'bandpass';
      breathFilter.frequency.value = fundamental * 3;
      breathFilter.Q.value = 10;
      const breathGain = ctx.createGain();
      breathGain.gain.value = 0.08;
      breathNoise.connect(breathFilter); breathFilter.connect(breathGain); breathGain.connect(fGain);
      const fOsc = ctx.createOscillator();
      fOsc.type = 'sine';
      fOsc.frequency.setValueAtTime(fundamental * finePitchMultiplier, actualTime);
      const fLFO = ctx.createOscillator(); fLFO.frequency.value = 4;
      const fLFOGain = ctx.createGain(); fLFOGain.gain.value = 2;
      fLFO.connect(fLFOGain); fLFOGain.connect(fOsc.frequency);
      fOsc.connect(fFilter);
      fOsc.start(actualTime); fOsc.stop(actualTime + 0.7 * lengthMultiplier);
      fLFO.start(actualTime); fLFO.stop(actualTime + 0.7 * lengthMultiplier);
      breathNoise.start(actualTime); breathNoise.stop(actualTime + 0.5 * lengthMultiplier);
      break;
    }
    case 'sax': {
      const fundamental = 330 * pitchMultiplier;
      const sFilter = ctx.createBiquadFilter();
      sFilter.type = 'bandpass';
      sFilter.frequency.value = 1200;
      sFilter.Q.value = 3;
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0.0001, actualTime);
      sGain.gain.linearRampToValueAtTime(volume * 0.35, actualTime + 0.05);
      sGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.6 * lengthMultiplier);
      sFilter.connect(sGain);
      connectToChain(sGain);
      const sOsc1 = ctx.createOscillator();
      sOsc1.type = 'sawtooth';
      sOsc1.frequency.setValueAtTime(fundamental * finePitchMultiplier, actualTime);
      const sOsc2 = ctx.createOscillator();
      sOsc2.type = 'square';
      sOsc2.frequency.setValueAtTime(fundamental * 0.5 * finePitchMultiplier, actualTime);
      const sOsc2Gain = ctx.createGain(); sOsc2Gain.gain.value = 0.3;
      sOsc1.connect(sFilter); sOsc2.connect(sOsc2Gain); sOsc2Gain.connect(sFilter);
      const sLFO = ctx.createOscillator(); sLFO.frequency.value = 5;
      const sLFOGain = ctx.createGain(); sLFOGain.gain.value = 4;
      sLFO.connect(sLFOGain); sLFOGain.connect(sOsc1.frequency);
      sOsc1.start(actualTime); sOsc1.stop(actualTime + 0.6 * lengthMultiplier);
      sOsc2.start(actualTime); sOsc2.stop(actualTime + 0.6 * lengthMultiplier);
      sLFO.start(actualTime); sLFO.stop(actualTime + 0.6 * lengthMultiplier);
      break;
    }
    case 'drums': {
      const drKick = ctx.createOscillator();
      drKick.type = 'sine';
      drKick.frequency.setValueAtTime(150 * pitchMultiplier * finePitchMultiplier, actualTime);
      drKick.frequency.exponentialRampToValueAtTime(30, actualTime + 0.1);
      const drKickGain = ctx.createGain();
      drKickGain.gain.setValueAtTime(volume * 0.5, actualTime);
      drKickGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.15 * lengthMultiplier);
      drKick.connect(drKickGain);
      connectToChain(drKickGain);
      drKick.start(actualTime); drKick.stop(actualTime + 0.15 * lengthMultiplier);
      const drSnare = ctx.createBufferSource();
      const drSnareBuf = ctx.createBuffer(1, 4410, 44100);
      const drSnareData = drSnareBuf.getChannelData(0);
      for (let i = 0; i < 4410; i++) drSnareData[i] = Math.random() * 2 - 1;
      drSnare.buffer = drSnareBuf;
      const drSnareFilter = ctx.createBiquadFilter();
      drSnareFilter.type = 'highpass';
      drSnareFilter.frequency.value = 1500;
      const drSnareGain = ctx.createGain();
      drSnareGain.gain.setValueAtTime(volume * 0.3, actualTime + 0.01);
      drSnareGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.12 * lengthMultiplier);
      drSnare.connect(drSnareFilter); drSnareFilter.connect(drSnareGain);
      connectToChain(drSnareGain);
      drSnare.start(actualTime); drSnare.stop(actualTime + 0.12 * lengthMultiplier);
      const drHat = ctx.createOscillator();
      drHat.type = 'square';
      drHat.frequency.value = 8000;
      const drHatFilter = ctx.createBiquadFilter();
      drHatFilter.type = 'highpass';
      drHatFilter.frequency.value = 8000;
      const drHatGain = ctx.createGain();
      drHatGain.gain.setValueAtTime(volume * 0.15, actualTime + 0.02);
      drHatGain.gain.exponentialRampToValueAtTime(0.001, actualTime + 0.05 * lengthMultiplier);
      drHat.connect(drHatFilter); drHatFilter.connect(drHatGain);
      connectToChain(drHatGain);
      drHat.start(actualTime); drHat.stop(actualTime + 0.05 * lengthMultiplier);
      break;
    }
  }
}

// Play a melodic note from the piano keyboard at a given pitch
function playMelodicNote(
  ctx: AudioContext,
  analyser: AnalyserNode | null,
  midi: number,
  volume: number,
) {
  const freq = midiToFreq(midi);
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  if (analyser) {
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
  } else {
    masterGain.connect(ctx.destination);
  }

  // Piano-like timbre
  const harmonics = [
    { freq, gain: 0.5, type: 'triangle' as OscillatorType },
    { freq: freq * 2, gain: 0.2, type: 'sine' as OscillatorType },
    { freq: freq * 3, gain: 0.08, type: 'sine' as OscillatorType },
  ];

  harmonics.forEach((h) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = h.type;
    osc.frequency.value = h.freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(h.gain, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
  });
}

// Visualizer canvas component
function Visualizer({ analyserRef }: { analyserRef: React.RefObject<AnalyserNode | null> }) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      if (!analyser) return;

      const w = canvas.width;
      const h = canvas.height;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Disable smoothing for crisp pixel rendering
      ctx2d.imageSmoothingEnabled = false;

      // Hard clear (reduced trail/blur for sharper edges)
      ctx2d.fillStyle = 'rgba(10, 14, 39, 0.85)';
      ctx2d.fillRect(0, 0, w, h);

      const barWidth = Math.max(2, Math.floor((w / bufferLength) * 2.5));
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = Math.round((dataArray[i] / 255) * h);
        const y = h - barHeight;
        const top = h - barHeight;
        // Solid two-tone fill: vibrant top, deep base — no soft gradient blur
        ctx2d.fillStyle = '#0ea5e9';
        ctx2d.fillRect(x, top, barWidth, barHeight);
        // Hard bright cap on top edge
        ctx2d.fillStyle = barHeight > 3 ? '#ec4899' : '#6366f1';
        ctx2d.fillRect(x, top, barWidth, Math.min(4, barHeight));
        x += barWidth + 1;
      }
    };

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [analyserRef]);

  return (
    <div className="beat-sequencer bg-theme-surface/50 border border-theme-border rounded-2xl p-2 glass-surface">
      <div className="flex items-center gap-2 mb-1 px-2">
        <AudioWaveform className="w-3.5 h-3.5 text-theme-primary" />
        <span className="text-[10px] text-theme-muted uppercase tracking-wider">{t('Визуализатор')}</span>
      </div>
      <canvas ref={canvasRef} className="w-full block rounded-lg" style={{ height: 80, imageRendering: 'crisp-edges' }} />
    </div>
  );
}

export default function BeatComposerPage({ isActive = true }: { isActive?: boolean }) {
  const { profile, session, isGuest, addXp, addCoins, checkAchievements } = useAuth();
  const isPremium = profile?.is_premium === true;


  const [tracks, setTracks] = useState<Track[]>(() =>
    TRACK_PRESETS.slice(0, 4).map(createTrack)
  );

  const { t } = useLocale();
  
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [genre, setGenre] = useState('Хип-Хоп');
  const [projectName, setProjectName] = useState('Без названия');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<{ id: string; name: string }[]>([]);
  const [soloTrack, setSoloTrack] = useState<string | null>(null);
  const [swing, setSwing] = useState(0);
  const [masterVolume, setMasterVolume] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);
  const [showPremiumPrompt, setShowPremiumPrompt] = useState(false);
  const [activePitch, setActivePitch] = useState<number | null>(null);
  const [showPiano, setShowPiano] = useState(false);
  const [effectsTab, setEffectsTab] = useState<'basic' | 'pro'>('basic');
  const [bars, setBars] = useState(1); // 1–256 bars, each bar = 16 steps
  const [trackSearch, setTrackSearch] = useState('');
  const [editingBpm, setEditingBpm] = useState<number | null>(null);

  const [pubCommentAccess, setPubCommentAccess] = useState<'all' | 'premium' | 'nobody'>('all');
  const [pubPriceGem, setPubPriceGem] = useState(100);
  const [pubPriceCoin, setPubPriceCoin] = useState(1000);
  const [pubIsHot, setPubIsHot] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [pubDescription, setPubDescription] = useState('');
  const [pubDownloadAccess, setPubDownloadAccess] = useState<'premium' | 'paid' | 'nobody'>('premium');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const tracksRef = useRef(tracks);
  const bpmRef = useRef(bpm);
  const isPlayingRef = useRef(isPlaying);
  const scrubPositionRef = useRef(0);
  const barsRef = useRef(bars);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { barsRef.current = bars; }, [bars]);
  useEffect(() => {
    setTracks(prev => prev.map(t => ({ ...t, steps: ensureStepsLength(t.steps, STEPS * bars) })));
  }, [bars]);
  const swingRef = useRef(swing);
  useEffect(() => { swingRef.current = swing; }, [swing]);
  const soloTrackRef = useRef(soloTrack);
  useEffect(() => { soloTrackRef.current = soloTrack; }, [soloTrack]);
  const masterVolRef = useRef(masterVolume);
  useEffect(() => { masterVolRef.current = masterVolume; }, [masterVolume]);

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
    }
    return audioCtxRef.current;
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
    setCurrentStep(-1);
    stepRef.current = 0;
  }, []);

  const play = useCallback(async (fromStep?: number) => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const stepDuration = 60000 / bpmRef.current / 4;
    const startStep = fromStep ?? 0;
    stepRef.current = startStep;
    scrubPositionRef.current = startStep;
    setIsPlaying(true);

    const tick = () => {
      const step = stepRef.current;
      const totalSteps = STEPS * barsRef.current;
      setCurrentStep(step);
      scrubPositionRef.current = step;
      const actualTime = ctx.currentTime;
      const swingOffset = step % 2 === 1 ? (swingRef.current * stepDuration * 0.25) / 1000 : 0;
      tracksRef.current.forEach((track) => {
        const audible = soloTrackRef.current ? track.id === soloTrackRef.current : !track.muted;
        if (audible && track.steps[step]) {
          makeSound(ctx, analyserRef.current, track.type, actualTime + swingOffset, track.volume * masterVolRef.current, {
            reverb: track.reverb,
            delay: track.delay,
            filter: track.filter,
            pitch: track.pitch,
            distortion: track.distortion,
            bitcrush: track.bitcrush,
            compressor: track.compressor,
            eqLow: track.eqLow,
            eqMid: track.eqMid,
            eqHigh: track.eqHigh,
            pan: track.pan,
            offset: track.offset || 0,
            length: track.length || 1.0,
            finePitch: track.finePitch || 0,
          }, bpm, step);
        }
      });
      stepRef.current = (step + 1) % totalSteps;
    };

    tick();
    intervalRef.current = window.setInterval(tick, stepDuration);
  }, [getCtx]);

  const playRef = useRef(play);
  const stopRef = useRef(stop);
  useEffect(() => { playRef.current = play; }, [play]);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  // Keyboard shortcut for spacebar play/stop (only when page is active)
  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) {
        e.preventDefault();
        if (isPlayingRef.current) stopRef.current(); else playRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isActive]);

  // Piano keyboard input (only when page is active)
  const heldKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.repeat || !KEY_MAP[key]) return;
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
      if (heldKeysRef.current.has(key)) return;
      heldKeysRef.current.add(key);
      const midi = KEY_MAP[key];
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume();
      playMelodicNote(ctx, analyserRef.current, midi, masterVolRef.current * 0.5);
      setActivePitch(midi);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!KEY_MAP[key]) return;
      heldKeysRef.current.delete(key);
      setActivePitch(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [getCtx, masterVolume, isActive]);

  const previewPianoKey = (midi: number) => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    playMelodicNote(ctx, analyserRef.current, midi, masterVolRef.current * 0.5);
    setActivePitch(midi);
    setTimeout(() => setActivePitch(null), 200);
  };

  const toggleStep = (trackId: string, step: number) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? { ...t, steps: t.steps.map((s, i) => (i === step ? !s : s)) }
          : t
      )
    );
  };

const addTrack = (presetType?: TrackType) => {
  const maxTracks = isPremium ? 60 : 15;
  
  if (tracks.length >= maxTracks) {
    alert(t(`Достигнут максимальный лимит в ${maxTracks} дорожек${isPremium ? ' (Premium)' : ''}`));
    return;
  }
  
  const used = tracks.map((t) => t.type);
  const preset = presetType
    ? TRACK_PRESETS.find((p) => p.type === presetType && !used.includes(p.type))
    : TRACK_PRESETS.find((p) => !used.includes(p.type));
  
  if (preset) {
    setTracks([...tracks, createTrack(preset)]);
  }
};

  const removeTrack = (id: string) => {
    setTracks(tracks.filter((t) => t.id !== id));
    if (selectedTrackId === id) {
      setSelectedTrackId(null);
      setShowEffectsPanel(false);
    }
  };

  const toggleMute = (id: string) => {
    setTracks(tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)));
  };

  const setTrackVolume = (id: string, vol: number) => {
    setTracks(tracks.map((t) => (t.id === id ? { ...t, volume: vol } : t)));
  };

  type BasicEffect = 'reverb' | 'delay' | 'filter' | 'pitch';
  type ProEffect = 'distortion' | 'bitcrush' | 'compressor' | 'eqLow' | 'eqMid' | 'eqHigh' | 'pan';

  const setTrackEffect = (id: string, effect: BasicEffect | ProEffect, value: number) => {
    setTracks(tracks.map((t) => (t.id === id ? { ...t, [effect]: value } : t)));
  };

  const clearAll = () => {
    setTracks((prev) => prev.map((t) => ({ ...t, steps: Array(STEPS * bars).fill(false) })));
  };

  const toggleSolo = (id: string) => {
    setSoloTrack((prev) => prev === id ? null : id);
  };

  const copyPattern = (id: string) => {
    const track = tracks.find((t) => t.id === id);
    if (track) navigator.clipboard?.writeText(JSON.stringify(track.steps)).catch(() => {});
  };

  const pastePattern = (id: string) => {
    navigator.clipboard?.readText().then((text) => {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const targetLength = STEPS * bars;
          const bools = parsed.map((s: unknown) => !!s);
          while (bools.length < targetLength) bools.push(false);
          setTracks((prev) => prev.map((t) => t.id === id ? { ...t, steps: bools.slice(0, targetLength) } : t));
        }
      } catch { /* invalid clipboard */ }
    }).catch(() => {});
  };

  const duplicateTrack =   useCallback((id: string) => {
    const maxTracks = isPremium ? 60 : 15;
  
    setTracks((prev) => {
    // 1. Проверка лимита
      if (prev.length >= maxTracks)   {
        alert(t(`Достигнут лимит в     ${maxTracks} дорожек${isPremium ? ' (Premium)' : ''}`));
      return prev;
      }

    // 2. Находим исходную дорожку
      const sourceTrack = prev.find((t) => t.id === id);
      if (!sourceTrack) return prev;

    // 3. Создаём ТОЧНУЮ копию со всеми настройками (volume, эффекты, offset, length, finePitch и т.д.)
      const newTrack: Track = {
        ...sourceTrack, // Копируем ВСЕ текущие параметры дорожки
        id: crypto.randomUUID(), // Генерируем новый ID
        name: `${sourceTrack.name} (Копия)`, // Добавляем пометку к имени
        steps: [...sourceTrack.steps], // Делаем независимую копию массива шагов
        muted: false // Снимаем мьют с новой копии, чтобы её было слышно
      };

    // 4. Вставляем копию сразу ПОСЛЕ оригинала (для удобства)
      const index = prev.findIndex((t) => t.id === id);
      return [
        ...prev.slice(0, index + 1),
        newTrack,
        ...prev.slice(index + 1)
      ];
    });
  }, [isPremium, t]);

  const loadDemoBeat = (g: string) => {
    setGenre(g);
    const patterns: Record<string, boolean[][]> = {
      'Хип-Хоп': [
        [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        [true, false, false, true, false, false, true, false, true, false, false, true, false, false, true, false],
      ],
      Трэп: [
        [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      ],
      House: [
        [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
        [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      ],
      Техно: [
        [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      ],
      'Lo-Fi': [
        [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
        [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
      ],
      'Драм-н-Бейс': [
        [true, false, false, false, false, true, false, false, true, false, false, true, false, false, true, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [true, false, true, true, false, true, true, false, true, true, false, true, true, false, true, true],
        [false, false, true, false, false, true, false, false, false, false, true, false, false, true, false, false],
      ],
      Дабстеп: [
        [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
        [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
        [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        [false, false, false, false, true, false, false, true, false, false, false, false, true, false, true, false],
      ],
      Рэгги: [
        [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      ],
      Рок: [
        [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
        [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      ],
      Поп: [
        [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
        [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      ],
      'R&B': [
        [true, false, false, false, false, true, false, false, true, false, false, false, false, false, true, false],
        [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
        [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
        [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      ],
      Фонк: [
        [true, false, false, true, true, false, false, true, true, false, true, false, true, false, false, true],
        [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
        [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
        [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      ],
    };
    const pattern = patterns[g] || patterns['Хип-Хоп'];
    setTracks((prev) =>
      prev.map((t, i) => ({
        ...t,
        steps: pattern[i] ? [...pattern[i]] : t.steps,
      }))
    );
  };

  const saveProject = async () => {
    if (!profile) return;
    if (isGuest || !session?.user) {
      try {
        const localProjects = JSON.parse(localStorage.getItem('beat_projects') || '[]');
        localProjects.unshift({ id: crypto.randomUUID(), name: projectName, data: { tracks, bpm, genre, bars } });
        localStorage.setItem('beat_projects', JSON.stringify(localProjects.slice(0, 20)));
        setSavedProjects(localProjects.slice(0, 10).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
        setSaveStatus(t('Гостевой режим — сохранено локально. Войдите в аккаунт для сохранения в облако.'));
      } catch {
        setSaveStatus(t('Ошибка при сохранении'));
      }
      setTimeout(() => setSaveStatus(null), 3500);
      return;
    }
    setSaveStatus(t('Сохранение...'));
    const hasSteps = tracks.some((t) => t.steps.some((s) => s));
    try {
      const { error } = await supabase.from('projects').insert({
        user_id: profile.id,
        name: projectName,
        data: { tracks, bpm, genre, bars },
        genre,
        bpm,
      });
      if (error) throw error;

      setSaveStatus(t('Сохранено в проекты и библиотеку!'));
      await addXp(50);
      await addCoins(10);
      loadProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('Ошибка при сохранении');
      setSaveStatus(t('Ошибка:') + ' ' + msg);
    }
    setTimeout(() => setSaveStatus(null), 3500);
  };


  const loadProject = async (projectId: string) => {
    const { data, error } = await supabase
      .from('projects')
      .select('name, data')
      .eq('id', projectId)
      .maybeSingle();
    if (error || !data) {
      try {
        const localProjects = JSON.parse(localStorage.getItem('beat_projects') || '[]');
        const local = localProjects.find((p: { id: string }) => p.id === projectId);
        if (local) {
          const d = local.data as { tracks?: Track[]; bpm?: number; genre?: string; bars?: number };
          if (d.bars && d.bars > 1) {
            setBars(d.bars);
            if (d.tracks) {
              setTracks(d.tracks.map((t) => ({ ...normalizeTrack(t), steps: ensureStepsLength(t.steps || [], STEPS * d.bars!) })));
            }
          } else {
            if (d.tracks) setTracks(d.tracks.map(normalizeTrack));
          }
          if (d.bpm) setBpm(d.bpm);
          if (d.genre) setGenre(d.genre);
          setProjectName(local.name);
        }
      } catch { /* ignore */ }
      return;
    }
    const d = data.data as { tracks?: Track[]; bpm?: number; genre?: string; bars?: number };
    if (d.bars && d.bars > 1) {
      setBars(d.bars);
      if (d.tracks) {
        setTracks(d.tracks.map((t) => ({ ...normalizeTrack(t), steps: ensureStepsLength(t.steps || [], STEPS * d.bars!) })));
      } else {
        setTracks(prev => prev.map(t => ({ ...t, steps: ensureStepsLength(t.steps, STEPS * d.bars!) })));
      }
    } else {
      if (d.tracks) setTracks(d.tracks.map(normalizeTrack));
    }
    if (d.bpm) setBpm(d.bpm);
    if (d.genre) setGenre(d.genre);
    setProjectName(data.name);
  };

  const loadProjects = useCallback(async () => {
    if (!profile) return;
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data && data.length > 0) {
        setSavedProjects(data);
      } else {
        const localProjects = JSON.parse(localStorage.getItem('beat_projects') || '[]');
        setSavedProjects(localProjects.slice(0, 10).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      }
    } catch {
      try {
        const localProjects = JSON.parse(localStorage.getItem('beat_projects') || '[]');
        setSavedProjects(localProjects.slice(0, 10).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      } catch { /* ignore */ }
    }
  }, [profile]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  
  const renameTrack = useCallback((trackId: string, newName: string) => {
    setTracks(prev => prev.map(t => 
      t.id === trackId ? { ...t, name: newName } : t
    ));
  }, []);

  const changeTrackType = useCallback((trackId: string, newType: TrackType) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        const preset = TRACK_PRESETS.find(p => p.type === newType);
        return { 
          ...t, 
          type: newType, 
          name: preset ? preset.name : t.name,
          color: preset ? preset.color : t.color
        };
      }
      return t;
    }));
  }, []);
  
  const openEffects = (trackId: string) => {
    setSelectedTrackId(trackId === selectedTrackId ? null : trackId);
    setShowEffectsPanel(trackId !== selectedTrackId);
  };

  // Scrubber: set position and optionally restart playback from there
  const handleScrub = (step: number) => {
    const totalSteps = STEPS * bars;
    const clamped = Math.max(0, Math.min(totalSteps - 1, step));
    scrubPositionRef.current = clamped;
    setCurrentStep(clamped);
    if (isPlaying) {
      stepRef.current = clamped;
    }
  };

  // Pro effects slider helper
  const proEffectSliders: { key: ProEffect; label: string; min: number; max: number; step: number; icon: typeof Waves; format: (v: number) => string }[] = [
    { key: 'distortion', label: 'Distortion', min: 0, max: 1, step: 0.05, icon: Zap, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'bitcrush', label: 'Bitcrush', min: 0, max: 1, step: 0.05, icon: Activity, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'compressor', label: 'Compressor', min: 0, max: 1, step: 0.05, icon: Sliders, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'eqLow', label: 'EQ Low', min: -1, max: 1, step: 0.05, icon: Radio, format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 12)}dB` },
    { key: 'eqMid', label: 'EQ Mid', min: -1, max: 1, step: 0.05, icon: Radio, format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 12)}dB` },
    { key: 'eqHigh', label: 'EQ High', min: -1, max: 1, step: 0.05, icon: Radio, format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 12)}dB` },
    { key: 'pan', label: 'Pan L/R', min: -1, max: 1, step: 0.05, icon: Headphones, format: (v) => v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <Disc3 className="w-6 h-6 text-theme-primary" />
            {t('Бит-Секвенсор Pro')}
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            {t('Секвенсор с 18 инструментами, пианино, эффектами и')} {GENRES.length} {t('жанрами')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h2>{t('Название:')} </h2>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
            placeholder={t('Без названия')}
          />
          <button
            onClick={saveProject}
            className="px-4 py-2 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> {t('Сохранить')}
          </button>
          <button
            onClick={() => setShowPublishModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-theme-accent to-theme-primary text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> {t('В ленту')}
          </button>
          {saveStatus && (
            <span className="text-xs text-theme-muted">{saveStatus}</span>
          )}
          {publishStatus && (
            <span className="text-xs text-theme-primary font-medium">{publishStatus}</span>
          )}
        </div>
      </div>

      {/* Transport controls */}
      <div className="bg-theme-surface/60 border border-theme-border rounded-2xl p-[20px_22px] mb-6 flex flex-col gap-[18px] glass-surface">
        {/* Top row: playback controls */}
        <div className="control-row">
          <button
            onClick={isPlaying ? stop : () => play()}
            className="bg-gradient-to-br from-[#10B981] to-[#059669] text-white font-bold rounded-[10px] px-[22px] py-[10px] shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] transition-all flex items-center gap-2 shrink-0"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? t('Стоп') : t('Играть')}
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <span className="control-label">{t('Темп')}</span>
            <input
              type="range"
              min={40}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="custom-slider control-slider w-[80px]"
            />
            {editingBpm !== null ? (
              <input
                autoFocus
                type="number"
                min={40}
                max={300}
                value={editingBpm}
                onChange={(e) => setEditingBpm(Number(e.target.value))}
                onBlur={() => {
                  const v = Math.max(40, Math.min(300, Math.round(editingBpm)));
                  setBpm(v);
                  setEditingBpm(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingBpm(null);
                }}
                className="control-value w-14 bg-theme-surface2 border border-theme-primary rounded px-1 text-theme-text focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingBpm(bpm)}
                className="control-value w-10 cursor-pointer hover:text-theme-primary transition-colors"
                title={t('Нажмите, чтобы ввести точное значение')}
              >
                {bpm}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="control-label">Swing</span>
            <input
              type="range"
              min={0}
              max={50}
              value={swing}
              onChange={(e) => setSwing(Number(e.target.value))}
              className="custom-slider control-slider w-[60px]"
            />
            <span className="control-value w-8">{swing}%</span>
          </div>

          <button
            onClick={() => setMasterVolume(masterVolume > 0 ? 0 : 1)}
            className="bg-theme-surface2 border border-theme-border rounded-[8px] text-theme-text hover:bg-theme-border transition-colors w-[34px] h-[34px] flex items-center justify-center shrink-0"
            title={t('Громкость')}
          >
            <Volume2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowPiano(!showPiano)}
            className={`px-[14px] py-[7px] rounded-[8px] text-white flex items-center gap-2 transition-colors shrink-0 ${
              showPiano ? 'bg-theme-primary text-white' : 'bg-theme-surface2 border border-theme-border hover:bg-theme-border'
            }`}
          >
            <PianoIcon className="w-4 h-4" /> {t('Пианино')}
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <span className="control-label">{t('Такты')}</span>
            <input
              type="range"
              min={1}
              max={256}
              step={1}
              value={bars}
              onChange={(e) => { setBars(Number(e.target.value)); stop(); }}
              className="custom-slider control-slider w-[60px]"
            />
            <span className="control-value w-8">{bars}</span>
          </div>

          <span className="text-[11px] text-theme-muted control-spacer">{t('Space = играть/стоп')}</span>
        </div>

        {/* Bottom row: genres */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#8FB5A6' }}>{t('Жанр')}</span>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => loadDemoBeat(g)}
                className={`px-[14px] py-[6px] rounded-[20px] text-[12.5px] font-medium transition-colors ${
                  genre === g
                    ? 'bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white shadow-[0_4px_12px_rgba(249,115,22,0.35)]'
                    : 'bg-theme-surface2 text-theme-muted hover:bg-theme-border hover:text-theme-text'
                }`}
              >
                {t(g)}
              </button>
            ))}
          </div>
          <button
            onClick={clearAll}
            className="flex items-center gap-2 bg-transparent border border-theme-border rounded-[20px] px-[14px] py-[6px] text-theme-muted hover:text-theme-text hover:border-theme-primary/50 transition-colors ml-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {t('Очистить')}
          </button>
        </div>
      </div>

      {/* Position scrubber / playhead */}
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-3 glass-surface">
        <div className="flex items-center gap-3">
          <span className="text-xs text-theme-muted uppercase tracking-wider shrink-0">{t('Позиция')}</span>
          <div className="relative flex-1 h-8 bg-theme-surface2 rounded-lg overflow-hidden">
            {(() => {
              const totalSteps = STEPS * bars;
              return (
                <>
                  {/* Bar dividers */}
                  {Array.from({ length: bars }).map((_, barIdx) => (
                    <div
                      key={`bar-${barIdx}`}
                      className="absolute top-0 bottom-0 border-l-2 border-theme-primary/30"
                      style={{ left: `${(barIdx / bars) * 100}%` }}
                    />
                  ))}
                  {/* Beat group markers */}
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <div
                      key={`step-${i}`}
                      className="absolute top-0 bottom-0 border-l border-theme-border/30"
                      style={{ left: `${(i / totalSteps) * 100}%`, width: `${100 / totalSteps}%` }}
                    />
                  ))}
                  {/* Bar numbers */}
                  {Array.from({ length: bars }).map((_, barIdx) => (
                    <span
                      key={`barlabel-${barIdx}`}
                      className="absolute top-1/2 -translate-y-1/2 text-[10px] font-mono text-theme-primary/70"
                      style={{ left: `${(barIdx / bars) * 100 + 1}%` }}
                    >
                      {barIdx + 1}
                    </span>
                  ))}
                  {/* Playhead line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-theme-danger shadow-[0_0_8px_rgba(239,68,68,0.8)] transition-all duration-75 pointer-events-none"
                    style={{ left: `${currentStep >= 0 ? ((currentStep + 0.5) / totalSteps) * 100 : 0}%` }}
                  />
                  {/* Clickable overlay */}
                  <input
                    type="range"
                    min={0}
                    max={totalSteps - 1}
                    step={1}
                    value={currentStep >= 0 ? currentStep : 0}
                    onChange={(e) => handleScrub(Number(e.target.value))}
                    className="scrubber-overlay absolute inset-0 w-full h-full"
                  />
                </>
              );
            })()}
          </div>
          <span className="text-xs font-mono text-theme-text shrink-0 w-16 text-right">
            {currentStep >= 0 ? `${currentStep + 1}/${STEPS * bars}` : `—/${STEPS * bars}`}
          </span>
        </div>
      </div>

      {/* Audio visualizer */}
      <Visualizer analyserRef={analyserRef} />

      {/* Track grid */}
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4 overflow-x-auto glass-surface">
        <div className="min-w-[600px] space-y-1.5">
          {/* Step indicators with beat group separators */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-36 shrink-0" />
            <div className="flex gap-px relative cursor-pointer">
              {Array.from({ length: STEPS * bars }).map((_, i) => {
                const isCurrent = currentStep === i;
                const isBarStart = i % STEPS === 0;
                const isBeatStart = i % 4 === 0;
                return (
                  <div
                    key={i}
                    onClick={() => handleScrub(i)}
                    title={t('Клик — установить позицию')}
                    className={`w-8 h-6 rounded flex items-center justify-center text-[10px] font-mono transition-all hover:bg-theme-primary/20 ${
                      isBarStart
                        ? 'text-theme-primary font-bold'
                        : isBeatStart
                        ? 'text-theme-muted/50'
                        : 'text-theme-muted/20'
                    } ${isCurrent ? 'bg-theme-primary-bg rounded-md' : ''}`}
                  >
                    {isBarStart ? i / STEPS + 1 : isBeatStart ? '·' : ''}
                  </div>
                );
              })}
              {/* Vertical playhead line overlay */}
              {currentStep >= 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-theme-danger/60 pointer-events-none transition-all duration-75"
                  style={{ left: `${currentStep * 32 + 16}px` }}
                />
              )}
            </div>
            <div className="w-24 shrink-0" />
          </div>

          {/* Tracks */}
          {tracks.map((track) => (
            <div
              key={track.id}
              className={`flex items-center gap-2 group rounded-lg transition-all ${
                selectedTrackId === track.id ? 'bg-theme-primary/10 p-1' : 'p-1'
              }`}
            >
              <div className="w-36 shrink-0 flex items-center gap-1">
                <button
                  onClick={() => toggleMute(track.id)}
                  className={`p-1 rounded transition-colors ${track.muted ? 'text-theme-muted/50' : 'text-theme-text'}`}
                  title={track.muted ? t('Включить звук') : t('Выключить звук')}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => toggleSolo(track.id)}
                  className={`p-0.5 rounded text-[10px] font-bold w-5 h-5 flex items-center justify-center transition-colors ${
                    soloTrack === track.id
                      ? 'bg-theme-warning text-white'
                      : 'text-theme-muted hover:text-theme-text'
                  }`}
                  title={t('Соло')}
                >
                  S
                </button>
                <button
                  onClick={() => openEffects(track.id)}
                  className={`p-0.5 rounded w-5 h-5 flex items-center justify-center transition-colors relative ${
                    selectedTrackId === track.id
                      ? 'text-theme-primary'
                      : 'text-theme-muted hover:text-theme-text'
                  }`}
                  title={isPremium ? t('Эффекты') : t('Эффекты (Pro — Premium)')}
                >
                  <Waves className="w-3.5 h-3.5" />
                </button>
                <span
                  className={`text-xs font-medium truncate flex-1 cursor-pointer ${
                    track.muted ? 'text-theme-muted line-through' : 'text-theme-text'
                  }`}
                  onClick={() => openEffects(track.id)}
                >
                  {t(track.name)}
                </span>
                <button
                  onClick={() => removeTrack(track.id)}
                  className="opacity-0 group-hover:opacity-100 text-theme-muted hover:text-theme-danger transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Step grid — shows all bars */}
              <div className="flex gap-px relative">
                {Array.from({ length: STEPS * bars }).map((_, i) => {
                  const active = track.steps[i];
                  const isBeatStart = i % 4 === 0;
                  const isBarStart = i % STEPS === 0;
                  const isCurrent = currentStep === i;
                  return (
                    <button
                      key={i}
                      onClick={() => toggleStep(track.id, i)}
                      style={{ imageRendering: 'crisp-edges' }}
                      className={`beat-cell w-8 h-9 rounded-md border border-white/10 transition-all ${
                        active
                          ? `${track.color} active brightness-125 saturate-150 shadow-[0_0_8px_rgba(255,255,255,0.25)] ring-1 ring-white/30`
                          : isBarStart
                          ? 'bg-theme-surface2/80 hover:bg-theme-border'
                          : isBeatStart
                          ? 'bg-theme-surface2 hover:bg-theme-border'
                          : 'bg-theme-surface/60 hover:bg-theme-surface2'
                      } ${isCurrent && active ? 'ring-2 ring-white/70 scale-105' : ''} ${
                        isCurrent && !active ? 'ring-1 ring-theme-primary/30' : ''
                      } ${isBarStart && i > 0 ? 'ml-1' : ''}`}
                    />
                  );
                })}
              </div>

              <div className="w-24 shrink-0 flex items-center gap-1">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={track.volume}
                  onChange={(e) => setTrackVolume(track.id, Number(e.target.value))}
                  className="w-16 accent-theme-primary"
                />
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => copyPattern(track.id)}
                    className="opacity-0 group-hover:opacity-100 text-theme-muted hover:text-theme-primary transition-opacity"
                    title={t('Копировать')}
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => pastePattern(track.id)}
                    className="opacity-0 group-hover:opacity-100 text-theme-muted hover:text-theme-primary transition-opacity"
                    title={t('Вставить')}
                  >
                    <Square className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Piano keyboard */}
      {showPiano && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4 glass-surface">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-theme-muted font-medium flex items-center gap-1.5">
              <PianoIcon className="w-3.5 h-3.5" />
              {t('Клавиатура · 2 октавы · клавиши ПК: Z–M, Q–U (белые), S,D,G,H,J + 2,3,5,6,7 (чёрные)')}
            </p>
            <button
              onClick={() => setShowPiano(false)}
              className="text-theme-muted hover:text-theme-text text-xs"
            >
              {t('Скрыть')}
            </button>
          </div>
          <div className="relative w-full select-none" style={{ height: '120px' }}>
            {/* White keys */}
            <div className="flex h-full gap-0.5">
              {WHITE_KEYS.map(midi => {
                const isActive = activePitch === midi;
                return (
                  <button
                    key={midi}
                    onMouseDown={() => previewPianoKey(midi)}
                    className={`flex-1 rounded-b-lg border border-theme-border transition-all relative flex items-end justify-center pb-2 ${
                      isActive
                        ? 'bg-theme-primary text-white'
                        : 'bg-theme-surface text-theme-muted hover:bg-theme-surface2'
                    }`}
                  >
                    <span className="text-[7px] font-mono opacity-50">{midiToNameRu(midi, t)}</span>
                  </button>
                );
              })}
            </div>
            {/* Black keys */}
            <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: '60%' }}>
              {BLACK_KEYS.map(({ midi, whiteIndex }) => {
                const isActive = activePitch === midi;
                const whiteKeyWidth = 100 / WHITE_KEYS.length;
                const left = (whiteIndex + 1) * whiteKeyWidth - whiteKeyWidth * 0.3;
                return (
                  <button
                    key={midi}
                    onMouseDown={(e) => { e.stopPropagation(); previewPianoKey(midi); }}
                    className={`absolute rounded-b-md pointer-events-auto transition-all ${
                      isActive
                        ? 'bg-theme-primary'
                        : 'bg-theme-surface2 hover:bg-theme-border border border-theme-border'
                    }`}
                    style={{ left: `${left}%`, width: `${whiteKeyWidth * 0.6}%`, height: '100%' }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Effects panel — basic for everyone, Pro tab is premium-only */}
      {showEffectsPanel && selectedTrack && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4 glass-surface animate-in fade-in slide-in-from-bottom-2 duration-200">
          
          {/* === НОВАЯ ШАПКА С УПРАВЛЕНИЕМ ДОРОЖКОЙ === */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-theme-border">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <Waves className="w-5 h-5 text-theme-primary shrink-0" />
              
              {/* Поле для переименования */}
              <input
                type="text"
                value={selectedTrack.name}
                onChange={(e) => renameTrack(selectedTrack.id, e.target.value)}
                className="bg-theme-surface2 border border-theme-border rounded-lg px-3 py-1.5 text-sm text-theme-text focus:outline-none focus:border-theme-primary focus:ring-1 focus:ring-theme-primary w-32 sm:w-40 transition-all"
                placeholder={t('Название')}
                title={t('Нажмите, чтобы переименовать')}
              />

              {/* Выпадающий список для смены инструмента */}
              <select
                value={selectedTrack.type}
                onChange={(e) => changeTrackType(selectedTrack.id, e.target.value as TrackType)}
                className="bg-theme-surface2 border border-theme-border rounded-lg px-3 py-1.5 text-sm text-theme-text focus:outline-none focus:border-theme-primary cursor-pointer hover:bg-theme-border transition-colors"
                title={t('Сменить инструмент')}
              >
                {TRACK_PRESETS.map(preset => (
                  <option key={preset.type} value={preset.type}>
                    {t(preset.name)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => duplicateTrack(selectedTrack.id)}
                className="px-3 py-1.5 bg-theme-primary/10 text-theme-primary border border-theme-primary/30 rounded-lg text-xs font-medium hover:bg-theme-primary/20 transition-colors flex items-center gap-1.5"
                title={t('Дублировать дорожку со всеми настройками и шагами')}
              >
                <Copy className="w-3.5 h-3.5" /> {t('Дублировать')}
              </button>
              <button
                onClick={() => { setShowEffectsPanel(false); setSelectedTrackId(null); }}
                className="p-1.5 text-theme-muted hover:text-theme-text hover:bg-theme-surface2 rounded-lg transition-colors"
                title={t('Закрыть панель')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs: Basic / Pro */}
          <div className="flex gap-2 mb-4 border-b border-theme-border">
            <button
              onClick={() => setEffectsTab('basic')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                effectsTab === 'basic'
                  ? 'text-theme-primary border-b-2 border-theme-primary'
                  : 'text-theme-muted hover:text-theme-text'
              }`}
            >
              {t('Базовые')}
            </button>
            <button
              onClick={() => {
                if (!isPremium) {
                  setShowPremiumPrompt(true);
                  return;
                }
                setEffectsTab('pro');
              }}
              className={`px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1 ${
                isPremium && effectsTab === 'pro'
                  ? 'text-theme-primary border-b-2 border-theme-primary'
                  : 'text-theme-muted hover:text-theme-text'
              }`}
            >
              <Crown className="w-3 h-3" /> {t('Pro-эффекты')}
            </button>
          </div>

          {effectsTab === 'basic' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-theme-muted flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Смещение (шаги)
                </label>
                <input
                  type="range" min={0} max={15} step={1}
                  value={selectedTrack.offset}
                  onChange={(e) => setTrackEffect(selectedTrack.id, 'offset' as any, Number(e.target.value))}
                  className="w-full accent-theme-primary"
                />
                <span className="text-xs text-theme-muted font-mono">{selectedTrack.offset}</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-theme-muted flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Длина звука
                </label>
                <input
                  type="range" min={0.1} max={2.0} step={0.1}
                  value={selectedTrack.length}
                  onChange={(e) => setTrackEffect(selectedTrack.id, 'length' as any, Number(e.target.value))}
                  className="w-full accent-theme-primary"
                />
                <span className="text-xs text-theme-muted font-mono">x{selectedTrack.length.toFixed(1)}</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-theme-muted flex items-center gap-1">
                  <Headphones className="w-3 h-3" /> Тон (без фильтра)
                </label>
                <input
                  type="range" min={-12} max={12} step={1}
                  value={selectedTrack.finePitch}
                  onChange={(e) => setTrackEffect(selectedTrack.id, 'finePitch' as any, Number(e.target.value))}
                  className="w-full accent-theme-primary"
                />
                <span className="text-xs text-theme-muted font-mono">{selectedTrack.finePitch > 0 ? '+' : ''}{selectedTrack.finePitch} st</span>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs text-theme-muted flex items-center gap-1">
                  <Radio className="w-3 h-3" /> Reverb
                </label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={selectedTrack.reverb}
                  onChange={(e) => setTrackEffect(selectedTrack.id, 'reverb', Number(e.target.value))}
                  className="w-full accent-theme-primary"
                />
                <span className="text-xs text-theme-muted font-mono">{Math.round(selectedTrack.reverb * 100)}%</span>
              </div>
          
              <div className="space-y-2">
                <label className="text-xs text-theme-muted flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Delay
                </label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={selectedTrack.delay}
                  onChange={(e) => setTrackEffect(selectedTrack.id, 'delay', Number(e.target.value))}
                  className="w-full accent-theme-primary"
                />
                <span className="text-xs text-theme-muted font-mono">{Math.round(selectedTrack.delay * 100)}%</span>
              </div>
      
              <div className="space-y-2">
                <label className="text-xs text-theme-muted flex items-center gap-1">
                  <Sliders className="w-3 h-3" /> Filter
                </label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={selectedTrack.filter}
                  onChange={(e) => setTrackEffect(selectedTrack.id, 'filter', Number(e.target.value))}
                  className="w-full accent-theme-primary"
                />
                <span className="text-xs text-theme-muted font-mono">
                  {selectedTrack.filter === 0 ? 'Off' : selectedTrack.filter > 0.5 ? 'HP' : 'LP'} {Math.round(selectedTrack.filter * 100)}%
                </span>
              </div>
    
              <div className="space-y-2">
                <label className="text-xs text-theme-muted flex items-center gap-1">
                  <Headphones className="w-3 h-3" /> Pitch
                </label>
                <input
                  type="range" min={-12} max={12} step={1}
                  value={selectedTrack.pitch}
                  onChange={(e) => setTrackEffect(selectedTrack.id, 'pitch', Number(e.target.value))}
                  className="w-full accent-theme-primary"
                />
                <span className="text-xs text-theme-muted font-mono">{selectedTrack.pitch > 0 ? '+' : ''}{selectedTrack.pitch} st</span>
              </div>
            </div>
          )}

          {effectsTab === 'pro' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {proEffectSliders.map((fx) => {
                const Icon = fx.icon;
                return (
                  <div key={fx.key} className="space-y-2">
                    <label className="text-xs text-theme-muted flex items-center gap-1">
                      <Icon className="w-3 h-3" /> {fx.label}
                    </label>
                    <input
                      type="range" min={fx.min} max={fx.max} step={fx.step}
                      value={selectedTrack[fx.key]}
                      onChange={(e) => setTrackEffect(selectedTrack.id, fx.key, Number(e.target.value))}
                      className="w-full accent-theme-primary"
                    />
                    <span className="text-xs text-theme-muted font-mono">{fx.format(selectedTrack[fx.key])}</span>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => {
              (['reverb', 'delay', 'filter', 'pitch', 'distortion', 'bitcrush', 'compressor', 'eqLow', 'eqMid', 'eqHigh', 'pan'] as const).forEach((eff) => {
                setTrackEffect(selectedTrack.id, eff, 0);
              });
            }}
            className="mt-4 px-3 py-1.5 bg-theme-surface2 text-theme-muted rounded-lg text-xs hover:text-theme-text transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> {t('Сбросить все эффекты')}
          </button>
        </div>
      )}

      {/* Premium prompt modal */}
      {showPremiumPrompt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-surface border border-theme-border rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center relative">
            <button
              onClick={() => setShowPremiumPrompt(false)}
              className="absolute top-4 right-4 text-theme-muted hover:text-theme-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mb-4 shadow-lg shadow-amber-500/30">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-theme-text mb-2">{t('Это Premium-функция')}</h3>
            <p className="text-theme-muted text-sm mb-5">
              {t('Pro-эффекты (Distortion, Bitcrush, Compressor, EQ, Pan) доступны только с Premium подпиской. Базовые эффекты (Reverb, Delay, Filter, Pitch) доступны всем.')}
            </p>
            <a
              href="/#subscription"
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = 'subscription';
                setShowPremiumPrompt(false);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-500/30 hover:scale-[1.03] transition-all"
            >
              <Crown className="w-4 h-4" />
              {t('Купить Premium за 259₽/мес')}
            </a>
          </div>
        </div>
      )}

      {/* Add track + saved projects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch">
        <div className="bg-theme-surface/60 border border-theme-border rounded-2xl p-6 glass-surface">
          <h3 className="text-[16px] font-bold text-white mb-5 flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t('Добавить дорожку')}
          </h3>
          <input
            value={trackSearch}
            onChange={(e) => setTrackSearch(e.target.value)}
            placeholder={t('Поиск инструмента...')}
            className="bg-theme-surface2 border border-theme-border rounded-lg px-3 py-2 text-[13px] text-theme-text outline-none focus:border-theme-primary w-full mb-2"
          />
          {(() => {
            const categories: { label: string; types: TrackType[] }[] = [
              { label: t('Барабаны'), types: ['kick', 'snare', 'hihat', 'openhat', 'clap', 'tom', 'perc', 'drums'] },
              { label: t('Бас и Синты'), types: ['bass', 'synth', 'pad', 'crash', 'rim'] },
              { label: t('Инструменты'), types: ['piano', 'lead', 'violin', 'guitar', 'rockguitar', 'flute', 'sax'] },
              { label: t('Голоса'), types: ['vocmale', 'vocfemale', 'vocaltimati'] },
            ];
            const search = trackSearch.toLowerCase();
            return categories.map((cat) => {
              const presets = cat.types
                .map(t => TRACK_PRESETS.find(p => p.type === t))
                .filter((p): p is NonNullable<typeof p> => p !== undefined)
                .filter(p => !search || p.name.toLowerCase().includes(search));
              if (presets.length === 0) return null;
              return (
                <div key={cat.label}>
                  <p className="text-[11px] text-theme-muted uppercase tracking-widest mb-2 mt-4">{cat.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => {
                      const used = tracks.some((t) => t.type === p.type);
                      return (
                        <button
                          key={p.type}
                          onClick={() => addTrack(p.type)}
                          disabled={used || tracks.length >= 15}
                          className={`bg-theme-surface2 border border-theme-border rounded-lg px-3 py-1.5 text-[13px] flex items-center gap-1 transition-colors ${
                            used
                              ? 'text-theme-muted cursor-not-allowed opacity-50'
                              : 'text-theme-muted hover:bg-theme-border hover:text-theme-text'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                          {t(p.name)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
          <p className="text-[12px] text-theme-muted mt-4">
            {tracks.length}/{isPremium ? 60 : 15} {t('дорожек')}
            {isPremium && <span className="text-theme-primary ml-1">(Premium)</span>}
          </p>
        </div>

        <div className="bg-theme-surface/60 border border-theme-border rounded-2xl p-6 glass-surface">
          <h3 className="text-[16px] font-bold text-white mb-5 flex items-center gap-2">
            <Save className="w-4 h-4" /> {t('Сохранённые проекты')}
          </h3>
          {savedProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-center">
              <div className="w-16 h-16 rounded-2xl bg-theme-surface2 flex items-center justify-center mb-4">
                <Disc3 className="w-8 h-8 text-theme-muted" />
              </div>
              <p className="text-[15px] font-semibold text-theme-text mb-2">{t('Здесь пока пусто')}</p>
              <p className="text-[13px] text-theme-muted mb-5 max-w-[260px]">
                {t('Сохрани свой первый бит, чтобы он появился в этом списке')}
              </p>
              <button
                onClick={saveProject}
                className="bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white font-bold rounded-lg px-5 py-2.5 text-[13px] shadow-[0_4px_14px_rgba(249,115,22,0.3)] hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(249,115,22,0.4)] transition-all"
              >
                {t('Создать первый проект')}
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {savedProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadProject(p.id)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-theme-surface2 rounded-lg hover:bg-theme-border transition-colors text-left"
                >
                  <span className="text-sm text-theme-text truncate">{p.name}</span>
                  <Play className="w-3.5 h-3.5 text-theme-muted shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {showPublishModal && (
        <PublishBeatModal
          onClose={() => setShowPublishModal(false)}
          onPublished={(beatId) => {
            setShowPublishModal(false);
            setPublishStatus(t('Бит опубликован!'));
            setTimeout(() => setPublishStatus(null), 3000);
          }}
          composerData={{ tracks, bpm, bars, genre, projectName }}
        />
      )}
    </div>
  );
}
