import { useState, type CSSProperties } from 'react';
import type { Page } from '@/components/Sidebar';
import { useLocale } from '@/context/LocaleContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { buildYooMoneyUrl } from '@/components/PremiumButton';
import {
  ArrowRight,
  ArrowDown,
  Music,
  Mic,
  Drum,
  Users,
  Radio,
  Headphones,
  Sparkles,
  Check,
  Zap,
  Shield,
  Gamepad2,
  Send,
} from 'lucide-react';

const TELEGRAM_URL = 'https://t.me/soundscapepro';

const stars = [
  { left: '8%', top: '18%', size: 2, delay: '0s' },
  { left: '17%', top: '32%', size: 3, delay: '1s' },
  { left: '28%', top: '14%', size: 2, delay: '2.5s' },
  { left: '41%', top: '27%', size: 2, delay: '.8s' },
  { left: '55%', top: '11%', size: 3, delay: '1.8s' },
  { left: '68%', top: '24%', size: 2, delay: '3s' },
  { left: '82%', top: '17%', size: 2, delay: '1.2s' },
  { left: '91%', top: '38%', size: 3, delay: '2.1s' },
  { left: '12%', top: '54%', size: 2, delay: '1.5s' },
  { left: '33%', top: '62%', size: 2, delay: '3.3s' },
  { left: '74%', top: '58%', size: 2, delay: '.4s' },
];

const features = [
  {
    icon: Drum,
    title: 'Бит-секвенсор',
    description:
      'Создавай биты прямо в браузере. Полноценная сетка шагов, пресеты инструментов и экспорт в один клик.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Mic,
    title: 'ИИ Студия',
    description:
      'Записывай вокал, миксуй треки и используй нейросетевые эффекты для профессионального звучания.',
    color: 'from-cyan-500 to-blue-500',
  },
  {
    icon: Radio,
    title: 'Прямые эфиры',
    description:
      'Стримь свою музыку в реальном времени. Общайся с слушателями в чате и получай сердечки.',
    color: 'from-red-500 to-orange-500',
  },
  {
    icon: Users,
    title: 'Сообщества',
    description:
      'Объединяйся с единомышленниками по жанрам. Lo-Fi, Трэп, Рок — найди свою музыкальную семью.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Headphones,
    title: 'Чарты и поиск',
    description:
      'Слушай топ-чарты и находи новую музыку. Тысячи треков доступны прямо в браузере.',
    color: 'from-amber-500 to-yellow-500',
  },
  {
    icon: Sparkles,
    title: 'Геймификация',
    description:
      'Получай XP за каждое действие, повышай уровень, открывай ачивки и зарабатывай монеты.',
    color: 'from-pink-500 to-rose-500',
  },
];

const pricingFeatures = [
  'Безлимитные дорожки в секвенсоре',
  'Pro-эффекты: Distortion, Bitcrush, Compressor, EQ, Pan',
  'Экспорт в MIDI и скачивание битов без ограничений',
  'Продажа своих битов за Gem и Coin',
  'Доход Gem за прослушивания ваших битов',
  'Публикация в «Горячие треки» и двойной XP',
];

const subscriptionComparison = [
  { value: '259 ₽', title: 'Всё за месяц', text: 'Все функции Premium и бонусы подписки в одном платёже.' },
  { value: '≈ 1 660', title: 'монет за те же деньги', text: 'Самый выгодный пакет монет — 2 500 за 299 ₽. Но монеты не дают безлимитного создания треков и двойного XP.' },
  { value: 'до 0.5 Gem', title: 'за каждое прослушивание', text: 'Премиум-авторы получают Gem за уникальные секунды прослушивания своих битов.' },
];

export default function AboutPage({ setPage }: { setPage: (p: Page) => void }) {
  const { t } = useLocale();
  const { profile, isGuest } = useAuth();
  const [subChecking, setSubChecking] = useState(false);
  const [subNotice, setSubNotice] = useState<string | null>(null);

  const handleSubscribe = async () => {
    if (isGuest || !profile) {
      setPage('profile');
      return;
    }
    setSubChecking(true);
    setSubNotice(null);
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_premium, premium_expires_at')
        .eq('id', profile.id)
        .maybeSingle();
      const isPremium = !!prof?.is_premium && (!prof.premium_expires_at || new Date(prof.premium_expires_at) > new Date());
      if (isPremium) {
        const exp = prof?.premium_expires_at ? new Date(prof.premium_expires_at).toLocaleDateString('ru-RU') : '';
        setSubNotice(exp ? t('У вас уже активна подписка Premium до') + ' ' + exp : t('У вас уже активна подписка Premium'));
        setSubChecking(false);
        return;
      }
      const label = `subscription_${profile.id}`;
      const { data: payment, error: insertError } = await supabase.from('payments').insert({
        user_id: profile.id,
        amount: 259,
        status: 'pending',
        label,
        payment_type: 'premium',
      }).select('id').maybeSingle();
      if (insertError || !payment) {
        setSubNotice(t('Не удалось начать оплату. Попробуйте ещё раз.'));
        setSubChecking(false);
        return;
      }
      window.location.href = buildYooMoneyUrl(profile.id, payment.id);
    } catch {
      setSubNotice(t('Не удалось начать оплату. Попробуйте ещё раз.'));
      setSubChecking(false);
    }
  };
  return (
    <div className="soundscape-home">
      {/* ===== HERO ===== */}
      <section className="soundscape-hero">
        <div className="soundscape-stars" aria-hidden="true">
          {stars.map((star, index) => (
            <span
              key={index}
              className="soundscape-star"
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
        <div className="soundscape-aurora soundscape-aurora-one" />
        <div className="soundscape-aurora soundscape-aurora-two" />
        <div className="soundscape-orbit soundscape-orbit-one" />
        <div className="soundscape-orbit soundscape-orbit-two" />

        <div className="soundscape-hero-content">
          <div className="soundscape-kicker">
            <span className="soundscape-kicker-line" />
            <span>{t('О платформе')}</span>
          </div>
          <h1>
            Soundscape
            <br />
            <em>Pro</em>
          </h1>
          <p>
            {t('Музыкальная вселенная, где каждый ритм становится историей. Создавай, слушай и делись музыкой в пространстве, созданном для тебя.')}
          </p>
          <div className="soundscape-hero-actions">
            <button className="soundscape-primary-button" onClick={() => setPage('home')}>
              {t('Начать путешествие')}
              <ArrowRight size={16} />
            </button>
            <button className="soundscape-text-button" onClick={() => setPage('trending')}>
              {t('Слушать музыку')}
              <ArrowDown size={15} />
            </button>
          </div>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="soundscape-telegram-banner"
          >
            <Send size={18} />
            <span>
              {t('Следите за обновлениями в нашем Telegram-канале')}
              <strong>t.me/soundscapepro</strong>
            </span>
            <ArrowRight size={14} />
          </a>
        </div>

        <div className="soundscape-vertical-label">SOUNDSCAPE PRO · 2026</div>
        <div className="soundscape-scroll-cue">
          <span>SCROLL TO EXPLORE</span>
          <ArrowDown size={14} />
        </div>
      </section>

      {/* ===== DESCRIPTION ===== */}
      <section style={{ padding: '80px 7vw', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: '-5%', top: '5%', width: '400px', height: '300px', borderRadius: '24px', opacity: 0.08, backgroundImage: 'url(https://images.pexels.com/photos/8722689/pexels-photo-8722689.jpeg?auto=compress&cs=tinysrgb&h=650&w=940)', backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(2px)' }} aria-hidden="true" />
        <div style={{ position: 'absolute', left: '-3%', bottom: '10%', width: '280px', height: '200px', borderRadius: '20px', opacity: 0.06, backgroundImage: 'url(https://images.pexels.com/photos/36481094/pexels-photo-36481094.jpeg?auto=compress&cs=tinysrgb&h=650&w=940)', backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden="true" />
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '40px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Music size={22} style={{ color: '#4ade80' }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 600, letterSpacing: '0.05em' }}>{t('МУЗЫКА')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(244,114,182,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Gamepad2 size={22} style={{ color: '#f472b6' }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: '#f472b6', fontWeight: 600, letterSpacing: '0.05em' }}>{t('ИГРЫ')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={22} style={{ color: '#38bdf8' }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600, letterSpacing: '0.05em' }}>{t('ОБЩЕНИЕ')}</span>
            </div>
          </div>

          <p style={{ fontSize: '1.15rem', lineHeight: 1.8, margin: 0 }}>
            <span style={{ color: '#4ade80', fontWeight: 600 }}>SoundScape Pro</span> {t('— это пространство, где')}{' '}
            <span style={{ color: '#f472b6' }}>{t('музыка, игры и общение')}</span> {t('собраны в одном месте. Здесь можно')}{' '}
            <span style={{ color: '#38bdf8' }}>{t('находить друзей')}</span>, {t('писать личные сообщения, общаться в общем чате и')}{' '}
            <span style={{ color: '#4ade80' }}>{t('создавать треки')}</span> {t('в AI-студии.')}{' '}
            <span style={{ color: '#f472b6' }}>{t('Повышай свой рейтинг')}</span> {t('в играх — весь прогресс и валюта сохраняются.')}
          </p>

          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, marginTop: '20px', color: 'rgba(232,232,240,0.6)' }}>
            {t('Мы уделяем большое внимание')}{' '}
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{t('безопасности')}</span>: {t('все переводы проходят через')}{' '}
            <span style={{ color: '#4ade80', fontWeight: 600 }}>{t('Сбер или ЮKassa')}</span>, {t('платёжные данные не сохраняются.')}
          </p>

          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, marginTop: '20px', color: 'rgba(232,232,240,0.6)' }}>
            <span style={{ color: '#f472b6', fontWeight: 600 }}>{t('Подписка')}</span> {t('открывает доступ к AI-студии, продвинутому секвенсору')}{' '}
            <span style={{ color: '#4ade80', fontWeight: 600 }}>Beat Composer Pro</span>, {t('эксклюзивным наградам и')}{' '}
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{t('внутренней валюте')}</span> {t('для быстрого развития.')}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '36px' }}>
            <Shield size={18} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '0.85rem', color: 'rgba(232,232,240,0.4)' }}>
              {t('Все достижения и валюта сохраняются в общей базе данных')}
            </span>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="soundscape-tools">
        <div className="soundscape-tools-heading">
          <div>
            <span className="soundscape-section-label">01 / {t('ВОЗМОЖНОСТИ')}</span>
            <h2>
              {t('Всё для музыки')}
              <br />
              <em>{t('в одном месте.')}</em>
            </h2>
          </div>
          <Headphones className="soundscape-headphones" size={52} strokeWidth={1} />
        </div>
        <div className="soundscape-tool-grid">
          {features.map((f, index) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="soundscape-tool-card"
                style={{ '--tool-index': index } as CSSProperties}
              >
                <span className="soundscape-tool-number">0{index + 1}</span>
                <span className="soundscape-tool-icon">
                  <Icon size={21} />
                </span>
                <span className="soundscape-tool-label">{t(f.title)}</span>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'rgba(232,232,240,0.5)', margin: 0 }}>
                  {t(f.description)}
                </p>
                <ArrowRight className="soundscape-tool-arrow" size={17} />
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section style={{ padding: '0 7vw 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span className="soundscape-section-label" style={{ textAlign: 'center' }}>
            03 / {t('ПРЕМИУМ')}
          </span>
          <h2 style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#f5f5fa', margin: 0 }}>
            Soundscape <em style={{ fontStyle: 'italic', fontWeight: 300, background: 'linear-gradient(135deg, #00e5d0, #b07ee0)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block', paddingRight: '0.15em' }}>Pro</em>
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(232,232,240,0.5)', marginTop: '16px' }}>
            {t('Открой все возможности платформы')}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              maxWidth: '420px',
              width: '100%',
              background: 'linear-gradient(135deg, rgba(0,229,208,0.08), rgba(176,126,224,0.08))',
              border: '1px solid rgba(0,229,208,0.3)',
              borderRadius: '24px',
              padding: '40px 32px',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '4px 16px',
                background: 'linear-gradient(135deg, #00e5d0, #b07ee0)',
                borderRadius: '100px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#03030a',
              }}
            >
              {t('Популярный')}
            </div>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <p style={{ fontSize: '0.85rem', color: 'rgba(232,232,240,0.5)', marginBottom: '8px' }}>{t('Ежемесячная подписка')}</p>
              <p style={{ fontSize: '0.75rem', color: 'rgba(0,229,208,0.6)', marginBottom: '8px' }}>{t('привязывается к вашему аккаунту')}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
                <span style={{ fontSize: '3rem', fontWeight: 800, color: '#f5f5fa' }}>259</span>
                <span style={{ fontSize: '1rem', color: 'rgba(232,232,240,0.5)' }}>{t('₽/мес')}</span>
              </div>
            </div>
            <div style={{ spaceY: '12px' }}>
              {pricingFeatures.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,229,208,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={12} style={{ color: '#00e5d0' }} />
                  </div>
                  <span style={{ fontSize: '0.9rem', color: 'rgba(232,232,240,0.8)' }}>{t(f)}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleSubscribe}
              disabled={subChecking}
              className="soundscape-primary-button"
              style={{ width: '100%', justifyContent: 'center', marginTop: '32px', opacity: subChecking ? 0.6 : 1 }}
            >
              <Zap size={16} />
              {subChecking ? t('Переход к оплате...') : t('Оформить подписку')}
            </button>
            {subNotice && (
              <p style={{ fontSize: '0.85rem', color: subNotice.includes(t('У вас уже активна')) ? '#00e5d0' : 'rgba(239,68,68,0.9)', marginTop: '12px', textAlign: 'center' }}>
                {subNotice}
              </p>
            )}
          </div>
        </div>
        <div style={{ maxWidth: '720px', margin: '48px auto 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {subscriptionComparison.map((item) => (
            <div
              key={item.title}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '24px' }}
            >
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#00e5d0', margin: '0 0 8px' }}>{item.value}</p>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f5f5fa', margin: '0 0 6px' }}>{t(item.title)}</p>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'rgba(232,232,240,0.55)', margin: 0 }}>{t(item.text)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section style={{ padding: '80px 7vw', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.07, backgroundImage: 'url(https://images.pexels.com/photos/9418211/pexels-photo-9418211.jpeg?auto=compress&cs=tinysrgb&h=650&w=940)', backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden="true" />
        <Sparkles size={32} style={{ color: 'rgba(0,229,208,0.5)', margin: '0 auto 24px' }} />
        <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#f5f5fa', margin: '0 0 16px' }}>
          {t('Звук начинается')} <em style={{ fontStyle: 'italic', fontWeight: 300, background: 'linear-gradient(135deg, #00e5d0, #b07ee0)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block', paddingRight: '0.15em' }}>{t('с тебя')}</em>
        </h2>
        <p style={{ fontSize: '1.1rem', color: 'rgba(232,232,240,0.5)', maxWidth: '480px', margin: '0 auto 40px' }}>
          {t('Присоединяйся к нашему сообществу музыкантов и слушателей. Твоя музыкальная вселенная ждёт.')}
        </p>
        <button className="soundscape-primary-button" onClick={() => setPage('beat')}>
          {t('Начать создавать')}
          <ArrowRight size={16} />
        </button>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{ padding: '40px 7vw', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #00e5d0, #b07ee0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music size={16} style={{ color: '#03030a' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f5f5fa' }}>Soundscape Pro</span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'rgba(232,232,240,0.3)' }}>
          {t('© 2026 Soundscape Pro. Музыка, которая живёт внутри тебя.')}
        </p>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px', fontSize: '0.85rem', fontWeight: 600, color: '#00e5d0', textDecoration: 'none' }}
        >
          <Send size={14} />
          t.me/soundscapepro
        </a>
      </footer>
    </div>
  );
}

