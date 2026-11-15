import { useEffect, useState } from 'react';
import { Loader2, Music, Upload, X, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';

const MAX_BYTES = 30 * 1024 * 1024;
const AUDIO_EXTENSION = /\.(mp3|wav)$/i;

type Props = {
  onClose: () => void;
  onUploaded: (beatId: string) => void;
};

export default function UploadBeatModal({ onClose, onUploaded }: Props) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const premiumBlocked = profile?.is_premium !== true;
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [bpm, setBpm] = useState(120);
  const [description, setDescription] = useState('');
  const [downloadAccess, setDownloadAccess] = useState<'premium' | 'nobody'>('premium');
  const [commentAccess, setCommentAccess] = useState<'all' | 'premium' | 'nobody'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const handleFileChange = (selected: File | null) => {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!AUDIO_EXTENSION.test(selected.name)) {
      setFile(null);
      setError(t('Выберите файл в формате MP3 или WAV'));
      return;
    }
    if (selected.size > MAX_BYTES) {
      setFile(null);
      setError(t('Файл слишком большой. Максимум 30 МБ'));
      return;
    }
    setFile(selected);
    if (!title.trim()) setTitle(selected.name.replace(AUDIO_EXTENSION, ''));
  };

  const canSubmit = Boolean(profile && file && title.trim()) && !submitting && !premiumBlocked;

  const handleSubmit = async () => {
    if (!profile || !file) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('Укажите название трека'));
      return;
    }
    setSubmitting(true);
    setError(null);

    const extension = /\.wav$/i.test(file.name) ? 'wav' : 'mp3';
    const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('beat-audio')
      .upload(path, file, { contentType: extension === 'wav' ? 'audio/wav' : 'audio/mpeg' });
    if (uploadError) {
      setError(t('Не удалось загрузить файл. Попробуйте еще раз'));
      setSubmitting(false);
      return;
    }

    const { data: publicFile } = supabase.storage.from('beat-audio').getPublicUrl(path);
    const { data: beat, error: insertError } = await supabase
      .from('beats')
      .insert({
        user_id: profile.id,
        title: trimmedTitle,
        genre: genre.trim(),
        bpm,
        audio_url: publicFile.publicUrl,
        play_count: 0,
        description: description.trim() || null,
        download_access: downloadAccess,
        comment_access: commentAccess,
      })
      .select('id')
      .maybeSingle();

    if (insertError || !beat) {
      await supabase.storage.from('beat-audio').remove([path]);
      setError(t('Не удалось сохранить бит. Попробуйте еще раз'));
      setSubmitting(false);
      return;
    }
    onUploaded(beat.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]"
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-beat-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 id="upload-beat-title" className="text-xl font-semibold text-theme-text">{t('Загрузить свой бит')}</h2>
            <p className="text-sm text-theme-muted mt-1">{t('MP3 или WAV до 30 МБ. Бит сразу появится в ленте и в рейтинге')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-surface2 transition-colors disabled:opacity-50"
            aria-label={t('Закрыть')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
            file ? 'border-theme-primary bg-theme-primary-bg' : 'border-theme-border hover:border-theme-primary'
          } ${submitting ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            className="sr-only"
            disabled={submitting}
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <Music className="w-6 h-6 text-theme-primary" />
          ) : (
            <Upload className="w-6 h-6 text-theme-muted" />
          )}
          <span className="text-sm font-medium text-theme-text break-all">
            {file ? file.name : t('Нажмите, чтобы выбрать MP3 или WAV')}
          </span>
        </label>

        <div className="grid gap-4 mt-5">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-theme-text">{t('Название')}</span>
            <input
              type="text"
              value={title}
              maxLength={80}
              disabled={submitting}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-theme-text">{t('Описание')}</span>
            <textarea
              value={description}
              maxLength={500}
              rows={2}
              disabled={submitting}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('Расскажите о бите — настроение, история, референсы')}
              className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none resize-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-theme-text">{t('Жанр')}</span>
              <input
                type="text"
                value={genre}
                maxLength={40}
                disabled={submitting}
                onChange={(event) => setGenre(event.target.value)}
                className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-theme-text">BPM</span>
              <input
                type="number"
                min={40}
                max={240}
                value={bpm}
                disabled={submitting}
                onChange={(event) => setBpm(Math.min(240, Math.max(40, Number(event.target.value) || 120)))}
                className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none"
              />
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-theme-text">{t('Кто может скачивать бит')}</span>
            <select
              value={downloadAccess}
              disabled={submitting}
              onChange={(event) => setDownloadAccess(event.target.value === 'nobody' ? 'nobody' : 'premium')}
              className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none"
            >
              <option value="premium">{t('Только Premium-пользователи')}</option>
              <option value="nobody">{t('Никто (только прослушивание)')}</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-theme-text">{t('Кто может комментировать')}</span>
            <select
              value={commentAccess}
              disabled={submitting}
              onChange={(event) => setCommentAccess(event.target.value === 'all' ? 'all' : event.target.value === 'premium' ? 'premium' : 'nobody')}
              className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none"
            >
              <option value="all">{t('Все пользователи')}</option>
              <option value="premium">{t('Только Premium-пользователи')}</option>
              <option value="nobody">{t('Никто')}</option>
            </select>
          </label>
        </div>

        {premiumBlocked && (
          <div className="mt-4 rounded-xl border border-theme-warning/30 bg-theme-warning/10 p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-theme-warning shrink-0 mt-0.5" />
            <p className="text-sm text-theme-text">{t('Загрузка треков доступна только подписчикам Premium. Оформите подписку в разделе «Premium»')}</p>
          </div>
        )}

        {error && <p className="text-sm text-theme-danger mt-4" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`mt-6 w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            canSubmit
              ? 'bg-theme-primary text-white hover:bg-theme-primary-hover'
              : 'bg-theme-surface2 text-theme-muted cursor-not-allowed'
          }`}
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('Загружаем бит...')}</> : t('Загрузить бит')}
        </button>
      </div>
    </div>
  );
}
