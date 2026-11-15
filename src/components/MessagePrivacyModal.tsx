import { useEffect, useState } from 'react';
import { Ban, Loader2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, type Profile } from '@/lib/supabase';
import AllowlistEditor, { type AllowlistScope } from '@/components/AllowlistEditor';

type AccessColumn = 'friend_request_privacy' | 'dm_privacy' | 'call_privacy';

type AccessOption = { value: string; title: string };

type AccessRule = {
  title: string;
  column: AccessColumn;
  scope: AllowlistScope;
  options: AccessOption[];
};

const SPECIFIC: AccessOption = { value: 'specific', title: 'Выбранные пользователи' };

const ACCESS_RULES: AccessRule[] = [
  {
    title: 'Кто может отправлять запросы в друзья',
    column: 'friend_request_privacy',
    scope: 'friend_request',
    options: [{ value: 'everyone', title: 'Все' }, SPECIFIC, { value: 'nobody', title: 'Никто' }],
  },
  {
    title: 'Кто может писать мне',
    column: 'dm_privacy',
    scope: 'message',
    options: [
      { value: 'everyone', title: 'Все' },
      { value: 'friends', title: 'Только друзья' },
      SPECIFIC,
      { value: 'nobody', title: 'Никто' },
    ],
  },
  {
    title: 'Кто может звонить мне',
    column: 'call_privacy',
    scope: 'call',
    options: [
      { value: 'everyone', title: 'Все' },
      { value: 'friends', title: 'Только друзья' },
      SPECIFIC,
      { value: 'nobody', title: 'Никто' },
    ],
  },
];

type BlockedUser = Pick<Profile, 'id' | 'username' | 'avatar_url'>;
type BlockedRow = { blocked_id: string; blocked: BlockedUser | null };

export default function MessagePrivacyModal({ onClose }: { onClose: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('blocked_users')
      .select('blocked_id, blocked:profiles!blocked_id(id, username, avatar_url)')
      .eq('blocker_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(t('Не удалось загрузить список блокировок'));
        else setBlocked((data ?? []) as unknown as BlockedRow[]);
        setLoadingBlocked(false);
      });
  }, [profile, t]);

  const changeRule = async (column: AccessColumn, value: string) => {
    if (!profile || busyId) return;
    setBusyId(column);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ [column]: value })
      .eq('id', profile.id)
      .select('id')
      .maybeSingle();
    setBusyId(null);
    if (updateError) {
      setError(t('Не удалось сохранить настройку'));
      return;
    }
    await refreshProfile();
  };

  const unblock = async (blockedId: string) => {
    if (!profile) return;
    setBusyId(blockedId);
    setError(null);
    const { error: deleteError } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', profile.id)
      .eq('blocked_id', blockedId);
    setBusyId(null);
    if (deleteError) {
      setError(t('Не удалось разблокировать пользователя'));
      return;
    }
    setBlocked((prev) => prev.filter((row) => row.blocked_id !== blockedId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-theme-surface border border-theme-border rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-theme-text">{t('Настройки доступа')}</h2>
            <p className="text-sm text-theme-muted mt-1">{t('Кто может связаться с вами и звонить вам')}</p>
          </div>
          <button onClick={onClose} aria-label={t('Закрыть')} className="p-2 -m-2 text-theme-muted hover:text-theme-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {ACCESS_RULES.map((rule) => {
            const current = profile?.[rule.column] ?? rule.options[0].value;
            return (
              <section key={rule.column}>
                <h3 className="text-sm font-medium text-theme-text mb-2">{t(rule.title)}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {rule.options.map((option) => {
                    const active = current === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => changeRule(rule.column, option.value)}
                        disabled={busyId === rule.column}
                        className={`p-2.5 rounded-xl border text-sm text-left transition-colors disabled:opacity-60 ${
                          active
                            ? 'border-theme-primary bg-theme-primary/10 text-theme-text'
                            : 'border-theme-border bg-theme-surface2 text-theme-muted hover:border-theme-primary/60'
                        }`}
                      >
                        {t(option.title)}
                      </button>
                    );
                  })}
                </div>
                {current === 'specific' && <AllowlistEditor scope={rule.scope} />}
              </section>
            );
          })}
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium text-theme-text mb-3">{t('Чёрный список')}</h3>
          {loadingBlocked ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-theme-muted" /></div>
          ) : blocked.length === 0 ? (
            <p className="text-sm text-theme-muted py-2">{t('Вы никого не заблокировали')}</p>
          ) : (
            <ul className="space-y-2">
              {blocked.map((row) => (
                <li key={row.blocked_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-theme-surface2 border border-theme-border">
                  <Ban className="w-4 h-4 text-theme-muted shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-theme-text truncate">{row.blocked?.username ?? t('Пользователь')}</span>
                  <button
                    type="button"
                    onClick={() => unblock(row.blocked_id)}
                    disabled={busyId === row.blocked_id}
                    className="text-xs font-medium text-theme-primary hover:underline disabled:opacity-50"
                  >
                    {t('Разблокировать')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-theme-danger">{error}</p>}
      </div>
    </div>
  );
}
