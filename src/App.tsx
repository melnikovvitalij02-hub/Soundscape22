import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useLocale } from '@/context/LocaleContext';
import AuthScreen from '@/components/AuthScreen';
import Sidebar, { type Page } from '@/components/Sidebar';
import Header from '@/components/Header';
import HomePage from '@/pages/HomePage';
import BeatComposerPage from '@/pages/BeatComposerPage';
import AIStudioPage from '@/pages/AIStudioPage';
import ChordsPage from '@/pages/CordsPage';
import ScoreEditorPage from '@/pages/ScoreEditorPage';
import ChatPage from '@/pages/ChatPage';
import MessagesPage from '@/pages/MessagesPage';
import GamesPage from '@/pages/GamesPage';
import ProfilePage from '@/pages/ProfilePage';
import BeatsFeedPage from '@/pages/BeatsFeedPage';
import ClansPage from '@/pages/ClansPage';
import AICoachPage from '@/pages/AICoachPage';
import SubscriptionPage from '@/pages/SubscriptionPage';
import AboutPage from '@/pages/AboutPage';
import FaqPage from '@/pages/FaqPage';
import SeasonalEventsPage from '@/pages/SeasonalEventsPage';
import DailyRewardsPage from '@/pages/DailyRewardsPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import ShopPage from '@/pages/ShopPage';
import TrendingPage from '@/pages/TrendingPage';
import ChartsPage from '@/pages/ChartsPage';
import MiniPlayer from '@/components/MiniPlayer';
import ActivityTracker from '@/components/ActivityTracker';
import { hit as metrikaHit, reachGoal } from '@/lib/metrika';

import { ArrowRight, Check, Loader2, Sparkles, X } from 'lucide-react';

const ONBOARDING_STEPS: { title: string; description: string; page: Page }[] = [
  { title: 'Создай свой первый бит', description: 'Открой секвенсор и собери ритм из инструментов.', page: 'beat' },
  { title: 'Попробуй ИИ-студию', description: 'Сгенерируй идею песни и развивай её дальше.', page: 'studio' },
  { title: 'Заработай монеты в аркадах', description: 'Играй, получай награды и открывай новые возможности.', page: 'games' },
  { title: 'Найди друзей в чате', description: 'Общайся с другими участниками Soundscape.', page: 'chat' },
];

function AppContent() {
  const { session, profile, loading, isGuest } = useAuth();
  const { t } = useLocale();
  const [page, setPage] = useState<Page>('home');
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [messageTargetUserId, setMessageTargetUserId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollRef = useRef(0);
  const mainRef = useRef<HTMLElement | null>(null);
  const firstPageRenderRef = useRef(true);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(() =>
    localStorage.getItem('soundscape-onboarding-complete') ? null : 0
  );

  // Detect payment-success or reset-password from URL path (YooMoney redirect)
  useEffect(() => {
    const path = window.location.pathname;
    const isPaymentSuccess = path === '/payment-success' || path === '/payment-success/';
    const isResetPassword = path === '/reset-password' || path === '/reset-password/';

    if (isPaymentSuccess) {
      setPage('payment-success');
    } else if (isResetPassword) {
      setPage('reset-password');
    } else {
      // Clean URL hash for SPA navigation (only when not on a path-based route)
      const hash = window.location.hash.replace('#', '');
      if (hash) setPage(hash as Page);
    }
  }, []);

  // SPA page view for Yandex Metrika: init already counts the first load,
  // so report a hit only when the in-app page actually changes
  useEffect(() => {
    if (firstPageRenderRef.current) {
      firstPageRenderRef.current = false;
      return;
    }
    metrikaHit(window.location.href);
  }, [page]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const onScroll = () => {
      const y = main.scrollTop;
      if (y < 80) {
        setHeaderVisible(true);
      } else if (y > lastScrollRef.current + 8) {
        setHeaderVisible(false);
      } else if (y < lastScrollRef.current - 8) {
        setHeaderVisible(true);
      }
      lastScrollRef.current = y;
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  const navigateToProfile = (userId: string) => {
    setViewUserId(userId);
    setPage('profile');
  };

  const navigateToMessages = (userId: string) => {
    setMessageTargetUserId(userId);
    setPage('messages');
  };

  const privatePages: Page[] = ['profile', 'payment-success'];
  useEffect(() => {
    if (isGuest && privatePages.includes(page)) {
      setPage('home');
    }
  }, [isGuest, page]);

  if (page === 'reset-password') {
    return <ResetPasswordPage setPage={setPage} onGoToSignIn={() => {
      window.history.replaceState({}, '', '/');
      setPage('home');
    }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-theme-primary animate-spin" />
      </div>
    );
  }

  if (!session && !isGuest) {
    return <AuthScreen />;
  }

  return (
    <div className="app-wrapper bg-theme-bg">
      <Header setPage={setPage} onToggleSidebar={() => setMobileSidebarOpen(true)} className={`app-header ${headerVisible ? '' : 'app-header-hidden'}`} />
      <ActivityTracker />
      <div className="cosmic-page-particles" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="cosmic-particle" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, width: i % 3 === 0 ? 3 : 2, height: i % 3 === 0 ? 3 : 2, animationDelay: `${i * 0.7}s`, animationDuration: `${6 + (i % 4) * 2}s` }} />
        ))}
      </div>
      <div className="app-body">
        <Sidebar page={page} setPage={setPage} onCollapse={setSidebarCollapsed} mobileOpen={mobileSidebarOpen} setMobileOpen={setMobileSidebarOpen} />
      <main ref={mainRef} className={`main-content ${page === 'home' || page === 'about' || page === 'faq' ? '' : 'p-3 sm:p-4 lg:p-6 pb-24'}`}>
          {page === 'home' && <HomePage setPage={setPage} />}
          {page === 'beat' && <BeatComposerPage isActive={page === 'beat'} />}
          {page === 'studio' && <AIStudioPage setPage={setPage} />}
          {page === 'score' && <ScoreEditorPage isActive={page === 'score'} />}
          {page === 'chat' && <ChatPage onNavigateToProfile={navigateToProfile} onNavigateToShop={() => setPage('shop')} onNavigateToMessages={navigateToMessages} />}
          {page === 'messages' && <MessagesPage initialUserId={messageTargetUserId} />}
          {page === 'trending' && <TrendingPage />}
          {page === 'charts' && <ChartsPage />}
          {page === 'cords' && <AIStudioPage />}
          {page === 'cords1' && <CordsPage />}
          {page === 'games' && <GamesPage />}
          {page === 'profile' && <ProfilePage viewUserId={viewUserId} onNavigateToProfile={navigateToProfile} onNavigateToMessages={navigateToMessages} />}
          {page === 'feed' && <BeatsFeedPage setPage={setPage} onNavigateToMessages={navigateToMessages} />}
          {page === 'clans' && <ClansPage />}
          {page === 'coach' && <AICoachPage onExit={() => setPage('home')} />}
          {page === 'subscription' && <SubscriptionPage />}
          {page === 'about' && <AboutPage setPage={setPage} />}
          {page === 'faq' && <FaqPage />}
          {page === 'seasonal' && <SeasonalEventsPage />}
          {page === 'daily' && <DailyRewardsPage />}
          {page === 'payment-success' && <PaymentSuccessPage setPage={setPage} />}
          {page === 'shop' && <ShopPage />}
          {page === 'reset-password' && <ResetPasswordPage setPage={setPage} onGoToSignIn={() => {
            supabase.auth.signOut();
            window.history.replaceState({}, '', '/');
            setPage('home');
          }} />}

      </main>
      </div>
      {onboardingStep !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl border border-theme-border bg-theme-surface p-6 shadow-2xl">
            <button
              onClick={() => {
                localStorage.setItem('soundscape-onboarding-complete', 'true');
                setOnboardingStep(null);
              }}
              className="absolute right-4 top-4 rounded-lg p-2 text-theme-muted transition hover:bg-theme-surface2 hover:text-theme-text"
              aria-label={t('Закрыть обучение')}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-theme-primary-bg text-theme-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-primary">{t('Быстрый старт')}</p>
                <p className="text-sm text-theme-muted">{t('Шаг')} {onboardingStep + 1} {t('из')} {ONBOARDING_STEPS.length}</p>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-theme-text">{t(ONBOARDING_STEPS[onboardingStep].title as Parameters<typeof t>[0])}</h2>
            <p className="mt-2 leading-relaxed text-theme-muted">{t(ONBOARDING_STEPS[onboardingStep].description as Parameters<typeof t>[0])}</p>
            <div className="mt-6 flex gap-1.5">
              {ONBOARDING_STEPS.map((_, index) => (
                <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= onboardingStep ? 'bg-theme-primary' : 'bg-theme-surface2'}`} />
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  localStorage.setItem('soundscape-onboarding-complete', 'true');
                  setOnboardingStep(null);
                }}
                className="text-sm text-theme-muted transition hover:text-theme-text"
              >
                {t('Пропустить')}
              </button>
              <button
                onClick={() => {
                  setPage(ONBOARDING_STEPS[onboardingStep].page);
                  if (onboardingStep === ONBOARDING_STEPS.length - 1) {
                    localStorage.setItem('soundscape-onboarding-complete', 'true');
                    setOnboardingStep(null);
                  } else {
                    setOnboardingStep(onboardingStep + 1);
                  }
                }}
                className="flex items-center gap-2 rounded-xl bg-theme-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-theme-primary-hover"
              >
                {onboardingStep === ONBOARDING_STEPS.length - 1 ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                {onboardingStep === ONBOARDING_STEPS.length - 1 ? t('Начать') : t('Далее')}
              </button>
            </div>
          </div>
        </div>
      )}
      <MiniPlayer />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
