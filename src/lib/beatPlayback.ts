import type { ExtendedEffects, TrackType } from '@/pages/BeatComposerPage';

export const STEPS = 16;

export type SavedTrack = {
  type: TrackType;
  volume: number;
  muted: boolean;
  steps: boolean[];
  reverb?: number;
  delay?: number;
  filter?: number;
  pitch?: number;
  pan?: number;
  distortion?: number;
  bitcrush?: number;
  compressor?: number;
  eqLow?: number;
  eqMid?: number;
  eqHigh?: number;
  offset?: number;
  length?: number;
  finePitch?: number;
};

export function trackEffects(track: Partial<SavedTrack> = {}): ExtendedEffects {
  return {
    reverb: track.reverb ?? 0,
    delay: track.delay ?? 0,
    filter: track.filter ?? 0,
    pitch: track.pitch ?? 0,
    distortion: track.distortion ?? 0,
    bitcrush: track.bitcrush ?? 0,
    compressor: track.compressor ?? 0,
    eqLow: track.eqLow ?? 0,
    eqMid: track.eqMid ?? 0,
    eqHigh: track.eqHigh ?? 0,
    pan: track.pan ?? 0,
    offset: track.offset ?? 0,
    length: track.length ?? 1,
    finePitch: track.finePitch ?? 0,
  };
}

export function buildPattern(genre: string): (TrackType | false)[][] {
  const patterns: Record<string, (TrackType | false)[][]> = {
    'Хип-Хоп': [
      ['kick', false, false, false, 'kick', false, false, false, 'kick', false, false, false, 'kick', false, false, false],
      ['snare', false, false, false, 'snare', false, false, false, 'snare', false, false, false, 'snare', false, false, false],
      ['hihat', false, 'hihat', false, 'hihat', false, 'hihat', false, 'hihat', false, 'hihat', false, 'hihat', false, 'hihat', false],
    ],
    Трэп: [
      ['kick', false, false, false, false, false, 'kick', false, 'kick', false, false, false, false, false, false, false],
      ['snare', false, false, false, 'snare', false, false, false, 'snare', false, false, false, 'snare', false, false, false],
      ['hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat', 'hihat'],
    ],
    House: [
      ['kick', false, false, false, 'kick', false, false, false, 'kick', false, false, false, 'kick', false, false, false],
      ['hihat', false, 'hihat', false, 'hihat', false, 'hihat', false, 'hihat', false, 'hihat', false, 'hihat', false, 'hihat', false],
      ['bass', false, false, false, 'bass', false, false, false, 'bass', false, false, false, 'bass', false, false, false],
    ],
  };
  return patterns[genre] || patterns['Хип-Хоп'];
}