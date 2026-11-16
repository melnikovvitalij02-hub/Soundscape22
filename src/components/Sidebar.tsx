import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  Music,
  Drum,
  Mic,
  BarChart3,
  MessageCircle,
  Gamepad2,
  User,
  Coins,
  Menu,
  X,
  MessageSquare,
  Newspaper,
  Info,
  Gift,
  Calendar,
  Crown,
  Headphones as HeadphonesIcon,
  Sparkles,
  TrendingUp,
  Orbit,
  FileMusic,
  ChevronLeft,
  Brain,
  CreditCard,
  ShoppingBag,
  Rocket,
  Flame,
  UserCheck,
  Scale,
} from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

export type Page =
  | 'home'
  | 'beat'
  | 'studio'
  | 'chat'
  | 'messages'
  | 'trending'
  | 'charts'
  | 'games'
  | 'profile'
  | 'feed'
  | 'clans'
  | 'coach'
  | 'subscription'
  | 'about'
  | 'faq'
  | 'seasonal'
  | 'daily'
  | 'payment-success'
  | 'reset-password'
  | 'score'
  | 'shop';

const navGroups: { label: string; icon: typeof Rocket; items: { id: Page; label: string; icon: typeof Music }[] }[] = [
  {
    label: 'Орбита',
    icon: Orbit,
    items: [
      { id: 'home', label: 'Главная', icon: Music },
      { id: 'charts', label: 'Чарты', icon: BarChart3 },
    ],
  },
  {
    label: 'Творчество',
    icon: Sparkles,
    items: [
      { id: 'beat', label: 'Бит-секвенсор', icon: Drum },
      { id: 'feed', label: 'Лента битов', icon: Newspaper },
      //{ id: 'studio', label: 'Текст и вокал', icon: Mic },
      { id: 'coach', label: 'ИИ Тренер', icon: Brain },
      { id: 'score', label: 'Нотный редактор', icon: FileMusic },
      { id: 'trending', label: 'Горящие треки', icon: Flame },
    ],
  },
  {
    label: 'Сектор',
    icon: MessageCircle,
    items: [
      { id: 'chat', label: 'Чат', icon: MessageCircle },
      { id: 'messages', label: 'Сообщения', icon: MessageSquare },
    ],
  },
  {
    label: 'Сообщество',
    icon: Crown,
    items: [
      { id: 'clans', label: 'Кланы', icon: Crown },
    ],
  },
  {
    label: 'Игры',
    icon: Gamepad2,
    items: [
      { id: 'games', label: 'Аркады', icon: Gamepad2 },
    ],
  },
  {
    label: 'Бонусы',
    icon: Gift,
    items: [
      { id: 'daily', label: 'Награды', icon: Gift },
      { id: 'shop', label: 'Магазин', icon: ShoppingBag },
      { id: 'seasonal', label: 'События', icon: Calendar },
      { id: 'subscription', label: 'Premium', icon: CreditCard },
      
    ],
  },
  {
    label: 'FAQ',
    icon: UserCheck,
    items: [
      { id: 'about', label: 'О нас', icon: Info },
      { id: 'faq', label: 'Юридический FAQ', icon: Scale },
    ]
  }
];

const cosmicStars = [
  { top: '12%', left: '20%', size: 2, delay: '0s' },
  { top: '25%', left: '70%', size: 1, delay: '1.5s' },
  { top: '45%', left: '15%', size: 2, delay: '0.8s' },
  { top: '60%', left: '80%', size: 1, delay: '2.2s' },
  { top: '75%', left: '40%', size: 2, delay: '1s' },
  { top: '85%', left: '65%', size: 1, delay: '3s' },
  { top: '35%', left: '50%', size: 1, delay: '0.4s' },
  { top: '90%', left: '25%', size: 1, delay: '2.5s' },
];

export default function Sidebar({
  page,
  setPage,
  onCollapse,
  mobileOpen,
  setMobileOpen,
}: {
  page: Page;
  setPage: (p: Page) => void;
  onCollapse?: (collapsed: boolean) => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    onCollapse?.(collapsed);
  }, [collapsed, onCollapse]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('chat-unread')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `user_id=neq.${profile.id}`,
        },
        () => {
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const handleNav = (p: Page) => {
    setPage(p);
    setMobileOpen?.(false);
    if (p === 'chat') setUnreadCount(0);
  };

  const navContent = (
    <nav className="flex-1 px-3 py-3 space-y-5 overflow-y-auto cosmic-nav-scroll">
      <div className="cosmic-sidebar-stars" aria-hidden="true">
        {cosmicStars.map((star, i) => (
          <span
            key={i}
            className="cosmic-sidebar-star"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              animationDelay: star.delay,
            }}
          />
        ))}
      </div>

      {navGroups.map((group) => {
        const GroupIcon = group.icon;
        return (
          <div key={group.label} className="relative">
            <div className="flex items-center gap-2 px-3 mb-2">
              <GroupIcon className="w-3.5 h-3.5 text-theme-primary/50" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-theme-muted/50">{t(group.label as Parameters<typeof t>[0])}</p>
              <div className="flex-1 h-px bg-gradient-to-r from-theme-border/50 to-transparent" />
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = page === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`cosmic-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group ${
                      active
                        ? 'cosmic-nav-active'
                        : 'text-theme-muted hover:text-theme-text hover:bg-theme-surface2/60'
                    }`}
                  >
                    {active && <span className="cosmic-nav-indicator" />}
                    <span className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                      active
                        ? 'bg-gradient-to-br from-theme-primary/30 to-theme-accent/20 text-theme-primary'
                        : 'text-theme-muted group-hover:text-theme-text'
                    }`}>
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                    </span>
                    <span className="flex-1 text-left relative z-10">{t(item.label as Parameters<typeof t>[0])}</span>
                    {item.id === 'chat' && unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-theme-danger text-white rounded-full min-w-[20px] text-center relative z-10 cosmic-notification-pulse">
                        {unreadCount}
                      </span>
                    )}
                    {active && (
                      <span className="cosmic-nav-glow" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const collapsedNavContent = (
    <div className="flex-1 flex flex-col items-center py-3 space-y-1 overflow-y-auto cosmic-nav-scroll">
      {navGroups.map((group) =>
        group.items.map((item) => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              title={t(item.label as Parameters<typeof t>[0])}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                active
                  ? 'bg-gradient-to-br from-theme-primary/30 to-theme-accent/20 text-theme-primary'
                  : 'text-theme-muted hover:text-theme-text hover:bg-theme-surface2/60'
              }`}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setMobileOpen?.(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 cosmic-sidebar flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-theme-border/50 relative z-10 cosmic-sidebar-header">
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-theme-primary via-theme-accent to-theme-primary flex items-center justify-center shadow-lg cosmic-logo-glow">
              <Music className="w-5 h-5 text-white relative z-10" />
            </div>
            <span className="text-theme-text font-bold text-sm">Soundscape</span>
          </div>
          <button onClick={() => setMobileOpen?.(false)} className="p-2 text-theme-muted hover:text-theme-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        {navContent}
      </aside>

      {/* Desktop sidebar — collapsible with toggle button */}
      <aside className={`sidebar hidden lg:flex ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-nav">
          {collapsed ? collapsedNavContent : navContent}
        </div>
        <div className="sidebar-toggle-wrapper">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? t('Развернуть меню') : t('Свернуть меню')}
            aria-label={collapsed ? t('Развернуть меню') : t('Свернуть меню')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
