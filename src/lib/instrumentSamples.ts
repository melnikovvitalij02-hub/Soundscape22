export type InstrumentId =
  | 'piano'
  | 'rockguitar'
  | 'guitar'
  | 'violin'
  | 'flute'
  | 'trumpet'
  | 'synth'
  | 'cello'
  | 'sax'
  | 'vocmale'
  | 'vocfemale';

export type InstrumentOption = { id: InstrumentId; name: string };

export const INSTRUMENT_OPTIONS: InstrumentOption[] = [
  { id: 'piano', name: 'Фортепиано' },
  { id: 'rockguitar', name: 'Рок-гитара' },
  { id: 'guitar', name: 'Акустическая гитара' },
  { id: 'violin', name: 'Скрипка' },
  { id: 'flute', name: 'Флейта' },
  { id: 'trumpet', name: 'Труба' },
  { id: 'synth', name: 'Синтезатор' },
  { id: 'cello', name: 'Виолончель' },
  { id: 'sax', name: 'Саксофон' },
  { id: 'vocmale', name: 'Голос (мужской)' },
  { id: 'vocfemale', name: 'Голос (женский)' },
];

type SampleSource = { soundfont: string; transpose: number };

// General MIDI soundfonts (FluidR3). There is no dedicated male or female voice in GM,
// so both voices use choir/vocal samples; the male one is shifted down an octave.
export const INSTRUMENT_SOURCES: Record<InstrumentId, SampleSource> = {
  piano: { soundfont: 'acoustic_grand_piano', transpose: 0 },
  rockguitar: { soundfont: 'distortion_guitar', transpose: 0 },
  guitar: { soundfont: 'acoustic_guitar_nylon', transpose: 0 },
  violin: { soundfont: 'violin', transpose: 0 },
  flute: { soundfont: 'flute', transpose: 0 },
  trumpet: { soundfont: 'trumpet', transpose: 0 },
  synth: { soundfont: 'lead_2_sawtooth', transpose: 0 },
  cello: { soundfont: 'cello', transpose: 0 },
  sax: { soundfont: 'tenor_sax', transpose: 0 },
  vocmale: { soundfont: 'choir_aahs', transpose: -12 },
  vocfemale: { soundfont: 'voice_oohs', transpose: 0 },
};

const SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';
const NOTE_OFFSETS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const RELEASE_SECONDS = 0.25;

export type LoadedSample = { midi: number; buffer: AudioBuffer };

const samplesByContext = new WeakMap<AudioContext, Map<InstrumentId, Promise<LoadedSample[]>>>();

function parseNoteName(name: string): number | null {
  const match = /^([A-G])([#sb]?)(-?\d+)$/.exec(name);
  if (!match) return null;
  const accidental = match[2] === '#' || match[2] === 's' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + NOTE_OFFSETS[match[1]] + accidental;
}

async function fetchSoundfont(ctx: AudioContext, soundfont: string): Promise<LoadedSample[]> {
  const response = await fetch(`${SOUNDFONT_BASE_URL}/${soundfont}-mp3.js`);
  if (!response.ok) throw new Error(`Не удалось загрузить звуки инструмента (${response.status})`);
  const text = await response.text();

  const entries = [...text.matchAll(/"([A-Za-z0-9#]+)":\s*"data:audio\/mp3;base64,([A-Za-z0-9+/=]+)"/g)];
  const decoded = await Promise.all(
    entries.map(async ([, name, base64]) => {
      const midi = parseNoteName(name);
      if (midi === null) return null;
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      return { midi, buffer };
    }),
  );

  return decoded
    .filter((sample): sample is LoadedSample => sample !== null)
    .sort((a, b) => a.midi - b.midi);
}

export function loadInstrumentSamples(ctx: AudioContext, id: InstrumentId): Promise<LoadedSample[]> {
  let cache = samplesByContext.get(ctx);
  if (!cache) {
    cache = new Map();
    samplesByContext.set(ctx, cache);
  }
  const cached = cache.get(id);
  if (cached) return cached;

  const pending = fetchSoundfont(ctx, INSTRUMENT_SOURCES[id].soundfont);
  cache.set(id, pending);
  pending.catch(() => cache?.delete(id));
  return pending;
}

function nearestSample(samples: LoadedSample[], midi: number): LoadedSample | null {
  if (samples.length === 0) return null;
  return samples.reduce((best, sample) =>
    Math.abs(sample.midi - midi) < Math.abs(best.midi - midi) ? sample : best,
  );
}

export function playSampledNote(
  ctx: AudioContext,
  samples: LoadedSample[],
  id: InstrumentId,
  midi: number,
  startTime: number,
  duration: number,
  volume: number,
  destination: AudioNode,
) {
  const target = midi + INSTRUMENT_SOURCES[id].transpose;
  const sample = nearestSample(samples, target);
  if (!sample) return;

  const source = ctx.createBufferSource();
  source.buffer = sample.buffer;
  source.playbackRate.value = 2 ** ((target - sample.midi) / 12);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.setValueAtTime(volume, startTime + duration);
  gain.gain.linearRampToValueAtTime(0, startTime + duration + RELEASE_SECONDS);

  source.connect(gain).connect(destination);
  source.start(startTime);
  source.stop(startTime + duration + RELEASE_SECONDS + 0.05);
}
