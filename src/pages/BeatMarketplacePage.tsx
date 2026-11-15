import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import { ShoppingBag, Plus, X, Coins, Search, Loader2, Music, Tag, Check, TrendingUp, Store } from 'lucide-react';

type BeatRow = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  bpm: number;
  cover_url: string | null;
  play_count: number;
  created_at: string;
};

type SellerProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type ListingStatus = 'active' | 'sold' | 'delisted';

type BeatListing = {
  id: string;
  beat_id: string;
  seller_id: string;
  price_coins: number | null;
  price_rub: number | null;
  status: ListingStatus;
  buyer_id: string | null;
  sold_at: string | null;
  platform_fee_coins: number | null;
  platform_fee_rub: number | null;
  created_at: string;
  beat: BeatRow | null;
  seller: SellerProfile | null;
};

const COMMISSION_RATE = 0.15;

const STATUS_LABELS: Record<ListingStatus, string> = {
  active: 'Активно',
  sold: 'Продано',
  delisted: 'Снято с продажи',
};

const STATUS_COLORS: Record<ListingStatus, string> = {
  active: 'text-theme-success',
  sold: 'text-theme-muted',
  delisted: 'text-theme-warning',
};

export default function BeatMarketplacePage() {
  const { profile, isGuest, refreshProfile } = useAuth();
  const { t } = useLocale();

  const [tab, setTab] = useState<'browse' | 'sell' | 'mine'>('browse');
  const [listings, setListings] = useState<BeatListing[]>([]);
  const [myBeats, setMyBeats] = useState<BeatRow[]>([]);
  const [myListings, setMyListings] = useState<BeatListing[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sell form
  const [selectedBeatId, setSelectedBeatId] = useState<string>('');
  const [priceCoins, setPriceCoins] = useState<string>('');
  const [priceRub, setPriceRub] = useState<string>('');
  const [showSellForm, setShowSellForm] = useState(false);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('beat_listings')
      .select(`
        id, beat_id, seller_id, price_coins, price_rub, status, buyer_id, sold_at,
        platform_fee_coins, platform_fee_rub, created_at,
        beat:beats ( id, user_id, title, genre, bpm, cover_url, play_count, created_at ),
        seller:profiles ( id, username, avatar_url )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchListings error:', error);
      setListings([]);
    } else {
      const rows = (data || []) as unknown as BeatListing[];
      setListings(rows);
      const g = Array.from(new Set(rows.map((r) => r.beat?.genre).filter(Boolean) as string[]));
      setGenres(g);
    }
    setLoading(false);
  }, []);

  const fetchMyBeats = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('beats')
      .select('id, user_id, title, genre, bpm, cover_url, play_count, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('fetchMyBeats error:', error);
      setMyBeats([]);
    } else {
      setMyBeats(data as BeatRow[]);
    }
  }, [profile]);

  const fetchMyListings = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('beat_listings')
      .select(`
        id, beat_id, seller_id, price_coins, price_rub, status, buyer_id, sold_at,
        platform_fee_coins, platform_fee_rub, created_at,
        beat:beats ( id, user_id, title, genre, bpm, cover_url, play_count, created_at ),
        seller:profiles ( id, username, avatar_url )
      `)
      .eq('seller_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('fetchMyListings error:', error);
      setMyListings([]);
    } else {
      setMyListings((data || []) as unknown as BeatListing[]);
    }
  }, [profile]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    if (tab === 'sell') fetchMyBeats();
    if (tab === 'mine') fetchMyListings();
  }, [tab, fetchMyBeats, fetchMyListings]);

  const filteredListings = listings.filter((l) => {
    if (genreFilter !== 'all' && l.beat?.genre !== genreFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const inTitle = l.beat?.title?.toLowerCase().includes(q);
      const inSeller = l.seller?.username?.toLowerCase().includes(q);
      if (!inTitle && !inSeller) return false;
    }
    return true;
  });

  const handleCreateListing = async () => {
    if (!profile) return;
    if (isGuest) {
      showMessage('error', t('Войдите в аккаунт, чтобы выставлять биты на продажу'));
      return;
    }
    if (!selectedBeatId) {
      showMessage('error', t('Выберите бит для продажи'));
      return;
    }
    const coins = priceCoins.trim() ? parseInt(priceCoins, 10) : 0;
    const rub = priceRub.trim() ? parseInt(priceRub, 10) : 0;
    if (coins <= 0 && rub <= 0) {
      showMessage('error', t('Укажите цену в монетах или рублях'));
      return;
    }

    setActionLoading('create');
    const { error } = await supabase.from('beat_listings').insert({
      beat_id: selectedBeatId,
      seller_id: profile.id,
      price_coins: coins > 0 ? coins : null,
      price_rub: rub > 0 ? rub : null,
      status: 'active',
    });

    if (error) {
      console.error('createListing error:', error);
      showMessage('error', t('Не удалось создать объявление'));
    } else {
      showMessage('success', t('Бит выставлен на продажу!'));
      setShowSellForm(false);
      setSelectedBeatId('');
      setPriceCoins('');
      setPriceRub('');
      fetchListings();
      fetchMyListings();
    }
    setActionLoading(null);
  };

  const handleBuy = async (listing: BeatListing) => {
    if (!profile) return;
    if (isGuest) {
      showMessage('error', t('Войдите в аккаунт, чтобы покупать биты'));
      return;
    }
    if (listing.seller_id === profile.id) {
      showMessage('error', t('Нельзя купить собственный бит'));
      return;
    }
    if ((listing.price_coins ?? 0) <= 0) {
      showMessage('error', t('Этот бит нельзя купить за монеты'));
      return;
    }

    setActionLoading(`buy-${listing.id}`);
    const { data, error } = await supabase.rpc('purchase_marketplace_listing', { p_listing_id: listing.id });
    if (error || !data?.[0]) {
      showMessage('error', t('Не удалось завершить покупку. Проверьте баланс и доступность объявления.'));
      setActionLoading(null);
      return;
    }

    await refreshProfile();
    fetchListings();
    fetchMyListings();
    showMessage('success', t('Бит «') + (listing.beat?.title ?? '') + t('» куплен!'));
    setActionLoading(null);
  };

  const handleDelist = async (listingId: string) => {
    if (!profile) return;
    setActionLoading(`delist-${listingId}`);
    const { error } = await supabase
      .from('beat_listings')
      .update({ status: 'delisted' })
      .eq('id', listingId)
      .eq('seller_id', profile.id);

    if (error) {
      showMessage('error', t('Не удалось снять объявление'));
    } else {
      showMessage('success', t('Объявление снято с продажи'));
      fetchListings();
      fetchMyListings();
    }
    setActionLoading(null);
  };

  const TabButton = ({ id, label, icon: Icon }: { id: typeof tab; label: string; icon: typeof ShoppingBag }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
        tab === id
          ? 'bg-theme-primary text-white'
          : 'bg-theme-surface/50 text-theme-muted hover:text-theme-text border border-theme-border'
      }`}
    >
      <Icon className="w-4 h-4" />
      {t(label)}
    </button>
  );

  const PriceTag = ({ coins, rub }: { coins: number | null; rub: number | null }) => (
    <div className="flex flex-wrap items-center gap-3">
      {coins != null && coins > 0 && (
        <span className="flex items-center gap-1.5 text-theme-warning font-bold">
          <Coins className="w-4 h-4" />
          {coins}
        </span>
      )}
      {rub != null && rub > 0 && (
        <span className="flex items-center gap-1.5 text-theme-text font-bold">
          <Tag className="w-4 h-4 text-theme-primary" />
          {rub} ₽
        </span>
      )}
    </div>
  );

  const ListingCard = ({ listing }: { listing: BeatListing }) => {
    const isOwn = profile?.id === listing.seller_id;
    const canBuy = !isOwn && (listing.price_coins ?? 0) > 0;
    return (
      <div className="bg-theme-surface/50 border border-theme-border rounded-2xl overflow-hidden glass-surface transition-all hover:border-theme-primary/40">
        <div className="relative h-32 flex items-center justify-center bg-gradient-to-br from-theme-primary/20 to-theme-accent/20">
          {listing.beat?.cover_url ? (
            <img src={listing.beat.cover_url} alt={listing.beat.title} className="w-full h-full object-cover" />
          ) : (
            <Music className="w-12 h-12 text-theme-primary/60" />
          )}
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-theme-surface/80 text-theme-muted text-xs rounded-full">
            {listing.beat?.bpm ?? 0} BPM
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <h3 className="text-theme-text font-bold truncate">{listing.beat?.title ?? t('Без названия')}</h3>
            <div className="flex items-center gap-2 mt-1">
              {listing.beat?.genre && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-theme-surface2 text-theme-muted">{listing.beat.genre}</span>
              )}
              <span className="text-xs text-theme-muted">{listing.beat?.play_count ?? 0} {t('прослуш.')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {listing.seller?.avatar_url ? (
              <img src={listing.seller.avatar_url} alt={listing.seller.username} className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-theme-primary/30 flex items-center justify-center text-xs text-theme-text">
                {listing.seller?.username?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <span className="text-sm text-theme-muted truncate">{listing.seller?.username ?? t('Неизвестно')}</span>
          </div>

          <PriceTag coins={listing.price_coins} rub={listing.price_rub} />

          {canBuy && (
            <button
              onClick={() => handleBuy(listing)}
              disabled={actionLoading === `buy-${listing.id}`}
              className="w-full py-2.5 bg-gradient-to-r from-theme-warning to-theme-accent text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading === `buy-${listing.id}` ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  {t('Купить за')} {listing.price_coins}
                </>
              )}
            </button>
          )}
          {isOwn && (
            <div className="w-full py-2.5 bg-theme-surface2 text-theme-muted rounded-xl text-sm text-center">
              {t('Ваше объявление')}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <Store className="w-6 h-6 text-theme-primary" />
            {t('Маркет битов')}
          </h1>
          <p className="text-theme-muted text-sm mt-1">{t('Покупайте и продавайте биты за монеты и рубли')}</p>
        </div>
        <div className="flex items-center gap-3 bg-theme-surface/50 border border-theme-border rounded-2xl px-5 py-3 glass-surface">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-theme-warning to-theme-accent flex items-center justify-center">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-theme-muted text-xs uppercase tracking-wider">{t('Ваш баланс')}</p>
            <p className="text-xl font-bold text-theme-text">{profile?.coins ?? 0} {t('монет')}</p>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl p-4 flex items-center gap-3 border ${
            message.type === 'success'
              ? 'bg-theme-success/10 border-theme-success/30 text-theme-success'
              : 'bg-theme-danger/10 border-theme-danger/30 text-theme-danger'
          }`}
        >
          {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <TabButton id="browse" label="Витрина" icon={ShoppingBag} />
        <TabButton id="sell" label="Продать бит" icon={Plus} />
        <TabButton id="mine" label="Мои объявления" icon={TrendingUp} />
      </div>

      {/* BROWSE */}
      {tab === 'browse' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Поиск по названию или продавцу...')}
                className="w-full pl-10 pr-4 py-2.5 bg-theme-surface/50 border border-theme-border rounded-xl text-theme-text placeholder:text-theme-muted focus:outline-none focus:border-theme-primary"
              />
            </div>
            <select
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              className="px-4 py-2.5 bg-theme-surface/50 border border-theme-border rounded-xl text-theme-text focus:outline-none focus:border-theme-primary"
            >
              <option value="all">{t('Все жанры')}</option>
              {genres.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-theme-primary animate-spin" />
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center glass-surface">
              <Music className="w-12 h-12 text-theme-muted mx-auto mb-3" />
              <p className="text-theme-muted">{t('Битов по запросу не найдено')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredListings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* SELL */}
      {tab === 'sell' && (
        <div className="space-y-4">
          {!showSellForm ? (
            <button
              onClick={() => setShowSellForm(true)}
              className="w-full py-3 bg-theme-primary text-white rounded-xl font-medium hover:bg-theme-primary-hover transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {t('Выставить бит на продажу')}
            </button>
          ) : (
            <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-6 glass-surface space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-theme-text font-bold text-lg">{t('Новое объявление')}</h2>
                <button onClick={() => setShowSellForm(false)} className="text-theme-muted hover:text-theme-text">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-sm text-theme-muted mb-2">{t('Выберите бит')}</label>
                {myBeats.length === 0 ? (
                  <p className="text-theme-muted text-sm">{t('У вас пока нет битов. Создайте бит в композиторе.')}</p>
                ) : (
                  <select
                    value={selectedBeatId}
                    onChange={(e) => setSelectedBeatId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-theme-surface/50 border border-theme-border rounded-xl text-theme-text focus:outline-none focus:border-theme-primary"
                  >
                    <option value="">— {t('Выберите')} —</option>
                    {myBeats.map((b) => (
                      <option key={b.id} value={b.id}>{b.title} ({b.genre})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-theme-muted mb-2">{t('Цена в монетах')}</label>
                  <div className="relative">
                    <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-warning" />
                    <input
                      type="number"
                      min="0"
                      value={priceCoins}
                      onChange={(e) => setPriceCoins(e.target.value)}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 bg-theme-surface/50 border border-theme-border rounded-xl text-theme-text placeholder:text-theme-muted focus:outline-none focus:border-theme-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-theme-muted mb-2">{t('Цена в рублях')}</label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-primary" />
                    <input
                      type="number"
                      min="0"
                      value={priceRub}
                      onChange={(e) => setPriceRub(e.target.value)}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 bg-theme-surface/50 border border-theme-border rounded-xl text-theme-text placeholder:text-theme-muted focus:outline-none focus:border-theme-primary"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-theme-muted">
                {t('Комиссия площадки — 15% с каждой продажи. Например, при цене 100 монет продавец получит 85.')}
              </p>

              <button
                onClick={handleCreateListing}
                disabled={actionLoading === 'create' || myBeats.length === 0}
                className="w-full py-3 bg-theme-primary text-white rounded-xl font-medium hover:bg-theme-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === 'create' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> {t('Опубликовать')}</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* MINE */}
      {tab === 'mine' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-theme-primary animate-spin" />
            </div>
          ) : myListings.length === 0 ? (
            <div className="bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center glass-surface">
              <Store className="w-12 h-12 text-theme-muted mx-auto mb-3" />
              <p className="text-theme-muted">{t('У вас нет объявлений')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myListings.map((l) => (
                <div key={l.id} className="bg-theme-surface/50 border border-theme-border rounded-2xl p-4 glass-surface flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-theme-primary/20 to-theme-accent/20 flex items-center justify-center flex-shrink-0">
                    {l.beat?.cover_url ? (
                      <img src={l.beat.cover_url} alt="" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <Music className="w-6 h-6 text-theme-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-theme-text font-bold truncate">{l.beat?.title ?? t('Без названия')}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className={`text-xs font-medium ${STATUS_COLORS[l.status]}`}>{t(STATUS_LABELS[l.status])}</span>
                      {l.beat?.genre && <span className="text-xs text-theme-muted">• {l.beat.genre}</span>}
                      {l.status === 'sold' && l.sold_at && (
                        <span className="text-xs text-theme-muted">
                          • {t('продано')} {new Date(l.sold_at).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <PriceTag coins={l.price_coins} rub={l.price_rub} />
                    {l.status === 'active' && (
                      <button
                        onClick={() => handleDelist(l.id)}
                        disabled={actionLoading === `delist-${l.id}`}
                        className="px-3 py-1.5 bg-theme-surface2 text-theme-muted rounded-lg text-sm hover:text-theme-danger transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {actionLoading === `delist-${l.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <><X className="w-4 h-4" /> {t('Снять')}</>}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
