import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import { Loader2, User, Mail, ShieldCheck, Sparkles, TrendingUp, Users, Crown, Music2 } from 'lucide-react';
import LegalRulesModal from '@/components/LegalRulesModal';

export default function AuthScreen() {
  const { signIn, signUp, signInGuest } = useAuth();
  const { t } = useLocale();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && !agreed) {
      setError(t('Чтобы зарегистрироваться, согласитесь с правилами сервиса.'));
      return;
    }
    setLoading(true);
    const result =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, username);
    if (result.error) {
      setError(result.error || t('Ошибка регистрации. Проверьте email и пароль.'));
      setLoading(false);
    } else if (mode === 'signup') {
      setSuccess(true);
      setLoading(false);
    } else {
      setTimeout(() => setLoading(false), 5000);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + '/reset-password',
    });
    setResetLoading(false);
    if (resetError) {
      setError(resetError.message || t('Не удалось отправить письмо. Проверьте email.'));
    } else {
      setResetSent(true);
    }
  };

  const features = [
    { icon: Sparkles, label: t('Создавай биты и треки') },
    { icon: Users, label: t('Общайся и находи друзей') },
    { icon: TrendingUp, label: t('Расти в рейтинге') },
    { icon: ShieldCheck, label: t('Играй в аркады') },
  ];

  const floatingNotes = [
    { left: '15%', top: '20%', delay: '0s', size: 24 },
    { left: '80%', top: '15%', delay: '2s', size: 20 },
    { left: '70%', top: '70%', delay: '1s', size: 28 },
    { left: '25%', top: '75%', delay: '3s', size: 22 },
  ];

  const inputClass = "w-full px-4 py-4 bg-[#0F1830] border border-[#1E293B] rounded-[16px] text-white text-[15px] placeholder:text-[#64748B] focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_4px_rgba(59,130,246,0.15)] transition-all";

  return (
    <div className="min-h-screen bg-[#0B132B] font-sans flex items-center justify-center p-4 relative overflow-hidden">
      {showRules && <LegalRulesModal onClose={() => setShowRules(false)} />}
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] z-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, rgba(139,92,246,0.1) 40%, transparent 70%)' }}
        />
        {/* Floating music notes */}
        {floatingNotes.map((note, i) => (
          <div
            key={i}
            className="absolute text-theme-primary/10"
            style={{
              left: note.left,
              top: note.top,
              animation: `float-note 6s ease-in-out infinite`,
              animationDelay: note.delay,
            }}
          >
            <Music2 size={note.size} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes float-note {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.15; }
          50% { transform: translateY(-20px) rotate(10deg); opacity: 0.25; }
        }
      `}</style>

      <div className="relative w-full max-w-md z-10">
        {/* Logo + heading */}
        <div className="text-center mb-8 flex flex-col items-center">
          <img src="/images/logo.png" alt="Soundscape" className="w-48 h-48 mb-5 object-contain" />
          <p className="text-[16px] text-[#94A3B8] mt-2.5 max-w-[90%]">
            {t('Музыкальная социальная платформа — создавай, делись, играй')}
          </p>
          <div className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-[20px] text-sm font-semibold text-[#F59E0B] bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)]">
            <Crown className="w-3.5 h-3.5" />
            {t('Premium 259₽/мес')}
          </div>
        </div>

        {/* Feature pills — filled style, no border, left-aligned */}
        <div className="grid grid-cols-2 gap-[14px] mb-8">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-[#101A33] transition-all hover:bg-[#152040] hover:-translate-y-0.5">
              <div className="w-9 h-9 rounded-[10px] bg-[rgba(59,130,246,0.15)] flex items-center justify-center shrink-0">
                <f.icon className="w-4 h-4 text-[#60A5FA]" />
              </div>
              <span className="text-sm text-[#E2E8F0] font-medium leading-tight pt-1.5">{f.label}</span>
            </div>
          ))}
        </div>

        {/* Main card — elevation effect */}
        <div className="bg-[#151F3C] border border-[rgba(255,255,255,0.05)] rounded-3xl p-9 relative overflow-hidden" style={{ boxShadow: '0 0 30px rgba(99,102,241,0.18), 0 25px 50px rgba(0,0,0,0.55)' }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #3B82F6, #6366F1, #8B5CF6)' }} />

          {resetMode ? (
            <div className="space-y-4 relative">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-theme-primary/15 mb-3">
                  <Mail className="w-7 h-7 text-theme-primary" />
                </div>
                <h2 className="text-lg font-bold text-theme-text">{t('Восстановление пароля')}</h2>
                <p className="text-sm text-theme-muted mt-1">{t('Введите email — мы пришлём ссылку для сброса')}</p>
              </div>
              {resetSent ? (
                <div className="space-y-3">
                  <div className="text-sm text-theme-success bg-theme-success/10 border border-theme-success/20 rounded-lg px-4 py-3 text-center">
                    {t('Письмо отправлено! Проверьте почту и перейдите по ссылке из письма.')}
                  </div>
                  <div className="text-xs text-theme-muted bg-theme-surface2 rounded-lg px-4 py-3 text-center">
                    {t('Если письмо не приходит — проверьте папку «Спам». Ссылка действует ограниченное время; если она устарела, запросите новую.')}
                  </div>
                  <button
                    onClick={() => { setResetSent(false); setError(null); }}
                    className="w-full text-sm text-theme-muted hover:text-theme-text transition-colors"
                  >
                    {t('Отправить письмо снова')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-[14px] font-medium text-[#94A3B8] mb-2">{t('Эл. почта')}</label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      className={inputClass}
                      placeholder="you@example.com"
                    />
                  </div>
                  {error && (
                    <div className="text-sm text-theme-danger bg-theme-danger/10 border border-theme-danger/20 rounded-lg px-4 py-2.5">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-4 bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-white rounded-[16px] font-bold text-[16px] hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ boxShadow: '0 6px 20px rgba(59,130,246,0.4)' }}
                  >
                    {resetLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t('Отправить ссылку')}
                  </button>
                </form>
              )}
              <button
                onClick={() => { setResetMode(false); setError(null); setResetSent(false); }}
                className="w-full text-sm text-theme-muted hover:text-theme-text transition-colors"
              >
                {t('Вернуться ко входу')}
              </button>
            </div>
          ) : (
            <>
          <div className="flex mb-6 p-[5px] bg-[#0F1830] rounded-[14px] relative">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-3 rounded-[10px] text-[15px] font-semibold transition-all ${
                mode === 'signin'
                  ? 'bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-white'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
              style={mode === 'signin' ? { boxShadow: '0 4px 15px rgba(59,130,246,0.4)' } : undefined}
            >
              {t('Войти')}
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-3 rounded-[10px] text-[15px] font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-white'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
              style={mode === 'signup' ? { boxShadow: '0 4px 15px rgba(59,130,246,0.4)' } : undefined}
            >
              {t('Регистрация')}
            </button>
          </div>

          {success && (
            <div className="space-y-3 mb-4">
              <div className="text-sm text-theme-success bg-theme-success/10 border border-theme-success/20 rounded-lg px-4 py-3 text-center">
                {t('Аккаунт создан! Мы отправили письмо со ссылкой для активации на ваш email.')}
              </div>
              <div className="text-xs text-theme-muted bg-theme-surface2 rounded-lg px-4 py-3 text-center">
                {t('Проверьте папку «Входящие» и «Спам». Перейдите по ссылке из письма, чтобы активировать аккаунт, затем войдите.')}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={signInGuest}
            className="w-full bg-[rgba(59,130,246,0.1)] border-2 border-[#60A5FA] text-white font-bold text-[15px] rounded-[14px] py-4 flex items-center justify-center gap-2.5 transition-all hover:bg-[rgba(59,130,246,0.2)] hover:-translate-y-px"
            style={{ boxShadow: '0 0 15px rgba(96,165,250,0.2), inset 0 0 10px rgba(96,165,250,0.05)' }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 25px rgba(96,165,250,0.4), inset 0 0 15px rgba(96,165,250,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 15px rgba(96,165,250,0.2), inset 0 0 10px rgba(96,165,250,0.05)'; }}
          >
            <User className="w-4 h-4 text-[#60A5FA]" />
            {t('Войти как гость')}
          </button>
          <p className="block text-center text-[13px] text-[#64748B] mt-2 mb-5">{t('Без регистрации. Ознакомьтесь с интерфейсом')}</p>

          <div className="flex items-center my-5">
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
            <span className="px-4 text-[13px] text-[#64748B] font-medium">{t('или войти по почте')}</span>
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 relative">
            {mode === 'signup' && (
              <div>
                <label className="block text-[14px] font-medium text-[#94A3B8] mb-2">{t('Имя пользователя')}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                  required
                  className={inputClass}
                  placeholder={t('ваш_никнейм')}
                />
              </div>
            )}
            <div>
              <label className="block text-[14px] font-medium text-[#94A3B8] mb-2">{t('Эл. почта')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                enterKeyHint="next"
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[#94A3B8] mb-2">{t('Пароль')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                enterKeyHint="go"
                className={inputClass}
                placeholder="••••••••"
              />
              {mode === 'signup' && (
                <p className="text-[11px] text-theme-muted mt-1.5">{t('Минимум 6 символов. Не используйте простые пароли.')}</p>
              )}
            </div>

            {mode === 'signup' && (
              <label className="flex items-start gap-3 cursor-pointer text-[14px] text-[#94A3B8] leading-relaxed">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#3B82F6]"
                />
                <span>
                  {t('Я ознакомился и согласен с')}{' '}
                  <button
                    type="button"
                    onClick={() => setShowRules(true)}
                    className="text-[#60A5FA] underline underline-offset-2 hover:text-white transition-colors"
                  >
                    {t('правилами сервиса')}
                  </button>
                </span>
              </label>
            )}

            {error && (
              <div className="text-sm text-theme-danger bg-theme-danger/10 border border-theme-danger/20 rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'signup' && !agreed)}
              className="w-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-white font-bold text-[16px] p-4 rounded-[16px] hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ boxShadow: '0 6px 20px rgba(59,130,246,0.4)' }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.boxShadow = '0 10px 25px rgba(59,130,246,0.5)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(59,130,246,0.4)'; }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'signin' ? t('Войти') : t('Создать аккаунт')}
            </button>

          </form>

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => { setResetMode(true); setError(null); }}
              className="block w-full text-center text-[14px] text-[#94A3B8] hover:text-white transition-colors mt-5 font-medium"
            >
              {t('Забыли пароль?')}
            </button>
          )}
            </>
          )}
        </div>

        <p className="text-center text-[14px] text-[#475569] mt-9 max-w-[90%] mx-auto leading-relaxed">
          {t('Создавай биты, записывай аудио, общайся, играй и зарабатывай XP')}
        </p>
      </div>
    </div>
  );
}
