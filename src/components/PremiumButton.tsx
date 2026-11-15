import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Crown, Loader2 } from 'lucide-react';
import { useState } from 'react';

const YOOMONEY_WALLET = '4100119640056035';
const PRICE = 259;
const SUCCESS_URL = `${window.location.origin}/payment-success`;

export function buildYooMoneyUrl(userId: string, paymentId?: string): string {
  const label = `subscription_${userId}`;
  const successUrl = paymentId
    ? `${SUCCESS_URL}?demoPaymentId=${paymentId}`
    : SUCCESS_URL;
  return `https://yoomoney.ru/quickpay/confirm.xml?receiver=${YOOMONEY_WALLET}&sum=${PRICE}&label=${label}&comment=Подписка+Soundscape+Pro&quickpay-form=shop&paymentType=AC&successURL=${encodeURIComponent(successUrl)}`;
}

export default function PremiumButton({ className = '' }: { className?: string }) {
  const { profile, isGuest } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    if (!profile || isGuest) return;
    setError(null);
    setLoading(true);

    const label = `subscription_${profile.id}`;
    const { data: payment, error: insertError } = await supabase.from('payments').insert({
      user_id: profile.id,
      amount: PRICE,
      status: 'pending',
      label,
      payment_type: 'premium',
    }).select('id').maybeSingle();

    if (insertError || !payment) {
      setError('Не удалось начать оплату. Попробуйте ещё раз.');
      setLoading(false);
      return;
    }

    const url = buildYooMoneyUrl(profile.id, payment.id);
    window.location.href = url;
  };

  return (
    <div>
      <button
        onClick={handlePay}
        disabled={loading || isGuest}
        className={`relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.03] hover:shadow-amber-500/50 active:scale-95 disabled:opacity-50 ${className}`}
      >
        <span className="flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
          Купить Premium за {PRICE}₽/мес
        </span>
      </button>
      {error && <p className="text-sm text-theme-danger mt-2">{error}</p>}
    </div>
  );
}
