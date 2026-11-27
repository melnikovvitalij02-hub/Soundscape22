import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';

export type PlayerTrack = {
  id: string;
  title: string;
  artist: string;
  cover?: string;
  url: string;
};

type PlayerContextType = {
  currentTrack: PlayerTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  play: (track: PlayerTrack) => void;
  toggle: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  queue: PlayerTrack[];
  playQueue: (tracks: PlayerTrack[], startIndex?: number) => void;
  loop: boolean;
  toggleLoop: () => void;
};

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { loopRef.current = loop; }, [loop]);

  const toggleLoop = useCallback(() => setLoop((v) => !v), []);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const onTime = () => {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };
    const onEnd = () => {
      if (loopRef.current && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
        return;
      }
      setIsPlaying(false);
      nextRef.current();
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onTime);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const loadAndPlay = useCallback((track: PlayerTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = track.url;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, []);

  const play = useCallback((track: PlayerTrack) => {
    setCurrentTrack(track);
    const idx = queue.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      setQueueIndex(idx);
    } else {
      setQueue([track]);
      setQueueIndex(0);
    }
    loadAndPlay(track);
  }, [queue, loadAndPlay]);

  const playQueue = useCallback((tracks: PlayerTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    setQueue(tracks);
    setQueueIndex(startIndex);
    setCurrentTrack(tracks[startIndex]);
    loadAndPlay(tracks[startIndex]);
  }, [loadAndPlay]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying, currentTrack]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setProgress(time);
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const next = useCallback(() => {
    if (queue.length === 0) return;
    const newIdx = (queueIndex + 1) % queue.length;
    setQueueIndex(newIdx);
    setCurrentTrack(queue[newIdx]);
    loadAndPlay(queue[newIdx]);
  }, [queue, queueIndex, loadAndPlay]);

  const prev = useCallback(() => {
    if (queue.length === 0) return;
    const newIdx = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
    setQueueIndex(newIdx);
    setCurrentTrack(queue[newIdx]);
    loadAndPlay(queue[newIdx]);
  }, [queue, queueIndex, loadAndPlay]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    setCurrentTrack(null);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    setQueue([]);
    setQueueIndex(-1);
  }, []);

  const nextRef = useRef(next);
  nextRef.current = next;

  return (
    <PlayerContext.Provider value={{ currentTrack, isPlaying, progress, duration, volume, play, toggle, seek, setVolume, next, prev, stop, queue, playQueue, loop, toggleLoop }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}


