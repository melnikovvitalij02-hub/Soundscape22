import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Coins, Gem, Loader2, Gamepad2, AlertCircle, X } from 'lucide-react';

export type CoinPackage = {
  id: string;
  coins: number;
  rub: number;
  discount: number | null;
};

export const DONATE_COIN_PACKAGES: CoinPackage[] = [
  { id: 'coins_100', coins: 100, rub: 89, discount: null },
  { id: 'coins_300', coins: 300, rub: 259, discount: 7 },
  { id: 'coins_1000', coins: 1000, rub: 829, discount: 15 },
  { id: 'coins_2500', coins: 2500, rub: 1879, discount: 20 },
];

const YOOMONEY_WALLET = '4100119640056035';
const SUCCESS_URL = `${window.location.origin}/payment-success`;

export default function CoinPurchase() {
  const { profile, isGuest } = useAuth();
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [confirmPkg, setConfirmPkg] = useState<CoinPackage | null>(null);

  const handlePurchase = async (pkg: CoinPackage) => {
    if (!profile || isGuest) return;
    setPurchaseError(null);
    setLoadingPkg(pkg.id);

    const label = `${pkg.id}_${profile.id}`;
    const { data: purchase, error } = await supabase
      .from('coin_purchases')
      .insert({
        user_id: profile.id,
        package_id: pkg.id,
        coins_amount: pkg.coins,
        rub_amount: pkg.rub,
        status: 'pending',
        label,
      })
      .select('id')
      .maybeSingle();

    if (error || !purchase) {
      setPurchaseError('Не удалось начать оплату. Попробуйте ещё раз.');
      setLoadingPkg(null);
      return;
    }

    const { data: payment, error: paymentError } = await supabase
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

    if (paymentError || !payment) {
      setPurchaseError('Не удалось начать оплату. Попробуйте ещё раз.');
      setLoadingPkg(null);
      return;
    }

    setLoadingPkg(null);
    const demoPaymentId = payment.id;
    window.location.href = `https://yoomoney.ru/quickpay/confirm.xml?receiver=${YOOMONEY_WALLET}&sum=${pkg.rub}&label=${label}&comment=${encodeURIComponent('Покупка ' + pkg.coins + ' донат-монет')}&quickpay-form=shop&paymentType=AC&successURL=${encodeURIComponent(`${SUCCESS_URL}?demoPaymentId=${demoPaymentId}`)}`;
  };

  const donateCoins = profile?.donate_coins ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-theme-surface/50 border border-theme-primary/30 rounded-2xl px-5 py-3 glass-surface flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
          <Gem className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-theme-muted text-xs uppercase tracking-wider">Донат-монеты</p>
          <p className="text-xl font-bold text-theme-text">{donateCoins}</p>
        </div>
      </div>

      <div className="bg-theme-primary-bg border border-theme-primary-border rounded-xl p-4 flex items-center gap-3">
        <Gamepad2 className="w-5 h-5 text-theme-primary shrink-0" />
        <p className="text-sm text-theme-primary-text">
          Донат-монеты покупаются за деньги и тратятся на звуковые наборы (сэмпл-паки). Игровые монеты зарабатываются в играх и тратятся на остальные покупки в магазине.
        </p>
      </div>

      <div className="bg-theme-surface/50 border border-theme-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-2 glass-surface">
        <p className="text-sm text-theme-muted">Курс обмена донат-монет</p>
        <p className="text-sm font-bold text-theme-text">1 донат-монета ≈ {DONATE_COIN_PACKAGES[0].rub / DONATE_COIN_PACKAGES[0].coins} ₽</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DONATE_COIN_PACKAGES.map((pkg) => (
          <div
            key={pkg.id}
            className={`shop-card bg-theme-surface/50 border-2 rounded-2xl p-5 glass-surface transition-all ${pkg.discount === 20 ? 'border-theme-primary ring-1 ring-theme-primary/30' : 'border-theme-border'}`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="coin-display">
                <div className={`coin-row ${pkg.coins === 1000 ? 'stacked' : ''} ${pkg.coins === 2500 ? 'heavy-stacked' : ''}`}>
                  {Array.from({ length: pkg.coins === 100 ? 1 : pkg.coins === 300 ? 3 : pkg.coins === 1000 ? 5 : 7 }).map((_, index) => (
                    <Gem key={index} className="w-4 h-4 text-white"/>
                  ))}
                </div>
              </div>
              {pkg.discount !== null && (
                <span className="px-2 py-1 bg-theme-danger/20 text-theme-danger text-xs font-bold rounded-full">
                  −{pkg.discount}%
                </span>
              )}
            </div>
            <h3 className="text-theme-text font-bold text-lg">{pkg.coins} донат-монет</h3>
            <p className="text-theme-muted text-sm mb-4">Премиум-валюта</p>
            <button
              onClick={() => setConfirmPkg(pkg)}
              disabled={loadingPkg === pkg.id || isGuest}
              className="buy-btn w-full py-3 bg-theme-primary text-white rounded-xl text-sm font-semibold hover:bg-theme-primary-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingPkg === pkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gem className="w-4 h-4 text-white sm"/> Купить за {pkg.rub} ₽</>}
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
                <Coins className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-theme-text font-bold text-lg">Переход к оплате</h3>
                <p className="text-theme-muted text-sm">ЮMoney</p>
              </div>
            </div>
            <div className="bg-theme-surface2 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-theme-muted text-sm">Пакет:</span>
                <span className="text-theme-text font-bold">{confirmPkg.coins} монет</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-theme-muted text-sm">Сумма:</span>
                <span className="text-theme-text font-bold text-lg">{confirmPkg.rub} ₽</span>
              </div>
            </div>
            <div className="flex items-start gap-2 mb-5 text-xs text-theme-muted">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Вы будете перенаправлены на сайт ЮMoney для безопасной оплаты. После успешной оплаты монеты зачислятся автоматически.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmPkg(null)} className="flex-1 py-3 bg-theme-surface2 text-theme-muted rounded-xl text-sm font-medium hover:text-theme-text transition-colors">
                Отмена
              </button>
              <button
                onClick={() => { const pkg = confirmPkg; setConfirmPkg(null); handlePurchase(pkg); }}
                disabled={loadingPkg === confirmPkg.id}
                className="flex-1 py-3 bg-gradient-to-r from-theme-primary to-theme-accent text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingPkg === confirmPkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gem key={index} className="w-4 h-4 text-white sm"/> Перейти к оплате</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {purchaseError && (
        <p className="text-sm text-theme-danger text-center">{purchaseError}</p>
      )}

      {isGuest && (
        <p className="text-xs text-theme-muted text-center">Войдите в аккаунт, чтобы покупать донат-монеты.</p>
      )}
    </div>
  );
}
