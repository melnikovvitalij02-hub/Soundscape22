import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Gem, ArrowDownToLine, Info, ExternalLink } from 'lucide-react';

const YOOMONEY_WALLET = '4100119640056035';
const GEM_TO_RUB = 0.7;
const MIN_WITHDRAWAL = 300;

function buildGemYooMoneyUrl(userId: string, gems: number): string {
  const rub = (gems * GEM_TO_RUB).toFixed(2);
  const label = `gem_withdrawal_${userId}_${gems}`;
  const comment = `Обмен ${gems} Gem Soundscape Pro`;

  return `https://yoomoney.ru/quickpay/confirm.xml?receiver=${YOOMONEY_WALLET}&sum=${rub}&label=${encodeURIComponent(label)}&comment=${encodeURIComponent(comment)}&quickpay-form=shop&paymentType=AC`;
}

export default function GemWithdrawal() {
  const { profile, isGuest } = useAuth();
  const { t } = useLocale();
  const [amount, setAmount] = useState('');
  const [open, setOpen] = useState(false);

  const gems = parseInt(amount, 10);
  const balance = profile?.donate_coins ?? 0;
  const validAmount = Number.isFinite(gems) && gems >= MIN_WITHDRAWAL && gems <= balance;
  const enteredMoreThanBalance = Number.isFinite(gems) && gems > balance;

  const handleWithdraw = () => {
    if (!profile || isGuest || !validAmount) return;
    window.location.href = buildGemYooMoneyUrl(profile.id, gems);
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
            <p className="text-theme-text font-medium text-sm flex items-center gap-1.5">
              <Gem className="w-4 h-4 text-theme-warning" /> {t('Вывод Gem')}
            </p>
            <p className="text-theme-muted text-xs mt-0.5">
              {t(`От ${MIN_WITHDRAWAL} Gem · курс 1 Gem = 0,7 ₽ · через ЮMoney`)}
            </p>
          </div>
        </div>
        <span className="text-theme-muted text-sm shrink-0">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-theme-muted flex items-start gap-2 bg-theme-surface2 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {t('Укажите количество Gem, а реквизиты для операции введите уже на странице ЮMoney. Баланс: ')}
              <span className="text-theme-text font-semibold ml-1">{balance} Gem</span>
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1.5">
              {t('Количество Gem')}
            </label>
            <input
              type="number"
              min={MIN_WITHDRAWAL}
              max={balance}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`${MIN_WITHDRAWAL}`}
              className="w-full px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-warning transition-colors"
            />
            {Number.isFinite(gems) && gems >= MIN_WITHDRAWAL && !enteredMoreThanBalance && (
              <p className="text-xs text-theme-success mt-1.5">
                {t('Сумма на странице ЮMoney')}: {(gems * GEM_TO_RUB).toFixed(2)} ₽
              </p>
            )}
            {enteredMoreThanBalance && (
              <p className="text-xs text-theme-danger mt-1.5">
                {t('Нельзя вывести больше Gem, чем есть на балансе')}
              </p>
            )}
          </div>

          <div className="text-xs text-theme-muted flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {t('После нажатия откроется сайт ЮMoney. Soundscape Pro не получает и не хранит реквизиты карты.')}
          </div>

          <button
            onClick={handleWithdraw}
            disabled={!validAmount || isGuest}
            className="w-full py-2.5 bg-gradient-to-r from-theme-warning to-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            {t('Перейти на ЮMoney')}
          </button>
        </div>
      )}
    </div>
  );
}
