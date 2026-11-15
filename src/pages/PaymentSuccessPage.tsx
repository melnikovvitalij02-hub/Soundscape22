import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Loader2, Crown, ArrowRight, Music, XCircle, RefreshCw } from 'lucide-react';
import type { Page } from '@/components/Sidebar';

export default function PaymentSuccessPage({ setPage }: { setPage: (p: Page) => void }) {
  const { session, isGuest, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [status, setStatus] = useState<'verifying' | 'activating' | 'done' | 'error' | 'polling'>('verifying');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      const demoPaymentId = new URLSearchParams(window.location.search).get('demoPaymentId');

      if (!session?.user || isGuest) {
        setStatus('error');
        setErrorMsg(t('Войдите в аккаунт, чтобы активировать покупку. Если вы оплатили — она будет обработана автоматически.'));
        return;
      }

      // ── Typed demo-payment path ───────────────────────────────────────
      // When demoPaymentId is present, the payment row was created by either
      // CoinPurchase (payment_type='coins') or PremiumButton (payment_type='premium').
      // grant_demo_payment branches on payment_type server-side, so a coin
      // purchase grants coins (NOT premium) and a premium purchase grants
      // premium. We must NOT call grant_premium_for_payment here — that would
      // grant premium even for a 30₽ coin purchase (Block 14 bug).
      if (demoPaymentId) {
        setStatus('activating');
        const { data: demoResult } = await supabase.rpc('grant_demo_payment', {
          p_payment_id: demoPaymentId,
        });
        if (demoResult?.granted) {
          await refreshProfile();
          setStatus('done');
          return;
        }

        // The demo RPC only claims a row that is still 'pending'. The YooMoney
        // webhook may have already processed it (flipping status to 'succeeded'
        // and granting the entitlement). Poll the payment row status to confirm.
        setStatus('polling');
        setPollCount(1);
        const maxAttempts = 20;
        let attempts = 0;

        const pollDemo = async () => {
          attempts++;
          setPollCount(attempts);

          // Check the payment row status directly — NOT the coin/premium balance,
          // which could already be non-zero from a prior purchase.
          const { data: payRow } = await supabase
            .from('payments')
            .select('status, payment_type')
            .eq('id', demoPaymentId)
            .maybeSingle();

          if (payRow?.status === 'succeeded') {
            await refreshProfile();
            setStatus('done');
            return;
          }

          if (attempts < maxAttempts) {
            setTimeout(pollDemo, 3000);
          } else {
            setStatus('error');
            setErrorMsg(t('Платёж ещё обрабатывается. Покупка будет завершена автоматически, как только ЮMoney подтвердит оплату. Если проблема сохраняется — свяжитесь с поддержкой.'));
          }
        };

        setTimeout(pollDemo, 3000);
        return;
      }

      // ── Normal premium redirect path (no demoPaymentId) ───────────────
      // This is the legacy/normal YooMoney quickpay redirect for a premium
      // subscription. The webhook may have already granted premium, or it may
      // still be processing. Try the server-side RPC, then poll the profile.
      setStatus('activating');
      const { data: result } = await supabase.rpc('grant_premium_for_payment');
      if (result?.granted) {
        await refreshProfile();
        setStatus('done');
        return;
      }

      // Check if premium was already granted by webhook
      await refreshProfile();
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('is_premium, premium_expires_at')
        .eq('id', session.user.id)
        .maybeSingle();

      if (currentProfile?.is_premium) {
        setStatus('done');
        return;
      }

      // Premium not yet granted — webhook may still be processing.
      // Start polling: retry the RPC every 3 seconds for up to 60 seconds.
      setStatus('polling');
      let attempts = 0;
      const maxAttempts = 20;

      const poll = async () => {
        attempts++;
        setPollCount(attempts);

        const { data: result } = await supabase.rpc('grant_premium_for_payment');

        if (result?.granted) {
          await refreshProfile();
          setStatus('done');
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          setStatus('error');
          setErrorMsg(t('Платёж ещё обрабатывается. Premium активируется автоматически, как только ЮMoney подтвердит оплату. Если проблема сохраняется — свяжитесь с поддержкой.'));
        }
      };

      setTimeout(poll, 3000);
    })();
  }, [session, isGuest, refreshProfile]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-theme-border bg-theme-surface/50 glass-surface p-8 text-center space-y-5 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-30 bg-gradient-to-br from-amber-400 to-orange-500" />

        <div className="relative mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-amber-500/30">
          <Crown className="w-10 h-10 text-white" />
        </div>

        {status === 'verifying' && (
          <>
            <h1 className="text-xl font-bold text-theme-text relative">{t('Проверка платежа...')}</h1>
            <p className="text-sm text-theme-muted relative">{t('Сверяем данные оплаты с базой данных.')}</p>
            <div className="flex items-center justify-center py-2 relative">
              <Loader2 className="w-7 h-7 text-theme-warning animate-spin" />
            </div>
          </>
        )}

        {status === 'activating' && (
          <>
            <h1 className="text-xl font-bold text-theme-text relative">{t('Активируем Premium...')}</h1>
            <p className="text-sm text-theme-muted relative">{t('Платёж подтверждён. Включаем VIP-статус.')}</p>
            <div className="flex items-center justify-center py-2 relative">
              <Loader2 className="w-7 h-7 text-theme-warning animate-spin" />
            </div>
          </>
        )}

        {status === 'polling' && (
          <>
            <h1 className="text-xl font-bold text-theme-text relative">{t('Ожидание подтверждения...')}</h1>
            <p className="text-sm text-theme-muted relative">
              {t('Платёж получен. Ждём подтверждения от Юкассы')} (попытка {pollCount}/20)...
            </p>
            <div className="flex items-center justify-center py-2 relative">
              <RefreshCw className="w-7 h-7 text-theme-warning animate-spin" />
            </div>
          </>
        )}

        {status === 'done' && (
          <>
            <h1 className="text-xl font-bold text-theme-text relative">{t('Premium активирован!')}</h1>
            <p className="text-sm text-theme-muted relative">
              {t('VIP-статус открыт на 30 дней. Корона у аватара, 2x XP, эксклюзивные функции — всё включено.')}
            </p>
            <div className="flex items-center justify-center gap-2 text-theme-success relative">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-bold">{t('Оплата подтверждена')}</span>
            </div>
            <button
              onClick={() => setPage('home')}
              className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/30 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 relative"
            >
              <Music className="w-4 h-4" /> {t('На главную')} <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="relative mx-auto w-16 h-16 rounded-2xl bg-theme-danger/20 flex items-center justify-center -mt-2">
              <XCircle className="w-8 h-8 text-theme-danger" />
            </div>
            <h1 className="text-xl font-bold text-theme-text relative">{t('Не удалось активировать автоматически')}</h1>
            <p className="text-sm text-theme-muted relative">{errorMsg}</p>
            <button
              onClick={() => setPage('home')}
              className="w-full rounded-xl bg-theme-surface2 border border-theme-border px-5 py-3 text-sm font-medium text-theme-text hover:border-theme-primary transition-colors flex items-center justify-center gap-2 relative"
            >
              {t('На главную')} <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
