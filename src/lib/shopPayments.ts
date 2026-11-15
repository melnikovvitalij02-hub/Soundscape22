import { supabase } from '@/lib/supabase';

const YOOMONEY_WALLET = '4100119640056035';
const SUCCESS_URL = `${window.location.origin}/payment-success`;

// Rates from CoinPurchase DONATE_COIN_PACKAGES: 100 coins for 30 RUB.
const COINS_PER_RUB = 100 / 30;

export function coinsToRub(coins: number): number {
  return Math.ceil(coins * COINS_PER_RUB);
}

type StartShopPaymentInput = {
  // shop_<type>_..._<userId>_r<price>; type is parsed server-side.
  itemType: 'sample' | 'cosmetic' | 'boost' | 'avatar' | 'chest' | 'promo';
  userId: string;
  priceCoins: number;
  itemId?: string;
  beatId?: string;
  promotionKind?: string;
  comment: string;
};

// Creates a pending payments row (payment_type 'shop') and redirects to the
// YooMoney quickpay page. The price suffix in the label is the trusted amount
// the webhook validates against.
export async function startShopPayment(input: StartShopPaymentInput): Promise<boolean> {
  const rub = coinsToRub(input.priceCoins);
  const middle = input.itemType === 'promo'
    ? `${input.beatId}_${input.promotionKind}`
    : input.itemType === 'chest'
      ? 'chest'
      : input.itemId;
  const label = `shop_${middle}_${input.userId}_r${rub}`;

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      user_id: input.userId,
      amount: rub,
      status: 'pending',
      label,
      payment_type: 'shop',
    })
    .select('id')
    .maybeSingle();

  if (error || !payment) return false;

  window.location.href = `https://yoomoney.ru/quickpay/confirm.xml?receiver=${YOOMONEY_WALLET}&sum=${rub}&label=${label}&comment=${encodeURIComponent(input.comment)}&quickpay-form=shop&paymentType=AC&successURL=${encodeURIComponent(`${SUCCESS_URL}?demoPaymentId=${payment.id}`)}`;
  return true;
}
