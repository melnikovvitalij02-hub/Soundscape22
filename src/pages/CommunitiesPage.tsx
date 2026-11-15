import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Profile } from '@/lib/supabase';
import {
  Users,
  Plus,
  Check,
  ArrowLeft,
  Search,
  Loader2,
  Music,
  Headphones,
  Zap,
  Guitar,
  Disc3,
  Radio,
  Mic,
  Coffee,
  Play,
  Pause,
} from 'lucide-react';

type Community = {
  id: string;
  name: string;
  description: string;
  genre: string;
  icon: string;
  member_count: number;
  created_at: string;
};

type CommunityMember = {
  id: string;
  community_id: string;
  user_id: string;
  joined_at: string;
};

type Beat = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  bpm: number;
  cover_url: string | null;
  play_count: number;
  created_at: string;
};

const ICON_MAP: Record<string, typeof Music> = {
  Coffee,
  Zap,
  Guitar,
  Disc3,
  Radio,
  Mic,
};

const GENRE_GRADIENTS: Record<string, string> = {
  'Lo-Fi': 'from-amber-500/30 to-orange-600/20',
  'Трэп': 'from-red-500/30 to-purple-600/20',
  'Рок': 'from-red-600/30 to-orange-700/20',
  House: 'from-blue-500/30 to-cyan-600/20',
  Техно: 'from-slate-500/30 to-gray-700/20',
  'Хип-Хоп': 'from-yellow-500/30 to-amber-700/20',
};

function getGradient(genre: string): string {
  return GENRE_GRADIENTS[genre] ?? 'from-theme-primary/30 to-theme-accent/20';
}

function getIcon(name: string): typeof Music {
  return ICON_MAP[name] ?? Music;
}

export default function CommunitiesPage() {
  const { profile, isGuest } = useAuth();
  const [loading, setLoading] = useState(true);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [openCommunity, setOpenCommunity] = useState<Community | null>(null);

  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('communities')
      .select('id, name, description, genre, icon, member_count, created_at')
      .order('member_count', { ascending: false });

    if (error) {
      console.error('Communities fetch error:', error);
      setLoading(false);
      return;
    }
    setCommunities((data ?? []) as Community[]);
    setLoading(false);
  }, []);

  const fetchJoined = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('community_members')
      .select('community_id')
      .eq('user_id', profile.id);

    if (error) {
      console.error('Joined fetch error:', error);
      return;
    }
    setJoinedIds(new Set((data ?? []).map((r: CommunityMember) => r.community_id)));
  }, [profile]);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  useEffect(() => {
    fetchJoined();
  }, [fetchJoined]);

  const handleToggleJoin = async (community: Community) => {
    if (!profile || isGuest) return;
    if (joinedIds.has(community.id)) {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', community.id)
        .eq('user_id', profile.id);
      if (error) {
        console.error('Leave error:', error);
        return;
      }
      setJoinedIds((prev) => {
        const next = new Set(prev);
        next.delete(community.id);
        return next;
      });
      setCommunities((prev) =>
        prev.map((c) =>
          c.id === community.id ? { ...c, member_count: Math.max(0, c.member_count - 1) } : c
        )
      );
    } else {
      const { error } = await supabase.from('community_members').insert({
        community_id: community.id,
        user_id: profile.id,
      });
      if (error) {
        console.error('Join error:', error);
        return;
      }
      setJoinedIds((prev) => new Set(prev).add(community.id));
      setCommunities((prev) =>
        prev.map((c) => (c.id === community.id ? { ...c, member_count: c.member_count + 1 } : c))
      );
    }
  };

  const genres = ['all', ...Array.from(new Set(communities.map((c) => c.genre)))];

  const filtered = communities.filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchesGenre = genreFilter === 'all' || c.genre === genreFilter;
    return matchesSearch && matchesGenre;
  });

  // Community detail view
  if (openCommunity) {
    return (
      <CommunityDetail
        community={openCommunity}
        isJoined={joinedIds.has(openCommunity.id)}
        onToggleJoin={() => handleToggleJoin(openCommunity)}
        onBack={() => setOpenCommunity(null)}
        currentUserId={profile?.id}
      />
    );
  }

  // Grid view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Users className="w-6 h-6 text-theme-primary" />
          Сообщества
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          Объединяйся по музыкальным вкусам — Lo-Fi, Трэп, Рок и больше
        </p>
      </div>

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск сообществ..."
            className="w-full pl-10 pr-3 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {genres.map((g) => (
            <button
              key={g}
              onClick={() => setGenreFilter(g)}
              className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                genreFilter === g
                  ? 'bg-theme-primary text-white'
                  : 'bg-theme-surface2 text-theme-muted hover:text-theme-text border border-theme-border'
              }`}
            >
              {g === 'all' ? 'Все' : g}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-theme-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-theme-muted text-sm">
          Ничего не найдено. Попробуй изменить запрос.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const Icon = getIcon(c.icon);
            const isJoined = joinedIds.has(c.id);
            return (
              <div
                key={c.id}
                className="glass-surface bg-theme-surface/60 border border-theme-border rounded-2xl overflow-hidden hover:border-theme-primary transition-colors"
              >
                <button
                  onClick={() => setOpenCommunity(c)}
                  className={`w-full text-left bg-gradient-to-br ${getGradient(c.genre)} p-5`}
                >
                  <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center mb-3">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-theme-text text-lg font-bold">{c.name}</h3>
                  <p className="text-theme-muted text-sm mt-1 line-clamp-2">{c.description}</p>
                </button>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-theme-muted text-xs">
                      <Users className="w-3.5 h-3.5" />
                      {c.member_count}
                    </span>
                    <span className="px-2 py-0.5 bg-theme-primary-bg text-theme-primary-text text-xs rounded-full">
                      {c.genre}
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleJoin(c)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isJoined
                        ? 'bg-theme-surface2 text-theme-muted border border-theme-border hover:text-theme-danger'
                        : 'bg-theme-primary text-white hover:bg-theme-primary-hover'
                    }`}
                  >
                    {isJoined ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Вы участник
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        Вступить
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Community Detail ---------- */

function CommunityDetail({
  community,
  isJoined,
  onToggleJoin,
  onBack,
  currentUserId,
}: {
  community: Community;
  isJoined: boolean;
  onToggleJoin: () => void;
  onBack: () => void;
  currentUserId: string | undefined;
}) {
  const [members, setMembers] = useState<Profile[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [actualMemberCount, setActualMemberCount] = useState(0);
  const [playingBeat, setPlayingBeat] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Fetch members
      const { data: memberRows } = await supabase
        .from('community_members')
        .select('user_id')
        .eq('community_id', community.id)
        .limit(20);

      const memberIds = ((memberRows ?? []) as Pick<CommunityMember, 'user_id'>[]).map(
        (r) => r.user_id
      );
      setActualMemberCount(memberIds.length);
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, bio, xp, level, coins, created_at, updated_at, is_online, last_seen')
          .in('id', memberIds);
        setMembers((profiles ?? []) as Profile[]);
      }

      // Fetch beats in this genre
      const { data: beatRows } = await supabase
        .from('beats')
        .select('id, user_id, title, genre, bpm, cover_url, play_count, created_at')
        .ilike('genre', community.genre)
        .order('play_count', { ascending: false })
        .limit(10);
      setBeats((beatRows ?? []) as Beat[]);

      setLoading(false);
    };
    load();
  }, [community.id, community.genre]);

  const Icon = getIcon(community.icon);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-theme-muted hover:text-theme-text text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Назад к сообществам
      </button>

      {/* Header */}
      <div className={`glass-surface bg-gradient-to-br ${getGradient(community.genre)} border border-theme-border rounded-2xl p-6`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Icon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-theme-text">{community.name}</h1>
              <p className="text-theme-muted text-sm mt-1">{community.description}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-theme-muted text-xs">
                  <Users className="w-3.5 h-3.5" />
                  {community.member_count} участников
                  {actualMemberCount !== community.member_count && (
                    <span className="text-theme-muted/60 ml-1">(фактически: {actualMemberCount})</span>
                  )}
                </span>
                <span className="px-2 py-0.5 bg-theme-primary-bg text-theme-primary-text text-xs rounded-full">
                  {community.genre}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onToggleJoin}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 ${
              isJoined
                ? 'bg-theme-surface2 text-theme-muted border border-theme-border hover:text-theme-danger'
                : 'bg-theme-primary text-white hover:bg-theme-primary-hover'
            }`}
          >
            {isJoined ? (
              <>
                <Check className="w-4 h-4" />
                Вы участник
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Вступить
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-theme-primary animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Members */}
          <div className="glass-surface bg-theme-surface/60 border border-theme-border rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-theme-muted uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Участники ({members.length})
            </h2>
            {members.length === 0 ? (
              <p className="text-theme-muted text-sm text-center py-6">
                Пока нет участников. Будь первым!
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-theme-surface2/50 transition-colors">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-xs font-bold">
                        {m.username?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <span className="text-theme-text text-sm font-medium flex-1 truncate">
                      {m.username}
                      {m.id === currentUserId && (
                        <span className="text-theme-muted text-xs ml-1">(вы)</span>
                      )}
                    </span>
                    {m.last_seen && (Date.now() - new Date(m.last_seen).getTime()) / 1000 < 120 && (
                      <span className="w-2 h-2 bg-theme-success rounded-full" title="онлайн" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent beats */}
          <div className="glass-surface bg-theme-surface/60 border border-theme-border rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-theme-muted uppercase tracking-wider mb-3 flex items-center gap-2">
              <Headphones className="w-4 h-4" />
              Биты в жанре {community.genre}
            </h2>
            {beats.length === 0 ? (
              <p className="text-theme-muted text-sm text-center py-6">
                Пока нет битов в этом жанре
              </p>
            ) : (
              <div className="space-y-2">
                {beats.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-theme-surface2/50 transition-colors"
                  >
                    <button
                      onClick={() => setPlayingBeat(playingBeat === b.id ? null : b.id)}
                      className="w-10 h-10 rounded-lg bg-theme-primary/20 flex items-center justify-center shrink-0 overflow-hidden hover:bg-theme-primary/30 transition-colors"
                    >
                      {playingBeat === b.id ? <Pause className="w-5 h-5 text-theme-primary" /> : <Play className="w-5 h-5 text-theme-primary" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-theme-text text-sm font-medium truncate">{b.title}</p>
                      <p className="text-theme-muted text-xs">{b.bpm} BPM</p>
                    </div>
                    <span className="text-theme-muted text-xs flex items-center gap-1">
                      <Headphones className="w-3 h-3" />
                      {b.play_count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
