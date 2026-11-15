export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export type Mode = 'major' | 'minor';
type Quality = 'maj' | 'min' | 'dim';

export type Chord = {
  roman: string;
  name: string;
  quality: Quality;
  rootPc: number;
  notes: string[];
};

export type ProgressionTemplate = {
  id: string;
  degrees: number[];
};

export const PROGRESSIONS: ProgressionTemplate[] = [
  { id: 'pop', degrees: [1, 5, 6, 4] },
  { id: 'epic', degrees: [6, 4, 1, 5] },
  { id: 'jazz', degrees: [2, 5, 1, 6] },
  { id: 'blues', degrees: [1, 4, 5, 4] },
  { id: 'minorPop', degrees: [1, 6, 3, 7] },
];

const MAJOR_SCALE: { roman: string; offset: number; quality: Quality }[] = [
  { roman: 'I', offset: 0, quality: 'maj' },
  { roman: 'ii', offset: 2, quality: 'min' },
  { roman: 'iii', offset: 4, quality: 'min' },
  { roman: 'IV', offset: 5, quality: 'maj' },
  { roman: 'V', offset: 7, quality: 'maj' },
  { roman: 'vi', offset: 9, quality: 'min' },
  { roman: 'vii°', offset: 11, quality: 'dim' },
];

const MINOR_SCALE: { roman: string; offset: number; quality: Quality }[] = [
  { roman: 'i', offset: 0, quality: 'min' },
  { roman: 'ii°', offset: 2, quality: 'dim' },
  { roman: 'III', offset: 3, quality: 'maj' },
  { roman: 'iv', offset: 5, quality: 'min' },
  { roman: 'v', offset: 7, quality: 'min' },
  { roman: 'VI', offset: 8, quality: 'maj' },
  { roman: 'VII', offset: 10, quality: 'maj' },
];

const QUALITY_INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
};

const QUALITY_SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dim: 'dim' };

export function buildChords(rootPc: number, mode: Mode, degrees: number[]): Chord[] {
  const scale = mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
  return degrees.map((degree) => {
    const step = scale[degree - 1];
    const rootIndex = (rootPc + step.offset) % 12;
    return {
      roman: step.roman,
      name: `${NOTE_NAMES[rootIndex]}${QUALITY_SUFFIX[step.quality]}`,
      quality: step.quality,
      rootPc: rootIndex,
      notes: QUALITY_INTERVALS[step.quality].map((i) => NOTE_NAMES[(rootIndex + i) % 12]),
    };
  });
}

export function chordFrequencies(chord: Chord): number[] {
  const rootMidi = 48 + chord.rootPc;
  return QUALITY_INTERVALS[chord.quality].map((i) => 440 * Math.pow(2, (rootMidi + i - 69) / 12));
}

export function playChords(ctx: AudioContext, chords: Chord[], bpm: number): number {
  const beat = 60 / bpm;
  const chordDuration = beat * 4;
  const start = ctx.currentTime + 0.05;
  chords.forEach((chord, index) => {
    const t0 = start + index * chordDuration;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.04);
    gain.gain.setValueAtTime(0.18, t0 + chordDuration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + chordDuration);
    gain.connect(ctx.destination);
    chordFrequencies(chord).forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t0);
      osc.stop(t0 + chordDuration);
    });
  });
  return chords.length * chordDuration;
}
