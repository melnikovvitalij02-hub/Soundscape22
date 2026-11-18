import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/context/LocaleContext';
import { History, Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';

type PaymentRow = {
  id: string;
  label: string | null;
  amount: number;
  status: string;
  payment_type: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  premium: 'Подписка Premium',
  coins: 'Покупка монет',
  shop: 'Покупка в магазине',
};

function describeLabel(label: string | null): string {
  if (!label) return 'Платёж';
  if (label.startsWith('subscription_')) return TYPE_LABELS.premium;
  if (label.startsWith('promosub_')) return 'Premium по промокоду';
  if (label.startsWith('coins_')) return TYPE_LABELS.coins;
  if (label.startsWith('balance_')) {
    const type = label.split('_')[1];
    const names: Record<string, string> = {
      sample: 'Сэмпл-пак', cosmetic: 'Предмет внешнего вида', boost: 'Ускорение',
      avatar: 'Аватар', sticker: 'Стикер',
    };
    return names[type] || 'Покупка с баланса';
  }
  if (label.startsWith('shop_')) {
    const parts = label.split('_');
    if (parts[1] === 'chest') return 'Сундук со стикером';
    if (parts[1] === 'promo') return 'Продвижение трека';
    const typeNames: Record<string, string> = {
      sample: 'Сэмпл-пак', cosmetic: 'Предмет внешнего вида', boost: 'Ускорение', avatar: 'Аватар',
    };
    return typeNames[parts[1]] || 'Покупка в магазине';
  }
  return 'Платёж';
}

export default function PurchaseHistory() {
  const { profile, isGuest } = useAuth();
  const { t } = useLocale();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || isGuest || !profile.id) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setRows((data ?? []) as PaymentRow[]);
      console.log('profile.id =', profile.id, '| вернулось строк =', (data ?? []).length, '| первые user_id =', (data ?? []).slice(0,3).map(r => r.id));
      const refetch = async () => {
        const { data } = await supabase.from('payments')
          .select('id, label, amount, status, payment_type, created_at')
          .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50);
        setRows((data ?? []) as PaymentRow[]);
      };
      console.log('Мои покупки:', data?.map(r => ({ id: r.id, user_id: r.user_id, label: r.label })));
      await refetch(); setLoading(false);
      
      const channel = supabase
        .channel('my-payments')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'payments', filter: `user_id=eq.${profile.id}` },
          () => refetch())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
      setLoading(false);
    })();
  }, [profile, isGuest]);

  if (isGuest || !profile) {
    return (
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center glass-surface">
        <History className="w-12 h-12 text-theme-muted mx-auto mb-3" />
        <p className="text-theme-muted">{t('Войдите в аккаунт, чтобы увидеть историю покупок')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-theme-primary animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center glass-surface">
        <History className="w-12 h-12 text-theme-muted mx-auto mb-3" />
        <p className="text-theme-muted">{t('Покупок пока нет')}</p>
      </div>
    );
  }

  const statusIcon = (status: string) => {
    if (status === 'succeeded' || status === 'completed') return <CheckCircle2 className="w-4 h-4 text-theme-success" />;
    if (status === 'pending') return <Clock className="w-4 h-4 text-theme-warning" />;
    return <XCircle className="w-4 h-4 text-theme-danger" />;
  };

  const statusLabel = (status: string) => {
    if (status === 'succeeded' || status === 'completed') return t('Завершено');
    if (status === 'pending') return t('Ожидает оплаты');
    return t('Отменено');
  };

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4 glass-surface flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-theme-text font-medium text-sm truncate">{describeLabel(row.label)}</p>
            <p className="text-theme-muted text-xs mt-0.5">
              {new Date(row.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-theme-text font-bold text-sm">{row.amount > 0 ? `${row.amount} ₽` : '—'}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
              row.status === 'succeeded' || row.status === 'completed' ? 'bg-theme-success/15 text-theme-success'
              : row.status === 'pending' ? 'bg-theme-warning/15 text-theme-warning'
              : 'bg-theme-danger/15 text-theme-danger'
            }`}>
              {statusIcon(row.status)} {statusLabel(row.status)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
