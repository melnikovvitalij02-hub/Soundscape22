import { useMemo, useState } from 'react';
import { useLocale } from '@/context/LocaleContext';
import { Guitar, Keyboard, Music } from 'lucide-react';

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

// Клавиши пианино в одной октаве: [offset, isBlack]
const PIANO_KEYS: { offset: number; label: string; black: boolean }[] = [
  { offset: 0, label: 'C', black: false }, { offset: 1, label: 'C#', black: true },
  { offset: 2, label: 'D', black: false }, { offset: 3, label: 'D#', black: true },
  { offset: 4, label: 'E', black: false }, { offset: 5, label: 'F', black: false },
  { offset: 6, label: 'F#', black: true }, { offset: 7, label: 'G', black: false },
  { offset: 8, label: 'G#', black: true }, { offset: 9, label: 'A', black: false },
  { offset: 10, label: 'A#', black: true }, { offset: 11, label: 'B', black: false },
];

// Открытые струны гитары (низ→верх), полутоны от C: E=4, A=9, D=2, G=7, B=11, E=4
const GUITAR_STRINGS = [
  { name: 'E', offset: 4 }, { name: 'A', offset: 9 }, { name: 'D', offset: 2 },
  { name: 'G', offset: 7 }, { name: 'B', offset: 11 }, { name: 'e', offset: 4 },
];

export default function ChordsPage() {
  const { t } = useLocale();
  const [root, setRoot] = useState(0); // индекс ноты 0..11
  const [quality, setQuality] = useState('maj');
  const [view, setView] = useState<'piano' | 'guitar'>('piano');

  const formula = CHORD_FORMULAS.find((f) => f.id === quality)!;
  const chordNotes = useMemo(
    () => formula.intervals.map((i) => (root + i) % 12),
    [root, formula]
  );
  const chordSet = useMemo(() => new Set(chordNotes), [chordNotes]);
  const chordName = `${NOTES[root]}${quality === 'maj' ? '' : quality === 'min' ? 'm' : quality === 'dim' ? 'dim' : quality === 'aug' ? 'aug' : quality === 'sus2' ? 'sus2' : quality === 'sus4' ? 'sus4' : quality === '7' ? '7' : quality === 'maj7' ? 'maj7' : 'm7'}`;

  const inputCls = 'px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Music className="w-6 h-6 text-theme-primary" /> {t('Аккорды')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">{t('Справочник аккордов: выбери ноту и тип, увидишь состав на пианино и гитаре')}</p>
      </div>

      {/* Управление */}
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

        <div className="flex items-center justify-between gap-3">
          <div className="text-center">
            <p className="text-3xl font-bold text-theme-primary">{chordName}</p>
            <p className="text-xs text-theme-muted mt-1">
              {t('Состав')}: {chordNotes.map((i) => NOTES_RU[NOTES[i]]).join(' — ')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView('piano')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${view === 'piano' ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted'}`}
            >
              <Keyboard className="w-4 h-4" /> {t('Пианино')}
            </button>
            <button
              onClick={() => setView('guitar')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${view === 'guitar' ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted'}`}
            >
              <Guitar className="w-4 h-4" /> {t('Гитара')}
            </button>
          </div>
        </div>
      </div>

      {/* Пианино: 2 октавы */}
      {view === 'piano' && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
          <div className="relative h-40 flex">
            {Array.from({ length: 24 }).map((_, i) => {
              const noteIdx = i % 12;
              const isBlack = PIANO_KEYS[noteIdx].black;
              const active = chordSet.has(noteIdx);
              if (isBlack) return null;
              return (
                <div
                  key={i}
                  className={`relative flex-1 border border-theme-border rounded-b-md flex items-end justify-center pb-1 text-[10px] font-mono transition-colors ${
                    active ? 'bg-theme-primary/80 text-white' : 'bg-theme-surface text-theme-muted'
                  }`}
                >
                  {NOTES[noteIdx]}
                  {i < 12 && PIANO_KEYS[noteIdx + 1]?.black && (
                    <div
                      className={`absolute top-0 right-0 translate-x-1/2 w-3/5 h-3/5 rounded-b-md z-10 flex items-end justify-center text-[8px] font-mono ${
                        chordSet.has((noteIdx + 1) % 12) ? 'bg-theme-accent text-white' : 'bg-theme-text text-theme-surface'
                      }`}
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

      {/* Гитара: сетка 6 струн × 5 ладов */}
      {view === 'guitar' && (
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: '28px repeat(6, 1fr)' }}>
            <div />
            {Array.from({ length: 5 }).map((_, fret) => (
              <div key={fret} className="text-center text-[10px] text-theme-muted">{fret + 1} лад</div>
            ))}
            {[...GUITAR_STRINGS].reverse().map((s, rowIdx) => (
              <>
                <div key={`n-${rowIdx}`} className="text-xs font-mono text-theme-muted flex items-center">{s.name}</div>
                {Array.from({ length: 5 }).map((_, fret) => {
                  const noteIdx = (s.offset + fret + 1) % 12;
                  const active = chordSet.has(noteIdx);
                  return (
                    <div key={`${rowIdx}-${fret}`} className="h-10 rounded-lg border border-theme-border flex items-center justify-center text-[10px] font-mono">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        active ? 'bg-theme-primary text-white font-bold' : 'text-theme-muted'
                      }`}>
                        {NOTES[noteIdx]}
                      </span>
                    </div>
                  );
                })}
              </>
            ))}
          </div>
          <p className="text-xs text-theme-muted mt-3">{t('Подсвечены ноты аккорда по грифу в стандартном строе')}</p>
        </div>
      )}
    </div>
  );
}