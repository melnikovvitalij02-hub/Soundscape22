import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import { Gem, Loader2, ArrowDownToLine, Info, ShieldCheck, ExternalLink } from 'lucide-react';

const GEM_TO_RUB = 0.7;
const MIN_WITHDRAWAL = 300;

export default function GemWithdrawal() {
  const { profile, isGuest, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const gems = parseInt(amount, 10);
  const validAmount = Number.isFinite(gems) && gems >= MIN_WITHDRAWAL;
  const balance = profile?.donate_coins ?? 0;

  // Instant payout: the server debits the Gems, sends the money through
  // YooMoney and refunds the Gems automatically if the transfer is rejected.
  // The recipient details go straight to YooMoney and are never stored.
  const handleWithdraw = async () => {
    if (!profile || isGuest || !validAmount || !details.trim()) return;
    setError(null); setSuccess(null); setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('yoomoney-payout', {
        body: { gems, payment_details: details.trim() },
      });
      if (fnError) throw new Error(fnError.message);
      const result = data as { ok?: boolean; rub?: number; error?: string };
      if (result?.error || !result?.ok) throw new Error(result?.error || 'Не удалось выполнить вывод');
      await refreshProfile();
      setSuccess(`Выплачено ${(result.rub ?? gems * GEM_TO_RUB).toFixed(2)} ₽ через ЮMoney. Проверьте карту.`);
      setAmount(''); setDetails('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      setError(msg.includes('Failed to send') || msg.includes('503')
        ? 'Вывод временно недоступен, попробуйте позже'
        : msg);
    } finally {
      setLoading(false);
    }
  };

  if (isGuest || !profile) return null;

  return (
    <div className="bg-theme-surface/50 border border-theme-warning/30 rounded-2xl p-5 glass-surface shop-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-theme-warning/15 flex items-center justify-center shrink-0">
            <ArrowDownToLine className="w-5 h-5 text-theme-warning" />
          </div>
          <div>
            <p className="text-theme-text font-medium text-sm flex items-center gap-1.5"><Gem className="w-4 h-4 text-theme-warning" /> {t('Вывод Gem')}</p>
            <p className="text-theme-muted text-xs mt-0.5">{t(`От ${MIN_WITHDRAWAL} Gem · курс 1 Gem = 0,7 ₽ · через ЮMoney`)}</p>
          </div>
        </div>
        <span className="text-theme-muted text-sm shrink-0">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-theme-muted flex items-start gap-2 bg-theme-surface2 rounded-lg px-3 py-2">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-theme-success" />
            <span>
              {t('Реквизиты карты вводятся на стороне ЮMoney и не хранятся на наших серверах. Баланс: ')}
              <span className="text-theme-text font-semibold ml-1">{balance} Gem</span>
            </span>
          </div>
          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1.5">{t('Количество Gem')}</label>
            <input
              type="number"
              min={MIN_WITHDRAWAL}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`${MIN_WITHDRAWAL}`}
              className="w-full px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-warning transition-colors"
            />
            {validAmount && (
              <p className="text-xs text-theme-success mt-1.5">
                {t('К выплате')}: {(gems * GEM_TO_RUB).toFixed(2)} ₽
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1.5">{t('Куда вывести (карта, счёт или телефон)')}</label>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={200}
              placeholder={t('Например: 2200 1234 5678 9010')}
              autoComplete="off"
              className="w-full px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-warning transition-colors"
            />
          </div>
          {error && <p className="text-xs text-theme-danger">{error}</p>}
          {success && <p className="text-xs text-theme-success bg-theme-success/10 border border-theme-success/20 rounded-lg px-3 py-2 flex items-start gap-2"><ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />{success}</p>}
          <div className="text-xs text-theme-muted flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {t('Деньги отправляются мгновенно через ЮMoney. Если перевод не пройдёт, Gem вернутся на баланс автоматически.')}
          </div>
          <button
            onClick={handleWithdraw}
            disabled={!validAmount || !details.trim() || loading || isGuest}
            className="w-full py-2.5 bg-gradient-to-r from-theme-warning to-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
            {t('Вывести через ЮMoney')}
          </button>
        </div>
      )}
    </div>
  );
}
