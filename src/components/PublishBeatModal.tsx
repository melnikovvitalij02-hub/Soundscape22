import { useEffect, useState } from 'react';
import { Loader2, Music, Upload, X, Lock, Flame, Disc3 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';

const MAX_BYTES = 30 * 1024 * 1024;
const AUDIO_EXTENSION = /\.(mp3|wav)$/i;

type ComposerData = {
  tracks: any[];
  bpm: number;
  bars: number;
  genre: string;
  projectName: string;
};

type Props = {
  onClose: () => void;
  onPublished: (beatId: string) => void;
  composerData?: ComposerData;
};

export default function PublishBeatModal({ onClose, onPublished, composerData }: Props) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const isComposerMode = Boolean(composerData);
  const isGuest = !profile;

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(composerData?.projectName || '');
  const [genre, setGenre] = useState(composerData?.genre || '');
  const [bpm, setBpm] = useState(composerData?.bpm || 120);
  const [description, setDescription] = useState('');
  const [downloadAccess, setDownloadAccess] = useState<'premium' | 'paid' | 'nobody'>('premium');
  const [commentAccess, setCommentAccess] = useState<'all' | 'premium' | 'nobody'>('all');
  const [priceGem, setPriceGem] = useState(100);
  const [priceCoin, setPriceCoin] = useState(1000);
  const [isHot, setIsHot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownError, setCooldownError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const handleFileChange = (selected: File | null) => {
    setError(null);
    if (!selected) { setFile(null); return; }
    if (!AUDIO_EXTENSION.test(selected.name)) { setFile(null); setError(t('Выберите MP3 или WAV')); return; }
    if (selected.size > MAX_BYTES) { setFile(null); setError(t('Файл слишком большой (макс 30 МБ)')); return; }
    setFile(selected);
    if (!title.trim()) setTitle(selected.name.replace(AUDIO_EXTENSION, ''));
  };

  const canSubmit =
    !submitting && !isGuest && title.trim().length > 0 &&
    (isComposerMode ? true : Boolean(file));

  const handleSubmit = async () => {
    if (!profile || !title.trim()) return;
    
  // Проверка кулдауна
    setCooldownError(null);
    const { data: canPublish, error: cooldownErr } = await supabase.rpc('check_publish_cooldown');
  
    if (cooldownErr) {
      console.error('Cooldown check error:', cooldownErr);
      setError(t('Ошибка проверки ограничений. Попробуйте позже.'));
      return;
    }
  
    if (!canPublish) {
      const isPremiumUser = profile.is_premium === true;
      const hours = isPremiumUser ? 2 : 6;
      setCooldownError(
        t(`Вы можете публиковать треки не чаще, чем раз в ${hours} часов${isPremiumUser ? ' (Premium)' : ''}. Купите буст в магазине, чтобы снять ограничение.`)
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      let audio_url: string | null = null;
      let beat_data: any = null;

      if (!isComposerMode && file) {
        const ext = /\.wav$/i.test(file.name) ? 'wav' : 'mp3';
        const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('beat-audio').upload(path, file, {
          contentType: ext === 'wav' ? 'audio/wav' : 'audio/mpeg',
        });
        if (upErr) throw upErr;
        audio_url = supabase.storage.from('beat-audio').getPublicUrl(path).data.publicUrl;
      }

      if (isComposerMode && composerData) {
        beat_data = { tracks: composerData.tracks, bpm: composerData.bpm, bars: composerData.bars, genre: composerData.genre };
      }

      const { data: beat, error: insErr } = await supabase.from('beats').insert({
        user_id: profile.id,
        title: title.trim(),
        genre: genre.trim() || 'Не указан',
        bpm,
        audio_url,
        data: beat_data,
        play_count: 0,
        description: description.trim() || null,
        download_access: downloadAccess,
        comment_access: commentAccess,
        price_gem: downloadAccess === 'paid' ? priceGem : 0,
        price_coin : 0,
        is_hot: isComposerMode && profile.is_premium ? isHot : false,
        is_public: true,
      }).select('id').maybeSingle();

      if (insErr || !beat) throw insErr;
      onPublished(beat.id);
    } catch (err: any) {
      console.error('Publish error:', err);
      setError(t('Не удалось опубликовать. Попробуйте ещё раз'));
      setSubmitting(false);
    }
  };

  const inputCls = "rounded-xl border border-theme-border bg-theme-surface2 px-3 py-2.5 text-sm text-theme-text focus:border-theme-primary focus:outline-none w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !submitting && onClose()}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-semibold text-theme-text">{isComposerMode ? t('Опубликовать бит') : t('Загрузить свой бит')}</h2>
            <p className="text-sm text-theme-muted mt-1">{isComposerMode ? t('Настройте доступ и описание') : t('MP3 или WAV до 30 МБ')}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-1.5 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-surface2 disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>

        {isComposerMode && composerData && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-theme-primary/30 bg-theme-primary/10 mb-4">
            <Disc3 className="w-6 h-6 text-theme-primary" />
            <p className="text-sm text-theme-text">{composerData.tracks.length} {t('дорожек')} · {composerData.bars} {t('тактов')} · {composerData.bpm} BPM</p>
          </div>
        )}

        <div className="grid gap-4 mt-5">
          <label className="grid gap-1.5"><span className="text-sm font-medium text-theme-text">{t('Название')}</span>
            <input value={title} maxLength={80} disabled={submitting} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-theme-text">{t('Описание')}</span>
            <textarea value={description} maxLength={500} rows={2} disabled={submitting} onChange={(e) => setDescription(e.target.value)} placeholder={t('Расскажите о бите...')} className={inputCls + " resize-none"} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5"><span className="text-sm font-medium text-theme-text">{t('Жанр')}</span>
              <input value={genre} maxLength={40} disabled={submitting} onChange={(e) => setGenre(e.target.value)} className={inputCls} /></label>
            <label className="grid gap-1.5"><span className="text-sm font-medium text-theme-text">BPM</span>
              <input type="number" min={40} max={240} value={bpm} disabled={submitting} onChange={(e) => setBpm(Math.min(240, Math.max(40, Number(e.target.value) || 120)))} className={inputCls} /></label>
          </div>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-theme-text">{t('Кто может скачивать')}</span>
            <select value={downloadAccess} disabled={submitting} onChange={(e) => setDownloadAccess(e.target.value as any)} className={inputCls}>
              <option value="premium">{t('Только Premium')}</option>
              <option value="paid">{t('За плату (Gem / Coin)')}</option>
              <option value="nobody">{t('Никто')}</option>
            </select></label>
          {downloadAccess === 'paid' && (
            <div className="p-3 rounded-xl border border-theme-warning/30 bg-theme-warning/10">
              <label className="grid gap-1.5"><span className="text-xs font-medium text-theme-warning">Цена в Gem (мин. 100)</span>
                <input type="number" min={100} value={priceGem} disabled={submitting} onChange={(e) => setPriceGem(Math.max(100, Number(e.target.value) || 100))} className={inputCls} /></label>
            </div>
            )}
          <label className="grid gap-1.5"><span className="text-sm font-medium text-theme-text">{t('Кто может комментировать')}</span>
            <select value={commentAccess} disabled={submitting} onChange={(e) => setCommentAccess(e.target.value as any)} className={inputCls}>
              <option value="all">{t('Все')}</option>
              <option value="premium">{t('Только Premium')}</option>
              <option value="nobody">{t('Никто')}</option>
            </select></label>
          {profile?.is_premium && isComposerMode && (
            <label className="flex items-center gap-3 p-3 rounded-xl border border-theme-primary/30 bg-theme-primary/10 cursor-pointer">
              <input type="checkbox" checked={isHot} disabled={submitting} onChange={(e) => setIsHot(e.target.checked)} className="w-4 h-4 accent-theme-primary" />
              <span className="text-sm font-medium text-theme-primary flex items-center justify-center gap-1"><Flame className="w-4 h-4" /> {t('Горячий трек')}</span>
            </label>
          )}
        </div>

        {isGuest && (
          <div className="mt-4 rounded-xl border border-theme-warning/30 bg-theme-warning/10 p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-theme-warning shrink-0" />
            <p className="text-sm text-theme-text">{t('Публикация треков доступна только зарегистрированным пользователям. Войдите или создайте аккаунт.')}</p>
          </div>
        )}
        {cooldownError && (
          <div className="mt-4 rounded-xl border border-theme-warning/30 bg-theme-warning/10 p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-theme-warning shrink-0" />
            <p className="text-sm text-theme-text">{cooldownError}</p>
          </div>
        )}
        {error && <p className="text-sm text-theme-danger mt-4" role="alert">{error}</p>}
        <button onClick={handleSubmit} disabled={!canSubmit} className={`mt-6 w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${canSubmit ? 'bg-theme-primary text-white hover:bg-theme-primary-hover' : 'bg-theme-surface2 text-theme-muted cursor-not-allowed'}`}>
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('Публикуем...')}</> : (isComposerMode ? t('Опубликовать') : t('Загрузить бит'))}
        </button>
      </div>
    </div>
  );
}