import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import {
  ListMusic,
  Plus,
  X,
  Music,
  Trash2,
  Loader2,
  Users,
  ArrowLeft,
  Play,
} from 'lucide-react';

type Playlist = {
  id: string;
  name: string;
  creator_id: string;
  created_at: string;
  track_count?: number;
};

type PlaylistTrack = {
  id: string;
  playlist_id: string;
  user_id: string;
  title: string;
  added_by: string | null;
  added_at: string;
};

export default function PlaylistsPage() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openPlaylist, setOpenPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchPlaylists = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('collab_playlists')
      .select('id, name, creator_id, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Playlist fetch error:', error);
      setLoading(false);
      return;
    }

    const lists = (data ?? []) as Playlist[];

    // Fetch track counts
    const counts = await Promise.all(
      lists.map(async (pl) => {
        const { count } = await supabase
          .from('collab_playlist_tracks')
          .select('id', { count: 'exact', head: true })
          .eq('playlist_id', pl.id);
        return { id: pl.id, count: count ?? 0 };
      })
    );
    const countMap = new Map(counts.map((c) => [c.id, c.count]));
    setPlaylists(lists.map((pl) => ({ ...pl, track_count: countMap.get(pl.id) ?? 0 })));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const fetchTracks = useCallback(async (playlistId: string) => {
    setTracksLoading(true);
    const { data, error } = await supabase
      .from('collab_playlist_tracks')
      .select('id, playlist_id, user_id, title, added_by, added_at')
      .eq('playlist_id', playlistId)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('Tracks fetch error:', error);
      setTracksLoading(false);
      return;
    }
    setTracks((data ?? []) as PlaylistTrack[]);
    setTracksLoading(false);
  }, []);

  const openPlaylistView = (pl: Playlist) => {
    setOpenPlaylist(pl);
    fetchTracks(pl.id);
  };

  const handleCreatePlaylist = async (name: string) => {
    if (!profile) return;
    if (creating) return;
    setCreating(true);
    const { error } = await supabase
      .from('collab_playlists')
      .insert({ name, creator_id: profile.id });
    if (error) {
      console.error('Create playlist error:', error);
      setCreating(false);
      return;
    }
    setShowCreate(false);
    setCreating(false);
    fetchPlaylists();
  };

  const handleAddTrack = async (title: string) => {
    if (!profile || !openPlaylist) return;
    const { error } = await supabase.from('collab_playlist_tracks').insert({
      playlist_id: openPlaylist.id,
      user_id: profile.id,
      title,
      added_by: profile.username,
    });
    if (error) {
      console.error('Add track error:', error);
      return;
    }
    fetchTracks(openPlaylist.id);
    // update count
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === openPlaylist.id ? { ...p, track_count: (p.track_count ?? 0) + 1 } : p
      )
    );
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (!openPlaylist) return;
    const { error } = await supabase.from('collab_playlist_tracks').delete().eq('id', trackId);
    if (error) {
      console.error('Delete track error:', error);
      return;
    }
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === openPlaylist.id ? { ...p, track_count: Math.max(0, (p.track_count ?? 0) - 1) } : p
      )
    );
  };

  // Playlist detail view
  if (openPlaylist) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setOpenPlaylist(null)}
          className="flex items-center gap-2 text-theme-muted hover:text-theme-text text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('Назад к плейлистам')}
        </button>

        <div className="glass-surface bg-gradient-to-br from-theme-primary/20 to-theme-accent/10 border border-theme-border rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center shrink-0">
              <ListMusic className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-theme-text">{openPlaylist.name}</h1>
              <p className="text-theme-muted text-sm mt-1 flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {openPlaylist.track_count ?? 0} {t('треков')}
              </p>
            </div>
          </div>
        </div>

        <AddTrackForm onAdd={handleAddTrack} t={t} />

        {tracksLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-theme-primary animate-spin" />
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-12 text-theme-muted text-sm">
            {t('В плейлисте пока нет треков. Добавь первый!')}
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map((t, i) => (
              <div
                key={t.id}
                className="glass-surface bg-theme-surface/50 border border-theme-border rounded-xl p-3 flex items-center gap-3 hover:border-theme-primary transition-colors"
              >
                <span className="text-theme-muted text-sm font-mono w-6 text-center shrink-0">
                  {i + 1}
                </span>
                <div className="w-10 h-10 rounded-lg bg-theme-primary/20 flex items-center justify-center shrink-0">
                  <Music className="w-5 h-5 text-theme-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-theme-text text-sm font-medium truncate">{t.title}</p>
                  <p className="text-theme-muted text-xs">
                    {t('добавил(а)')} {t.added_by || t('неизвестный')}
                  </p>
                </div>
                {t.user_id === profile?.id && (
                  <button
                    onClick={() => handleDeleteTrack(t.id)}
                    className="p-2 text-theme-muted hover:text-theme-danger transition-colors shrink-0"
                    title={t('Удалить трек')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Playlist list view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <ListMusic className="w-6 h-6 text-theme-primary" />
            {t('Совместные плейлисты')}
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            {t('Создавайте плейлисты вместе с друзьями')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-theme-primary text-white rounded-xl hover:bg-theme-primary-hover transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('Создать')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-theme-primary animate-spin" />
        </div>
      ) : playlists.length === 0 ? (
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-12 text-center">
          <ListMusic className="w-12 h-12 text-theme-muted mx-auto mb-3" />
          <p className="text-theme-muted text-sm">
            {t('Пока нет плейлистов. Создай первый и пригласи друзей!')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => openPlaylistView(pl)}
              className="glass-surface bg-theme-surface/60 border border-theme-border rounded-2xl p-4 hover:border-theme-primary transition-colors text-left group"
            >
              <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-theme-primary/30 to-theme-accent/20 flex items-center justify-center mb-3 relative overflow-hidden">
                <ListMusic className="w-12 h-12 text-theme-primary group-hover:scale-110 transition-transform" />
                <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-lg text-white text-xs">
                  <Music className="w-3 h-3" />
                  {pl.track_count ?? 0}
                </div>
              </div>
              <p className="text-theme-text text-sm font-medium truncate">{pl.name}</p>
              <p className="text-theme-muted text-xs mt-0.5">
                {pl.creator_id === profile?.id ? t('Вы создали') : t('Совместный плейлист')}
              </p>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePlaylistModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreatePlaylist}
          creating={creating}
          t={t}
        />
      )}
    </div>
  );
}

/* ---------- Create Playlist Modal ---------- */

function CreatePlaylistModal({
  onClose,
  onCreate,
  creating,
  t,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
  creating: boolean;
  t: (key: string) => string;
}) {
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-surface bg-theme-surface border border-theme-border rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-theme-text">{t('Новый плейлист')}</h2>
          <button onClick={onClose} className="text-theme-muted hover:text-theme-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          <label className="block text-xs text-theme-muted mb-1.5">{t('Название')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreate(name.trim())}
            placeholder={t('Например: Friday Vibes')}
            className="w-full px-3 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary"
            autoFocus
          />
        </div>
        <button
          onClick={() => name.trim() && onCreate(name.trim())}
          disabled={!name.trim() || creating}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-theme-primary text-white rounded-xl hover:bg-theme-primary-hover transition-colors disabled:opacity-50 text-sm font-medium"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {creating ? t('Создание...') : t('Создать плейлист')}
        </button>
      </div>
    </div>
  );
}

/* ---------- Add Track Form ---------- */

function AddTrackForm({ onAdd, t }: { onAdd: (title: string) => void; t: (key: string) => string }) {
  const [title, setTitle] = useState('');

  return (
    <div className="glass-surface bg-theme-surface/60 border border-theme-border rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) {
              onAdd(title.trim());
              setTitle('');
            }
          }}
          placeholder={t('Добавить трек в плейлист...')}
          className="flex-1 px-3 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary"
        />
        <button
          onClick={() => {
            if (title.trim()) {
              onAdd(title.trim());
              setTitle('');
            }
          }}
          disabled={!title.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-theme-primary text-white rounded-xl hover:bg-theme-primary-hover transition-colors disabled:opacity-50 text-sm font-medium shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t('Добавить')}
        </button>
      </div>
    </div>
  );
}
