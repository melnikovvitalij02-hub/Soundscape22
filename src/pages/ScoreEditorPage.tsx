import { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import BeatSequencer from '@/components/BeatSequencer';
import { BEAT_STEPS, buildDrumPreset, scheduleDrumHit, type DrumTrack } from '@/lib/drumMachine';
import {
  INSTRUMENT_OPTIONS,
  type InstrumentOption,
  type LoadedSample,
  type InstrumentId,
  loadInstrumentSamples,
  playSampledNote,
} from '@/lib/instrumentSamples';

import {
  Music,
  Play,
  Pause,
  Trash2,
  Download,
  Volume2,
  Eraser,
  Repeat,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type NoteDuration = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

type Articulation = 'none' | 'staccato' | 'accent' | 'tenuto' | 'crescendo' | 'decrescendo';

type PlacedItem = {
  id: string;
  type: 'note' | 'rest';
  pitch: number;
  accidental: 'natural' | 'sharp' | 'flat';
  duration: NoteDuration;
  position: number;
  staffIndex: number;
  articulation: Articulation;
};

type Clef = 'treble' | 'bass';

const DURATION_VALUES: Record<NoteDuration, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
};
const DURATION_LABELS: Record<NoteDuration, string> = {
  whole: 'Целая',
  half: 'Половинная',
  quarter: 'Четвертная',
  eighth: 'Восьмая',
  sixteenth: 'Шестнадцатая',
};

const NOTE_NAMES_RU = ['До', 'До#', 'Ре', 'Ре#', 'Ми', 'Фа', 'Фа#', 'Соль', 'Соль#', 'Ля', 'Ля#', 'Си'];

const ARTICULATIONS: { id: Articulation; label: string }[] = [
  { id: 'none', label: 'Без модификатора' },
  { id: 'staccato', label: 'Стаккато' },
  { id: 'accent', label: 'Акцент' },
  { id: 'tenuto', label: 'Тенуто' },
  { id: 'crescendo', label: 'Крещендо' },
  { id: 'decrescendo', label: 'Диминуэндо' },
];

const midiToNameRu = (midi: number) => {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES_RU[midi % 12];
  return `${name}${octave}`;
};

const STAFF_SYSTEMS_PER_PAGE = 8; // 4 grand-staff pairs (treble + bass)
const MAX_PAGES = 8;
const STAFF_HEIGHT = 120;
const STAFF_PADDING = 30;
const NOTE_SIZE = 7;
const BEATS_PER_MEASURE = 4;
const MEASURES_PER_STAFF = 4;
const BEATS_PER_STAFF = BEATS_PER_MEASURE * MEASURES_PER_STAFF;
const LINE_SPACING = 10;

const diatonicMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

function midiToStaffY(midi: number, clef: Clef): number {
  const refMidi = clef === 'treble' ? 64 : 45;
  let steps = 0;
  if (midi >= refMidi) {
    let m = refMidi;
    while (m < midi) {
      steps += diatonicMap[(m + 1) % 12] === diatonicMap[m % 12] ? 0 : 1;
      m++;
    }
  } else {
    let m = refMidi;
    while (m > midi) {
      steps -= diatonicMap[(m - 1) % 12] === diatonicMap[m % 12] ? 0 : 1;
      m--;
    }
  }
  return -steps * (LINE_SPACING / 2);
}

function staffYToMidi(y: number, clef: Clef): number {
  const refMidi = clef === 'treble' ? 64 : 45;
  const halfSteps = Math.round(-y / (LINE_SPACING / 2));
  let midi = refMidi;
  if (halfSteps >= 0) {
    let s = 0;
    while (s < halfSteps && midi < 127) {
      midi++;
      if (diatonicMap[midi % 12] !== diatonicMap[(midi - 1) % 12]) s++;
    }
  } else {
    let s = 0;
    while (s > halfSteps && midi > 0) {
      midi--;
      if (diatonicMap[midi % 12] !== diatonicMap[(midi + 1) % 12]) s--;
    }
  }
  return midi;
}

function getClefForStaff(staffIndex: number): Clef {
  return staffIndex % 2 === 0 ? 'treble' : 'bass';
}

export default function ScoreEditorPage({ isActive = true }: { isActive?: boolean }) {
  const { theme, isDark } = useTheme();
  const { profile } = useAuth();
  const { t } = useLocale();
  const [items, setItems] = useState<PlacedItem[]>([]);
  const [selectedDuration, setSelectedDuration] = useState<NoteDuration>('quarter');
  const [selectedTool, setSelectedTool] = useState<'note' | 'rest' | 'cursor'>('note');
  const [accidental, setAccidental] = useState<'natural' | 'sharp' | 'flat'>('natural');
  const [selectedArticulation, setSelectedArticulation] = useState<Articulation>('none');
  const [instrument, setInstrument] = useState<InstrumentOption>(INSTRUMENT_OPTIONS[0]);
  const [instrumentError, setInstrumentError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempo, setTempo] = useState(120);
  const [eraseMode, setEraseMode] = useState(false);
  const [playbackBeat, setPlaybackBeat] = useState(-1);
  const [volume, setVolume] = useState(0.5);
  const [drumTracks, setDrumTracks] = useState<DrumTrack[]>(() => buildDrumPreset('Базовый'));
  const [beatEnabled, setBeatEnabled] = useState(true);
  const [beatVolume, setBeatVolume] = useState(0.35);
  const [selectedPreset, setSelectedPreset] = useState('Базовый');
  const [currentPage, setCurrentPage] = useState(0);
  const [playStartBeat, setPlayStartBeat] = useState(0);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const totalBeatsPerPage = (STAFF_SYSTEMS_PER_PAGE / 2) * BEATS_PER_STAFF; // 4 pairs × 16 beats

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sampleSetRef = useRef<{ id: InstrumentId; samples: LoadedSample[] } | null>(null);
  const playbackStopRef = useRef(false);
  const playbackTokenRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  // Schedule a note at absolute time — all notes at same position play simultaneously (chords!)
  const scheduleNote = useCallback((midi: number, duration: NoteDuration, inst: InstrumentOption, baseVol: number, bpm: number, startTime: number, articulation: Articulation = 'none') => {
    const loaded = sampleSetRef.current;
    if (!loaded || loaded.id !== inst.id) return;
    const ctx = getAudioCtx();
    const dur = DURATION_VALUES[duration] * (60 / bpm) * (articulation === 'staccato' ? 0.5 : 1);
    const vol = articulation === 'accent' ? baseVol * 1.4 : baseVol;

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    if (articulation === 'crescendo') {
      masterGain.gain.setValueAtTime(0.25, startTime);
      masterGain.gain.linearRampToValueAtTime(1, startTime + dur);
    } else if (articulation === 'decrescendo') {
      masterGain.gain.setValueAtTime(1, startTime);
      masterGain.gain.linearRampToValueAtTime(0.25, startTime + dur);
    }

    playSampledNote(ctx, loaded.samples, inst.id, midi, startTime, dur, vol, masterGain);
  }, []);

  const ensureInstrumentLoaded = async (inst: InstrumentOption) => {
    if (sampleSetRef.current?.id === inst.id) return;
    const samples = await loadInstrumentSamples(getAudioCtx(), inst.id);
    sampleSetRef.current = { id: inst.id, samples };
    setInstrumentError(null);
  };

  const selectInstrument = (inst: InstrumentOption) => {
    setInstrument(inst);
    ensureInstrumentLoaded(inst).catch(() => setInstrumentError('Не удалось загрузить звуки инструмента. Проверьте интернет.'));
  };

  const pageStartBeat = currentPage * totalBeatsPerPage;
  const pageEndBeat = pageStartBeat + totalBeatsPerPage;
  const pageItems = items.filter(n => n.position >= pageStartBeat && n.position < pageEndBeat);

  const handleStaffClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = canvas.clientWidth;

    const systemHeight = STAFF_HEIGHT + STAFF_PADDING * 2;
    const staffIdx = Math.floor(y / systemHeight);
    if (staffIdx < 0 || staffIdx >= STAFF_SYSTEMS_PER_PAGE) return;

    const clef = getClefForStaff(staffIdx);
    const staffTop = staffIdx * systemHeight + STAFF_PADDING + 30;
    const staffMidY = staffTop + 4 * LINE_SPACING / 2;
    const relY = y - staffMidY;

    const midi = staffYToMidi(relY, clef);

    const staffLeft = STAFF_PADDING + 20;
    const staffRight = w - 20;
    const staffWidth = staffRight - staffLeft;
    const beatWidth = staffWidth / BEATS_PER_STAFF;
    const rawBeat = (x - staffLeft) / beatWidth;
    if (rawBeat < 0 || rawBeat >= BEATS_PER_STAFF) return;
    const grid = DURATION_VALUES[selectedDuration];
    const beatInStaff = Math.floor(rawBeat / grid) * grid;

    const pairIndex = Math.floor(staffIdx / 2);
    const beatPosition = pageStartBeat + pairIndex * BEATS_PER_STAFF + beatInStaff;

    if (selectedTool === 'cursor') {
      setPlayStartBeat(beatPosition);
      return;
    }

    if (eraseMode) {
      setItems(prev => {
        const candidates = prev.filter(n => n.position === beatPosition && n.staffIndex === staffIdx && (n.type === 'rest' || n.pitch === midi));
        if (candidates.length === 0) return prev;
        return prev.filter(n => n.id !== candidates[candidates.length - 1].id);
      });
      return;
    }

    // Toggle off if same item exists at same position+staff+pitch
    const existing = items.find(n => n.position === beatPosition && n.staffIndex === staffIdx && n.type === selectedTool && (n.type === 'rest' || n.pitch === midi));
    if (existing) {
      setItems(prev => prev.filter(n => n.id !== existing.id));
      return;
    }

    // Apply accidental to pitch
    let finalPitch = midi;
    if (accidental === 'sharp') finalPitch = midi + 1;
    if (accidental === 'flat') finalPitch = midi - 1;

    const newItem: PlacedItem = {
      id: `${Date.now()}-${Math.random()}`,
      type: selectedTool,
      pitch: selectedTool === 'rest' ? 0 : finalPitch,
      accidental,
      duration: selectedDuration,
      position: beatPosition,
      staffIndex: staffIdx,
      articulation: selectedTool === 'rest' ? 'none' : selectedArticulation,
    };
    setItems(prev => [...prev, newItem]);

    if (selectedTool === 'note') {
      // Preview the note
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      ensureInstrumentLoaded(instrument)
        .then(() => scheduleNote(finalPitch, selectedDuration, instrument, volume, tempo, getAudioCtx().currentTime, selectedArticulation))
        .catch(() => setInstrumentError('Не удалось загрузить звуки инструмента. Проверьте интернет.'));
    }
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(n => n.id !== id));
  const clearAll = () => { setItems([]); setPlaybackBeat(-1); };

  const applyPreset = (name: string) => {
    setSelectedPreset(name);
    setDrumTracks(buildDrumPreset(name));
  };

  // Playback: schedule ALL notes by absolute time so chords play simultaneously
  const playAll = async () => {
    if (isPlaying) {
      stopPlayback();
      await new Promise((r) => setTimeout(r, 50));
    }
    const token = ++playbackTokenRef.current;
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    try {
      await ensureInstrumentLoaded(instrument);
    } catch {
      setInstrumentError('Не удалось загрузить звуки инструмента. Проверьте интернет.');
      return;
    }

    setIsPlaying(true);
    playbackStopRef.current = false;

    const secPerBeat = 60 / tempo;
    const secPerStep = secPerBeat / 4;
    const playStart = ctx.currentTime + 0.1;

    // Sort notes by position for correct playback order
    const sortedNotes = [...items].sort((a, b) => a.position - b.position);

    // Group notes by position for chord playback — sorted ensures correct order
    const notesByPosition = new Map<number, PlacedItem[]>();
    sortedNotes.forEach(item => {
      if (item.position < playStartBeat) return;
      if (item.type !== 'note') return;
      const arr = notesByPosition.get(item.position) || [];
      arr.push(item);
      notesByPosition.set(item.position, arr);
    });

    // Calculate total duration
    const maxBeat = items.length > 0
      ? Math.max(...items.map(n => n.position + DURATION_VALUES[n.duration]))
      : playStartBeat + totalBeatsPerPage;
    const totalBeatsToPlay = Math.max(maxBeat, playStartBeat + totalBeatsPerPage);
    const totalDuration = (totalBeatsToPlay - playStartBeat) * secPerBeat;

    // Schedule all notes at their absolute times — chords play simultaneously!
    notesByPosition.forEach((notesAtPos, position) => {
      const noteStartTime = playStart + (position - playStartBeat) * secPerBeat;
      notesAtPos.forEach(note => {
        scheduleNote(note.pitch, note.duration, instrument, volume, tempo, noteStartTime, note.articulation);
      });
    });

    // Schedule drums
    if (beatEnabled) {
      const totalSteps = Math.ceil(totalDuration / secPerStep);
      const startStep = Math.floor(playStartBeat * 4);
      drumTracks.forEach((track) => {
        if (track.muted) return;
        for (let s = 0; s < totalSteps; s++) {
          const idx = (((startStep + s - track.offset) % BEAT_STEPS) + BEAT_STEPS) % BEAT_STEPS;
          if (!track.steps[idx]) continue;
          scheduleDrumHit(ctx, track, playStart + s * secPerStep, beatVolume);
        }
      });
    }

    // Animate playback cursor
    const cursorStartTime = performance.now();
    const cursorDuration = totalDuration * 1000;
    const animateCursor = () => {
      if (playbackStopRef.current || playbackTokenRef.current !== token) return;
      const elapsed = performance.now() - cursorStartTime;
      const beat = playStartBeat + (elapsed / 1000) / secPerBeat;
      if (elapsed >= cursorDuration) {
        setPlaybackBeat(-1);
        if (playbackTokenRef.current === token) setIsPlaying(false);
        return;
      }
      setPlaybackBeat(beat);
      requestAnimationFrame(animateCursor);
    };
    requestAnimationFrame(animateCursor);

    // Wait for playback to finish
    await new Promise(resolve => setTimeout(resolve, (totalDuration + 0.5) * 1000));
    if (playbackTokenRef.current === token) {
      playbackStopRef.current = true;
      setPlaybackBeat(-1);
      setIsPlaying(false);
    }
  };

  const stopPlayback = () => {
    playbackStopRef.current = true;
    playbackTokenRef.current++;
    setIsPlaying(false);
    setPlaybackBeat(-1);
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'running') {
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const exportMidi = () => {
    if (profile?.is_premium !== true) {
      setExportNotice(t('Экспорт MIDI доступен только подписчикам Premium. Оформите подписку в разделе «Premium»'));
      return;
    }
    const sortedItems = [...items].sort((a, b) => a.position - b.position);
    const header = [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x60];
    const trackData: number[] = [];
    let absTime = 0;
    for (const item of sortedItems) {
      const itemStartTime = Math.round(item.position * 96);
      const ticks = Math.round(DURATION_VALUES[item.duration] * 96);
      if (item.type === 'rest') {
        absTime = itemStartTime + ticks;
        continue;
      }
      if (itemStartTime > absTime) {
        trackData.push(...writeVarLen(itemStartTime - absTime));
        absTime = itemStartTime;
      } else {
        trackData.push(...writeVarLen(0));
      }
      trackData.push(0x90, item.pitch, 0x7F);
      trackData.push(...writeVarLen(ticks));
      trackData.push(0x80, item.pitch, 0x00);
      absTime += ticks;
    }
    trackData.push(0x00, 0xFF, 0x2F, 0x00);
    const trackHeader = [0x4D, 0x54, 0x72, 0x6B];
    const trackLen = trackData.length;
    trackHeader.push((trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF, (trackLen >> 8) & 0xFF, trackLen & 0xFF);
    const midi = new Uint8Array([...header, ...trackHeader, ...trackData]);
    const blob = new Blob([midi], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'soundscape-score.mid';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Draw staves
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const systemHeight = STAFF_HEIGHT + STAFF_PADDING * 2;
    const totalHeight = systemHeight * STAFF_SYSTEMS_PER_PAGE;
    canvas.width = w * dpr;
    canvas.height = totalHeight * dpr;
    ctx.scale(dpr, dpr);
    // Theme-aware canvas colors: light theme → dark elements, dark theme → light elements.
    // Detected via the ThemeContext's isDark flag, which reflects data-theme on <html>.
    const noteColor = isDark ? '#ffffff' : '#1a1a2e';
    const staffLineColor = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)';
    const editorBg = isDark ? 'transparent' : '#ffffff';
    const editorText = isDark ? '#ffffff' : '#1a1a2e';
    const editorTextMuted = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
    if (editorBg !== 'transparent') {
      ctx.fillStyle = editorBg;
      ctx.fillRect(0, 0, w, totalHeight);
    } else {
      ctx.clearRect(0, 0, w, totalHeight);
    }

    const staffLeft = STAFF_PADDING + 20;
    const staffRight = w - 20;
    const staffWidth = staffRight - staffLeft;
    const beatWidth = staffWidth / BEATS_PER_STAFF;
    const measureWidth = staffWidth / MEASURES_PER_STAFF;

    for (let s = 0; s < STAFF_SYSTEMS_PER_PAGE; s++) {
      const clef = getClefForStaff(s);
      const systemTop = s * systemHeight + STAFF_PADDING;
      const staffTop = systemTop + 30;

      ctx.strokeStyle = staffLineColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = staffTop + i * LINE_SPACING;
        ctx.beginPath();
        ctx.moveTo(staffLeft, y);
        ctx.lineTo(staffRight, y);
        ctx.stroke();
      }

      ctx.fillStyle = editorText;
      ctx.font = '28px serif';
      ctx.fillText(clef === 'treble' ? '\u266F' : '\u266D', staffLeft - 18, staffTop + 26);
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = editorTextMuted;
      ctx.fillText(clef === 'treble' ? t('Скрипичный') : t('Басовый'), staffLeft - 18, staffTop - 6);

      ctx.strokeStyle = staffLineColor;
      ctx.lineWidth = 1;
      for (let i = 0; i <= MEASURES_PER_STAFF; i++) {
        const x = staffLeft + i * measureWidth;
        ctx.beginPath();
        ctx.moveTo(x, staffTop);
        ctx.lineTo(x, staffTop + 4 * LINE_SPACING);
        ctx.stroke();
      }

      ctx.strokeStyle = editorTextMuted;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < BEATS_PER_STAFF; i++) {
        if (i % BEATS_PER_MEASURE !== 0) {
          const x = staffLeft + i * beatWidth;
          ctx.beginPath();
          ctx.moveTo(x, staffTop);
          ctx.lineTo(x, staffTop + 4 * LINE_SPACING);
          ctx.stroke();
        }
      }

      ctx.fillStyle = editorTextMuted;
      ctx.font = '8px Inter, sans-serif';
      ctx.fillText(`${s + 1}`, 4, staffTop + 24);

      // Draw items on this staff (use stored staffIndex — paired staves share positions)
      const itemsOnStaff = pageItems.filter(n => n.staffIndex === s);

      itemsOnStaff.forEach(item => {
        const pairIdx = Math.floor(s / 2);
        const beatInStaff = (item.position - pageStartBeat) - pairIdx * BEATS_PER_STAFF;
        const x = staffLeft + (beatInStaff + DURATION_VALUES[item.duration] / 2) * beatWidth;
        const y = staffTop + 4 * LINE_SPACING / 2 + (item.type === 'rest' ? 0 : midiToStaffY(item.pitch, clef));
        const isPlayingItem = playbackBeat >= item.position && playbackBeat < item.position + DURATION_VALUES[item.duration];

        if (item.type === 'rest') {
          // Draw rest symbol
          ctx.fillStyle = isPlayingItem ? '#a5b4fc' : noteColor;
          ctx.font = '20px serif';
          const restSymbols: Record<NoteDuration, string> = {
            whole: '\u1D15B', half: '\u1D15C', quarter: '\u266B', eighth: '\u1D15E', sixteenth: '\u1D15F',
          };
          ctx.fillText(restSymbols[item.duration] || '\u266B', x - 6, y + 4);
          return;
        }

        const itemColor = isPlayingItem ? '#a5b4fc' : noteColor;
        ctx.fillStyle = itemColor;
        ctx.strokeStyle = itemColor;
        ctx.beginPath();
        ctx.ellipse(x, y, NOTE_SIZE, NOTE_SIZE * 0.7, -0.3, 0, Math.PI * 2);
        ctx.fill();

        if (item.duration !== 'whole') {
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x + NOTE_SIZE - 1, y);
          ctx.lineTo(x + NOTE_SIZE - 1, y - 25);
          ctx.stroke();
          if (item.duration === 'eighth' || item.duration === 'sixteenth') {
            ctx.beginPath();
            ctx.moveTo(x + NOTE_SIZE - 1, y - 25);
            ctx.lineTo(x + NOTE_SIZE + 5, y - 20);
            ctx.stroke();
            if (item.duration === 'sixteenth') {
              ctx.beginPath();
              ctx.moveTo(x + NOTE_SIZE - 1, y - 21);
              ctx.lineTo(x + NOTE_SIZE + 5, y - 16);
              ctx.stroke();
            }
          }
        }

        // Accidentals (sharp/flat)
        if (item.accidental === 'sharp') {
          ctx.fillStyle = itemColor;
          ctx.font = '14px serif';
          ctx.fillText('\u266F', x - NOTE_SIZE - 8, y + 4);
        } else if (item.accidental === 'flat') {
          ctx.fillStyle = itemColor;
          ctx.font = '14px serif';
          ctx.fillText('\u266D', x - NOTE_SIZE - 8, y + 4);
        }

        // Ledger lines
        const bottomLineY = staffTop + 4 * LINE_SPACING;
        const topLineY = staffTop;
        if (y > bottomLineY + 2) {
          for (let ly = bottomLineY + LINE_SPACING; ly <= y + 2; ly += LINE_SPACING) {
            ctx.strokeStyle = staffLineColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x - NOTE_SIZE - 2, ly);
            ctx.lineTo(x + NOTE_SIZE + 2, ly);
            ctx.stroke();
          }
        } else if (y < topLineY - 2) {
          for (let ly = topLineY - LINE_SPACING; ly >= y - 2; ly -= LINE_SPACING) {
            ctx.strokeStyle = staffLineColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x - NOTE_SIZE - 2, ly);
            ctx.lineTo(x + NOTE_SIZE + 2, ly);
            ctx.stroke();
          }
        }

        ctx.strokeStyle = itemColor;
        ctx.fillStyle = itemColor;
        ctx.lineWidth = 1.2;
        if (item.articulation === 'staccato') {
          ctx.beginPath();
          ctx.arc(x, y - NOTE_SIZE - 5, 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (item.articulation === 'accent') {
          ctx.beginPath();
          ctx.moveTo(x - 4, y - NOTE_SIZE - 9);
          ctx.lineTo(x + 3, y - NOTE_SIZE - 6);
          ctx.lineTo(x - 4, y - NOTE_SIZE - 3);
          ctx.stroke();
        } else if (item.articulation === 'tenuto') {
          ctx.beginPath();
          ctx.moveTo(x - 4, y - NOTE_SIZE - 5);
          ctx.lineTo(x + 4, y - NOTE_SIZE - 5);
          ctx.stroke();
        } else if (item.articulation === 'crescendo' || item.articulation === 'decrescendo') {
          const hy = staffTop + 4 * LINE_SPACING + 22;
          const hx = x + beatWidth * DURATION_VALUES[item.duration] * 0.8;
          const open = 4;
          ctx.beginPath();
          if (item.articulation === 'crescendo') {
            ctx.moveTo(x, hy); ctx.lineTo(hx, hy - open);
            ctx.moveTo(x, hy); ctx.lineTo(hx, hy + open);
          } else {
            ctx.moveTo(x, hy - open); ctx.lineTo(hx, hy);
            ctx.moveTo(x, hy + open); ctx.lineTo(hx, hy);
          }
          ctx.stroke();
        }

        ctx.fillStyle = isPlayingItem ? 'rgba(165, 180, 252, 0.8)' : editorTextMuted;
        ctx.font = '7px Inter, sans-serif';
        ctx.fillText(`${t(NOTE_NAMES_RU[item.pitch % 12])}${Math.floor(item.pitch / 12) - 1}`, x - 7, staffTop + 5 * LINE_SPACING + 10);
      });

      // Playback cursor — highlight both staves in the pair
      if (playbackBeat >= pageStartBeat && playbackBeat < pageEndBeat) {
        const relBeat = playbackBeat - pageStartBeat;
        const cursorPair = Math.floor(relBeat / BEATS_PER_STAFF);
        if (Math.floor(s / 2) === cursorPair) {
          const beatInStaff = relBeat - cursorPair * BEATS_PER_STAFF;
          const x = staffLeft + beatInStaff * beatWidth + beatWidth / 2;
          ctx.strokeStyle = 'rgba(165, 180, 252, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, staffTop - 5);
          ctx.lineTo(x, staffTop + 4 * LINE_SPACING + 5);
          ctx.stroke();
        }
      }

      if (playStartBeat >= pageStartBeat && playStartBeat < pageEndBeat) {
        const relStart = playStartBeat - pageStartBeat;
        const startPair = Math.floor(relStart / BEATS_PER_STAFF);
        if (Math.floor(s / 2) === startPair) {
          const beatInStaff = relStart - startPair * BEATS_PER_STAFF;
          const x = staffLeft + beatInStaff * beatWidth;
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, staffTop - 8);
          ctx.lineTo(x, staffTop + 4 * LINE_SPACING + 8);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }, [pageItems, playbackBeat, playStartBeat, eraseMode, pageStartBeat, pageEndBeat, currentPage, theme, isDark, t]);

  const currentBeat = items.reduce((sum, n) => Math.max(sum, n.position + DURATION_VALUES[n.duration]), 0);
  const playingStep = playbackBeat >= 0 ? Math.floor(playbackBeat * 4) % BEAT_STEPS : -1;
  return (
    <div className="space-y-5 pb-24">
      <div className="cosmic-page-header">
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2 cosmic-header-glow">
          <Music className="w-6 h-6 text-theme-primary" />
          {t('Нотный редактор')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          {t('Нажми прямо на линейку, чтобы поставить ноту или паузу. Скрипичный и басовый ключи, аккорды,')} {MAX_PAGES} {t('страниц')}
        </p>
      </div>

      {/* Staff display */}
      <div className="cosmic-card glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-theme-muted">
            <span className="px-2 py-1 rounded-md bg-theme-surface2 font-mono">
              {t('Стр.')} {currentPage + 1}/{MAX_PAGES}
            </span>
            <span className="px-2 py-1 rounded-md bg-theme-surface2 font-mono">4/4</span>
            <span className="px-2 py-1 rounded-md bg-theme-surface2 font-mono">{tempo} BPM</span>
            <span className="px-2 py-1 rounded-md bg-theme-surface2 font-mono">{items.length} {t('эл.')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEraseMode(!eraseMode)}
              className={`p-2 rounded-lg transition-colors ${eraseMode ? 'bg-theme-danger/20 text-theme-danger' : 'text-theme-muted hover:text-theme-text hover:bg-theme-surface2'}`}
              title={t('Ластик')}
            >
              <Eraser className="w-4 h-4" />
            </button>
            <button
              onClick={clearAll}
              className="p-2 rounded-lg text-theme-muted hover:text-theme-danger hover:bg-theme-surface2 transition-colors"
              title={t('Очистить всё')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          onClick={handleStaffClick}
          className="w-full block rounded-xl cursor-crosshair score-editor-canvas"
          style={{ height: (STAFF_HEIGHT + STAFF_PADDING * 2) * STAFF_SYSTEMS_PER_PAGE, background: 'var(--editor-bg, transparent)' }}
        />
        {items.length === 0 && (
          <p className="text-center text-theme-muted text-xs py-2">
            {t('Нажимай прямо на линейку, чтобы ставить ноты. Чётные системы — скрипичный ключ, нечётные — басовый.')}
          </p>
        )}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setCurrentPage(p => Math.max(0, p - 1)); setPlayStartBeat(Math.max(0, (currentPage - 1) * totalBeatsPerPage)); }}
          disabled={currentPage === 0}
          className="p-2 rounded-lg bg-theme-surface2 text-theme-text disabled:opacity-30 hover:bg-theme-surface transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: MAX_PAGES }).map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrentPage(i); setPlayStartBeat(i * totalBeatsPerPage); }}
            className={`w-8 h-8 rounded-lg text-xs font-mono transition-all ${
              currentPage === i
                ? 'bg-theme-primary text-white'
                : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
            }`}
          >
            {i + 1}
          </button>
        ))}
        <button
          onClick={() => { setCurrentPage(p => Math.min(MAX_PAGES - 1, p + 1)); setPlayStartBeat(Math.min((MAX_PAGES - 1) * totalBeatsPerPage, (currentPage + 1) * totalBeatsPerPage)); }}
          disabled={currentPage === MAX_PAGES - 1}
          className="p-2 rounded-lg bg-theme-surface2 text-theme-text disabled:opacity-30 hover:bg-theme-surface transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <BeatSequencer
        tracks={drumTracks}
        setTracks={setDrumTracks}
        enabled={beatEnabled}
        onToggleEnabled={() => setBeatEnabled(!beatEnabled)}
        volume={beatVolume}
        onVolumeChange={setBeatVolume}
        presetName={selectedPreset}
        onApplyPreset={applyPreset}
        playingStep={playingStep}
      />

      {/* Playback controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={isPlaying ? stopPlayback : playAll}
          className="flex items-center gap-2 px-5 py-2.5 bg-theme-primary text-white rounded-xl text-sm font-semibold hover:bg-theme-primary-hover transition-colors shadow-lg"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? t('Стоп') : t('Играть')}
        </button>
        <div className="flex items-center gap-2 px-3 py-2 bg-theme-surface/50 border border-theme-border rounded-xl">
          <span className="text-xs text-theme-muted">{t('Темп')}</span>
          <input type="range" min={60} max={180} value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
            className="w-24 accent-theme-primary" />
          <span className="text-xs font-mono text-theme-text tabular-nums w-10">{tempo}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-theme-surface/50 border border-theme-border rounded-xl">
          <Volume2 className="w-4 h-4 text-theme-muted" />
          <input type="range" min={0} max={1} step={0.05} value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-20 accent-theme-primary" />
        </div>
        <button
          onClick={() => { setPlayStartBeat(currentPage * totalBeatsPerPage); }}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-theme-surface/50 border border-theme-border text-theme-text rounded-xl text-xs font-medium hover:border-theme-primary transition-colors"
          title={t('Играть с начала текущей страницы')}
        >
          <Repeat className="w-3.5 h-3.5" />
          {t('Со стр.')} {currentPage + 1}
        </button>
        <button
          onClick={exportMidi}
          disabled={items.length === 0}
          title={profile?.is_premium ? t('Экспорт MIDI') : t('Экспорт MIDI — только для Premium')}
          className="flex items-center gap-2 px-4 py-2.5 bg-theme-surface/50 border border-theme-border text-theme-text rounded-xl text-sm font-medium hover:border-theme-primary transition-colors disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          MIDI
          {profile?.is_premium !== true && <span className="text-[10px] text-theme-warning font-semibold">PRO</span>}
        </button>
      </div>

      {exportNotice && (
        <div className="px-4 py-2 rounded-lg bg-theme-warning/10 border border-theme-warning/30 text-theme-warning text-sm">
          {exportNotice}
        </div>
      )}

      {/* Tool selector: note vs rest */}
      <div>
        <p className="text-xs text-theme-muted mb-2 font-medium">{t('Инструмент ввода')}</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTool('note')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              selectedTool === 'note'
                ? 'bg-theme-primary text-white shadow-lg'
                : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text'
            }`}
          >
            <Music className="w-3.5 h-3.5 inline mr-1" /> {t('Нота')}
          </button>
          <button
            onClick={() => setSelectedTool('rest')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              selectedTool === 'rest'
                ? 'bg-theme-primary text-white shadow-lg'
                : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text'
            }`}
          >
            {t('Пауза')}
          </button>
          <button
            onClick={() => setSelectedTool('cursor')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              selectedTool === 'cursor'
                ? 'bg-theme-primary text-white shadow-lg'
                : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text'
            }`}
          >
            {t('Старт с места')}
          </button>
        </div>
        <p className="text-[10px] text-theme-muted mt-1">
          {t('Режим «Старт с места»: клик по линейке выбирает, с какой доли начнётся воспроизведение.')}
        </p>
      </div>

      {/* Duration selector */}
      <div>
        <p className="text-xs text-theme-muted mb-2 font-medium">{t('Длительность')}</p>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(DURATION_VALUES) as NoteDuration[]).map(d => (
            <button
              key={d}
              onClick={() => setSelectedDuration(d)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                selectedDuration === d
                  ? 'bg-theme-primary text-white shadow-lg'
                  : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text hover:border-theme-primary'
              }`}
            >
              {t(DURATION_LABELS[d])}
            </button>
          ))}
        </div>
      </div>

      {/* Accidental selector */}
      <div>
        <p className="text-xs text-theme-muted mb-2 font-medium">{t('Знаки альтерации')}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setAccidental('natural')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              accidental === 'natural'
                ? 'bg-theme-primary text-white shadow-lg'
                : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text'
            }`}
          >
            {t('Без знака')}
          </button>
          <button
            onClick={() => setAccidental('sharp')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              accidental === 'sharp'
                ? 'bg-theme-primary text-white shadow-lg'
                : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text'
            }`}
          >
            <span className="text-base">♯ {t('Диез')}</span>
          </button>
          <button
            onClick={() => setAccidental('flat')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              accidental === 'flat'
                ? 'bg-theme-primary text-white shadow-lg'
                : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text'
            }`}
          >
            <span className="text-base">♭ {t('Бемоль')}</span>
          </button>
        </div>
      </div>

      {/* Articulation selector */}
      <div>
        <p className="text-xs text-theme-muted mb-2 font-medium">{t('Модификаторы')}</p>
        <div className="flex gap-2 flex-wrap">
          {ARTICULATIONS.map(art => (
            <button
              key={art.id}
              onClick={() => setSelectedArticulation(art.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                selectedArticulation === art.id
                  ? 'bg-theme-primary text-white shadow-lg'
                  : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text hover:border-theme-primary'
              }`}
            >
              {t(art.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Instrument selector */}
      <div>
        <p className="text-xs text-theme-muted mb-2 font-medium">{t('Инструмент')}</p>
        <div className="flex gap-2 flex-wrap">
          {INSTRUMENT_OPTIONS.map(inst => (
            <button
              key={inst.id}
              onClick={() => selectInstrument(inst)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                instrument.id === inst.id
                  ? 'bg-theme-primary-bg border border-theme-primary-border text-theme-primary-text'
                  : 'bg-theme-surface/50 border border-theme-border text-theme-muted hover:text-theme-text hover:border-theme-primary'
              }`}
            >
              {t(inst.name)}
            </button>
          ))}
        </div>
        {instrumentError && (
          <p className="mt-2 text-xs text-theme-danger">{instrumentError}</p>
        )}
      </div>

      {/* Items list */}
      {items.length > 0 && (
        <div className="cosmic-card glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
          <p className="text-xs text-theme-muted mb-3 font-medium">
            {t('Элементы')} ({items.length}) — {currentBeat.toFixed(1)} {t('долей')}
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {[...items].sort((a, b) => a.position - b.position).map((item) => (
              <button
                key={item.id}
                onClick={() => removeItem(item.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  playbackBeat >= item.position && playbackBeat < item.position + DURATION_VALUES[item.duration]
                    ? 'bg-theme-primary text-white'
                    : 'bg-theme-surface2 text-theme-text hover:bg-theme-danger/20 hover:text-theme-danger'
                }`}
                title={t('Нажми, чтобы удалить')}
              >
                {item.type === 'rest' ? t('Пауза') : `${t(NOTE_NAMES_RU[item.pitch % 12])}${Math.floor(item.pitch / 12) - 1}`}
                {' · '}
                {t(DURATION_LABELS[item.duration].slice(0, 3))}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function writeVarLen(value: number): number[] {
  const bytes: number[] = [];
  let buffer = value & 0x7F;
  value >>= 7;
  while (value > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7F) | 0x80;
    value >>= 7;
  }
  while (true) {
    bytes.push(buffer & 0xFF);
    if (buffer & 0x80) { buffer >>= 8; } else { break; }
  }
  return bytes;
}
