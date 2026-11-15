import { makeSound } from '@/pages/BeatComposerPage';
import { STEPS, trackEffects, type SavedTrack } from '@/lib/beatPlayback';

const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 2;

export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'beat';
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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const extension = url.split('?')[0].split('.').pop()?.toLowerCase() || 'mp3';
  saveBlob(blob, `${safeFileName(title)}.${extension}`);
}

export async function renderSequencerWav(tracks: SavedTrack[], bpm: number, bars: number): Promise<Blob> {
  const audibleTracks = tracks.filter((track) => !track.muted);
  const totalSteps = STEPS * bars;
  const stepSeconds = 60 / bpm / 4;
  const length = Math.ceil((totalSteps * stepSeconds + TAIL_SECONDS) * SAMPLE_RATE);
  const offline = new OfflineAudioContext(2, length, SAMPLE_RATE);

  for (let step = 0; step < totalSteps; step++) {
    const time = step * stepSeconds;
    audibleTracks.forEach((track) => {
      if (track.steps[step]) {
        makeSound(
          offline as unknown as AudioContext,
          null,
          track.type,
          time,
          track.volume * 0.7,
          trackEffects(track),
        );
      }
    });
  }

  const rendered = await offline.startRendering();
  return encodeWav(rendered);
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}
