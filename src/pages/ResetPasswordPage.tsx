import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/context/LocaleContext';
import { Music, Loader2, Lock, CheckCircle2, XCircle } from 'lucide-react';
import type { Page } from '@/components/Sidebar';

type Props = {
  setPage: (p: Page) => void;
  onGoToSignIn: () => void;
};

export default function ResetPasswordPage({ setPage, onGoToSignIn }: Props) {
  const { t } = useLocale();
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase delivers the reset link either as a URL fragment
    // (#access_token=... for the implicit flow) or as a ?code=... query
    // parameter (PKCE). Absence of both means the link is broken or the
    // user opened the page directly — treat it as invalid.
    const hash = window.location.hash;
    const hasSession = hash.includes('access_token') || new URLSearchParams(window.location.search).has('code');
    if (hasSession) {
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setLinkState('valid');
      });
      // The fragment may already be consumed by the client initialization;
      // if a session exists we are good regardless of the event.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setLinkState('valid');
        else setLinkState('invalid');
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setLinkState(data.session ? 'valid' : 'invalid');
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError(t('Пароль должен быть не короче 6 символов'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('Пароли не совпадают'));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      const msg = updateError.message || '';
      if (msg.includes('session') || msg.includes('auth') || msg.includes('401')) {
        setError(t('Ссылка устарела. Запросите новое письмо на странице входа.'));
      } else {
        setError(updateError.message || t('Не удалось изменить пароль. Попробуйте ещё раз.'));
      }
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-theme-success/20 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-theme-success" />
          </div>
          <h1 className="text-xl font-bold text-theme-text">{t('Пароль изменён')}</h1>
          <p className="text-sm text-theme-muted">{t('Пароль успешно обновлён. Теперь войдите с новым паролем.')}</p>
          <button
            onClick={() => { supabase.auth.signOut(); onGoToSignIn(); }}
            className="w-full py-3 bg-gradient-to-r from-theme-primary to-theme-accent text-white rounded-xl font-medium text-sm hover:shadow-lg transition-all"
          >
            {t('Войти с новым паролем')}
          </button>
        </div>
      </div>
    );
  }

  if (linkState === 'checking') {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-theme-primary animate-spin" />
      </div>
    );
  }

  if (linkState === 'invalid') {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-theme-danger/20 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-theme-danger" />
          </div>
          <h1 className="text-xl font-bold text-theme-text">{t('Ссылка недействительна или устарела')}</h1>
          <p className="text-sm text-theme-muted">
            {t('Ссылки для сброса пароля работают один раз и ограниченное время. Запросите новое письмо на странице входа — и проверьте папку «Спам», если оно не пришло.')}
          </p>
          <button
            onClick={onGoToSignIn}
            className="w-full py-3 bg-gradient-to-r from-theme-primary to-theme-accent text-white rounded-xl font-medium text-sm hover:shadow-lg transition-all"
          >
            {t('На страницу входа')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(var(--color-primary-rgb), 0.1)' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-theme-primary to-theme-accent mb-4 shadow-lg">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-theme-text">{t('Новый пароль')}</h1>
          <p className="text-theme-muted mt-2 text-sm">{t('Придумайте новый пароль для вашего аккаунта')}</p>
        </div>

        <div className="bg-theme-surface/80 backdrop-blur-xl border border-theme-border rounded-2xl p-8 shadow-2xl glass-surface">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-theme-muted mb-1.5">{t('Новый пароль')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary focus:ring-1 focus:ring-theme-primary transition-colors"
                placeholder="••••••••"
              />
              <p className="text-[11px] text-theme-muted mt-1.5">{t('Минимум 6 символов')}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-muted mb-1.5">{t('Повторите пароль')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary focus:ring-1 focus:ring-theme-primary transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-sm text-theme-danger bg-theme-danger/10 border border-theme-danger/20 rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-theme-primary to-theme-accent text-white rounded-lg font-medium text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('Изменить пароль')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-theme-muted mt-6 flex items-center justify-center gap-1.5">
          <Music className="w-3.5 h-3.5" />
          Soundscape Pro
        </p>
      </div>
    </div>
  );
}
