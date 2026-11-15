import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Profile } from '@/lib/supabase';
import {
  Plus,
  X,
  Mic,
  Music,
  Loader2,
  Circle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Play,
  Video,
} from 'lucide-react';

type Story = {
  id: string;
  user_id: string;
  track_title: string;
  audio_url: string | null;
  video_url: string | null;
  image_url: string | null;
  created_at: string;
  expires_at: string;
  profile: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
};

type StoryGroup = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  stories: Story[];
};

const STORY_DURATION = 5000; // 5s per audio/text story for the viewer progress bar
const VIDEO_STORY_DURATION = 15000; // 15s for video stories

type RecordingMode = 'audio' | 'video';

export default function StoriesPage() {
  const { profile, isGuest } = useAuth();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<{ groupIndex: number; storyIndex: number } | null>(null);

  const fetchStories = useCallback(async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('stories')
      .select(
        'id, user_id, track_title, audio_url, video_url, image_url, created_at, expires_at, profiles!inner(id, username, avatar_url)'
      )
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Story fetch error:', error);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as Array<
      Story & { profiles: Pick<Profile, 'id' | 'username' | 'avatar_url'> }
    >;

    const map = new Map<string, StoryGroup>();
    for (const row of rows) {
      const p = row.profiles;
      if (!p) continue;
      const story: Story = {
        id: row.id,
        user_id: row.user_id,
        track_title: row.track_title,
        audio_url: row.audio_url,
        video_url: row.video_url,
        image_url: row.image_url,
        created_at: row.created_at,
        expires_at: row.expires_at,
        profile: { id: p.id, username: p.username, avatar_url: p.avatar_url },
      };
      let g = map.get(row.user_id);
      if (!g) {
        g = { user_id: row.user_id, username: p.username, avatar_url: p.avatar_url, stories: [] };
        map.set(row.user_id, g);
      }
      g.stories.push(story);
    }

    // Current user's group first (if present), then others
    const all = [...map.values()];
    all.sort((a, b) => (a.user_id === profile?.id ? -1 : b.user_id === profile?.id ? 1 : 0));
    setGroups(all);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  const openViewer = (groupIndex: number, storyIndex: number) => {
    setViewing({ groupIndex, storyIndex });
  };

  const closeViewer = () => setViewing(null);

  const nextStory = useCallback(() => {
    setViewing((cur) => {
      if (!cur) return null;
      const g = groups[cur.groupIndex];
      if (!g) return null;
      if (cur.storyIndex + 1 < g.stories.length) {
        return { groupIndex: cur.groupIndex, storyIndex: cur.storyIndex + 1 };
      }
      if (cur.groupIndex + 1 < groups.length) {
        return { groupIndex: cur.groupIndex + 1, storyIndex: 0 };
      }
      return null;
    });
  }, [groups]);

  const prevStory = useCallback(() => {
    setViewing((cur) => {
      if (!cur) return null;
      if (cur.storyIndex > 0) {
        return { groupIndex: cur.groupIndex, storyIndex: cur.storyIndex - 1 };
      }
      if (cur.groupIndex > 0) {
        const prevGroup = groups[cur.groupIndex - 1];
        return { groupIndex: cur.groupIndex - 1, storyIndex: prevGroup.stories.length - 1 };
      }
      return null;
    });
  }, [groups]);

  const deleteStory = async (storyId: string) => {
    await supabase.from('stories').delete().eq('id', storyId);
    fetchStories();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <Circle className="w-6 h-6 text-theme-primary fill-theme-primary" />
            Истории
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            24-часовые музыкальные истории — исчезают через сутки
          </p>
        </div>
        {!isGuest && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-theme-primary text-white rounded-xl hover:bg-theme-primary-hover transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Создать
          </button>
        )}
        {isGuest && (
          <p className="text-xs text-theme-muted">Войдите в аккаунт, чтобы создавать истории</p>
        )}
      </div>

      {/* Story circles row */}
      <div className="glass-surface bg-theme-surface/60 border border-theme-border rounded-2xl p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-theme-primary animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-10 text-theme-muted text-sm">
            Пока нет активных историй. Создай первую!
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {groups.map((g, gi) => (
              <button
                key={g.user_id}
                onClick={() => openViewer(gi, 0)}
                className="flex flex-col items-center gap-2 shrink-0 group"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-theme-primary via-theme-accent to-theme-primary">
                    <div className="w-full h-full rounded-full p-[2px] bg-theme-bg">
                      {g.avatar_url ? (
                        <img
                          src={g.avatar_url}
                          alt={g.username}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-theme-surface2 flex items-center justify-center text-theme-muted text-lg font-bold">
                          {g.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                  </div>
                  {g.user_id === profile?.id && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-theme-primary border-2 border-theme-bg flex items-center justify-center">
                      <Plus className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <span className="text-xs text-theme-muted max-w-[64px] truncate">
                  {g.user_id === profile?.id ? 'Вы' : g.username}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid of recent stories */}
      {!loading && groups.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-theme-muted uppercase tracking-wider mb-3">
            Недавние истории
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {groups.flatMap((g) => g.stories).map((s) => (
              <div
                key={s.id}
                className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl overflow-hidden hover:border-theme-primary transition-colors"
              >
                <button
                  onClick={() => {
                    const gi = groups.findIndex((g) => g.user_id === s.user_id);
                    const si = groups[gi]?.stories.findIndex((x) => x.id === s.id) ?? 0;
                    if (gi >= 0) openViewer(gi, si);
                  }}
                  className="w-full text-left"
                >
                  <div className="relative aspect-square bg-gradient-to-br from-theme-primary/30 to-theme-accent/30 flex items-center justify-center">
                    {s.image_url ? (
                      <img src={s.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-8 h-8 text-theme-primary" />
                    )}
                    {s.video_url && (
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full p-1.5">
                        <Video className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-theme-text truncate">{s.track_title}</p>
                    <p className="text-xs text-theme-muted truncate">{s.profile?.username}</p>
                  </div>
                </button>
                {s.user_id === profile?.id && (
                  <button
                    onClick={() => deleteStory(s.id)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-theme-danger hover:bg-theme-danger/10 transition-colors border-t border-theme-border"
                  >
                    <Trash2 className="w-3 h-3" />
                    Удалить
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateStoryModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchStories();
          }}
        />
      )}

      {/* Story viewer */}
      {viewing && groups[viewing.groupIndex] && (
        <StoryViewer
          groups={groups}
          startGroup={viewing.groupIndex}
          startStory={viewing.storyIndex}
          onClose={closeViewer}
          onNext={nextStory}
          onPrev={prevStory}
          currentUserId={profile?.id}
          onDelete={deleteStory}
        />
      )}
    </div>
  );
}

/* ---------- Create Story Modal ---------- */

function CreateStoryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [trackTitle, setTrackTitle] = useState('');
  const [mode, setMode] = useState<RecordingMode>('audio');
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Clean up object URL and stream when modal closes or blob changes
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickVideoMimeType = (): string => {
    if (typeof MediaRecorder === 'undefined') return 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      return 'video/webm;codecs=vp9';
    }
    return 'video/webm';
  };

  const startRecording = async () => {
    setError(null);
    try {
      const constraints: MediaStreamConstraints =
        mode === 'video'
          ? { video: true, audio: true }
          : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (mode === 'video' && liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play().catch(() => {});
      }

      const mimeType = mode === 'video' ? pickVideoMimeType() : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (mode === 'video') {
          // revoke previous preview URL if any
          setVideoPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          setVideoBlob(blob);
        } else {
          setAudioBlob(blob);
        }
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      setError(
        mode === 'video'
          ? 'Не удалось получить доступ к камере и микрофону'
          : 'Не удалось получить доступ к микрофону'
      );
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const resetRecording = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    setVideoBlob(null);
    setAudioBlob(null);
  };

  const handleSubmit = async () => {
    if (!trackTitle.trim() && !audioBlob && !videoBlob) {
      setError('Введите название трека или запишите аудио/видео');
      return;
    }
    if (!profile) return;
    setSubmitting(true);
    setError(null);

    let audioUrl: string | null = null;
    let videoUrl: string | null = null;

    if (audioBlob) {
      const filePath = `${profile.id}/${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(filePath, audioBlob, { contentType: 'audio/webm' });
      if (upErr) {
        setError('Ошибка загрузки аудио: ' + upErr.message);
        setSubmitting(false);
        return;
      }
      const { data: pub } = supabase.storage.from('stories').getPublicUrl(filePath);
      audioUrl = pub.publicUrl;
    }

    if (videoBlob) {
      const filePath = `${profile.id}/${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(filePath, videoBlob, { contentType: 'video/webm' });
      if (upErr) {
        setError('Ошибка загрузки видео: ' + upErr.message);
        setSubmitting(false);
        return;
      }
      const { data: pub } = supabase.storage.from('stories').getPublicUrl(filePath);
      videoUrl = pub.publicUrl;
    }

    const { error: insErr } = await supabase.from('stories').insert({
      user_id: profile.id,
      track_title: trackTitle.trim() || 'Без названия',
      audio_url: audioUrl,
      video_url: videoUrl,
    });

    if (insErr) {
      setError('Ошибка сохранения: ' + insErr.message);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onCreated();
  };

  const hasRecording = mode === 'video' ? !!videoBlob : !!audioBlob;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-surface bg-theme-surface border border-theme-border rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-theme-text">Новая история</h2>
          <button onClick={onClose} className="text-theme-muted hover:text-theme-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs text-theme-muted mb-1.5">Название трека</label>
          <input
            value={trackTitle}
            onChange={(e) => setTrackTitle(e.target.value)}
            placeholder="Например: Midnight Drive"
            className="w-full px-3 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary"
          />
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 p-1 bg-theme-surface2 rounded-xl border border-theme-border">
          <button
            onClick={() => {
              if (recording) stopRecording();
              setMode('audio');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'audio'
                ? 'bg-theme-primary text-white'
                : 'text-theme-muted hover:text-theme-text'
            }`}
          >
            <Mic className="w-4 h-4" />
            Аудио
          </button>
          <button
            onClick={() => {
              if (recording) stopRecording();
              setMode('video');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'video'
                ? 'bg-theme-primary text-white'
                : 'text-theme-muted hover:text-theme-text'
            }`}
          >
            <Video className="w-4 h-4" />
            Видео
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 py-4 border border-theme-border rounded-xl bg-theme-surface2/50">
          {/* Video live preview while recording */}
          {mode === 'video' && recording && (
            <video
              ref={liveVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full max-h-48 rounded-xl bg-black object-cover"
            />
          )}

          {/* Video recorded preview */}
          {mode === 'video' && videoPreviewUrl && !recording && (
            <div className="w-full flex flex-col items-center gap-2">
              <video
                src={videoPreviewUrl}
                controls
                className="w-full max-h-48 rounded-xl bg-black object-cover"
              />
              <div className="flex items-center gap-2 text-theme-success text-sm">
                <Video className="w-4 h-4" />
                Видео записано ({(videoBlob ? videoBlob.size / 1024 : 0).toFixed(0)} КБ)
                <button
                  onClick={resetRecording}
                  className="ml-2 text-xs text-theme-danger hover:underline"
                >
                  сбросить
                </button>
              </div>
            </div>
          )}

          {/* Audio recorded indicator */}
          {mode === 'audio' && audioBlob && !recording && (
            <div className="flex items-center gap-2 text-theme-success text-sm">
              <Music className="w-5 h-5" />
              Аудио записано ({(audioBlob.size / 1024).toFixed(0)} КБ)
              <button
                onClick={resetRecording}
                className="ml-2 text-xs text-theme-danger hover:underline"
              >
                сбросить
              </button>
            </div>
          )}

          {/* Recording controls */}
          {!hasRecording && !recording && (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-5 py-3 bg-theme-primary text-white rounded-full hover:bg-theme-primary-hover transition-colors"
            >
              {mode === 'video' ? <Video className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              {mode === 'video' ? 'Записать видео' : 'Записать аудио'}
            </button>
          )}

          {recording && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-5 py-3 bg-theme-danger text-white rounded-full animate-pulse"
            >
              <span className="w-3 h-3 bg-white rounded-full" />
              Остановить запись
            </button>
          )}
        </div>

        {error && <p className="text-sm text-theme-danger">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-theme-primary text-white rounded-xl hover:bg-theme-primary-hover transition-colors disabled:opacity-50 text-sm font-medium"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Опубликовать историю
        </button>
      </div>
    </div>
  );
}

/* ---------- Story Viewer ---------- */

function StoryViewer({
  groups,
  startGroup,
  startStory,
  onClose,
  onNext,
  onPrev,
  currentUserId,
  onDelete,
}: {
  groups: StoryGroup[];
  startGroup: number;
  startStory: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  currentUserId: string | undefined;
  onDelete: (id: string) => void;
}) {
  const [groupIndex, setGroupIndex] = useState(startGroup);
  const [storyIndex, setStoryIndex] = useState(startStory);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];

  const advance = useCallback(() => {
    setStoryIndex((si) => {
      if (!group) return si;
      if (si + 1 < group.stories.length) return si + 1;
      // move to next group
      if (groupIndex + 1 < groups.length) {
        setGroupIndex(groupIndex + 1);
        return 0;
      }
      onClose();
      return si;
    });
  }, [group, groupIndex, groups.length, onClose]);

  useEffect(() => {
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
    const duration = story?.video_url ? VIDEO_STORY_DURATION : STORY_DURATION;
    const step = 100 / (duration / 50);
    timerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          advance();
          return 0;
        }
        return p + step;
      });
    }, 50);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [groupIndex, storyIndex, advance, story?.video_url]);

  if (!group || !story) {
    return null;
  }

  const handleTapLeft = () => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
    } else if (groupIndex > 0) {
      setGroupIndex(groupIndex - 1);
      setStoryIndex(groups[groupIndex - 1].stories.length - 1);
    }
  };

  const handleTapRight = () => {
    if (storyIndex + 1 < group.stories.length) {
      setStoryIndex(storyIndex + 1);
    } else if (groupIndex + 1 < groups.length) {
      setGroupIndex(groupIndex + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  };

  // keep external onNext/onPrev in sync with internal state for keyboard nav
  useEffect(() => {
    onNext;
    onPrev;
  }, [onNext, onPrev]);

  const gradients = [
    'from-purple-600 via-pink-600 to-orange-500',
    'from-blue-600 via-purple-600 to-pink-500',
    'from-emerald-500 via-teal-500 to-cyan-500',
    'from-rose-500 via-red-500 to-orange-500',
    'from-indigo-500 via-blue-500 to-cyan-400',
  ];
  const gradient = gradients[(groupIndex + storyIndex) % gradients.length];

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none">
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-30`} />
      <div className="absolute inset-0 bg-black/40" />

      {/* Progress bars */}
      <div className="absolute top-4 left-4 right-4 flex gap-1.5 z-20">
        {group.stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-75"
              style={{ width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-8 left-4 right-4 flex items-center justify-between z-20 mt-3">
        <div className="flex items-center gap-2">
          {group.avatar_url ? (
            <img src={group.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
              {group.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <span className="text-white text-sm font-medium">{group.username}</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Tap zones */}
      <button
        className="absolute left-0 top-0 bottom-0 w-1/3 z-10 flex items-center justify-start pl-2"
        onClick={handleTapLeft}
      >
        <ChevronLeft className="w-6 h-6 text-white/40 opacity-0 hover:opacity-100 transition-opacity" />
      </button>
      <button
        className="absolute right-0 top-0 bottom-0 w-1/3 z-10 flex items-center justify-end pr-2"
        onClick={handleTapRight}
      >
        <ChevronRight className="w-6 h-6 text-white/40 opacity-0 hover:opacity-100 transition-opacity" />
      </button>

      {/* Content */}
      {story.video_url ? (
        <div className="relative z-10 flex flex-col items-center justify-center gap-4 px-4 max-w-md w-full">
          <video
            src={story.video_url}
            autoPlay
            muted
            className="max-h-[70vh] max-w-full rounded-2xl"
          />
          <div className="text-center">
            <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Видео история</p>
            <h2 className="text-white text-xl font-bold">{story.track_title}</h2>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-8 max-w-md text-center">
          <div className="w-32 h-32 rounded-3xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
            {story.image_url ? (
              <img src={story.image_url} alt="" className="w-full h-full rounded-3xl object-cover" />
            ) : (
              <Music className="w-14 h-14 text-white" />
            )}
          </div>
          <div>
            <p className="text-white/60 text-xs uppercase tracking-widest mb-2">Сейчас играет</p>
            <h2 className="text-white text-2xl font-bold">{story.track_title}</h2>
          </div>
          {story.audio_url ? (
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <Play className="w-4 h-4" />
              <span>Аудио история</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Delete for owner */}
      {story.user_id === currentUserId && (
        <button
          onClick={() => {
            onDelete(story.id);
            handleTapRight();
          }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full text-sm transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Удалить историю
        </button>
      )}
    </div>
  );
}
