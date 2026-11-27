import type { PlayerTrack } from '@/context/PlayerContext';

const ARTIST_VITALIJ = 'Виталий Мельников';
const ARTIST_TIMSAF = 'TimSaf';

export const CHART_TRACKS: PlayerTrack[] = [
  { id: 'chart-error-404', title: 'Ошибка 404', artist: ARTIST_VITALIJ, cover: '/charts/cover-1.webp', url: '/charts/track-1.mp3' },
  { id: 'chart-tunnel', title: 'Тоннель на Ленинском', artist: ARTIST_VITALIJ, cover: '/charts/cover-2.webp', url: '/charts/track-2.mp3' },
  { id: 'chart-freedom-snake', title: 'Свобода и змея', artist: ARTIST_VITALIJ, cover: '/charts/cover-3.webp', url: '/charts/track-3.mp3' },
  { id: 'chart-love-bets', title: 'Ставки о любви', artist: ARTIST_VITALIJ, cover: '/charts/cover-4.webp', url: '/charts/track-4.mp3' },
  { id: 'chart-track-5', title: 'Кто круче танцует', artist: 'Никита Шульгин, Adrenalin House', cover: '/charts/cover-5.webp', url: '/charts/track-5.mp3' },
];
