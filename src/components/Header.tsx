import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, xpProgress } from '@/lib/supabase';
import { useTheme, THEMES, type ThemeId, type ThemeIconName } from '@/context/ThemeContext';
import { LOCALES, useLocale } from '@/context/LocaleContext';
import { type Page } from '@/components/Sidebar';
import {
  Music,
  Moon,
  Sun,
  Leaf,
  Flame,
  Star,
  Globe,
  ChevronDown,
  LogOut,
  Crown,
  Check,
  Gem,
  Plus,
} from 'lucide-react';

const THEME_ICONS: Record<ThemeIconName, typeof Moon> = {
  moon: Moon,
  sun: Sun,
  leaf: Leaf,
  fire: Flame,
  star: Star,
};

export default function Header({
  setPage,
  onToggleSidebar,
  className = '',
}: {
  setPage: (p: Page) => void;
  onToggleSidebar?: () => void;
  className?: string;
}) {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentTheme = THEMES.find((tm) => tm.id === theme);
  const CurrentThemeIcon = currentTheme ? THEME_ICONS[currentTheme.icon] : Moon;
  const progress = profile ? xpProgress(profile.xp) : null;
  const currentLocale = LOCALES.find((l) => l.id === locale);

  const handleThemeSelect = (id: ThemeId) => {
    setTheme(id);
    setThemeOpen(false);
  };

  return (
    <header className={`app-header ${className}`}>
      <div className="header-left">
        <button
          className="lg:hidden p-2 text-theme-muted hover:text-theme-text transition-colors"
          onClick={onToggleSidebar}
          aria-label="Menu"
        >
          <Music className="w-5 h-5" />
        </button>
        <div className="logo">
          <span className="logo-badge" role="img" aria-label="Soundscape" />
        </div>

        {/* Theme dropdown */}
        <div ref={themeRef} className={`dropdown ${themeOpen ? 'open' : ''}`}>
          <button
            className="dropdown-trigger theme-trigger"
            onClick={() => { setThemeOpen(!themeOpen); setLangOpen(false); }}
            title={t('Сменить тему')}
            aria-label={t('Сменить тему')}
          >
            <CurrentThemeIcon className="w-[18px] h-[18px]" />
          </button>
          {themeOpen && (
            <div className="dropdown-menu dropdown-menu--start">
              {THEMES.map((tm) => {
                const Icon = THEME_ICONS[tm.icon];
                return (
                  <button
                    key={tm.id}
                    className={`dropdown-item ${theme === tm.id ? 'active' : ''}`}
                    onClick={() => handleThemeSelect(tm.id)}
                  >
                    <Icon className="w-4 h-4" />
                    {tm.name}
                    {theme === tm.id && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="header-right">
        {/* Language dropdown */}
        <div ref={langRef} className={`dropdown ${langOpen ? 'open' : ''}`}>
          <button
            className="dropdown-trigger lang-trigger"
            onClick={() => { setLangOpen(!langOpen); setThemeOpen(false); }}
          >
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">{currentLocale?.nativeName}</span>
            <ChevronDown className={`w-2.5 h-2.5 arrow ${langOpen ? 'rotate-180' : ''} transition-transform`} />
          </button>
          {langOpen && (
            <div className="dropdown-menu">
              {LOCALES.map((l) => (
                <button
                  key={l.id}
                  className={`dropdown-item ${locale === l.id ? 'active' : ''}`}
                  onClick={() => { setLocale(l.id); setLangOpen(false); }}
                >
                  {l.nativeName}
                  {locale === l.id && <Check className="w-3.5 h-3.5 ml-auto" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Balance */}
        {profile && (
          <div className="balance-pill balance-pill--donate">
            <Gem className="w-3.5 h-3.5" />
            {profile.donate_coins ?? 0}
            <button
              className="donate-add-btn"
              onClick={() => setPage('shop')}
              title={t('Купить донат-монеты')}
              aria-label={t('Купить донат-монеты')}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
        {profile && (
          <div className="balance-pill">
            <span className="coin coin-sm" />
            {profile.coins}
          </div>
        )}

        {/* Level widget */}
        {profile && progress && (
          <div className="level-widget">
            <div className="level-header">
              <span className="level-title">
                <Star className="w-3.5 h-3.5" fill="currentColor" />
                LVL {profile.level}
              </span>
              <span className="level-xp">{progress.current}/{progress.needed}</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {/* Profile */}
        {profile && (
          <button
            className="user-profile-btn"
            onClick={() => setPage('profile')}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="user-avatar object-cover" />
            ) : (
              <div className="user-avatar flex items-center justify-center font-bold text-sm" style={{ background: 'var(--space-4)' }}>
                {profile.username?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <span className="user-name hidden md:inline">{profile.username}</span>
            {profile.is_premium && <Crown className="w-3 h-3 user-crown" fill="currentColor" />}
          </button>
        )}

        {/* Logout */}
        <button
          className="logout-btn-icon"
          onClick={signOut}
          title={t('Выйти из космоса')}
          aria-label={t('Выйти из космоса')}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
