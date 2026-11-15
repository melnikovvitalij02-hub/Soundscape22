import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/context/LocaleContext';
import { Gem, Loader2, ArrowDownToLine, Info } from 'lucide-react';

const GEM_TO_RUB = 0.3;
const MIN_WITHDRAWAL = 100;

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

  const handleWithdraw = async () => {
    if (!profile || isGuest || !validAmount || !details.trim()) return;
    setError(null);
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('request_withdrawal', {
      p_coins_amount: gems,
      p_payment_details: details.trim(),
    });
    setLoading(false);
    if (rpcError) {
      setError(
        rpcError.message.includes('Minimum') ? t('Минимум 100 Gem для вывода') :
        rpcError.message.includes('Insufficient') ? t('Недостаточно Gem на балансе') :
        rpcError.message.includes('7 days') ? t('Аккаунт должен существовать минимум 7 дней') :
        t('Не удалось создать заявку. Попробуйте позже.'),
      );
      return;
    }
    await refreshProfile();
    setSuccess(`Заявка на вывод ${gems} Gem (${(gems * GEM_TO_RUB).toFixed(2)} ₽) отправлена. Обработка займёт до 3 рабочих дней.`);
    setAmount('');
    setDetails('');
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
            <p className="text-theme-muted text-xs mt-0.5">{t(`От ${MIN_WITHDRAWAL} Gem · курс 1 Gem = 0,3 ₽`)}</p>
          </div>
        </div>
        <span className="text-theme-muted text-sm shrink-0">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-theme-muted flex items-start gap-2 bg-theme-surface2 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {t('Выводятся накопленные Gem (донат-монеты). Баланс: ')} <span className="text-theme-text font-semibold ml-1">{balance} Gem</span>
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
            <label className="block text-xs font-medium text-theme-muted mb-1.5">{t('Реквизиты для выплаты (карта, телефон)')}</label>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={200}
              placeholder={t('Например: 2200 1234 5678 9010')}
              className="w-full px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-warning transition-colors"
            />
          </div>
          {error && <p className="text-xs text-theme-danger">{error}</p>}
          {success && <p className="text-xs text-theme-success bg-theme-success/10 border border-theme-success/20 rounded-lg px-3 py-2">{success}</p>}
          <button
            onClick={handleWithdraw}
            disabled={!validAmount || !details.trim() || loading || isGuest}
            className="w-full py-2.5 bg-gradient-to-r from-theme-warning to-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
            {t('Создать заявку на вывод')}
          </button>
        </div>
      )}
    </div>
  );
}
