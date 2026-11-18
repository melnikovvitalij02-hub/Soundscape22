import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import { Gift, Loader2, Sparkles, X } from 'lucide-react';

type StickerResult = {
  sticker_id: string;
  sticker_name: string;
  sticker_url: string;
  is_duplicate: boolean;
};

export default function StickerChest() {
  const { profile, isGuest, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StickerResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  const balance = profile?.coins ?? 0;
  const canOpen = balance >= 1000 && !loading && !isGuest;

  const handleOpen = async () => {
    if (!canOpen) return;
    setError(null);
    setResult(null);
    setLoading(true);

    const { data, error: rpcError } = await supabase.rpc('open_sticker_chest');

    setLoading(false);

    if (rpcError) {
      setError(
        rpcError.message.includes('Недостаточно')
          ? t('Недостаточно монет')
          : t('Не удалось открыть сундук')
      );
      return;
    }

    if (data?.error) {
      setError(data.error);
      return;
    }

    if (data?.success) {
      await refreshProfile();
      setResult(data as StickerResult);
      setShowResult(true);
    }
  };

  if (isGuest || !profile) return null;

  return (
    <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Gift className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-theme-text">{t('Сундук стикеров')}</h3>
            <p className="text-xs text-theme-muted">{t('Случайный стикер за 1000 монет')}</p>
          </div>
        </div>
      </div>

      <div className="bg-theme-surface2 rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-theme-muted">{t('Твой баланс')}</span>
          <span className="text-lg font-bold text-theme-warning">{balance} {t('монет')}</span>
        </div>
        <p className="text-xs text-theme-muted mt-2">
          {t('Можно открыть')} <span className="text-theme-text font-semibold">{Math.floor(balance / 1000)}</span> {t('сундуков')}
        </p>
      </div>

      {error && (
        <div className="bg-theme-danger/10 border border-theme-danger/30 rounded-xl p-3 mb-4">
          <p className="text-sm text-theme-danger">{error}</p>
        </div>
      )}

      <button
        onClick={handleOpen}
        disabled={!canOpen}
        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('Открываем...')}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {t('Открыть за 1000 монет')}
          </>
        )}
      </button>

      {/* Модалка результата */}
      {showResult && result && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowResult(false)}
        >
          <div
            className="bg-theme-surface border border-theme-border rounded-2xl p-6 max-w-sm w-full text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowResult(false)}
              className="absolute top-3 right-3 text-theme-muted hover:text-theme-text"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
              <Sparkles className="w-10 h-10 text-white" />
            </div>

            <h3 className="text-xl font-bold text-theme-text mb-2">
              {result.is_duplicate ? t('Дубликат!') : t('Новый стикер!')}
            </h3>

            <p className="text-theme-muted text-sm mb-4">
              {result.is_duplicate
                ? t('У тебя уже есть этот стикер. Коллекция не изменится.')
                : t('Стикер добавлен в твою коллекцию!')}
            </p>

            <div className="bg-theme-surface2 rounded-xl p-4 mb-4">
              <p className="text-xs text-theme-muted mb-1">{t('Название')}</p>
              <p className="text-lg font-bold text-theme-text">{result.sticker_name}</p>
            </div>

            <button
              onClick={() => setShowResult(false)}
              className="w-full py-2.5 bg-theme-primary text-white rounded-xl text-sm font-semibold hover:bg-theme-primary-hover"
            >
              {t('Отлично!')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}