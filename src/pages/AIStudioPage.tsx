import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { ArrowRight, Music, Play, Shuffle, Square } from 'lucide-react';
import type { Page } from '@/components/Sidebar';
import { NOTE_NAMES, PROGRESSIONS, buildChords, playChords, type Mode } from '@/lib/chordProgressions';

const BPM = 96;

const MODES: { id: Mode; label: string }[] = [
  { id: 'major', label: 'Мажор' },
  { id: 'minor', label: 'Минор' },
];

const PROGRESSION_LABELS: Record<string, string> = {
  pop: 'Поп',
  epic: 'Эпик',
  jazz: 'Джаз',
  blues: 'Блюз',
  minorPop: 'Минорный поп',
};

const pickRandom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export default function AIStudioPage({ setPage }: { setPage?: (p: Page) => void }) {
  const { addXp } = useAuth();
  const { t } = useLocale();
  const [rootPc, setRootPc] = useState(0);
  const [mode, setMode] = useState<Mode>('major');
  const [progressionId, setProgressionId] = useState(PROGRESSIONS[0].id);
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  const progression = PROGRESSIONS.find((p) => p.id === progressionId) ?? PROGRESSIONS[0];
  const chords = useMemo(() => buildChords(rootPc, mode, progression.degrees), [rootPc, mode, progression]);

  const stop = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (ctxRef.current) {
      void ctxRef.current.close();
      ctxRef.current = null;
    }
    setPlaying(false);
  };

  useEffect(() => stop, []);

  const changeSetting = (apply: () => void) => {
    stop();
    apply();
  };

  const togglePlay = () => {
    if (playing) {
      stop();
      return;
    }
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const durationSec = playChords(ctx, chords, BPM);
    setPlaying(true);
    timerRef.current = window.setTimeout(stop, (durationSec + 0.2) * 1000);
  };

  const randomize = () => {
    changeSetting(() => {
      setRootPc(Math.floor(Math.random() * 12));
      setMode(pickRandom(MODES).id);
      setProgressionId(pickRandom(PROGRESSIONS).id);
    });
    addXp(10);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Music className="w-6 h-6 text-theme-accent" />
          {t('Аккорды')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          {t('Подбор аккордовых прогрессий по тональности и стилю')}
        </p>
      </div>

      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface space-y-6">
        <div>
          <label className="text-xs text-theme-muted uppercase tracking-wider mb-2 block">{t('Тоника')}</label>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
            {NOTE_NAMES.map((note, index) => (
              <button
                key={note}
                onClick={() => changeSetting(() => setRootPc(index))}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  rootPc === index ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
                }`}
              >
                {note}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="text-xs text-theme-muted uppercase tracking-wider mb-2 block">{t('Лад')}</label>
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => changeSetting(() => setMode(m.id))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    mode === m.id ? 'bg-theme-warning text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
                  }`}
                >
                  {t(m.label)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-theme-muted uppercase tracking-wider mb-2 block">{t('Стиль')}</label>
            <div className="flex flex-wrap gap-2">
              {PROGRESSIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => changeSetting(() => setProgressionId(p.id))}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    progressionId === p.id ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
                  }`}
                >
                  {t(PROGRESSION_LABELS[p.id])}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs text-theme-muted mb-3">
            {t('Каждая ступень лада даёт свой аккорд. Прогрессия играет по 4 такта на аккорд, темп')} {BPM} BPM.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {chords.map((chord, index) => (
              <div
                key={`${chord.roman}-${index}`}
                className="rounded-xl bg-theme-surface2 border border-theme-border p-4 text-center transition-colors hover:border-theme-primary"
              >
                <p className="text-[11px] uppercase tracking-wider text-theme-muted">{chord.roman}</p>
                <p className="text-2xl font-bold text-theme-text mt-1">{chord.name}</p>
                <p className="text-xs text-theme-muted mt-2">{chord.notes.join(' · ')}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={togglePlay}
            className="px-5 py-2.5 bg-theme-primary text-white rounded-xl text-sm font-medium hover:bg-theme-primary-hover transition-all flex items-center gap-2"
          >
            {playing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {playing ? t('Стоп') : t('Прослушать')}
          </button>
          <button
            onClick={randomize}
            className="px-5 py-2.5 bg-theme-surface2 border border-theme-border text-theme-text rounded-xl text-sm font-medium hover:border-theme-primary transition-all flex items-center gap-2"
          >
            <Shuffle className="w-4 h-4" />
            {t('Случайная прогрессия')}
          </button>
          {setPage && (
            <button
              onClick={() => setPage('beat')}
              className="px-5 py-2.5 bg-theme-surface2 border border-theme-border text-theme-text rounded-xl text-sm font-medium hover:border-theme-primary transition-all flex items-center gap-2"
            >
              {t('Открыть Бит-Секвенсор для создания музыки')} <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
