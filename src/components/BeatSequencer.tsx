import { useState, type Dispatch, type SetStateAction } from 'react';
import { Drum, Volume2, Copy, Pencil, SlidersHorizontal, VolumeX, Check } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import {
  BEAT_STEPS,
  DRUM_PRESET_NAMES,
  DRUM_SOUNDS,
  soundColor,
  type DrumSound,
  type DrumTrack,
} from '@/lib/drumMachine';

type BeatSequencerProps = {
  tracks: DrumTrack[];
  setTracks: Dispatch<SetStateAction<DrumTrack[]>>;
  enabled: boolean;
  onToggleEnabled: () => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  presetName: string;
  onApplyPreset: (name: string) => void;
  playingStep: number;
};

export default function BeatSequencer({
  tracks,
  setTracks,
  enabled,
  onToggleEnabled,
  volume,
  onVolumeChange,
  presetName,
  onApplyPreset,
  playingStep,
}: BeatSequencerProps) {
  const { t } = useLocale();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const updateTrack = (id: string, patch: Partial<DrumTrack>) =>
    setTracks((prev) => prev.map((track) => (track.id === id ? { ...track, ...patch } : track)));

  const toggleStep = (id: string, stepIndex: number) =>
    setTracks((prev) =>
      prev.map((track) =>
        track.id === id
          ? { ...track, steps: track.steps.map((on, i) => (i === stepIndex ? !on : on)) }
          : track,
      ),
    );

  const duplicateTrack = (id: string) =>
  setTracks((prev) => {
    const maxTracks = isPremium ? 60 : 15;
    if (prev.length >= maxTracks) {
      alert(t(`Достигнут максимальный лимит в ${maxTracks} дорожек${isPremium ? ' (Premium)' : ''}`));
      return prev;
    }
    
    const index = prev.findIndex((track) => track.id === id);
    if (index < 0) return prev;
    
    const source = prev[index];
    const copy: Track = { 
      ...source, 
      id: crypto.randomUUID(), 
      name: `${source.name} (Копия)`, 
      steps: [...source.steps] 
    };
    
    return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
  });

  const startRename = (track: DrumTrack) => {
    setEditingId(track.id);
    setDraftName(track.name);
  };

  const commitRename = (id: string) => {
    const name = draftName.trim();
    if (name) updateTrack(id, { name: name.slice(0, 24) });
    setEditingId(null);
  };

  return (
    <div className="score-editor-sequencer cosmic-card glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Drum className="w-4 h-4 text-theme-accent" />
          <p className="text-xs text-theme-muted font-medium">{t('Бит-секвенсор')}</p>
          <button
            type="button"
            onClick={onToggleEnabled}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
              enabled ? 'bg-theme-success/20 text-theme-success' : 'bg-theme-surface2 text-theme-muted'
            }`}
          >
            {enabled ? t('ВКЛ') : t('ВЫКЛ')}
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {DRUM_PRESET_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onApplyPreset(name)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                presetName === name
                  ? 'bg-theme-primary text-white'
                  : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
              }`}
            >
              {t(name)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {tracks.map((track) => {
          const color = soundColor(track.sound);
          const isOpen = openId === track.id;
          return (
            <div key={track.id} className={`rounded-xl p-2 transition-colors ${track.muted ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2 overflow-x-auto">
                <div className="flex items-center gap-1 w-36 shrink-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                  {editingId === track.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(track.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(track.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      maxLength={24}
                      aria-label={t('Переименовать')}
                      className="w-full min-w-0 rounded bg-theme-surface2 px-1.5 py-0.5 text-[11px] text-theme-text focus:outline-none focus:ring-1 focus:ring-theme-primary"
                    />
                  ) : (
                    <span className="truncate text-[11px] font-medium text-theme-text" style={{ color }}>
                      {t(track.name)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateTrack(track.id, { muted: !track.muted })}
                    aria-label={track.muted ? t('Включить звук дорожки') : t('Выключить звук дорожки')}
                    className={`p-1 rounded transition-colors ${track.muted ? 'text-theme-danger' : 'text-theme-muted hover:text-theme-text'}`}
                  >
                    <VolumeX className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startRename(track)}
                    aria-label={t('Переименовать')}
                    className="p-1 rounded text-theme-muted hover:text-theme-text transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateTrack(track.id)}
                    aria-label={t('Дублировать дорожку')}
                    className="p-1 rounded text-theme-muted hover:text-theme-text transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : track.id)}
                    aria-label={t('Настройки дорожки')}
                    aria-expanded={isOpen}
                    className={`p-1 rounded transition-colors ${isOpen ? 'text-theme-primary' : 'text-theme-muted hover:text-theme-text'}`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-1 min-w-max">
                  {track.steps.map((on, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleStep(track.id, i)}
                      aria-pressed={on}
                      className={`h-6 w-[18px] shrink-0 rounded transition-all hover:opacity-80 ${i === playingStep ? 'ring-2 ring-white/80 ' : ''}${
                        on ? 'shadow-sm' : i % 4 === 0 ? 'bg-theme-muted/40' : 'bg-theme-border'
                      }`}
                      style={on ? { background: color } : undefined}
                    />
                  ))}
                </div>
              </div>

              {isOpen && (
                <TrackSettings track={track} onChange={(patch) => updateTrack(track.id, patch)} />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Volume2 className="w-3.5 h-3.5 text-theme-muted" />
        <input
          type="range"
          min={0}
          max={0.8}
          step={0.05}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="w-24 accent-theme-accent"
        />
        <span className="text-[10px] text-theme-muted">{t('Громкость бита')}</span>
      </div>
      <p className="mt-1 text-[10px] text-theme-muted">{BEAT_STEPS} {t('шагов')}</p>
    </div>
  );
}

function TrackSettings({ track, onChange }: { track: DrumTrack; onChange: (patch: Partial<DrumTrack>) => void }) {
  const { t } = useLocale();
  const field = 'flex flex-col gap-1 text-[10px] text-theme-muted';
  const input = 'accent-theme-primary';

  return (
    <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-theme-surface2/60 p-3 md:grid-cols-5">
      <label className={field}>
        {t('Инструмент')}
        <select
          value={track.sound}
          onChange={(e) => onChange({ sound: e.target.value as DrumSound })}
          className="rounded-md bg-theme-surface px-2 py-1 text-xs text-theme-text"
        >
          {DRUM_SOUNDS.map((sound) => (
            <option key={sound.id} value={sound.id}>{t(sound.label)}</option>
          ))}
        </select>
      </label>
      <label className={field}>
        {t('Громкость дорожки')} {Math.round(track.volume * 100)}%
        <input type="range" min={0} max={1.5} step={0.05} value={track.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) })} className={input} />
      </label>
      <label className={field}>
        {t('Длина звука')} {track.decay.toFixed(2)}x
        <input type="range" min={0.25} max={3} step={0.05} value={track.decay}
          onChange={(e) => onChange({ decay: Number(e.target.value) })} className={input} />
      </label>
      <label className={field}>
        {t('Тон')} {track.cutoff >= 20000 ? t('Без фильтра') : `${Math.round(track.cutoff)} Гц`}
        <input type="range" min={400} max={20000} step={100} value={track.cutoff}
          onChange={(e) => onChange({ cutoff: Number(e.target.value) })} className={input} />
      </label>
      <label className={field}>
        {t('Смещение')} {track.offset > 0 ? `+${track.offset}` : track.offset} {t('шаг.')}
        <input type="range" min={-4} max={4} step={1} value={track.offset}
          onChange={(e) => onChange({ offset: Number(e.target.value) })} className={input} />
      </label>
      <span className="col-span-2 flex items-center gap-1 text-[10px] text-theme-muted md:col-span-5">
        <Check className="w-3 h-3" />
        {t('Настройки применяются сразу, но не сохраняются после перезагрузки страницы')}
      </span>
    </div>
  );
}
