import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, UserMinus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';

export type AllowlistScope = 'friend_request' | 'message' | 'call';
type AllowedUser = { id: string; username: string };

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export default function AllowlistEditor({ scope }: { scope: AllowlistScope }) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const { data: rows, error: rowsError } = await supabase
        .from('access_allowlist')
        .select('allowed_id')
        .eq('owner_id', profile.id)
        .eq('scope', scope);
      if (cancelled) return;
      if (rowsError) {
        setError(t('Не удалось загрузить список пользователей'));
        setLoading(false);
        return;
      }
      const ids = (rows ?? []).map((row) => row.allowed_id as string);
      if (ids.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', ids);
      if (cancelled) return;
      if (profilesError) {
        setError(t('Не удалось загрузить список пользователей'));
      } else {
        setUsers((profiles ?? []) as AllowedUser[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, scope, t]);

  const addUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    const name = nickname.trim();
    if (!name) return;
    setBusy(true);
    setError(null);

    const { data: found, error: findError } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', escapeLike(name))
      .maybeSingle();
    if (findError) {
      setError(t('Не удалось найти пользователя'));
      setBusy(false);
      return;
    }
    if (!found) {
      setError(t('Пользователь с таким ником не найден'));
      setBusy(false);
      return;
    }
    if (found.id === profile.id) {
      setError(t('Нельзя добавить самого себя'));
      setBusy(false);
      return;
    }
    if (users.some((user) => user.id === found.id)) {
      setError(t('Этот пользователь уже в списке'));
      setBusy(false);
      return;
    }

    const { error: insertError } = await supabase
      .from('access_allowlist')
      .insert({ owner_id: profile.id, allowed_id: found.id, scope });
    if (insertError) {
      setError(t('Не удалось добавить пользователя'));
    } else {
      setUsers((prev) => [...prev, found as AllowedUser]);
      setNickname('');
    }
    setBusy(false);
  };

  const removeUser = async (allowedId: string) => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from('access_allowlist')
      .delete()
      .eq('owner_id', profile.id)
      .eq('allowed_id', allowedId)
      .eq('scope', scope);
    if (deleteError) {
      setError(t('Не удалось удалить пользователя'));
    } else {
      setUsers((prev) => prev.filter((user) => user.id !== allowedId));
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 space-y-3">
      <form onSubmit={addUser} className="flex gap-2">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value.replace(/\s/g, ''))}
          placeholder={t('Ник пользователя')}
          maxLength={32}
          className="flex-1 min-w-0 px-3 py-2 text-sm rounded-xl bg-theme-surface2 border border-theme-border text-theme-text placeholder:text-theme-muted focus:outline-none focus:border-theme-primary"
        />
        <button
          type="submit"
          disabled={busy || !nickname.trim()}
          className="px-3 py-2 text-sm font-medium rounded-xl bg-theme-primary text-theme-primary-text disabled:opacity-50 transition-opacity"
        >
          {t('Добавить')}
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-theme-muted" /></div>
      ) : users.length === 0 ? (
        <p className="text-xs text-theme-muted">{t('В списке пока никого нет')}</p>
      ) : (
        <ul className="space-y-1.5">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-theme-surface2 border border-theme-border">
              <span className="flex-1 min-w-0 text-sm text-theme-text truncate">{user.username}</span>
              <button
                type="button"
                onClick={() => removeUser(user.id)}
                disabled={busy}
                aria-label={t('Удалить из списка')}
                className="p-1.5 text-theme-muted hover:text-theme-text transition-colors disabled:opacity-50"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-theme-danger">{error}</p>}
    </div>
  );
}
