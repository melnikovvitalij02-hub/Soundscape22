import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type AvatarShopItem, type Sticker } from '@/lib/supabase';
import {
  Coins, Gem, Check, ShoppingBag, Sparkles, Loader2, Crown, Star,
  Package, Palette, Zap, Music, Download, Banknote, History, ArrowDownToLine,
} from 'lucide-react';
import CoinPurchase from '@/components/CoinPurchase';
import { useLocale } from '@/context/LocaleContext';
import GemWithdrawal from '@/components/GemWithdrawal';
import PurchaseHistory from '@/components/PurchaseHistory';

type SamplePack = { id: string; name: string; producer_name: string; genre: string; price_gems: number; price_coins: number; description: string; track_count: number; cover_url: string | null; is_exclusive: boolean };
type CosmeticItem = { id: string; name: string; type: 'skin' | 'frame' | 'theme' | 'effect'; price_gems: number; price_coins: number; rarity: 'common' | 'rare' | 'epic' | 'legendary'; preview_url: string | null; description: string };
type UserCosmetic = { id: string; user_id: string; cosmetic_id: string; is_equipped: boolean; purchased_at: string };
type BoostItem = { id: string; name: string; type: string; price_gems: number; price_coins: number; duration_hours: number; description: string };
type TabId = 'coins' | 'samples' | 'cosmetics' | 'boosts' | 'avatars' | 'stickers' | 'history';

const RARITY_STYLES: Record<string, { border: string; glow: string; badge: string; label: string }> = {
  common: { border: 'border-theme-border', glow: '', badge: 'bg-theme-surface2 text-theme-muted', label: 'Обычный' },
  rare: { border: 'border-blue-500/50', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.2)]', badge: 'bg-blue-500/20 text-blue-400', label: 'Редкий' },
  epic: { border: 'border-purple-500/50', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.25)]', badge: 'bg-purple-500/20 text-purple-400', label: 'Эпический' },
  legendary: { border: 'border-amber-500/50', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]', badge: 'bg-amber-500/20 text-amber-400', label: 'Легендарный' },
};

const AVATAR_GRADIENTS = [
  'from-red-500 to-orange-500', 'from-blue-500 to-cyan-500', 'from-purple-500 to-pink-500',
  'from-green-500 to-emerald-500', 'from-amber-500 to-yellow-500', 'from-indigo-500 to-purple-500',
  'from-rose-500 to-pink-500', 'from-teal-500 to-cyan-500',
];

const TABS: { id: TabId; label: string; icon: typeof Coins }[] = [
  { id: 'coins', label: 'Монеты', icon: Coins },
  { id: 'samples', label: 'Сэмпл-паки', icon: Music },
  { id: 'cosmetics', label: 'Внешний вид', icon: Palette },
  { id: 'boosts', label: 'Ускорения', icon: Zap },
  { id: 'avatars', label: 'Аватары', icon: Crown },
  { id: 'stickers', label: 'Стикеры', icon: Sparkles },
  { id: 'history', label: 'История', icon: History },
];

const COSMETIC_TYPE_LABELS: Record<string, string> = { skin: 'Скин', frame: 'Рамка', theme: 'Тема', effect: 'Эффект' };

function EmptyState({ icon: Icon, text }: { icon: typeof Coins; text: string }) {
  return (<div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center glass-surface shop-card"><Icon className="w-12 h-12 text-theme-muted mx-auto mb-3" /><p className="text-theme-muted">{text}</p></div>);
}

// Dual-currency price row: Gem (donate) first, Coin below.
function DualPrice({ gems, coins }: { gems: number; coins: number }) {
  if (gems === 0 && coins === 0) {
    return (
      <div className="mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-theme-success/15 text-theme-success text-xs font-semibold rounded-lg">{t_free()}</span>
      </div>
    );
  }
  return (
    <div className="mb-3 space-y-1">
      <div className="flex items-center gap-1.5"><Gem className="w-4 h-4 text-theme-warning" /><span className="text-theme-text font-bold">{gems} Gem</span></div>
      <div className="flex items-center gap-1.5"><span className="coin coin-sm" /><span className="text-theme-text font-bold">{coins} Coin</span></div>
    </div>
  );
}

function t_free(): string {
  return 'Бесплатно';
}

function OwnedBadge({ label, icon: Icon = Check }: { label: string; icon?: typeof Coins }) {
  return (<div className="w-full py-2.5 bg-theme-success/20 text-theme-success rounded-xl text-sm font-medium text-center flex items-center justify-center gap-2"><Icon className="w-4 h-4" /> {label}</div>);
}

function EquipBtn({ onClick, equippingId, id }: { onClick: () => void; equippingId: string | null; id: string }) {
  const { t } = useLocale();
  return (<button onClick={onClick} disabled={equippingId === id} className="w-full py-2.5 bg-theme-primary text-white rounded-xl text-sm font-medium hover:bg-theme-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2">{equippingId === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {t('Установить')}</button>);
}

function RarityBadge({ rarity, legendary }: { rarity: string; legendary: boolean }) {
  const { t } = useLocale();
  const r = RARITY_STYLES[rarity] || RARITY_STYLES.common;
  return (<div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold ${r.badge} flex items-center gap-1`}>{legendary && <Star className="w-3 h-3" fill="currentColor" />}{t(r.label)}</div>);
}

function EquippedBadge() {
  const { t } = useLocale();
  return (<div className="absolute top-2 left-2 px-2 py-0.5 bg-theme-primary text-white text-xs font-medium rounded-full flex items-center gap-1"><Check className="w-3 h-3" /> {t('Активен')}</div>);
}

export default function ShopPage() {
  const { profile, isGuest, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState<TabId>('coins');

  const [samplePacks, setSamplePacks] = useState<SamplePack[]>([]);
  const [ownedSamplePacks, setOwnedSamplePacks] = useState<string[]>([]);
  const [cosmeticItems, setCosmeticItems] = useState<CosmeticItem[]>([]);
  const [ownedCosmetics, setOwnedCosmetics] = useState<string[]>([]);
  const [equippedCosmetics, setEquippedCosmetics] = useState<string[]>([]);
  const [boostItems, setBoostItems] = useState<BoostItem[]>([]);
  const [avatars, setAvatars] = useState<AvatarShopItem[]>([]);
  const [ownedAvatars, setOwnedAvatars] = useState<string[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [ownedStickers, setOwnedStickers] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const showMessage = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(null), 3000); };

  const loadTab = useCallback(async (tab: TabId) => {
    if (!profile || isGuest || tab === 'coins') return;
    setLoading(true);
    if (tab === 'samples') {
      const [i, o] = await Promise.all([
        supabase.from('sample_packs').select('*').order('price_gems', { ascending: true }),
        supabase.from('user_sample_packs').select('sample_pack_id').eq('user_id', profile.id),
      ]);
      if (i.data) setSamplePacks(i.data as SamplePack[]);
      if (o.data) setOwnedSamplePacks((o.data as { sample_pack_id: string }[]).map((r) => r.sample_pack_id));
    } else if (tab === 'cosmetics') {
      const [i, o] = await Promise.all([
        supabase.from('cosmetic_items').select('*').order('price_gems', { ascending: true }),
        supabase.from('user_cosmetics').select('cosmetic_id,is_equipped').eq('user_id', profile.id),
      ]);
      if (i.data) setCosmeticItems(i.data as CosmeticItem[]);
      if (o.data) {
        const rows = o.data as UserCosmetic[];
        setOwnedCosmetics(rows.map((r) => r.cosmetic_id));
        setEquippedCosmetics(rows.filter((r) => r.is_equipped).map((r) => r.cosmetic_id));
      }
    } else if (tab === 'boosts') {
      const { data } = await supabase.from('boost_items').select('*').order('price_gems', { ascending: true });
      if (data) setBoostItems(data as BoostItem[]);
    } else if (tab === 'avatars') {
      const [i, o] = await Promise.all([
        supabase.from('avatar_shop_items').select('*').order('price', { ascending: true }),
        supabase.from('user_avatars').select('avatar_shop_item_id').eq('user_id', profile.id),
      ]);
      if (i.data) setAvatars(i.data as AvatarShopItem[]);
      if (o.data) setOwnedAvatars((o.data as { avatar_shop_item_id: string }[]).map((r) => r.avatar_shop_item_id));
    } else if (tab === 'stickers') {
      const [i, o] = await Promise.all([
        supabase.from('stickers').select('*').order('price_coins', { ascending: true }),
        supabase.from('user_stickers').select('sticker_id').eq('user_id', profile.id),
      ]);
      if (i.data) setStickers(i.data as Sticker[]);
      if (o.data) setOwnedStickers((o.data as { sticker_id: string }[]).map((r) => r.sticker_id));
    }
    setLoading(false);
  }, [profile, isGuest]);

  useEffect(() => { loadTab(activeTab); }, [activeTab, loadTab]);

  // Purchase with Gem or Coin balance via the server-side RPC. Free items
  // (price 0 in both currencies) are granted without a balance check.
  const buyWithBalance = async (
    type: 'sample' | 'cosmetic' | 'boost' | 'avatar' | 'sticker',
    item: { id: string },
    currency: 'gem' | 'coin',
    name: string,
  ) => {
    if (!profile || isGuest) { showMessage(t('Войдите в аккаунт')); return; }
    setBuying(item.id + currency);
    const { data, error } = await supabase.rpc('purchase_with_balance', {
      p_type: type,
      p_item_id: item.id,
      p_currency: currency,
    });
    setBuying(null);
    if (error || !data?.ok) {
      const reason = data?.reason;
      showMessage(
        reason === 'insufficient' ? t('Недостаточно средств') :
        reason === 'coin_only' ? t('Этот товар продаётся только за Coin') :
        t('Не удалось купить. Попробуйте ещё раз.'),
      );
      return;
    }
    await refreshProfile();
    showMessage((data.message as string) || `${t('Куплено')}: ${name}`);
    loadTab(activeTab);
  };

  const handleBuySamplePack = (item: SamplePack, currency: 'gem' | 'coin') =>
    buyWithBalance('sample', item, currency, item.name);

  const handleBuyCosmetic = (item: CosmeticItem, currency: 'gem' | 'coin') =>
    buyWithBalance('cosmetic', item, currency, item.name);

  const handleEquipCosmetic = async (item: CosmeticItem) => {
    if (!profile || isGuest || !ownedCosmetics.includes(item.id)) return;
    setEquipping(item.id);
    const { error } = await supabase.rpc('equip_cosmetic', { p_cosmetic_id: item.id });
    if (error) {
      setEquipping(null);
      showMessage(t('Не удалось установить предмет'));
      return;
    }
    const sameType = cosmeticItems.filter((c) => c.type === item.type).map((c) => c.id);
    setEquippedCosmetics([...equippedCosmetics.filter((id) => !sameType.includes(id)), item.id]);
    setEquipping(null);
    showMessage(t('«') + item.name + t('» установлено!'));
  };

  const handleBuyBoost = (item: BoostItem, currency: 'gem' | 'coin') =>
    buyWithBalance('boost', item, currency, item.name);

  const handleBuyAvatar = (item: AvatarShopItem, currency: 'gem' | 'coin') =>
    buyWithBalance('avatar', item, currency, item.name);

  const handleBuySticker = (item: Sticker) =>
    buyWithBalance('sticker', item, 'coin', item.name);

  // Currency choice UI: two buttons when both prices exist, one otherwise.
  function BuyButtons({ id, gems, coins, onBuy, label, icon: Icon }: { id: string; gems: number; coins: number; onBuy: (c: 'gem' | 'coin') => void; label: string; icon?: typeof Coins }) {
    const free = gems === 0 && coins === 0;
    if (free) {
      return (
        <button onClick={() => onBuy('gem')} disabled={buying === id + 'gem'} className="buy-btn w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 bg-theme-success/20 text-theme-success hover:bg-theme-success/30 disabled:opacity-50">
          {buying === id + 'gem' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4" /> {t('Получить бесплатно')}</>}
        </button>
      );
    }
    if (gems === 0) {
      return (
        <button onClick={() => onBuy('coin')} disabled={buying === id + 'coin'} className="buy-btn w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 bg-theme-primary text-white hover:bg-theme-primary-hover disabled:opacity-50">
          {buying === id + 'coin' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span className="coin coin-sm" /> {label} · {coins} Coin</>}
        </button>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onBuy('gem')} disabled={buying === id + 'gem'} className="buy-btn py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/40 hover:bg-amber-500/25 disabled:opacity-50">
          {buying === id + 'gem' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gem className="w-4 h-4" /> {gems}</>}
        </button>
        <button onClick={() => onBuy('coin')} disabled={buying === id + 'coin'} className="buy-btn py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 bg-theme-primary/15 text-theme-primary border border-theme-primary/40 hover:bg-theme-primary/25 disabled:opacity-50">
          {buying === id + 'coin' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span className="coin coin-sm" /> {coins}</>}
        </button>
      </div>
    );
  }

  const tabBody: ReactNode = (() => {
    if (loading) return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-theme-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
    if (activeTab === 'coins') return <CoinPurchase />;
    if (activeTab === 'history') return <PurchaseHistory />;
    if (activeTab === 'samples') return samplePacks.length === 0 ? <EmptyState icon={Package} text={t('Сэмпл-паки скоро появятся')} /> : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {samplePacks.map((item) => {
          const owned = ownedSamplePacks.includes(item.id);
          return (
            <div key={item.id} className="bg-theme-surface/50 border border-theme-border rounded-2xl overflow-hidden glass-surface shop-card">
              <div className="relative h-32 bg-gradient-to-br from-theme-primary/30 to-theme-accent/20 flex items-center justify-center">
                {item.cover_url ? <img src={item.cover_url} alt={item.name} className="w-full h-full object-cover" />
                  : <Package className="w-12 h-12 text-theme-primary/50" />}
                {item.is_exclusive && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 bg-theme-warning/20 text-theme-warning text-xs font-bold rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" fill="currentColor" /> {t('Эксклюзив')}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-theme-text font-bold text-sm mb-1">{item.name}</h3>
                <p className="text-theme-muted text-xs mb-1">{item.producer_name} · {item.genre}</p>
                <p className="text-theme-muted text-xs mb-3 flex items-center gap-1"><Music className="w-3 h-3" /> {item.track_count} {t('треков')}</p>
                <p className="text-theme-muted text-xs mb-2 line-clamp-2">{item.description}</p>
                <DualPrice gems={item.price_gems} coins={item.price_coins} />
                {owned ? <OwnedBadge label={t('Куплено')} icon={Download} />
                  : <BuyButtons id={item.id} gems={item.price_gems} coins={item.price_coins} onBuy={(c) => handleBuySamplePack(item, c)} label={t('Купить')} icon={Music} />}
              </div>
            </div>
          );
        })}
      </div>
    );
    if (activeTab === 'cosmetics') return cosmeticItems.length === 0 ? <EmptyState icon={Palette} text={t('Внешний вид скоро появится')} /> : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cosmeticItems.map((item) => {
          const owned = ownedCosmetics.includes(item.id);
          const equipped = equippedCosmetics.includes(item.id);
          const r = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
          return (
            <div key={item.id} className={`bg-theme-surface/50 border-2 rounded-2xl overflow-hidden glass-surface shop-card ${r.border} ${r.glow} ${equipped ? 'ring-2 ring-theme-primary' : ''}`}>
              <div className="relative h-28 flex items-center justify-center bg-theme-surface2">
                {item.preview_url ? <img src={item.preview_url} alt={item.name} className="w-full h-full object-cover" />
                  : <Palette className="w-10 h-10 text-theme-muted" />}
                <RarityBadge rarity={item.rarity} legendary={item.rarity === 'legendary'} />
                {equipped && <EquippedBadge />}
              </div>
              <div className="p-4">
                <h3 className="text-theme-text font-bold text-sm mb-1">{item.name}</h3>
                <p className="text-theme-muted text-xs mb-2">{t(COSMETIC_TYPE_LABELS[item.type] || item.type)}</p>
                <p className="text-theme-muted text-xs mb-2 line-clamp-2">{item.description}</p>
                <DualPrice gems={item.price_gems} coins={item.price_coins} />
                {owned ? (equipped ? <OwnedBadge label={t('✓ Установлено')} />
                  : <EquipBtn onClick={() => handleEquipCosmetic(item)} equippingId={equipping} id={item.id} />)
                  : <BuyButtons id={item.id} gems={item.price_gems} coins={item.price_coins} onBuy={(c) => handleBuyCosmetic(item, c)} label={t('Купить')} icon={Palette} />}
              </div>
            </div>
          );
        })}
      </div>
    );
    if (activeTab === 'boosts') return boostItems.length === 0 ? <EmptyState icon={Zap} text={t('Ускорения скоро появятся')} /> : (
      <div className="space-y-4">
        <div className="bg-theme-surface/50 border border-theme-warning/30 rounded-2xl p-4 glass-surface shop-card">
          <div className="flex items-start gap-3">
            <Crown className="w-5 h-5 text-theme-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-theme-text font-medium mb-1">{t('Премиум-пользователи могут публиковать треки без очереди')}</p>
              <p className="text-theme-muted text-xs">{t('Без премиума нужно ждать 6 часов между публикациями — или купить Буст публикации')}</p>
            </div>
          </div>
        </div>
        <GemWithdrawal />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boostItems.map((item) => {
            const isDoubleXp = item.type === 'double_xp';
            return (
              <div key={item.id} className="bg-theme-surface/50 border border-theme-border rounded-2xl p-5 glass-surface shop-card">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-theme-primary/15 flex items-center justify-center"><Zap className="w-6 h-6 text-theme-primary" /></div>
                  <span className="px-2 py-0.5 bg-theme-primary/20 text-theme-primary text-xs font-medium rounded-full">{item.duration_hours} {t('ч.')}</span>
                </div>
                <h3 className="text-theme-text font-bold text-sm mb-1">{item.name}</h3>
                <p className="text-theme-muted text-xs mb-2">{item.description}</p>
                {isDoubleXp && profile?.is_premium ? (
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-theme-warning/15 text-theme-warning text-xs font-medium rounded-lg"><Crown className="w-3 h-3" /> {t('Премиум бесплатно')}</span>
                  </div>
                ) : (
                  <DualPrice gems={item.price_gems} coins={item.price_coins} />
                )}
                {isDoubleXp && profile?.is_premium ? (
                  <button onClick={() => handleBuyBoost(item, 'gem')} disabled={false} className="w-full py-2.5 bg-theme-success/20 text-theme-success rounded-xl text-sm font-medium flex items-center justify-center gap-2"><Crown className="w-4 h-4" /> {t('Активировать')}</button>
                ) : (
                  <BuyButtons id={item.id} gems={item.price_gems} coins={item.price_coins} onBuy={(c) => handleBuyBoost(item, c)} label={t('Активировать')} icon={Zap} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
    if (activeTab === 'avatars') return avatars.length === 0 ? <EmptyState icon={Crown} text={t('Магазин скоро будет пополнен')} /> : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {avatars.map((item, idx) => {
          const owned = ownedAvatars.includes(item.id);
          const equipped = profile?.avatar_url === item.image_url;
          const r = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
          const gradient = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
          return (
            <div key={item.id} className={`bg-theme-surface/50 border-2 rounded-2xl overflow-hidden glass-surface shop-card transition-all ${r.border} ${r.glow} ${equipped ? 'ring-2 ring-theme-primary' : ''}`}>
              <div className="relative h-40 flex items-center justify-center overflow-hidden">
                {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  : <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}><Crown className="w-16 h-16 text-white/80" /></div>}
                <RarityBadge rarity={item.rarity} legendary={item.rarity === 'legendary'} />
                {equipped && <EquippedBadge />}
              </div>
              <div className="p-4">
                <h3 className="text-theme-text font-bold text-base mb-1">{item.name}</h3>
                <div className="mb-4"><DualPrice gems={item.price_gems} coins={item.price} /></div>
                {owned ? (equipped ? <OwnedBadge label={t('Установлен')} />
                  : <EquipBtn onClick={() => handleEquipAvatar(item)} equippingId={equipping} id={item.id} />)
                  : <BuyButtons id={item.id} gems={item.price_gems} coins={item.price} onBuy={(c) => handleBuyAvatar(item, c)} label={t('Купить')} icon={Crown} />}
              </div>
            </div>
          );
        })}
      </div>
    );
    if (activeTab === 'stickers') return stickers.length === 0 ? <EmptyState icon={Sparkles} text={t('Стикеры скоро появятся')} /> : (
      <div className="space-y-5">
        <div>
          <p className="text-xs text-theme-muted uppercase tracking-wider mb-3">{t('Коллекция — только за Coin')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {stickers.map((item) => {
              const owned = ownedStickers.includes(item.id);
              const r = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
              return (
                <div key={item.id} className={`bg-theme-surface/50 border-2 rounded-2xl overflow-hidden glass-surface shop-card ${r.border} ${r.glow} ${owned ? '' : 'opacity-60'}`}>
                  <div className="relative h-24 flex items-center justify-center bg-theme-surface2">
                    {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /> : <span className="text-4xl">{item.emoji}</span>}
                    <RarityBadge rarity={item.rarity} legendary={item.rarity === 'legendary'} />
                  </div>
                  <div className="p-3">
                    <h3 className="text-theme-text font-bold text-sm mb-1">{owned ? item.name : t('Не найдено')}</h3>
                    <p className="text-theme-muted text-xs">{owned ? item.category : t('Откройте сундук')}</p>
                    {!owned && (
                      <div className="mt-2">
                        <BuyButtons id={item.id} gems={0} coins={item.price_coins} onBuy={() => handleBuySticker(item)} label={t('Купить')} icon={Sparkles} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
    return null;
  })();

  return (
    <div className="shop-page space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2"><ShoppingBag className="w-6 h-6 text-theme-primary" /> {t('Магазин')}</h1>
          <p className="text-theme-muted text-sm mt-1">{t('Всё покупается за Gem или Coin — цена в Coin выше. Стикеры — только за Coin.')}</p>
        </div>
      </div>

      {message && (
        <div className="bg-theme-primary-bg border border-theme-primary-border rounded-xl p-4 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-theme-primary" />
          <p className="text-theme-primary-text text-sm font-medium">{message}</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'bg-theme-primary text-white' : 'bg-theme-surface/50 text-theme-muted hover:text-theme-text border border-theme-border'
            }`}>
            <tab.icon className="w-4 h-4" /> {t(tab.label)}
          </button>
        ))}
      </div>

      {tabBody}


    </div>
  );
}
