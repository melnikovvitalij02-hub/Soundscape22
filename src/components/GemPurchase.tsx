import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import { Gem, Loader2, AlertCircle, X } from 'lucide-react';

export type GemPackage = {
  id: string;
  gems: number;
  rub: number;
  discount: number | null;
};

// 1 Gem = 0.30 RUB, same rate the old withdrawal flow used.
export const GEM_PACKAGES: GemPackage[] = [
  { id: 'gems_100', gems: 100, rub: 30, discount: null },
  { id: 'gems_500', gems: 500, rub: 150, discount: null },
  { id: 'gems_1000', gems: 1000, rub: 300, discount: 10 },
  { id: 'gems_2500', gems: 2500, rub: 750, discount: null },
  { id: 'gems_5000', gems: 5000, rub: 1500, discount: null },
];

const YOOMONEY_WALLET = '4100119640056035';
const SUCCESS_URL = `${window.location.origin}/payment-success`;

export default function GemPurchase() {
  const { profile, isGuest } = useAuth();
  const { t } = useLocale();
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [confirmPkg, setConfirmPkg] = useState<GemPackage | null>(null);

  const handlePurchase = async (pkg: GemPackage) => {
    if (!profile || isGuest) return;
    setPurchaseError(null);
    setLoadingPkg(pkg.id);

    const label = `${pkg.id}_${profile.id}`;

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        user_id: profile.id,
        amount: pkg.rub,
        status: 'pending',
        label,
        payment_type: 'coins',
      })
      .select('id')
      .maybeSingle();

    if (error || !payment) {
      setPurchaseError(t('Не удалось начать оплату. Попробуйте ещё раз.'));
      setLoadingPkg(null);
      return;
    }

    setLoadingPkg(null);
    window.location.href = `https://yoomoney.ru/quickpay/confirm.xml?receiver=${YOOMONEY_WALLET}&sum=${pkg.rub}&label=${label}&comment=${encodeURIComponent('Покупка ' + pkg.gems + ' Gem')}&quickpay-form=shop&paymentType=AC&successURL=${encodeURIComponent(`${SUCCESS_URL}?demoPaymentId=${payment.id}`)}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-theme-surface/50 border border-theme-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-2 glass-surface">
        <p className="text-sm text-theme-muted">{t('Курс покупки Gem')}</p>
        <p className="text-sm font-bold text-theme-text">1 Gem = 0,30 ₽</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GEM_PACKAGES.map((pkg) => (
          <div
            key={pkg.id}
            className="shop-card bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="coin-display">
                <div className="coin-row">
                  {Array.from({ length: pkg.gems >= 1000 ? 7 : pkg.gems >= 500 ? 5 : 3 }).map((_, i) => (
                    <Gem key={i} className="w-4 h-4 text-theme-warning" />
                  ))}
                </div>
              </div>
              {pkg.discount !== null && (
                <span className="px-2 py-1 bg-theme-danger/20 text-theme-danger text-xs font-bold rounded-full">
                  −{pkg.discount}%
                </span>
              )}
            </div>
            <h3 className="text-theme-text font-bold text-lg">{pkg.gems} Gem</h3>
            <p className="text-theme-muted text-sm mb-4">{t('Премиум-валюта')}</p>
            <button
              onClick={() => setConfirmPkg(pkg)}
              disabled={loadingPkg === pkg.id || isGuest}
              className="buy-btn w-full py-3 bg-theme-warning text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingPkg === pkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gem className="w-4 h-4 text-white" /> {t('Купить за')} {pkg.rub} ₽</>}
            </button>
          </div>
        ))}
      </div>

      {confirmPkg && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmPkg(null)}>
          <div className="bg-theme-surface border border-theme-border rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setConfirmPkg(null)} className="absolute top-4 right-4 text-theme-muted hover:text-theme-text transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <Gem className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-theme-text font-bold text-lg">{t('Переход к оплате')}</h3>
                <p className="text-theme-muted text-sm">ЮMoney</p>
              </div>
            </div>
            <div className="bg-theme-surface2 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-theme-muted text-sm">{t('Пакет')}:</span>
                <span className="text-theme-text font-bold">{confirmPkg.gems} Gem</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-theme-muted text-sm">{t('Сумма')}:</span>
                <span className="text-theme-text font-bold text-lg">{confirmPkg.rub} ₽</span>
              </div>
            </div>
            <div className="flex items-start gap-2 mb-5 text-xs text-theme-muted">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{t('Вы будете перенаправлены на сайт ЮMoney для безопасной оплаты. После успешной оплаты Gem зачислятся автоматически.')}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmPkg(null)} className="flex-1 py-3 bg-theme-surface2 text-theme-muted rounded-xl text-sm font-medium hover:text-theme-text transition-colors">
                {t('Отмена')}
              </button>
              <button
                onClick={() => { const pkg = confirmPkg; setConfirmPkg(null); handlePurchase(pkg); }}
                disabled={loadingPkg === confirmPkg.id}
                className="flex-1 py-3 bg-gradient-to-r from-theme-primary to-theme-accent text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingPkg === confirmPkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gem className="w-4 h-4 text-white" /> {t('Перейти к оплате')}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {purchaseError && (
        <p className="text-sm text-theme-danger text-center">{purchaseError}</p>
      )}

      {isGuest && (
        <p className="text-xs text-theme-muted text-center">{t('Войдите в аккаунт, чтобы покупать Gem.')}</p>
      )}
    </div>
  );
}
