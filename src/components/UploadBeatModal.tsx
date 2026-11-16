import { useEffect, useState } from 'react';
import { Loader2, Music, Upload, X, Lock, Flame } from 'lucide-react';
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
  
  // Настройки доступа и монетизации
  const [description, setDescription] = useState('');
  const [downloadAccess, setDownloadAccess] = useState<'premium' | 'paid' | 'nobody'>('premium');
  const [commentAccess, setCommentAccess] = useState<'all' | 'premium' | 'nobody'>('all');
  const [priceGem, setPriceGem] = useState<number>(100);
  const [priceCoin, setPriceCoin] = useState<number>(1000);
  const [isHot, setIsHot] = useState(false);
  
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
        genre: genre.trim() || 'Не указан',
        bpm,
        audio_url: publicFile.publicUrl,
        play_count: 0,
        description: description.trim() || null,
        download_access: downloadAccess,
        comment_access: commentAccess,
        price_gem: downloadAccess === 'paid' ? priceGem : 0,
        price_coin: downloadAccess === 'paid' ? priceCoin : 0,
        is_hot: profile.is_premium ? isHot : false,
        is_public: true,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !submitting && onClose()}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-semibold text-theme-text">{t('Загрузить свой бит')}</h2>
            <p className="text-sm text-theme-muted mt-1">{t('MP3 или WAV до 30 МБ')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="p-1.5 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-surface2 transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${file ? 'border-theme-primary bg-theme-primary/10' : 'border-theme-border hover:border-theme-primary'} ${submitting ? 'pointer-events-none opacity-60' : ''}`}>
          <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className="sr-only" disabled={submitting} onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
          {file ? <Music className="w-6 h-6 text-theme-primary" /> : <Upload className="w-6 h-6 text-theme-muted" />}
          <span className="text-sm font-medium text-theme-text break-all">{file ? file.name : t('Нажмите, чтобы выбрать MP3 или WAV')}</span>
        </label>

        <div className="grid gap-4 mt-5">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-theme-text">{t('Название')}</span>
            <input type="text" value={title} maxLength={80} disabled={submitting} onChange={(e) => setTitle(e.target.value)} className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none" />
          </label>
          
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-theme-text">{t('Описание')}</span>
            <textarea value={description} maxLength={500} rows={2} disabled={submitting} onChange={(e) => setDescription(e.target.value)} placeholder={t('Расскажите о бите...')} className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none resize-none" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-theme-text">{t('Жанр')}</span>
              <input type="text" value={genre} maxLength={40} disabled={submitting} onChange={(e) => setGenre(e.target.value)} className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-theme-text">BPM</span>
              <input type="number" min={40} max={240} value={bpm} disabled={submitting} onChange={(e) => setBpm(Math.min(240, Math.max(40, Number(e.target.value) || 120)))} className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none" />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-theme-text">{t('Кто может скачивать бит')}</span>
            <select value={downloadAccess} disabled={submitting} onChange={(e) => setDownloadAccess(e.target.value as any)} className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none">
              <option value="premium">{t('Только Premium-пользователи')}</option>
              <option value="paid">{t('За плату (Gem / Coin)')}</option>
              <option value="nobody">{t('Никто (только прослушивание)')}</option>
            </select>
          </label>

          {downloadAccess === 'paid' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-theme-warning/30 bg-theme-warning/10">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-theme-warning">Цена в Gem (мин. 100)</span>
                <input type="number" min={100} value={priceGem} disabled={submitting} onChange={(e) => setPriceGem(Math.max(100, Number(e.target.value) || 100))} className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-theme-warning focus:outline-none" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-theme-warning">Цена в Coin (мин. 1000)</span>
                <input type="number" min={1000} value={priceCoin} disabled={submitting} onChange={(e) => setPriceCoin(Math.max(1000, Number(e.target.value) || 1000))} className="rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-theme-warning focus:outline-none" />
              </label>
            </div>
          )}

          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-theme-text">{t('Кто может комментировать')}</span>
            <select value={commentAccess} disabled={submitting} onChange={(e) => setCommentAccess(e.target.value as any)} className="rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none">
              <option value="all">{t('Все пользователи')}</option>
              <option value="premium">{t('Только Premium-пользователи')}</option>
              <option value="nobody">{t('Никто')}</option>
            </select>
          </label>

          {profile?.is_premium && (
            <label className="flex items-center gap-3 p-3 rounded-xl border border-theme-primary/30 bg-theme-primary/10 cursor-pointer">
              <input type="checkbox" checked={isHot} disabled={submitting} onChange={(e) => setIsHot(e.target.checked)} className="w-4 h-4 accent-theme-primary" />
              <span className="text-sm font-medium text-theme-primary flex items-center gap-1"><Flame className="w-4 h-4" /> {t('Опубликовать в «Горячих треках»')}</span>
            </label>
          )}
        </div>

        {premiumBlocked && (
          <div className="mt-4 rounded-xl border border-theme-warning/30 bg-theme-warning/10 p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-theme-warning shrink-0 mt-0.5" />
            <p className="text-sm text-theme-text">{t('Загрузка треков доступна только подписчикам Premium.')}</p>
          </div>
        )}

        {error && <p className="text-sm text-theme-danger mt-4" role="alert">{error}</p>}

        <button type="button" onClick={handleSubmit} disabled={!canSubmit} className={`mt-6 w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${canSubmit ? 'bg-theme-primary text-white hover:bg-theme-primary-hover' : 'bg-theme-surface2 text-theme-muted cursor-not-allowed'}`}>
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('Загружаем...')}</> : t('Загрузить бит')}
        </button>
      </div>
    </div>
  );
}