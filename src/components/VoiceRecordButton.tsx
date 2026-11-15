import { useEffect, useRef, useState } from 'react';
import { Mic, Send, X } from 'lucide-react';
import { formatClock } from '@/lib/formatClock';
import { useLocale } from '@/context/LocaleContext';

const MAX_SECONDS = 120;

export type RecordedVoice = {
  blob: Blob;
  mimeType: string;
  duration: number;
};

type Props = {
  disabled?: boolean;
  onRecorded: (voice: RecordedVoice) => void;
  onRecordingChange: (recording: boolean) => void;
  onError: (message: string) => void;
};

export default function VoiceRecordButton({ disabled, onRecorded, onRecordingChange, onError }: Props) {
  const { t } = useLocale();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);
  const discardRef = useRef(false);
  const onRecordedRef = useRef(onRecorded);
  const onRecordingChangeRef = useRef(onRecordingChange);
  onRecordedRef.current = onRecorded;
  onRecordingChangeRef.current = onRecordingChange;

  const releaseResources = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      releaseResources();
    };
  }, []);

  const finish = (send: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    discardRef.current = !send;
    recorder.stop();
  };

  const start = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError(t('Запись голоса не поддерживается в этом браузере'));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError(t('Нет доступа к микрофону'));
      return;
    }

    const recorder = new MediaRecorder(stream);
    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    discardRef.current = false;
    secondsRef.current = 0;
    setSeconds(0);

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      releaseResources();
      recorderRef.current = null;
      setRecording(false);
      onRecordingChangeRef.current(false);
      if (discardRef.current || chunksRef.current.length === 0) return;
      const mimeType = (recorder.mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onRecordedRef.current({ blob, mimeType, duration: Math.max(1, secondsRef.current) });
    };

    recorder.start();
    setRecording(true);
    onRecordingChangeRef.current(true);
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_SECONDS) finish(true);
    }, 1000);
  };

  if (!recording) {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label={t('Записать голосовое сообщение')}
        title={t('Записать голосовое сообщение')}
        className="p-2.5 shrink-0 bg-theme-surface2 border border-theme-border text-theme-muted rounded-xl hover:text-theme-primary hover:border-theme-primary transition-colors disabled:opacity-50"
      >
        <Mic className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-2 px-3 py-1.5 min-w-0 rounded-xl bg-theme-danger/10 border border-theme-danger/40">
      <span className="w-2.5 h-2.5 rounded-full bg-theme-danger animate-pulse shrink-0" />
      <span className="flex-1 text-sm font-medium tabular-nums text-theme-text">
        {formatClock(seconds)}
        <span className="text-xs text-theme-muted"> / {formatClock(MAX_SECONDS)}</span>
      </span>
      <button
        type="button"
        onClick={() => finish(false)}
        aria-label={t('Отменить запись')}
        className="p-2 rounded-lg text-theme-muted hover:text-theme-danger transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => finish(true)}
        aria-label={t('Отправить голосовое')}
        className="p-2 rounded-lg bg-theme-primary text-white hover:bg-theme-primary-hover transition-colors"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
