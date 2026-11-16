import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from '@/lib/supabase';
import { isProfaneText } from '@/lib/profanity';

type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null }>;
  signInGuest: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  addXp: (amount: number) => Promise<void>;
  addCoins: (amount: number) => Promise<void>;
  checkAchievements: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const guestProfile: Profile = {
    id: 'guest',
    username: 'Гость',
    avatar_url: '/avatar-ghost.webp',
    bio: 'Гостевой режим',
    xp: 0,
    level: 1,
    coins: 100,
    is_online: true,
    last_seen: new Date().toISOString(),
  };

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Profile fetch error:', error);
      return;
    }
    if (!data) {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email || '';
      const username = (userData.user?.user_metadata as { username?: string } | undefined)?.username || email.split('@')[0] || 'Пользователь';
      const { error: insertError } = await supabase.from('profiles').insert({
        id: userId,
        username,
      });
      if (insertError) {
        console.error('Profile auto-create error:', insertError);
        return;
      }
      const { data: created } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      setProfile(created as Profile | null);
      return;
    }
    await supabase.from('profiles').update({ last_seen: new Date().toISOString(), is_online: true }).eq('id', userId);
    const { data: updated } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile((updated || data) as Profile | null);
  }, []);

  useEffect(() => {
    const savedGuest = localStorage.getItem('soundscape-guest');
    if (savedGuest === 'true') {
      setIsGuest(true);
      setProfile(guestProfile);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        fetchProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        fetchProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return { error: null };
    const ru: Record<string, string> = {
      'Invalid login credentials': 'Неверный email или пароль',
      'Email not confirmed': 'Email не подтверждён',
    };
    return { error: ru[error.message] || error.message };
  };

  const signUp = async (email: string, password: string, username: string) => {
    if (/\s/.test(username)) {
      return { error: 'В нике нельзя использовать пробелы' };
    }
    if (isProfaneText(username)) {
      return { error: 'Этот ник уже занят' };
    }
    const { data: takenProfile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username.replace(/[\\%_]/g, '\\$&'))
      .maybeSingle();
    if (takenProfile) {
      return { error: 'Этот ник уже занят' };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { username },
      },
    });
    if (error) {
      const ru: Record<string, string> = {
        'Password is known to be weak and easy to guess, please choose a different one.': 'Пароль слишком простой. Выберите более надёжный пароль (минимум 6 символов).',
        'User already registered': 'Аккаунт с этой почтой уже создан. Войдите с паролем или нажмите «Забыли пароль?» — пришлём ссылку для входа.',
        'Email rate limit exceeded': 'Слишком много попыток. Попробуйте позже.',
      };
      return { error: ru[error.message] || error.message };
    }
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        username,
      });
      if (profileError) {
        if (profileError.message.includes('profiles_username_lower_key')) {
          return { error: 'Этот ник уже занят' };
        }
        // Profile might already exist from a trigger — ignore duplicate key errors
        if (!profileError.message.includes('duplicate')) {
          return { error: profileError.message };
        }
      }

      // Auto-login: immediately sign in so the user doesn't need email confirmation
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // If auto-login fails (e.g. email confirmation is on), still report success
        // so the user sees the "check your email" message instead of an error
        return { error: null, success: true } as { error: string | null; success?: boolean };
      }

      // Send welcome notification email (fire-and-forget)
      fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://cccoflivuzxzujieuhvo.supabase.co'}/functions/v1/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'welcome', email, username }),
      }).catch(() => {});
    }
    return { error: null, success: true } as { error: string | null; success?: boolean };
  };

  const signInGuest = () => {
    localStorage.setItem('soundscape-guest', 'true');
    setIsGuest(true);
    setProfile(guestProfile);
  };

  const signOut = async () => {
    if (isGuest) {
      localStorage.removeItem('soundscape-guest');
      setIsGuest(false);
      setProfile(null);
      return;
    }
    if (session?.user) {
      await supabase.from('profiles').update({ last_seen: new Date().toISOString(), is_online: false }).eq('id', session.user.id);
    }
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  // Heartbeat: keep last_seen fresh while the tab is open
  useEffect(() => {
    if (!session?.user) return;
    const interval = setInterval(async () => {
      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString(), is_online: true })
        .eq('id', session.user.id);
    }, 20000);
    return () => clearInterval(interval);
  }, [session?.user]);

  // Mark last_seen on tab close
  useEffect(() => {
    if (!session?.user) return;
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjY29mbGl2dXp4enVqaWV1aHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4ODk3MDcsImV4cCI6MjEwNDQ2NTcwN30.-suTh6a9r7yQOPacLl7Ez8mrFIw7kKrepkqNT964bNI';
    const handler = () => {
      fetch(
        `https://cccoflivuzxzujieuhvo.supabase.co/rest/v1/profiles?id=eq.${session.user.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ last_seen: new Date().toISOString(), is_online: false }),
          keepalive: true,
        }
      ).catch(() => {});
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [session?.user]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (isGuest) {
      setProfile((prev) => prev ? { ...prev, ...updates } : prev);
      return;
    }
    if (!session?.user) return;
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id);
    if (!error) await refreshProfile();
  };

  const addXp = async (amount: number) => {
    if (!profile || isGuest || amount <= 0) return;
    const { error } = await supabase.rpc('change_xp', { p_amount: amount });
    if (!error) {
      await refreshProfile();
      checkAchievements();
    }
  };

  const addCoins = async (amount: number, reason = 'reward') => {
    if (!profile || isGuest || amount === 0) return;
    const { error } = await supabase.rpc('change_coins', { p_amount: amount, p_reason: reason });
    if (!error) await refreshProfile();
  };

  const checkAchievements = async () => {
    if (!session?.user || isGuest) return;
    try {
      const userId = session.user.id;
      const [beatsRes, gamesRes, chatRes, friendsRes, uaRes] = await Promise.all([
        supabase.from('beats').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('game_scores').select('score', { count: 'exact', head: false }).eq('user_id', userId),
        supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('friendships').select('id', { count: 'exact', head: true }).or(`user_id.eq.${userId},friend_id.eq.${userId}`),
        supabase.from('user_achievements').select('achievement_id').eq('user_id', userId),
      ]);

      const beatsCreated = beatsRes.count ?? 0;
      const gamesPlayed = gamesRes.count ?? 0;
      const highScore = Math.max(0, ...(gamesRes.data?.map((r: { score: number }) => r.score) ?? [0]));
      const chatMessages = chatRes.count ?? 0;
      const friends = friendsRes.count ?? 0;
      const earnedIds = new Set((uaRes.data ?? []).map((r: { achievement_id: string }) => r.achievement_id));

      const { data: allAchievements } = await supabase.from('achievements').select('*');
      if (!allAchievements) return;

      const checks: Record<string, () => boolean> = {
        beats_created: () => beatsCreated >= 1,
        recordings: () => beatsCreated >= 1,
        chat_messages: () => chatMessages >= 50,
        games_played: () => gamesPlayed >= 1,
        game_score: () => highScore >= 100,
        level: () => (profile?.level ?? 0) >= 5,
        friends: () => friends >= 3,
      };

      for (const ach of allAchievements) {
        if (earnedIds.has(ach.id)) continue;
        const check = checks[ach.requirement_type];
        if (check && check()) {
          await supabase.from('user_achievements').insert({
            user_id: userId,
            achievement_id: ach.id,
          });
          await addXp(ach.xp_reward ?? 0);
          await addCoins(ach.coin_reward ?? 0, `Награда: ${ach.name}`);
        }
      }
    } catch (e) {
      console.error('Achievement check error:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, isGuest, signIn, signUp, signInGuest, signOut, refreshProfile, updateProfile, addXp, addCoins, checkAchievements }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
