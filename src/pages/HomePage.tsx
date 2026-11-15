import type { CSSProperties } from 'react';
import type { Page } from '@/components/Sidebar';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import {
  ArrowRight,
  Drum,
  Gamepad2,
  Headphones,
  Mic,
  Music2,
  Sparkles,
  TrendingUp,
  Crown,
  Brain,
} from 'lucide-react';

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

const quickLinks: { id: Page; label: string; icon: typeof Music2; desc: string }[] = [
  { id: 'beat', label: 'Создать бит', icon: Drum, desc: 'Секвенсор ритмов' },
  { id: 'coach', label: 'ИИ Тренер', icon: Brain, desc: 'Анализ твоих битов' },
  { id: 'studio', label: 'Открыть студию', icon: Mic, desc: 'ИИ-генерация треков' },
  { id: 'trending', label: 'Горящие треки', icon: TrendingUp, desc: 'Что слушают сейчас' },
];

export default function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const displayName = profile?.username || t('исследователь');
  const isPremium = profile?.is_premium;

  return (
    <div className="soundscape-home">
      <section className="soundscape-hero" style={{ backgroundImage: 'linear-gradient(180deg, rgba(3,3,10,0.6) 0%, rgba(3,3,10,0.85) 100%), url(https://images.pexels.com/photos/38400814/pexels-photo-38400814.jpeg?auto=compress&cs=tinysrgb&h=650&w=940)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
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
        <div className="soundscape-aurora soundscape-aurora-three" />
        <div className="soundscape-orbit soundscape-orbit-one" />
        <div className="soundscape-orbit soundscape-orbit-two" />
        <div className="soundscape-orbit soundscape-orbit-three" />

        <div className="soundscape-hero-content">
          <div className="soundscape-kicker">
            <span className="soundscape-kicker-line" />
            <span>{t('Добро пожаловать')}, {displayName}</span>
            {isPremium && (
              <span className="soundscape-premium-badge">
                <Crown size={11} /> VIP
              </span>
            )}
          </div>
          <h1>
            {t('Музыка,')}
            <br />
            {t('которая')} <em>{t('живёт')}</em>
            <br />
            {t('внутри тебя.')}
          </h1>
          <p>
            {t('Твоя личная вселенная звука. Создавай, находи и слушай музыку, которая превращает обычный день в путешествие.')}
          </p>
          <div className="soundscape-hero-actions">
            <button className="soundscape-primary-button" onClick={() => setPage('beat')}>
              {t('Начать создавать')}
              <ArrowRight size={16} />
            </button>
            <button className="soundscape-text-button" onClick={() => setPage('trending')}>
              {t('Исследовать музыку')}
              <TrendingUp size={15} />
            </button>
          </div>

          <div className="soundscape-stats">
            <div className="soundscape-stat">
              <span className="soundscape-stat-value">{profile?.level ?? 1}</span>
              <span className="soundscape-stat-label">{t('Уровень')}</span>
            </div>
            <div className="soundscape-stat-divider" />
            <div className="soundscape-stat">
              <span className="soundscape-stat-value">{profile?.xp ?? 0}</span>
              <span className="soundscape-stat-label">XP</span>
            </div>
            <div className="soundscape-stat-divider" />
            <div className="soundscape-stat">
              <span className="soundscape-stat-value">{profile?.coins ?? 0}</span>
              <span className="soundscape-stat-label">{t('Монеты')}</span>
            </div>
          </div>
        </div>

        <div className="soundscape-vertical-label">SOUNDSCAPE PRO</div>
        <div className="soundscape-scroll-cue">
          <span>SCROLL TO EXPLORE</span>
          <ArrowRight size={14} />
        </div>
      </section>

      <section className="soundscape-intro" style={{ position: 'relative' }}>
        <div className="soundscape-intro-photo soundscape-intro-photo-right" style={{ position: 'absolute', right: '3vw', top: '20%', width: '360px', height: '240px', borderRadius: '20px', opacity: 0.15, backgroundImage: 'url(https://images.pexels.com/photos/27141312/pexels-photo-27141312.jpeg?auto=compress&cs=tinysrgb&h=650&w=940)', backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(1px)' }} aria-hidden="true" />
        <div className="soundscape-intro-photo soundscape-intro-photo-left" style={{ position: 'absolute', left: '3vw', bottom: '10%', width: '200px', height: '140px', borderRadius: '16px', opacity: 0.1, backgroundImage: 'url(https://images.pexels.com/photos/9418211/pexels-photo-9418211.jpeg?auto=compress&cs=tinysrgb&h=650&w=940)', backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden="true" />
        <div>
          <span className="soundscape-section-label">01 / THE SOUND UNIVERSE</span>
          <h2>
            {t('Твоя музыка.')}
            <br />
            {t('Твои правила.')}
          </h2>
        </div>
        <div className="soundscape-intro-copy">
          <p>
            {t('Soundscape Pro собирает всё, что нужно для музыкального путешествия, в одном пространстве — от первого ритма до любимого трека.')}
          </p>
          <div className="soundscape-intro-features">
            <div className="soundscape-intro-feature">
              <Headphones className="w-5 h-5" />
              <span>{t('HD звук')}</span>
            </div>
            <div className="soundscape-intro-feature">
              <Sparkles className="w-5 h-5" />
              <span>{t('ИИ-генерация')}</span>
            </div>
            <div className="soundscape-intro-feature">
              <TrendingUp className="w-5 h-5" />
              <span>{t('Геймификация')}</span>
            </div>
          </div>
          <button className="soundscape-outline-button" onClick={() => setPage('studio')}>
            {t('Открыть студию')} <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <section className="soundscape-tools">
        <div className="soundscape-tools-heading">
          <div>
            <span className="soundscape-section-label">02 / YOUR FREQUENCY</span>
            <h2>{t('Настройся на')}<br /><em>{t('свою частоту.')}</em></h2>
          </div>
          <Headphones className="soundscape-headphones" size={52} strokeWidth={1} />
        </div>
        <div className="soundscape-tool-grid">
          {quickLinks.map((link, index) => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                className="soundscape-tool-card"
                onClick={() => setPage(link.id)}
                style={{ '--tool-index': index } as CSSProperties}
              >
                <span className="soundscape-tool-number">0{index + 1}</span>
                <span className="soundscape-tool-icon"><Icon size={21} /></span>
                <span className="soundscape-tool-label">{t(link.label)}</span>
                <span className="soundscape-tool-desc">{t(link.desc)}</span>
                <ArrowRight className="soundscape-tool-arrow" size={17} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="soundscape-bottom-cta" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.08, pointerEvents: 'none', backgroundImage: 'url(https://images.pexels.com/photos/14601959/pexels-photo-14601959.jpeg?auto=compress&cs=tinysrgb&h=650&w=940)', backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden="true" />
        <Sparkles size={18} />
        <span>{t('Звук начинается с тебя')}</span>
        <button onClick={() => setPage('profile')}>{t('Настроить профиль')} <ArrowRight size={14} /></button>
      </section>
    </div>
  );
}
