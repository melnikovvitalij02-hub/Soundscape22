import { useEffect, useState } from 'react';
import { Coins, Flame, Loader2, Music, Trophy, Upload, Zap, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import {
  PROMOTION_OPTIONS,
  type PromotionKind,
  type PromotionOption,
} from '@/lib/trending';

type OwnBeat = {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  cover_url: string | null;
};

type Props = {
  initialBeatId?: string | null;
  onClose: () => void;
  onPurchased: () => void;
  onUploadNew: () => void;
};

const TIER_META: Record<PromotionKind, { title: string; description: string; icon: typeof Zap }> = {
  boost_basic: { title: 'Буст на сутки', description: '+100 очков рейтинга на 24 часа', icon: Zap },
  boost_plus: { title: 'Усиленный буст', description: '+250 очков рейтинга на 24 часа', icon: Zap },
  boost_max: { title: 'Максимальный буст', description: '+600 очков рейтинга на 24 часа', icon: Flame },
  top3: { title: 'Топ-3 на сутки', description: 'Место в тройке лидеров на 24 часа (3 места)', icon: Trophy },
};

const AVAILABILITY_ERRORS: Record<string, string> = {
  already_top3: 'Этот трек уже в топ-3',
  top3_full: 'Все места в топ-3 сейчас заняты',
  beat_not_found: 'Трек не найден среди ваших опубликованных',
  bad_kind: 'Не удалось купить продвижение. Попробуйте еще раз',
  not_authenticated: 'Войдите в аккаунт',
  no_profile: 'Профиль не найден',
  insufficient: 'Недостаточно Gem. Пополните баланс донат-монет',
};

export default function TrendingBoostModal({ initialBeatId = null, onClose, onPurchased, onUploadNew }: Props) {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [ownBeats, setOwnBeats] = useState<OwnBeat[]>([]);
  const [loadingBeats, setLoadingBeats] = useState(true);
  const [beatsError, setBeatsError] = useState(false);
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(initialBeatId);
  const [selectedKind, setSelectedKind] = useState<PromotionKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const selectedOption: PromotionOption | null =
    PROMOTION_OPTIONS.find((option) => option.kind === selectedKind) ?? null;
  const canSubmit = Boolean(selectedBeatId && selectedOption) && !submitting;

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('beats')
        .select('id, title, genre, bpm, cover_url')
        .eq('user_id', profile.id)
        .eq('is_public', true)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setBeatsError(true);
      } else {
        setOwnBeats((data ?? []) as OwnBeat[]);
      }
      setLoadingBeats(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const handleConfirm = async () => {
    if (!profile || !selectedBeatId || !selectedOption) return;
    setSubmitting(true);
    setPurchaseError(null);
    try {
      const { data: result, error } = await supabase.rpc('purchase_trending_promotion', {
        p_beat_id: selectedBeatId,
        p_kind: selectedOption.kind,
      });
      if (error) throw error;
      if (!result || result.ok !== true) {
        const reason = result?.reason ?? 'unknown';
        setPurchaseError(t(AVAILABILITY_ERRORS[reason] || 'Не удалось купить продвижение. Попробуйте еще раз'));
        return;
      }
      await refreshProfile();
      onPurchased();
      onClose();
    } catch {
      setPurchaseError(t('Не удалось купить продвижение. Попробуйте еще раз'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]"
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trending-boost-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 id="trending-boost-title" className="text-xl font-semibold text-theme-text">{t('Продвинуть трек')}</h2>
            <p className="text-sm text-theme-muted mt-1">{t('Поднимите свой бит в рейтинге Горящих треков')}</p>
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

        <section className="mb-6">
          <h3 className="text-sm font-medium text-theme-text mb-3">{t('1. Ваш трек')}</h3>
          {loadingBeats ? (
            <div className="flex items-center gap-2 text-sm text-theme-muted py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('Загружаем ваши биты')}
            </div>
          ) : beatsError ? (
            <p className="text-sm text-theme-danger py-4">{t('Не удалось загрузить ваши биты')}</p>
          ) : ownBeats.length === 0 ? (
            <p className="text-sm text-theme-muted py-4">{t('У вас пока нет битов в рейтинге. Загрузите MP3, чтобы продвинуть его')}</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {ownBeats.map((beat) => {
                const selected = selectedBeatId === beat.id;
                return (
                  <li key={beat.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedBeatId(beat.id)}
                      className={`w-full flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                        selected
                          ? 'border-theme-primary bg-theme-primary-bg'
                          : 'border-theme-border bg-theme-surface hover:border-theme-primary'
                      }`}
                    >
                      <span className="w-10 h-10 rounded-lg bg-theme-surface2 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {beat.cover_url ? (
                          <img src={beat.cover_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Music className="w-4 h-4 text-theme-muted" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-theme-text">{beat.title}</span>
                        <span className="block truncate text-xs text-theme-muted">{beat.genre} · {beat.bpm} BPM</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!loadingBeats && !beatsError && (
            <button
              type="button"
              onClick={onUploadNew}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-theme-primary hover:text-theme-primary-hover transition-colors"
            >
              <Upload className="w-4 h-4" /> {t('Загрузить новый MP3')}
            </button>
          )}
        </section>

        <section className="mb-6">
          <h3 className="text-sm font-medium text-theme-text mb-3">{t('2. Способ продвижения')}</h3>
          <div className="grid gap-2">
            {PROMOTION_OPTIONS.map((option) => {
              const meta = TIER_META[option.kind];
              const Icon = meta.icon;
              const selected = selectedKind === option.kind;
              return (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => setSelectedKind(option.kind)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    selected
                      ? 'border-theme-primary bg-theme-primary-bg shadow-md'
                      : 'border-theme-border bg-theme-surface hover:border-theme-primary'
                  }`}
                >
                  <span className="w-9 h-9 rounded-lg bg-theme-surface2 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-theme-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-theme-text">{t(meta.title)}</span>
                    <span className="block text-xs text-theme-muted">{t(meta.description)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-theme-text flex-shrink-0">
                    <Coins className="w-3.5 h-3.5 text-theme-warning" />
                    {option.price} Gem
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {purchaseError && <p className="text-sm text-theme-danger mb-3" role="alert">{purchaseError}</p>}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canSubmit}
          className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            canSubmit
              ? 'bg-theme-primary text-white hover:bg-theme-primary-hover'
              : 'bg-theme-surface2 text-theme-muted cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : !selectedOption ? (
            t('Выберите способ продвижения')
          ) : !selectedBeatId ? (
            t('Сначала выберите трек')
          ) : (
            <><Coins className="w-4 h-4" /> {`${t('Купить за')} ${selectedOption.price} Gem`}</>
          )}
        </button>
      </div>
    </div>
  );
}
