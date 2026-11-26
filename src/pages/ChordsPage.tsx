import { useCallback, Fragment, useMemo, useRef, useState } from 'react';
import { useLocale } from '@/context/LocaleContext';
import { Guitar, Keyboard, Music, Play, Square } from 'lucide-react';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_RU: Record<string, string> = {
  C: 'До', 'C#': 'До#', D: 'Ре', 'D#': 'Ре#', E: 'Ми', F: 'Фа',
  'F#': 'Фа#', G: 'Соль', 'G#': 'Соль#', A: 'Ля', 'A#': 'Ля#', B: 'Си',
};

const CHORD_FORMULAS: { id: string; label: string; intervals: number[] }[] = [
  { id: 'maj', label: 'Major (мажор)', intervals: [0, 4, 7] },
  { id: 'min', label: 'Minor (минор)', intervals: [0, 3, 7] },
  { id: 'dim', label: 'Diminished', intervals: [0, 3, 6] },
  { id: 'aug', label: 'Augmented', intervals: [0, 4, 8] },
  { id: 'sus2', label: 'Sus2', intervals: [0, 2, 7] },
  { id: 'sus4', label: 'Sus4', intervals: [0, 5, 7] },
  { id: '7', label: 'Dominant 7', intervals: [0, 4, 7, 10] },
  { id: 'maj7', label: 'Major 7', intervals: [0, 4, 7, 11] },
  { id: 'min7', label: 'Minor 7', intervals: [0, 3, 7, 10] },
];

const BASE_MIDI = 60;
const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const PIANO_KEYS: { offset: number; label: string; black: boolean }[] = [
  { offset: 0, label: 'C', black: false }, { offset: 1, label: 'C#', black: true },
  { offset: 2, label: 'D', black: false }, { offset: 3, label: 'D#', black: true },
  { offset: 4, label: 'E', black: false }, { offset: 5, label: 'F', black: false },
  { offset: 6, label: 'F#', black: true }, { offset: 7, label: 'G', black: false },
  { offset: 8, label: 'G#', black: true }, { offset: 9, label: 'A', black: false },
  { offset: 10, label: 'A#', black: true }, { offset: 11, label: 'B', black: false },
];

const GUITAR_STRINGS = [
  { name: 'E2', offset: 4 }, { name: 'A2', offset: 9 }, { name: 'D3', offset: 2 },
  { name: 'G3', offset: 7 }, { name: 'B3', offset: 11 }, { name: 'E4', offset: 4 },
];

export default function ChordsPage() {
  const { t } = useLocale();
  const [root, setRoot] = useState(0);
  const [quality, setQuality] = useState('maj');
  const [view, setView] = useState<'piano' | 'guitar'>('piano');
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainRef = useRef<GainNode | null>(null);

  const formula = CHORD_FORMULAS.find((f) => f.id === quality)!;
  const chordNotes = useMemo(
    () => formula.intervals.map((i) => (root + i) % 12),
    [root, formula]
  );
  const chordSet = useMemo(() => new Set(chordNotes), [chordNotes]);
  const chordName = `${NOTES[root]}${quality === 'maj' ? '' : quality === 'min' ? 'm' : quality === 'dim' ? 'dim' : quality === 'aug' ? 'aug' : quality === 'sus2' ? 'sus2' : quality === 'sus4' ? 'sus4' : quality === '7' ? '7' : quality === 'maj7' ? 'maj7' : 'm7'}`;

  const playChord = useCallback(() => {
    if (isPlaying) {
      oscillatorsRef.current.forEach((osc) => {
        try { osc.stop(); } catch {}
      });
      oscillatorsRef.current = [];
      if (gainRef.current && audioCtxRef.current) {
        gainRef.current.gain.setValueAtTime(gainRef.current.gain.value, audioCtxRef.current.currentTime);
        gainRef.current.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.1);
      }
      setIsPlaying(false);
      return;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.connect(ctx.destination);
    gainRef.current = gain;

    const duration = (60 / bpm) * 4;
    const oscs: OscillatorNode[] = [];

    chordNotes.forEach((noteIdx) => {
      const midi = BASE_MIDI + noteIdx;
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.connect(gain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
      oscs.push(osc);
    });

    oscillatorsRef.current = oscs;
    setIsPlaying(true);

    setTimeout(() => {
      setIsPlaying(false);
      oscillatorsRef.current = [];
    }, duration * 1000);
  }, [chordNotes, bpm, isPlaying]);

  const inputCls = 'px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Music className="w-6 h-6 text-theme-primary" /> {t('Аккорды')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">{t('Справочник аккордов: выбери ноту и тип, увидишь состав на пианино и гитаре')}</p>
      </div>

      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-theme-muted">{t('Нота')}</span>
            <select value={root} onChange={(e) => setRoot(Number(e.target.value))} className={inputCls}>
              {NOTES.map((n, i) => (
                <option key={n} value={i}>{NOTES_RU[n]} ({n})</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-theme-muted">{t('Тип аккорда')}</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} className={inputCls}>
              {CHORD_FORMULAS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-theme-muted">{t('Темп (BPM)')}</span>
            <span className="text-xs font-mono text-theme-primary">{bpm} BPM</span>
          </div>
          <input
            type="range"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-full accent-theme-primary"
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-center">
            <p className="text-3xl font-bold text-theme-primary">{chordName}</p>
            <p className="text-xs text-theme-muted mt-1">
              {t('Состав')}: {chordNotes.map((i) => NOTES_RU[NOTES[i]]).join(' — ')}
            </p>
          </div>
          <button
            onClick={playChord}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
              isPlaying
                ? 'bg-theme-danger text-white'
                : 'bg-gradient-to-r from-theme-primary to-theme-accent text-white hover:scale-105'
            }`}
          >
            {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? t('Стоп') : t('Слушать')}
          </button>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setView('piano')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'piano' ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'}`}
          >
            <Keyboard className="w-4 h-4" /> {t('Пианино')}
          </button>
          <button
            onClick={() => setView('guitar')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'guitar' ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'}`}
          >
            <Guitar className="w-4 h-4" /> {t('Гитара')}
          </button>
        </div>
      </div>

      {view === 'piano' && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
          <div className="relative h-48 flex">
            {Array.from({ length: 24 }).map((_, i) => {
              const noteIdx = i % 12;
              const isBlack = PIANO_KEYS[noteIdx].black;
              const active = chordSet.has(noteIdx);
              if (isBlack) return null;
              return (
                <div
                  key={i}
                  className={`relative flex-1 border border-theme-border rounded-b-md flex items-end justify-center pb-2 text-[10px] font-mono transition-colors ${
                    active ? 'bg-theme-primary/80 text-white' : 'bg-theme-surface text-theme-muted hover:bg-theme-surface2'
                  }`}
                  style={{ zIndex: 1 }}
                >
                  {NOTES[noteIdx]}
                  {i < 12 && PIANO_KEYS[noteIdx + 1]?.black && (
                    <div
                      className={`absolute top-0 right-0 translate-x-1/2 w-3/5 h-3/5 rounded-b-md flex items-end justify-center text-[8px] font-mono ${
                        chordSet.has((noteIdx + 1) % 12) ? 'bg-theme-accent text-white' : 'bg-theme-text text-theme-surface'
                      }`}
                      style={{ zIndex: 2 }}
                    >
                      {NOTES[(noteIdx + 1) % 12]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'guitar' && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: '32px repeat(5, 1fr)' }}>
            <div />
            {Array.from({ length: 5 }).map((_, fret) => (
              <div key={`fret-${fret}`} className="text-center text-[10px] text-theme-muted">{fret + 1} {t('лад')}</div>
            ))}
            {[...GUITAR_STRINGS].reverse().map((s, rowIdx) => (
              <Fragment key={`string-${rowIdx}`}>
                <div className="text-xs font-mono text-theme-muted flex items-center">{s.name}</div>
                {Array.from({ length: 5 }).map((_, fret) => {
                  const noteIdx = (s.offset + fret + 1) % 12;
                  const active = chordSet.has(noteIdx);
                  return (
                    <div key={`cell-${rowIdx}-${fret}`} className="h-10 rounded-lg border border-theme-border flex items-center justify-center text-[10px] font-mono">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors ${
                        active ? 'bg-theme-primary text-white font-bold' : 'bg-theme-surface2 text-theme-muted'
                      }`}>
                        {NOTES[noteIdx]}
                      </span>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <p className="text-xs text-theme-muted mt-3">{t('Подсвечены ноты аккорда по грифу в стандартном строе')}</p>
        </div>
      )}
    </div>
  );
}