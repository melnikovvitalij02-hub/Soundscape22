import { useState } from 'react';
import { Tv, X, Play, Users } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

type TwitchChannel = {
  name: string;
  title: string;
  genre: string;
  avatar: string;
};

const TWITCH_CHANNELS: TwitchChannel[] = [
  { name: 'monstercat', title: 'Monstercat — Electronic Music 24/7', genre: 'Электроника', avatar: '/avatar-robot.webp' },
  { name: 'thesynthwave', title: 'Synthwave Radio — Retro Vibes', genre: 'Synthwave', avatar: '/avatar-ghost.webp' },
  { name: 'lofigirl', title: 'Lofi Girl — Chill Beats to Study/Relax', genre: 'Lo-Fi', avatar: '/avatar-cat.webp' },
  { name: 'mr_suicide_sheep', title: 'MrSuicideSheep — Music Stream', genre: 'Электроника', avatar: '/avatar-fox.webp' },
  { name: 'proletebeats', title: 'Prolete Beats — Hip-Hop Instrumentals', genre: 'Хип-Хоп', avatar: '/avatar-dragon.webp' },
  { name: 'ukf', title: 'UKF — Bass Music Channel', genre: 'Bass', avatar: '/avatar-panda.webp' },
];

export default function StreamsPage() {
  const [activeChannel, setActiveChannel] = useState<TwitchChannel | null>(null);
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Tv className="w-6 h-6 text-purple-500" />
          {t('Twitch Стримы')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          {t('Смотри живые музыкальные стримы прямо из Twitch')}
        </p>
      </div>

      {/* Channel grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TWITCH_CHANNELS.map((channel: TwitchChannel) => (
          <button
            key={channel.name}
            onClick={() => setActiveChannel(channel)}
            className="glass-surface bg-theme-surface/60 border border-theme-border rounded-2xl overflow-hidden hover:border-purple-500 transition-colors text-left group"
          >
            {/* Preview area */}
            <div className="relative aspect-video bg-theme-surface2 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-theme-surface2 to-theme-surface2" />
              <div className="relative flex flex-col items-center gap-3">
                <img
                  src={channel.avatar}
                  alt={channel.name}
                  className="w-20 h-20 rounded-full border-2 border-purple-500/40 group-hover:scale-105 transition-transform"
                />
                <div className="w-14 h-14 rounded-full bg-purple-500/90 flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                  <Play className="w-6 h-6 text-white fill-white" />
                </div>
              </div>
              {/* LIVE badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-purple-500 rounded-md text-white text-xs font-bold">
                <Tv className="w-3.5 h-3.5" />
                TWITCH
              </div>
            </div>

            {/* Card body */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <img
                  src={channel.avatar}
                  alt={channel.name}
                  className="w-9 h-9 rounded-full shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-theme-text text-sm font-medium truncate">{channel.title}</p>
                  <p className="text-theme-muted text-xs truncate">{channel.name}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="inline-block px-2.5 py-1 bg-theme-primary-bg text-theme-primary-text text-xs rounded-full">
                  {t(channel.genre)}
                </span>
                <span className="flex items-center gap-1.5 text-theme-muted text-xs">
                  <Users className="w-3.5 h-3.5" />
                  {t('Смотреть')}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Stream viewer modal */}
      {activeChannel && (
        <StreamViewerModal channel={activeChannel} onClose={() => setActiveChannel(null)} />
      )}
    </div>
  );
}

/* ---------- Stream Viewer Modal ---------- */

function StreamViewerModal({
  channel,
  onClose,
}: {
  channel: TwitchChannel;
  onClose: () => void;
}) {
  const parent: string = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const twitchEmbedUrl: string = `https://player.twitch.tv/?channel=${channel.name}&parent=${parent}&autoplay=true`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-surface bg-theme-surface border border-theme-border rounded-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
          <div className="flex items-center gap-3 min-w-0">
            <img src={channel.avatar} alt={channel.name} className="w-9 h-9 rounded-full shrink-0" />
            <div className="min-w-0">
              <p className="text-theme-text text-sm font-medium truncate">{channel.title}</p>
              <p className="text-theme-muted text-xs truncate flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-purple-500" />
                {channel.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-text shrink-0 ml-2"
            aria-label={t('Закрыть')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Twitch player iframe */}
        <div className="relative bg-black">
          <iframe
            src={twitchEmbedUrl}
            allowFullScreen
            className="w-full aspect-video"
            title={`${channel.name} — Twitch Stream`}
          />
        </div>

        {/* Channel info footer */}
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block px-2.5 py-1 bg-theme-primary-bg text-theme-primary-text text-xs rounded-full">
              {t(channel.genre)}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/15 text-purple-500 text-xs rounded-full font-medium">
              <Tv className="w-3.5 h-3.5" />
              Twitch
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
