import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Loader2, Crown, ArrowRight, Music, XCircle, RefreshCw, Coins } from 'lucide-react';
import type { Page } from '@/components/Sidebar';

export default function PaymentSuccessPage({ setPage }: { setPage: (p: Page) => void }) {
  const { session, isGuest, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [status, setStatus] = useState<'verifying' | 'activating' | 'done' | 'error' | 'polling'>('verifying');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [isCoins, setIsCoins] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      const demoPaymentId = new URLSearchParams(window.location.search).get('demoPaymentId');

      if (!session?.user || isGuest) {
        setStatus('error');
        setErrorMsg(t('Войдите в аккаунт, чтобы активировать покупку.'));
        return;
      }

      if (demoPaymentId) {
        // 1. Сначала узнаём тип и статус платежа напрямую из БД
        const { data: payRow, error: payError } = await supabase
          .from('payments')
          .select('status, payment_type')
          .eq('id', demoPaymentId)
          .maybeSingle();

        if (payError || !payRow) {
          setStatus('error');
          setErrorMsg(t('Платёж не найден в системе.'));
          return;
        }

        const isCoinsPurchase = payRow.payment_type === 'coins';
        setIsCoins(isCoinsPurchase);

        if (payRow.status === 'succeeded') {
          // Уже обработано (например, вебхуком)
          await refreshProfile();
          setStatus('done');
          return;
        }

        if (payRow.status === 'pending') {
          setStatus('activating');
          
          // Пытаемся обработать через RPC (он должен смотреть на payment_type внутри себя)
          const { data: demoResult } = await supabase.rpc('grant_demo_payment', {
            p_payment_id: demoPaymentId,
          });

          if (demoResult?.granted) {
            await refreshProfile();
            setStatus('done');
            return;
          }

          // Если RPC не сработал сразу, начинаем поллинг (ждём вебхук)
          setStatus('polling');
          setPollCount(1);
          let attempts = 0;
          const maxAttempts = 20;

          const pollDemo = async () => {
            attempts++;
            setPollCount(attempts);

            const { data: updatedPayRow } = await supabase
              .from('payments')
              .select('status')
              .eq('id', demoPaymentId)
              .maybeSingle();

            if (updatedPayRow?.status === 'succeeded') {
              await refreshProfile();
              setStatus('done');
              return;
            }

            if (attempts < maxAttempts) {
              setTimeout(pollDemo, 3000);
            } else {
              setStatus('error');
              setErrorMsg(t('Платёж ещё обрабатывается. Покупка будет завершена автоматически, как только ЮMoney подтвердит оплату.'));
            }
          };

          setTimeout(pollDemo, 3000);
        } else {
          setStatus('error');
          setErrorMsg(t('Платёж был отменён или не удалось его обработать.'));
        }
        return;
      }

      // ── Fallback: если нет demoPaymentId (старый редирект только для Premium) ──
      setStatus('activating');
      const { data: result } = await supabase.rpc('grant_premium_for_payment');
      if (result?.granted) {
        await refreshProfile();
        setStatus('done');
        return;
      }

      await refreshProfile();
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', session.user.id)
        .maybeSingle();

      if (currentProfile?.is_premium) {
        setStatus('done');
        return;
      }

      setStatus('polling');
      let attempts = 0;
      const maxAttempts = 20;

      const poll = async () => {
        attempts++;
        setPollCount(attempts);

        const { data: pollResult } = await supabase.rpc('grant_premium_for_payment');
        if (pollResult?.granted) {
          await refreshProfile();
          setStatus('done');
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          setStatus('error');
          setErrorMsg(t('Платёж ещё обрабатывается. Premium активируется автоматически.'));
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
          {isCoins ? <Coins className="w-10 h-10 text-white" /> : <Crown className="w-10 h-10 text-white" />}
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
            <h1 className="text-xl font-bold text-theme-text relative">
              {isCoins ? t('Зачисляем монеты...') : t('Активируем Premium...')}
            </h1>
            <p className="text-sm text-theme-muted relative">
              {isCoins ? t('Платёж подтверждён. Обновляем баланс.') : t('Платёж подтверждён. Включаем VIP-статус.')}
            </p>
            <div className="flex items-center justify-center py-2 relative">
              <Loader2 className="w-7 h-7 text-theme-warning animate-spin" />
            </div>
          </>
        )}

        {status === 'polling' && (
          <>
            <h1 className="text-xl font-bold text-theme-text relative">{t('Ожидание подтверждения...')}</h1>
            <p className="text-sm text-theme-muted relative">
              {t('Платёж получен. Ждём подтверждения от платёжной системы')} (попытка {pollCount}/20)...
            </p>
            <div className="flex items-center justify-center py-2 relative">
              <RefreshCw className="w-7 h-7 text-theme-warning animate-spin" />
            </div>
          </>
        )}

        {status === 'done' && (
          <>
            {isCoins ? (
              <>
                <h1 className="text-xl font-bold text-theme-text relative">{t('Монеты зачислены!')}</h1>
                <p className="text-sm text-theme-muted relative">
                  {t('Баланс успешно пополнен. Теперь вы можете покупать сэмпл-паки и стикеры в магазине.')}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-theme-text relative">{t('Premium активирован!')}</h1>
                <p className="text-sm text-theme-muted relative">
                  {t('VIP-статус открыт на 30 дней. Корона у аватара, 2x XP, эксклюзивные функции — всё включено.')}
                </p>
              </>
            )}
            <div className="flex items-center justify-center gap-2 text-theme-success relative">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-bold">{t('Оплата подтверждена')}</span>
            </div>
            <button
              onClick={() => setPage('home')}
              className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/30 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 relative"
            >
              {isCoins ? <Music className="w-4 h-4" /> : <Crown className="w-4 h-4" />} 
              {t('На главную')} <ArrowRight className="w-4 h-4" />
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