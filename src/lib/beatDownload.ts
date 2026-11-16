import { Mp3Encoder } from '@breezystack/lamejs';
import { makeSound, type ExtendedEffects } from '@/pages/BeatComposerPage';
import { STEPS, trackEffects, type SavedTrack } from '@/lib/beatPlayback';

const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 2;

export function safeFileName(title: string): string {
  return title.replace(/[/:*?"<>|]+/g, '_').trim() || 'beat';
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadAudioFile(url: string, title: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
    const blob = await response.blob();
    const extension = url.split('?')[0].split('.').pop()?.toLowerCase() || 'mp3';
    saveBlob(blob, `${safeFileName(title)}.${extension}`);
  } catch (err) {
    console.error('Ошибка скачивания аудиофайла:', err);
    throw err;
  }
}

export async function renderSequencerMp3(tracks: SavedTrack[], bpm: number, bars: number): Promise<Blob> {
  console.log('🎵 Начало офлайн-рендеринга...', { tracksCount: tracks.length, bpm, bars });
  
  const audibleTracks = tracks.filter((track) => !track.muted);
  const totalSteps = STEPS * bars;
  const stepSeconds = 60 / bpm / 4;
  const length = Math.ceil((totalSteps * stepSeconds + TAIL_SECONDS) * SAMPLE_RATE);
  
  // Защита от зависания браузера при огромном количестве тактов (макс ~10 минут)
  const maxLength = 10 * 60 * SAMPLE_RATE;
  const safeLength = Math.min(length, maxLength);
  
  const offline = new OfflineAudioContext(2, safeLength, SAMPLE_RATE);

  for (let step = 0; step < totalSteps; step++) {
    const time = step * stepSeconds;
    audibleTracks.forEach((track) => {
      // БЕЗОПАСНАЯ ПРОВЕРКА: гарантируем, что шаг существует и равен true
      if (track.steps && track.steps[step] === true) {
        makeSound(
          offline as unknown as AudioContext,
          null,
          track.type,
          time,
          track.volume * 0.7,
          trackEffects(track) as ExtendedEffects,
          step
        );
      }
    });
  }

  console.log('⏳ Рендеринг аудио-буфера...');
  const rendered = await offline.startRendering();
  console.log('✅ Буфер отрендерен, кодирование в MP3...');
  
  return encodeMp3(rendered);
}

function encodeMp3(buffer: AudioBuffer): Blob {
  const encoder = new Mp3Encoder(2, SAMPLE_RATE, 192); // 192 kbps
  const chunks: Int8Array[] = [];

  const left = convertToInt16(buffer.getChannelData(0));
  const right = buffer.numberOfChannels > 1
    ? convertToInt16(buffer.getChannelData(1))
    : left;

  const blockSize = 1152;
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = right.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(l, r);
    if (mp3buf.length > 0) {
      chunks.push(new Int8Array(mp3buf));
    }
  }
  const end = encoder.flush();
  if (end.length > 0) {
    chunks.push(new Int8Array(end));
  }

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}

function convertToInt16(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}