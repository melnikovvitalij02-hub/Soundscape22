import { useEffect, useState } from 'react';
import { Gem, Banknote, Loader2, CheckCircle2, Clock, XCircle, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/context/LocaleContext';

type WithdrawalRow = {
  id: string;
  amount_gem: number;
  amount_rub: number;
  wallet: string;
  status: string;
  created_at: string;
};

const GEM_TO_RUB = 0.3;
const MIN_GEM = 100;

export default function GemWithdraw() {
  const { profile, isGuest, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [amount, setAmount] = useState('');
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<'ok' | 'err' | null>(null);
  const [rows, setRows] = useState<WithdrawalRow[]>([]);

  useEffect(() => {
    if (!profile || isGuest) return;
    supabase
      .from('gem_withdrawals')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setRows((data ?? []) as WithdrawalRow[]));
  }, [profile, isGuest]);

  if (isGuest || !profile) {
    return (
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 text-center glass-surface">
        <p className="text-theme-muted text-sm">{t('Войдите в аккаунт, чтобы выводить Gem в рубли')}</p>
      </div>
    );
  }

  const balance = profile.donate_coins ?? 0;
  const gemNum = parseInt(amount, 10);
  const valid = Number.isFinite(gemNum) && gemNum >= MIN_GEM && gemNum <= balance && wallet.trim().length >= 4;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('request_gem_withdrawal', {
      p_amount_gem: gemNum,
      p_wallet: wallet.trim(),
    });
    setBusy(false);
    if (error || !data?.[0]?.ok) {
      const reason = data?.[0]?.reason;
      setMsgType('err');
      setMsg(
        reason === 'insufficient' ? t('Недостаточно Gem на балансе')
        : reason === 'invalid_wallet' ? t('Проверьте номер кошелька ЮMoney')
        : reason === 'min_amount' ? t(`Минимум ${MIN_GEM} Gem за один вывод`)
        : t('Не удалось создать заявку на вывод')
      );
      return;
    }
    setAmount('');
    setWallet('');
    setMsgType('ok');
    setMsg(t('Заявка создана! Средства спишутся с баланса, выплата придёт на указанный кошелёк ЮMoney'));
    await refreshProfile();
    const { data: fresh } = await supabase
      .from('gem_withdrawals')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setRows((fresh ?? []) as WithdrawalRow[]);
  };

  const statusLabel = (status: string) => {
    if (status === 'paid') return t('Выплачено');
    if (status === 'pending') return t('В обработке');
    return t('Отклонено');
  };

  return (
    <div className="space-y-4">
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-theme-warning/15 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5 text-theme-warning" />
          </div>
          <div>
            <p className="text-theme-text font-medium text-sm">{t('Вывод Gem в рубли')}</p>
            <p className="text-theme-muted text-xs mt-0.5">
              {t('Курс: 1 Gem = 0,30 ₽ · минимум 100 Gem · выплата на кошелёк ЮMoney')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Gem className="w-4 h-4 text-theme-warning" />
          <span className="text-theme-muted">{t('Баланс')}:</span>
          <span className="text-theme-text font-semibold">{balance} Gem</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-theme-muted block mb-1">{t('Сколько Gem вывести')}</label>
            <input
              type="number"
              min={MIN_GEM}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(MIN_GEM)}
              className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
            />
            {Number.isFinite(gemNum) && gemNum >= MIN_GEM && (
              <p className="text-xs text-theme-success mt-1">≈ {Math.floor(gemNum * GEM_TO_RUB)} ₽</p>
            )}
          </div>
          <div>
            <label className="text-xs text-theme-muted block mb-1">{t('Кошелёк ЮMoney')}</label>
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="4100..."
              inputMode="numeric"
              className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
            />
          </div>
        </div>

        {msg && (
          <p className={`text-sm ${msgType === 'ok' ? 'text-theme-success' : 'text-theme-danger'}`}>{msg}</p>
        )}

        <button
          onClick={submit}
          disabled={!valid || busy}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-theme-warning text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
          {t('Создать заявку на вывод')}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-theme-muted uppercase tracking-widest">{t('Мои заявки на вывод')}</p>
          {rows.map((row) => (
            <div key={row.id} className="bg-theme-surface/50 border border-theme-border rounded-xl p-3 flex items-center justify-between gap-3 glass-surface">
              <div className="min-w-0">
                <p className="text-theme-text text-sm font-medium">
                  {row.amount_gem} Gem → {row.amount_rub} ₽
                </p>
                <p className="text-theme-muted text-xs mt-0.5">
                  {t('Кошелёк')} {row.wallet} · {new Date(row.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium shrink-0 ${
                row.status === 'paid' ? 'bg-theme-success/15 text-theme-success'
                : row.status === 'pending' ? 'bg-theme-warning/15 text-theme-warning'
                : 'bg-theme-danger/15 text-theme-danger'
              }`}>
                {row.status === 'paid' ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : row.status === 'pending' ? <Clock className="w-3.5 h-3.5" />
                  : <XCircle className="w-3.5 h-3.5" />}
                {statusLabel(row.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
