import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, xpProgress, type Achievement, type Friendship, type Profile, type Beat, type ProfileComment, PROFILE_COMMENT_COST_COINS } from '@/lib/supabase';
import { reachGoal } from '@/lib/metrika';
import PremiumButton from '@/components/PremiumButton';
import MessagePrivacyModal from '@/components/MessagePrivacyModal';
import { useLocale } from '@/context/LocaleContext';
import {
  User,
  Coins,
  Zap,
  Trophy,
  Users,
  Edit3,
  Save,
  X,
  Search,
  UserPlus,
  UserCheck,
  Shield,
  Check,
  Clock,
  ImageIcon,
  Circle,
  MessageSquare,
  ArrowLeft,
  Send,
  Loader2,
  Crown,
  Music,
  Trash2,
  EyeOff,
  Eye,
  ShoppingCart,
  MoreVertical,
  Edit2,
  Download,
} from 'lucide-react';

const AVATAR_OPTIONS = [
  '/avatar-cat.webp',
  '/avatar-robot.webp',
  '/avatar-astronaut.webp',
  '/avatar-music.webp',
  '/avatar-fox.webp',
  '/avatar-panda.webp',
  '/avatar-dragon.webp',
  '/avatar-ghost.webp',
];

export default function ProfilePage({
  viewUserId,
  onNavigateToProfile,
  onNavigateToMessages,
}: {
  viewUserId?: string | null;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToMessages?: (userId: string) => void;
}) {
  const { profile, session, isGuest, updateProfile, addXp, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [earnedIds, setEarnedIds] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<Profile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [gameScores, setGameScores] = useState<{ game_name: string; score: number }[]>([]);
  const [viewedProfile, setViewedProfile] = useState<Profile | null>(null);
  const [viewedLoading, setViewedLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userBeats, setUserBeats] = useState<Beat[]>([]);
  const [viewedBeats, setViewedBeats] = useState<Beat[]>([]);
  const [profileComments, setProfileComments] = useState<ProfileComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentAuthors, setCommentAuthors] = useState<Record<string, Profile>>({});
  const [menuOpenBeatId, setMenuOpenBeatId] = useState<string | null>(null);
  const [renamingBeat, setRenamingBeat] = useState<Beat | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const isViewingOther = !!viewUserId && viewUserId !== profile?.id;
  const displayProfile = isViewingOther ? viewedProfile : profile;

  const loadViewedProfile = useCallback(async (uid: string) => {
    setViewedLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (!error && data) setViewedProfile(data as Profile);
    setViewedLoading(false);
  }, []);

  const loadData = useCallback(async () => {
    if (!profile || isGuest) return;

    const [achRes, earnedRes, friendsRes, pendingRes, scoresRes] = await Promise.all([
      supabase.from('achievements').select('*'),
      supabase.from('user_achievements').select('achievement_id').eq('user_id', profile.id),
      supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
        .eq('status', 'accepted'),
      supabase
        .from('friendships')
        .select('*')
        .eq('addressee_id', profile.id)
        .eq('status', 'pending'),
      supabase
        .from('game_scores')
        .select('game_name, score')
        .eq('user_id', profile.id)
        .order('score', { ascending: false }),
    ]);

    if (achRes.data) setAchievements(achRes.data);
    if (earnedRes.data) setEarnedIds(new Set(earnedRes.data.map((e) => e.achievement_id)));

    if (friendsRes.data) {
      const friendIds = friendsRes.data.map((f) =>
        f.requester_id === profile.id ? f.addressee_id : f.requester_id
      );
      if (friendIds.length > 0) {
        const { data: friendProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', friendIds);
        if (friendProfiles) setFriends(friendProfiles as Profile[]);
      }
    }

    if (pendingRes.data) setPendingRequests(pendingRes.data as Friendship[]);
    if (scoresRes.data) {
      const best: Record<string, number> = {};
      scoresRes.data.forEach((s) => {
        if (!best[s.game_name] || best[s.game_name] < s.score) {
          best[s.game_name] = s.score;
        }
      });
      setGameScores(Object.entries(best).map(([game_name, score]) => ({ game_name, score })));
    }

    const beatsRes = await supabase.from('beats').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    if (beatsRes.data) setUserBeats(beatsRes.data as Beat[]);
  }, [profile, isGuest]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
      if (profile.is_premium && profile.premium_expires_at) {
        const expired = new Date(profile.premium_expires_at).getTime() < Date.now();
        if (expired && !isGuest) {
          supabase.from('profiles').update({ is_premium: false }).eq('id', profile.id).then(() => refreshProfile());
        }
      }
    }
  }, [profile, isGuest, refreshProfile]);

  // Live debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim() || !profile) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${searchQuery.trim()}%`)
        .neq('id', profile.id)
        .limit(10);
      if (!error && data) setSearchResults(data as Profile[]);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, profile]);

  const handleSave = async () => {
    await updateProfile({ username, bio, avatar_url: avatarUrl || null });
    setEditing(false);
  };

  const searchUsers = async () => {
    if (!searchQuery.trim() || !profile) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${searchQuery.trim()}%`)
      .neq('id', profile.id)
      .limit(10);
    if (data) setSearchResults(data as Profile[]);
  };

  const sendFriendRequest = async (addresseeId: string) => {
    if (!profile) return;
    if (isGuest) {
      showMessage(t('Войдите в аккаунт, чтобы добавлять друзей'));
      return;
    }
    // Check if request already exists
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .or(`and(requester_id.eq.${profile.id},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${profile.id}))`)
      .maybeSingle();
    if (existing) {
      showMessage(t('Запрос в друзья уже отправлен'));
      return;
    }
    const { error } = await supabase.from('friendships').insert({
      requester_id: profile.id,
      addressee_id: addresseeId,
      status: 'pending',
    });
    if (!error) {
      showMessage(t('Запрос на дружбу отправлен'));
      setSearchResults((prev) => prev.filter((u) => u.id !== addresseeId));
    }
  };

  const acceptFriend = async (requesterId: string) => {
    if (!profile) return;
    await supabase
      .from('friendships')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('requester_id', requesterId)
      .eq('addressee_id', profile.id);
    setPendingRequests((prev) => prev.filter((r) => r.requester_id !== requesterId));
    loadData();
    await addXp(20);
  };

  const toggleBeatVisibility = async (beatId: string, currentPublic: boolean) => {
    const { error } = await supabase.from('beats').update({ is_public: !currentPublic }).eq('id', beatId).eq('user_id', profile?.id);
    if (!error) {
      setUserBeats((prev) => prev.map((b) => b.id === beatId ? { ...b, is_public: !currentPublic } : b));
      showMessage(currentPublic ? t('Трек скрыт из публичного доступа') : t('Трек снова доступен публике'));
      setMenuOpenBeatId(null);
    }
  };

  const renameBeat = async () => {
    if (!profile || !renamingBeat || !renameValue.trim()) return;
    const { error } = await supabase.from('beats').update({ title: renameValue.trim() }).eq('id', renamingBeat.id).eq('user_id', profile.id);
    if (!error) {
      setUserBeats((prev) => prev.map((b) => (b.id === renamingBeat.id ? { ...b, title: renameValue.trim() } : b)));
      showMessage(t('Трек переименован'));
    }
    setRenamingBeat(null);
    setRenameValue('');
    setMenuOpenBeatId(null);
  };

  const downloadBeat = (beat: Beat) => {
    if (beat.audio_url) {
      const a = document.createElement('a');
      a.href = beat.audio_url;
      a.download = beat.title;
      a.click();
      reachGoal('beat_download');
    } else {
      showMessage(t('Этот бит не имеет аудиофайла для скачивания'));
    }
    setMenuOpenBeatId(null);
  };

  const deleteBeat = async (beatId: string) => {
    if (!confirm(t('Удалить трек навсегда?'))) return;
    const { error } = await supabase.from('beats').delete().eq('id', beatId).eq('user_id', profile?.id);
    if (!error) {
      setUserBeats((prev) => prev.filter((b) => b.id !== beatId));
      showMessage(t('Трек удалён'));
    }
  };

  const loadProfileComments = useCallback(async (uid: string) => {
    const { data } = await supabase.from('profile_comments').select('*').eq('profile_user_id', uid).order('created_at', { ascending: false });
    if (data) {
      setProfileComments(data as ProfileComment[]);
      const authorIds = [...new Set((data as ProfileComment[]).map((c) => c.author_id))];
      if (authorIds.length > 0) {
        const { data: authors } = await supabase.from('profiles').select('*').in('id', authorIds);
        if (authors) {
          const map: Record<string, Profile> = {};
          (authors as Profile[]).forEach((a) => { map[a.id] = a; });
          setCommentAuthors(map);
        }
      }
    }
  }, []);

  const loadViewedBeats = useCallback(async (uid: string) => {
    const { data } = await supabase.from('beats').select('*').eq('user_id', uid).eq('is_public', true).order('created_at', { ascending: false });
    if (data) setViewedBeats(data as Beat[]);
  }, []);

  useEffect(() => {
    if (isViewingOther && viewUserId) {
      setViewedProfile(null);
      loadViewedProfile(viewUserId);
      loadProfileComments(viewUserId);
      loadViewedBeats(viewUserId);
    } else {
      setViewedProfile(null);
    }
  }, [viewUserId, isViewingOther, loadViewedProfile, loadProfileComments, loadViewedBeats]);

  const postComment = async () => {
    if (!profile || !viewedProfile || !commentText.trim()) return;
    if (isGuest) { setCommentError(t('Войдите в аккаунт')); return; }
    if (profile.coins < PROFILE_COMMENT_COST_COINS) {
      setCommentError(t('Нужно') + ' ' + PROFILE_COMMENT_COST_COINS + ' ' + t('монет') + '. ' + t('У вас') + ' ' + profile.coins + '.');
      return;
    }
    setPostingComment(true);
    setCommentError(null);
    const { data, error } = await supabase.from('profile_comments').insert({
      profile_user_id: viewedProfile.id,
      author_id: profile.id,
      content: commentText.trim(),
      coins_spent: PROFILE_COMMENT_COST_COINS,
    }).select('*').single();
    if (error) {
      setCommentError(t('Не удалось опубликовать комментарий'));
      setPostingComment(false);
      return;
    }
    const { error: chargeError } = await supabase.rpc('change_coins', {
      p_amount: -PROFILE_COMMENT_COST_COINS,
      p_reason: `Комментарий на профиле ${viewedProfile.username}`,
    });
    if (chargeError) {
      await supabase.from('profile_comments').delete().eq('id', (data as ProfileComment).id).eq('author_id', profile.id);
      setCommentError(t('Недостаточно монет или операция недоступна'));
      setPostingComment(false);
      return;
    }
    await refreshProfile();
    setProfileComments((prev) => [data as ProfileComment, ...prev]);
    setCommentAuthors((prev) => ({ ...prev, [profile.id]: profile }));
    setCommentText('');
    setPostingComment(false);
  };

  const deleteComment = async (commentId: string) => {
    if (!profile) return;
    const { error } = await supabase.from('profile_comments').delete().eq('id', commentId).eq('author_id', profile.id);
    if (!error) {
      setProfileComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  const isRecentlyActive = (lastSeen?: string | null) => {
    if (!lastSeen) return false;
    const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    return diff < 300;
  };

  const formatLastSeen = (lastSeen?: string | null) => {
    if (!lastSeen) return t('Не в сети');
    const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    if (diff < 60) return t('был(а) недавно');
    if (diff < 3600) return t('был(а)') + ' ' + Math.floor(diff / 60) + ' ' + t('мин назад');
    if (diff < 86400) return t('был(а)') + ' ' + Math.floor(diff / 3600) + ' ' + t('ч назад');
    return t('был(а)') + ' ' + new Date(lastSeen).toLocaleDateString('ru');
  };

  useEffect(() => {
    const handleClick = () => setMenuOpenBeatId(null);
    if (menuOpenBeatId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenBeatId]);

  if (!profile) return null;

  const progress = xpProgress(profile.xp);

  // Other user's profile view
  if (isViewingOther) {
    if (viewedLoading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-theme-primary border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (!viewedProfile) {
      return (
        <div className="space-y-4">
          <button
            onClick={() => onNavigateToProfile?.(profile.id)}
            className="flex items-center gap-2 text-theme-muted hover:text-theme-text text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t('Назад в профиль')}
          </button>
          <p className="text-theme-muted text-sm">{t('Пользователь не найден.')}</p>
        </div>
      );
    }

    const otherProgress = xpProgress(viewedProfile.xp);

    return (
      <div className="space-y-6">
        <button
          onClick={() => onNavigateToProfile?.(profile.id)}
          className="flex items-center gap-2 text-theme-muted hover:text-theme-text text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('Назад в профиль')}
        </button>

        <div className="glass-surface bg-gradient-to-br from-theme-surface2 via-theme-surface to-theme-bg border border-theme-border rounded-2xl p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="shrink-0">
              {viewedProfile.avatar_url ? (
                <img src={viewedProfile.avatar_url} alt="" className="w-24 h-24 rounded-2xl object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-3xl font-bold">
                  {viewedProfile.username[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-theme-text">{viewedProfile.username}</h1>
                {viewedProfile.is_premium && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-theme-warning to-theme-accent text-white text-xs font-bold">
                    <Crown className="w-3 h-3" /> Premium
                  </span>
                )}
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-theme-surface2 border border-theme-border">
                  <Circle
                    className={`w-2.5 h-2.5 ${isRecentlyActive(viewedProfile.last_seen) ? 'fill-theme-success text-theme-success' : 'fill-theme-muted text-theme-muted'}`}
                  />
                  <span className="text-xs text-theme-muted">
                    {isRecentlyActive(viewedProfile.last_seen) ? t('в сети') : formatLastSeen(viewedProfile.last_seen)}
                  </span>
                </div>
              </div>
              <p className="text-theme-muted text-sm mt-1">
                {viewedProfile.bio || t('Описание отсутствует.')}
              </p>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-1.5 text-sm">
                  <Zap className="w-4 h-4 text-theme-primary" />
                  <span className="text-theme-text font-medium">{viewedProfile.xp}</span>
                  <span className="text-theme-muted text-xs">XP</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <User className="w-4 h-4 text-theme-success" />
                  <span className="text-theme-text font-medium">Уровень {viewedProfile.level}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Coins className="w-4 h-4 text-theme-warning" />
                  <span className="text-theme-text font-medium">{viewedProfile.coins}</span>
                  <span className="text-theme-muted text-xs">{t('монет')}</span>
                </div>
              </div>
              <div className="mt-4 max-w-md">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-theme-muted">{t('Уровень')} {viewedProfile.level}</span>
                  <span className="text-theme-muted">
                    {otherProgress.current}/{otherProgress.needed} XP
                  </span>
                </div>
                <div className="h-2 bg-theme-surface2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-theme-primary to-theme-accent rounded-full transition-all duration-500"
                    style={{ width: `${otherProgress.percent}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => onNavigateToMessages?.(viewedProfile.id)}
                  className="px-4 py-2.5 bg-theme-primary text-white rounded-xl text-sm font-medium hover:bg-theme-primary-hover transition-colors flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" /> {t('Написать сообщение')}
                </button>
                {friends.some((f) => f.id === viewedProfile.id) ? (
                  <span className="px-4 py-2.5 bg-theme-success/15 text-theme-success rounded-xl text-sm font-medium flex items-center gap-2 border border-theme-success/30">
                    <UserCheck className="w-4 h-4" /> {t('Ваш друг')}
                  </span>
                ) : (
                  <button
                    onClick={() => sendFriendRequest(viewedProfile.id)}
                    className="px-4 py-2.5 bg-theme-surface2 text-theme-text rounded-xl text-sm font-medium hover:bg-theme-border transition-colors flex items-center gap-2 border border-theme-border"
                  >
                    <UserPlus className="w-4 h-4" /> {t('В друзья')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Viewed profile: tracks */}
        {viewedBeats.length > 0 && (
          <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
            <h3 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
              <Music className="w-4 h-4 text-theme-primary" />
              {t('Треки')} ({viewedBeats.length})
            </h3>
            <div className="space-y-2">
              {viewedBeats.map((beat) => (
                <div key={beat.id} className="flex items-center gap-3 p-2 bg-theme-surface2 rounded-lg">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center shrink-0">
                    <Music className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-theme-text truncate">{beat.title}</p>
                    <p className="text-xs text-theme-muted">{t(beat.genre)} • {beat.bpm} BPM • {beat.play_count} {t('прослушиваний')}</p>
                  </div>
                  {beat.download_price ? (
                    <span className="text-xs text-theme-warning flex items-center gap-1 shrink-0">
                      <Coins className="w-3 h-3" />{beat.download_price}
                    </span>
                  ) : (
                    <span className="text-xs text-theme-success shrink-0">{t('Бесплатно')}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Viewed profile: comments */}
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-theme-accent" />
            {t('Комментарии')} ({profileComments.length})
          </h3>
          <p className="text-xs text-theme-warning mb-3 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" />
            {t('Каждый комментарий стоит')} {PROFILE_COMMENT_COST_COINS} {t('монет')}
          </p>
          {!isGuest && (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !postingComment && postComment()}
                placeholder={t('Оставить комментарий...')}
                className="flex-1 px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
              />
              <button
                onClick={postComment}
                disabled={postingComment || !commentText.trim()}
                className="px-3 py-2 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {postingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          )}
          {commentError && (
            <p className="text-xs text-theme-danger mb-3">{commentError}</p>
          )}
          {profileComments.length === 0 ? (
            <p className="text-xs text-theme-muted">{t('Комментариев пока нет. Будь первым!')}</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {profileComments.map((c) => {
                const author = commentAuthors[c.author_id];
                return (
                  <div key={c.id} className="flex gap-3 p-3 bg-theme-surface2 rounded-lg">
                    <div className="shrink-0">
                      {author?.avatar_url ? (
                        <img src={author.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-xs font-bold">
                          {(author?.username || '?')[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <button
                          onClick={() => author && onNavigateToProfile?.(author.id)}
                          className="text-xs font-medium text-theme-text hover:text-theme-primary transition-colors"
                        >
                          {author?.username || t('Пользователь')}
                        </button>
                        <span className="text-[10px] text-theme-muted">{new Date(c.created_at).toLocaleDateString('ru')}</span>
                        <span className="text-[10px] text-theme-warning flex items-center gap-0.5">
                          <Coins className="w-2.5 h-2.5" />{c.coins_spent}
                        </span>
                        {c.author_id === profile?.id && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="ml-auto text-theme-muted hover:text-theme-danger transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-theme-text break-words">{c.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Own profile
  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-theme-primary text-white rounded-xl text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}
      {/* Profile header */}
      <div className="glass-surface bg-gradient-to-br from-theme-surface2 via-theme-surface to-theme-bg border border-theme-border rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-24 h-24 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-3xl font-bold">
                {profile.username[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-3">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary w-full max-w-xs"
                  placeholder={t('Имя пользователя')}
                />
                <div>
                  <label className="text-xs font-medium text-theme-muted mb-2 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    {t('Выбрать аватар')}
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-3">
                    {AVATAR_OPTIONS.map((av) => (
                      <button
                        key={av}
                        onClick={() => setAvatarUrl(av)}
                        className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                          avatarUrl === av
                            ? 'border-theme-primary ring-2 ring-theme-primary/30 scale-105'
                            : 'border-theme-border hover:border-theme-muted'
                        }`}
                      >
                        <img src={av} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary w-full max-w-xs"
                    placeholder={t('Или вставь ссылку на аватар')}
                  />
                </div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary w-full max-w-md resize-none"
                  rows={2}
                  placeholder={t('О себе')}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" /> {t('Сохранить')}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 bg-theme-surface2 text-theme-text rounded-lg text-sm font-medium hover:bg-theme-border transition-colors flex items-center gap-2"
                  >
                    <X className="w-4 h-4" /> {t('Отмена')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-theme-text">{profile.username}</h1>
                  {profile.is_premium && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-theme-warning to-theme-accent text-white text-xs font-bold">
                      <Crown className="w-3 h-3" /> Premium
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-theme-surface2 border border-theme-border">
                    <Circle
                      className={`w-2.5 h-2.5 ${isRecentlyActive(profile.last_seen) ? 'fill-theme-success text-theme-success' : 'fill-theme-muted text-theme-muted'}`}
                    />
                    <span className="text-xs text-theme-muted">
                      {isRecentlyActive(profile.last_seen) ? t('в сети') : formatLastSeen(profile.last_seen)}
                    </span>
                  </div>
                  <button
                    onClick={() => setEditing(true)}
                    className="p-1.5 text-theme-muted hover:text-theme-primary transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-theme-muted text-sm mt-1">
                  {profile.bio || t('Описание отсутствует. Нажми на карандаш, чтобы добавить.')}
                </p>
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Zap className="w-4 h-4 text-theme-primary" />
                    <span className="text-theme-text font-medium">{profile.xp}</span>
                    <span className="text-theme-muted text-xs">XP</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <User className="w-4 h-4 text-theme-success" />
                    <span className="text-theme-text font-medium">{t('Уровень')} {profile.level}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Coins className="w-4 h-4 text-theme-warning" />
                    <span className="text-theme-text font-medium">{profile.coins}</span>
                    <span className="text-theme-muted text-xs">{t('монет')}</span>
                  </div>
                </div>
                <div className="mt-4 max-w-md">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-theme-muted">{t('Уровень')} {profile.level}</span>
                    <span className="text-theme-muted">
                      {progress.current}/{progress.needed} XP {t('до следующего уровня')}
                    </span>
                  </div>
                  <div className="h-2 bg-theme-surface2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-theme-primary to-theme-accent rounded-full transition-all duration-500"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
                {!profile.is_premium && !isGuest && (
                  <div className="mt-4">
                    <PremiumButton />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Privacy settings */}
      {!isViewingOther && !isGuest && (
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-theme-text flex items-center gap-2">
                <Shield className="w-4 h-4 text-theme-primary" />
                {t('Приватность и доступ')}
              </h3>
              <p className="text-xs text-theme-muted mt-1">
                {t('Кто может писать вам, звонить и отправлять заявки в друзья, а также чёрный список')}
              </p>
            </div>
            <button
              onClick={() => setShowPrivacy(true)}
              className="px-4 py-2 bg-theme-surface2 border border-theme-border text-theme-text rounded-lg text-sm font-medium hover:border-theme-primary transition-colors shrink-0"
            >
              {t('Открыть настройки')}
            </button>
          </div>
        </div>
      )}

      {showPrivacy && <MessagePrivacyModal onClose={() => setShowPrivacy(false)} />}

      {/* Pending friend requests */}
      {pendingRequests.length > 0 && (
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-theme-warning" />
            {t('Заявки в друзья')} ({pendingRequests.length})
          </h3>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-theme-surface2 rounded-lg">
                <span className="text-sm text-theme-text">{t('Заявка в друзья')}</span>
                <button
                  onClick={() => acceptFriend(req.requester_id)}
                  className="px-3 py-1.5 bg-theme-success text-white rounded-lg text-xs font-medium hover:bg-theme-success/90 transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> {t('Принять')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends + Search */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-theme-primary" />
            {t('Друзья')} ({friends.length})
          </h3>
          {friends.length === 0 ? (
            <p className="text-xs text-theme-muted">{t('Друзей пока нет. Найди пользователей ниже, чтобы добавить.')}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {friends.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onNavigateToProfile?.(f.id)}
                  className="w-full flex items-center gap-3 p-2 bg-theme-surface2 rounded-lg hover:bg-theme-border transition-colors text-left"
                >
                  <div className="relative shrink-0">
                    {f.avatar_url ? (
                      <img src={f.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-xs font-bold">
                        {f.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <Circle
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${isRecentlyActive(f.last_seen) ? 'fill-theme-success text-theme-success' : 'fill-theme-muted text-theme-muted'} bg-theme-surface2 rounded-full`}
                    />
                  </div>
                  <div>
                    <p className="text-sm text-theme-text">{f.username}</p>
                    <p className="text-xs text-theme-muted">
                      {isRecentlyActive(f.last_seen) ? t('в сети') : `${t('Уровень')} ${f.level}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-theme-success" />
            {t('Найти друзей')}
          </h3>
          <div className="flex gap-2 mb-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
              placeholder={t('Поиск по имени...')}
              className="flex-1 px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
            />
            <button
              onClick={searchUsers}
              className="px-3 py-2 bg-theme-surface2 text-theme-text rounded-lg text-sm hover:bg-theme-border transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {searchQuery.trim() && searchResults.length === 0 && (
            <p className="text-xs text-theme-muted py-2">{t('Никого не найдено. Попробуйте другое имя.')}</p>
          )}
          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {searchResults.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-2 bg-theme-surface2 rounded-lg">
                  <button
                    onClick={() => onNavigateToProfile?.(u.id)}
                    className="flex items-center gap-2 text-left"
                  >
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-xs font-bold">
                        {u.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm text-theme-text">{u.username}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onNavigateToProfile?.(u.id)}
                      className="px-2 py-1 text-theme-muted hover:text-theme-text text-xs transition-colors"
                      title={t('Открыть профиль')}
                    >
                      <User className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => sendFriendRequest(u.id)}
                      className="px-2.5 py-1 bg-theme-primary text-white rounded-lg text-xs font-medium hover:bg-theme-primary-hover transition-colors flex items-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" /> {t('В друзья')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* My Tracks */}
      {userBeats.length > 0 && (
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
            <Music className="w-4 h-4 text-theme-primary" />
            {t('Мои треки')} ({userBeats.length})
          </h3>
          <div className="space-y-2">
            {userBeats.map((beat) => (
              <div key={beat.id} className="flex items-center gap-3 p-3 bg-theme-surface2 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-theme-primary/20 flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4 text-theme-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-theme-text truncate">{beat.title}</p>
                  <p className="text-xs text-theme-muted">
                    {t(beat.genre)} • {beat.play_count} {t('прослушиваний')}
                    {beat.is_public === false && <span className="text-theme-warning"> • {t('Скрыт')}</span>}
                    {beat.download_price ? <span className="text-theme-warning"> • {beat.download_price} {t('монет')}</span> : null}
                  </p>
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpenBeatId(menuOpenBeatId === beat.id ? null : beat.id); }}
                    className="p-1.5 text-theme-muted hover:text-theme-text transition-colors rounded-lg hover:bg-theme-surface"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {menuOpenBeatId === beat.id && (
                    <div
                      className="absolute right-0 top-full mt-1 z-30 w-48 bg-theme-surface border border-theme-border rounded-xl shadow-xl py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => { setRenamingBeat(beat); setRenameValue(beat.title); setMenuOpenBeatId(null); }}
                        className="w-full px-3 py-2 text-left text-sm text-theme-text hover:bg-theme-surface2 flex items-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" /> {t('Переименовать')}
                      </button>
                      <button
                        onClick={() => toggleBeatVisibility(beat.id, beat.is_public !== false)}
                        className="w-full px-3 py-2 text-left text-sm text-theme-text hover:bg-theme-surface2 flex items-center gap-2"
                      >
                        {beat.is_public !== false ? <><EyeOff className="w-4 h-4" /> {t('Сделать приватным')}</> : <><Eye className="w-4 h-4" /> {t('Сделать публичным')}</>}
                      </button>
                      <button
                        onClick={() => downloadBeat(beat)}
                        className="w-full px-3 py-2 text-left text-sm text-theme-text hover:bg-theme-surface2 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" /> {t('Скачать')}
                      </button>
                      <div className="border-t border-theme-border my-1" />
                      <button
                        onClick={() => deleteBeat(beat.id)}
                        className="w-full px-3 py-2 text-left text-sm text-theme-danger hover:bg-theme-danger/10 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" /> {t('Удалить')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rename modal */}
      {renamingBeat && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { setRenamingBeat(null); setRenameValue(''); }}
        >
          <div
            className="glass-surface bg-theme-surface border border-theme-border rounded-2xl p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-theme-text font-semibold flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-theme-primary" /> {t('Переименовать трек')}
              </h3>
              <button onClick={() => { setRenamingBeat(null); setRenameValue(''); }} className="text-theme-muted hover:text-theme-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') renameBeat(); }}
              placeholder={t('Новое название')}
              className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
              autoFocus
            />
            <button
              onClick={renameBeat}
              disabled={!renameValue.trim()}
              className="w-full px-4 py-2 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors disabled:opacity-50"
            >
              {t('Сохранить')}
            </button>
          </div>
        </div>
      )}

      {/* Achievements */}
      <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
        <h3 className="text-sm font-medium text-theme-text mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-theme-warning" />
          {t('Достижения')} ({earnedIds.size}/{achievements.length})
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {achievements.map((ach) => {
            const earned = earnedIds.has(ach.id);
            return (
              <div
                key={ach.id}
                className={`p-4 rounded-xl border text-center transition-all ${
                  earned
                    ? 'bg-gradient-to-br from-theme-warning/10 to-theme-primary/10 border-theme-warning'
                    : 'bg-theme-surface2/30 border-theme-border opacity-50'
                }`}
              >
                <div className={`text-2xl mb-2 ${earned ? '' : 'grayscale'}`}>
                  {earned ? '🏆' : '🔒'}
                </div>
                <p className="text-theme-text text-xs font-medium mb-1">{ach.name}</p>
                <p className="text-theme-muted text-[10px] leading-tight">{ach.description}</p>
                {earned && (
                  <p className="text-theme-warning text-[10px] mt-1">+{ach.xp_reward} XP</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Game scores */}
      {gameScores.length > 0 && (
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-theme-accent" />
            {t('Рекорды')}
          </h3>
          <div className="space-y-2">
            {gameScores.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-theme-surface2 rounded-lg">
                <span className="text-sm text-theme-text capitalize">{s.game_name}</span>
                <span className="text-sm text-theme-text font-mono">{s.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
