import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, type Subscription } from '@/lib/supabase';
import { Crown, Check, X, Zap, Headphones, Music, Loader2, XCircle, Star, Lock, Shield, TicketPercent, Waves } from 'lucide-react';

const PRICE = 259;

const YOOMONEY_WALLET = '4100119640056035';
const SUCCESS_URL = `${window.location.origin}/payment-success`;

const PREMIUM_FEATURES = [
  { icon: Music, label: 'Безлимитные дорожки в секвенсоре' },
  { icon: Headphones, label: 'Все звуки, инструменты и Pro-эффекты' },
  { icon: Check, label: 'Экспорт в MIDI и без водяного знака' },
  { icon: Zap, label: 'Скачивание любых битов и продажных' },
  { icon: Crown, label: 'Продажа своих битов за Gem и Coin' },
  { icon: Star, label: 'Публикация в «Горячие треки»' },
  { icon: Check, label: 'Доход Gem за прослушивания ваших битов' },
  { icon: Zap, label: 'Двойной XP и VIP-статус' },
];

const COMPARISON: { feature: string; free: string | boolean; premium: string | boolean }[] = [
  { feature: 'Дорожки в секвенсоре', free: '3', premium: 'Безлимит' },
  { feature: 'Такты в секвенсоре', free: '4', premium: '256' },
  { feature: 'Базовые эффекты (Reverb, Delay, Filter, Pitch)', free: true, premium: true },
  { feature: 'Pro-эффекты (Distortion, Bitcrush, Compressor, EQ, Pan)', free: false, premium: true },
  { feature: 'Все инструменты', free: false, premium: true },
  { feature: 'Экспорт в MIDI и без водяного знака', free: false, premium: true },
  { feature: 'Скачивание битов (своих и из ленты)', free: false, premium: true },
  { feature: 'Продажа битов за Gem и Coin', free: false, premium: true },
  { feature: 'Доход Gem за прослушивания', free: false, premium: true },
  { feature: 'Публикация в «Горячие треки»', free: false, premium: true },
  { feature: 'Двойной XP и VIP-статус', free: false, premium: true },
];

export default function SubscriptionPage() {
  const { profile, isGuest, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoState, setPromoState] = useState<'idle' | 'applied'>('idle');
  const [promoInfo, setPromoInfo] = useState<{ amount: number; discountPercent: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);

  const PROMO_REASONS: Record<string, string> = {
    not_found: 'Промокод не найден или больше не активен',
    expired: 'Срок действия промокода истёк',
    limit_reached: 'Лимит применений промокода исчерпан',
    already_used: 'Вы уже использовали этот промокод',
    not_authenticated: 'Войдите в аккаунт, чтобы применить промокод',
  };

  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code || !profile || isGuest) return;
    setPromoError(null);
    setCheckingPromo(true);
    const { data, error: rpcError } = await supabase.rpc('check_promo_code', { p_code: code });
    setCheckingPromo(false);
    if (rpcError || !data?.ok) {
      setPromoState('idle');
      setPromoInfo(null);
      setPromoError(PROMO_REASONS[data?.reason] || 'Промокод не найден или больше не активен');
      return;
    }
    setPromoState('applied');
    setPromoInfo({ amount: Number(data.amount), discountPercent: data.discount_percent });
  };

  const removePromo = () => {
    setPromoState('idle');
    setPromoInfo(null);
    setPromoInput('');
    setPromoError(null);
  };

  const fetchSubscription = useCallback(async () => {
    if (!profile || isGuest) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();
    if (error) {
      console.error('Error fetching subscription:', error);
    } else {
      setSubscription(data as Subscription | null);
    }
    setLoading(false);
  }, [profile, isGuest]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const isActive = subscription?.status === 'active' && subscription?.expires_at && new Date(subscription.expires_at) > new Date();

  const handlePayment = async () => {
    if (!profile || isGuest) return;
    setError(null);
    setProcessing(true);

    // Promo path: the server validates the code, claims a slot and returns
    // the discounted amount — the client never sets the price.
    if (promoState === 'applied' && promoInput.trim()) {
      const { data: promo, error: promoRpcError } = await supabase.rpc('start_promo_premium_payment', {
        p_code: promoInput.trim(),
      });
      if (promoRpcError || !promo?.ok) {
        setError(PROMO_REASONS[promo?.reason as string] || 'Не удалось применить промокод. Попробуйте ещё раз.');
        setPromoState('idle');
        setPromoInfo(null);
        setProcessing(false);
        return;
      }
      const promoAmount = Number(promo.amount);
      const promoUrl = `https://yoomoney.ru/quickpay/confirm.xml?receiver=${YOOMONEY_WALLET}&sum=${promoAmount}&label=${promo.label}&comment=Premium+подписка+30+дней+по+промокоду&quickpay-form=shop&paymentType=AC&successURL=${encodeURIComponent(`${SUCCESS_URL}?demoPaymentId=${promo.payment_id}`)}`;
      window.location.href = promoUrl;
      return;
    }

    const label = `subscription_${profile.id}`;
    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({
        user_id: profile.id,
        amount: PRICE,
        status: 'pending',
        label,
      })
      .select('id')
      .maybeSingle();

    if (insertError || !payment) {
      setError(t('Не удалось начать оплату. Попробуйте ещё раз.'));
      setProcessing(false);
      return;
    }

    const url = `https://yoomoney.ru/quickpay/confirm.xml?receiver=${YOOMONEY_WALLET}&sum=${PRICE}&label=${label}&comment=Premium+подписка+30+дней&quickpay-form=shop&paymentType=AC&successURL=${encodeURIComponent(`${SUCCESS_URL}?demoPaymentId=${payment.id}`)}`;
    window.location.href = url;
  };

  const cancelSubscription = async () => {
    if (!subscription || !profile) return;
    const { error } = await supabase.from('subscriptions').update({ status: 'cancelled', tier: 'free' }).eq('id', subscription.id);
    if (error) {
      console.error('Error cancelling subscription:', error);
      return;
    }
    await supabase.rpc('cancel_premium');
    await refreshProfile();
    await fetchSubscription();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-theme-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderCell = (val: string | boolean) => {
    if (val === true) return <Check className="w-4 h-4 text-theme-success mx-auto" />;
    if (val === false) return <X className="w-4 h-4 text-theme-danger mx-auto" />;
    return <span className="text-sm text-theme-muted">{t(val)}</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Crown className="w-6 h-6 text-theme-warning" />
          {t('Подписка Premium')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">{t('Один план — все возможности')}</p>
      </div>

      {isActive && (
        <div className="bg-gradient-to-r from-theme-warning/20 via-theme-primary/20 to-theme-accent/20 border border-theme-warning/30 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-theme-warning to-theme-primary flex items-center justify-center shrink-0">
            <Crown className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-theme-text font-medium">{t('Premium активен')}</p>
            <p className="text-theme-muted text-sm">
              {t('Действует до:')} {new Date(subscription!.expires_at!).toLocaleDateString('ru-RU')}
            </p>
          </div>
          <button
            onClick={cancelSubscription}
            className="px-4 py-2 bg-theme-surface2 text-theme-muted hover:text-theme-danger border border-theme-border rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            {t('Отменить')}
          </button>
        </div>
      )}

      {/* Single premium card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* Free */}
        <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-theme-surface2 flex items-center justify-center shrink-0">
              <Music className="w-6 h-6 text-theme-muted" />
            </div>
            <h2 className="text-xl font-bold text-theme-text">Free</h2>
          </div>
          <div className="mb-5">
            <span className="text-4xl font-bold text-theme-text">0</span>
            <span className="text-theme-muted ml-1">₽</span>
          </div>
          <div className="space-y-2.5 mb-6 flex-1">
            <div className="flex items-center gap-2.5">
              <Music className="w-4 h-4 text-theme-muted shrink-0" />
              <span className="text-sm text-theme-muted">{t('3 дорожки и 4 такта в секвенсоре')}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Waves className="w-4 h-4 text-theme-muted shrink-0" />
              <span className="text-sm text-theme-muted">{t('Только базовые эффекты (Reverb, Delay, Filter, Pitch)')}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-theme-muted shrink-0" />
              <span className="text-sm text-theme-muted">{t('Без скачивания, продаж и «Горячих треков»')}</span>
            </div>
          </div>
          <div className="w-full py-3 bg-theme-surface2 text-theme-muted rounded-xl font-medium text-center text-sm">
            {t('Базовый план')}
          </div>
        </div>

        {/* Premium */}
        <div className="relative bg-theme-surface/50 border border-theme-primary rounded-2xl p-6 glass-surface flex flex-col md:scale-[1.03] md:shadow-xl md:shadow-theme-primary/10">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-theme-primary to-theme-accent text-white text-xs font-medium rounded-full flex items-center gap-1 whitespace-nowrap">
            <Star className="w-3 h-3" />
            Premium
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center shrink-0">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-theme-text">Premium</h2>
          </div>
          <div className="mb-5">
            <span className="text-4xl font-bold text-theme-text">259</span>
            <span className="text-theme-muted ml-1">{t('₽ / мес')}</span>
          </div>
          <div className="space-y-2.5 mb-6 flex-1">
            {PREMIUM_FEATURES.map((feat) => (
              <div key={feat.label} className="flex items-center gap-2.5">
                <feat.icon className="w-4 h-4 text-theme-primary shrink-0" />
                <span className="text-sm text-theme-text">{t(feat.label)}</span>
              </div>
            ))}
          </div>
          {isActive ? (
            <div className="w-full py-3 bg-theme-success/20 text-theme-success rounded-xl font-medium text-center flex items-center justify-center gap-2">
              <Check className="w-5 h-5" />
              {t('Текущий план')}
            </div>
          ) : (
            <div className="space-y-3">
              {promoState === 'applied' && promoInfo ? (
                <div className="bg-theme-success/10 border border-theme-success/30 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TicketPercent className="w-4 h-4 text-theme-success shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-theme-text truncate">{promoInput.trim().toUpperCase()} — −{promoInfo.discountPercent}% на первый месяц</p>
                      <p className="text-xs text-theme-muted">{promoInfo.amount.toFixed(2)} ₽ сейчас, далее 259 ₽/мес</p>
                    </div>
                  </div>
                  <button onClick={removePromo} className="p-1 text-theme-muted hover:text-theme-danger transition-colors shrink-0" aria-label={t('Убрать промокод')}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <TicketPercent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }}
                        placeholder={t('Промокод')}
                        maxLength={32}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-theme-surface2 border border-theme-border text-sm text-theme-text placeholder:text-theme-muted focus:outline-none focus:border-theme-primary transition-colors"
                      />
                    </div>
                    <button
                      onClick={applyPromo}
                      disabled={!promoInput.trim() || checkingPromo || isGuest}
                      className="px-4 py-2.5 rounded-xl bg-theme-surface2 border border-theme-border text-sm font-medium text-theme-text hover:border-theme-primary transition-colors disabled:opacity-50 shrink-0"
                    >
                      {checkingPromo ? <Loader2 className="w-4 h-4 animate-spin" /> : t('Применить')}
                    </button>
                  </div>
                  {promoError && <p className="text-xs text-theme-danger mt-1.5">{promoError}</p>}
                </div>
              )}
              <button
                onClick={handlePayment}
                disabled={processing || isGuest}
                className="w-full py-3 bg-gradient-to-r from-theme-primary to-theme-accent text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 hover:shadow-lg disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('Переход к оплате...')}
                  </>
                ) : (
                  <>
                    <Crown className="w-5 h-5" />
                    {promoState === 'applied' && promoInfo
                      ? `${t('Оплатить')} ${promoInfo.amount.toFixed(2)} ₽`
                      : t('Оформить Premium')}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl overflow-hidden glass-surface">
        <h3 className="text-sm font-medium text-theme-text p-4 border-b border-theme-border flex items-center gap-2">
          <Star className="w-4 h-4 text-theme-warning" />
          {t('Сравнение планов')}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-theme-border">
                <th className="text-left p-4 text-xs text-theme-muted uppercase tracking-wider font-medium">{t('Возможность')}</th>
                <th className="text-center p-4 text-xs text-theme-muted uppercase tracking-wider font-medium">Free</th>
                <th className="text-center p-4 text-theme-warning uppercase tracking-wider font-medium">
                  <span className="flex items-center justify-center gap-1"><Crown className="w-3.5 h-3.5" /> Premium</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? 'bg-theme-surface2/30' : ''}>
                  <td className="p-4 text-sm text-theme-text">{t(row.feature)}</td>
                  <td className="p-4 text-center">{renderCell(row.free)}</td>
                  <td className="p-4 text-center">{renderCell(row.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <p className="text-sm text-theme-danger text-center">{error}</p>
      )}

      {isGuest && (
        <p className="text-xs text-theme-muted text-center">{t('Войдите в аккаунт, чтобы оформить Premium.')}</p>
      )}

      <p className="text-xs text-theme-muted text-center flex items-center justify-center gap-1.5">
        <Shield className="w-3 h-3" />
        {t('Оплата через YooMoney — надёжно и безопасно')}
      </p>
    </div>
  );
}
