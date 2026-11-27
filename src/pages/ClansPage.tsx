import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, type Profile } from '@/lib/supabase';
import {
  Users,
  Plus,
  Crown,
  LogOut,
  Trophy,
  Shield,
  X,
  Loader2,
  Swords,
  Search,
  Lock,
  Mail,
  Check,
} from 'lucide-react';

type Clan = {
  id: string;
  name: string;
  description: string;
  leader_id: string;
  tag: string;
  is_private: boolean | null;
  created_at: string;
};

type ClanInvite = {
  id: string;
  clan_id: string;
  status: string;
  created_at: string;
};

type ClanMember = {
  id: string;
  clan_id: string;
  user_id: string;
  role: 'leader' | 'member';
  joined_at: string;
};

type ClanWithMeta = Clan & {
  memberCount: number;
  isMember: boolean;
  totalXp: number;
};

export default function ClansPage() {
  const { profile, addXp, isGuest } = useAuth();
  const { t } = useLocale();
  const [clans, setClans] = useState<ClanWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedClan, setSelectedClan] = useState<ClanWithMeta | null>(null);
  const [members, setMembers] = useState<(ClanMember & { profile: Profile | null })[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newPrivate, setNewPrivate] = useState(false);
  const [myInvites, setMyInvites] = useState<(ClanInvite & { clan: Clan | null })[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);

  const fetchClans = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clans')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('fetchClans', error);
      setLoading(false);
      return;
    }
    const clanList = data as Clan[];
    // fetch member counts and xp for each
    const enriched: ClanWithMeta[] = [];
    for (const clan of clanList) {
      const { data: membs } = await supabase
        .from('clan_members')
        .select('user_id')
        .eq('clan_id', clan.id);
      const userIds = (membs || []).map((m) => m.user_id);
      let totalXp = 0;
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('xp')
          .in('id', userIds);
        totalXp = (profs || []).reduce((sum, p) => sum + (p.xp || 0), 0);
      }
      const isMember = profile ? userIds.includes(profile.id) : false;
      enriched.push({
        ...clan,
        memberCount: userIds.length,
        isMember,
        totalXp,
      });
    }
    // sort by total xp desc for leaderboard
    enriched.sort((a, b) => b.totalXp - a.totalXp);
    setClans(enriched);
    setLoading(false);
  }, [profile]);

  const fetchInvites = useCallback(async () => {
    if (!profile || isGuest) { setMyInvites([]); return; }
    const { data } = await supabase
      .from('clan_invites')
      .select('id, clan_id, status, created_at, clan:clans(id, name, description, leader_id, tag, is_private, created_at)')
      .eq('invitee_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setMyInvites((data as unknown as (ClanInvite & { clan: Clan | null })[]) ?? []);
  }, [profile, isGuest]);

  useEffect(() => {
    fetchClans();
    fetchInvites();
  }, [fetchClans, fetchInvites]);

  const createClan = async () => {
    if (!profile || isGuest) return;
    if (!newName.trim() || !newTag.trim()) {
      setStatus(t('Заполните название и тег'));
      return;
    }
    const { data, error } = await supabase.rpc('clan_create', {
      p_name: newName.trim(),
      p_tag: newTag.trim(),
      p_description: newDesc.trim(),
      p_is_private: newPrivate,
    });
    const res = (data as unknown as { ok: boolean; reason: string; clan_id: string }[] | null)?.[0];
    if (error || !res?.ok) {
      const reason = res?.reason;
      setStatus(t(
        reason === 'tag_taken' ? 'Такой тег уже занят'
        : reason === 'name_taken' ? 'Клан с таким названием уже есть'
        : reason === 'already_in_clan' ? 'Вы уже состоите в клане'
        : reason === 'invalid_tag' ? 'Тег: 2-4 символа, буквы и цифры'
        : 'Ошибка при создании клана'
      ));
      return;
    }
    setShowCreate(false);
    setNewName('');
    setNewTag('');
    setNewDesc('');
    setNewPrivate(false);
    await addXp(30);
    setStatus(t('Клан создан! +30 XP'));
    setTimeout(() => setStatus(null), 2500);
    fetchClans();
  };

  const joinClan = async (clan: ClanWithMeta) => {
    if (!profile || isGuest) return;
    if (clan.isMember) return;
    const { data, error } = await supabase.rpc('clan_join', { p_clan_id: clan.id });
    const res = (data as unknown as { ok: boolean; reason: string }[] | null)?.[0];
    if (error || !res?.ok) {
      const reason = res?.reason;
      setStatus(t(
        reason === 'invite_required' ? 'Клан закрытый — нужна приглашение от лидера'
        : reason === 'already_in_clan' ? 'Вы уже состоите в клане'
        : 'Ошибка при вступлении в клан'
      ));
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    setStatus(`${t('Вы вступили в клан')} ${clan.name}`);
    setTimeout(() => setStatus(null), 2500);
    fetchClans();
  };

  const respondInvite = async (inviteId: string, accept: boolean) => {
    if (!profile || isGuest || inviteBusy) return;
    setInviteBusy(true);
    const { data, error } = await supabase.rpc('clan_respond', { p_invite_id: inviteId, p_accept: accept });
    const res = (data as unknown as { ok: boolean; reason: string }[] | null)?.[0];
    setInviteBusy(false);
    if (error || !res?.ok) {
      setStatus(t('Не удалось обработать приглашение'));
      setTimeout(() => setStatus(null), 3000);
      fetchInvites();
      return;
    }
    setStatus(accept ? t('Приглашение принято — вы в клане!') : t('Приглашение отклонено'));
    setTimeout(() => setStatus(null), 2500);
    fetchInvites();
    fetchClans();
  };

  const leaveClan = async (clan: ClanWithMeta) => {
    if (!profile) return;
    const { data, error } = await supabase.rpc('clan_leave');
    const res = (data as unknown as { ok: boolean; reason: string }[] | null)?.[0];
    if (error || !res?.ok) {
      const reason = res?.reason;
      setStatus(t(
        reason === 'leader_must_transfer' ? 'Лидер не может выйти: сначала передайте лидерство или распустите клан'
        : 'Ошибка при выходе из клана'
      ));
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    setStatus(`${t('Вы покинули клан')} ${clan.name}`);
    setTimeout(() => setStatus(null), 2500);
    setSelectedClan(null);
    fetchClans();
  };

  const viewClan = async (clan: ClanWithMeta) => {
    setSelectedClan(clan);
    const { data } = await supabase
      .from('clan_members')
      .select('*')
      .eq('clan_id', clan.id)
      .order('joined_at', { ascending: true });
    const membs = (data || []) as ClanMember[];
    // fetch profiles
    const enriched: (ClanMember & { profile: Profile | null })[] = [];
    for (const m of membs) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', m.user_id)
        .maybeSingle();
      enriched.push({ ...m, profile: (prof as Profile) || null });
    }
    setMembers(enriched);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <Shield className="w-6 h-6 text-theme-primary" />
            {t('Кланы')}
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            {t('Объединяйся в команды и соревнуйся за лидерство')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> {t('Создать клан')}
        </button>
      </div>

      {status && (
        <div className="px-4 py-2 rounded-lg bg-theme-primary-bg border border-theme-primary-border text-theme-primary-text text-sm">
          {status}
        </div>
      )}

      {/* Leaderboard */}
      <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Поиск по названию или тегу клана...')}
            className="w-full pl-10 pr-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary transition-colors"
          />
        </div>
        <h2 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-theme-warning" />
          {t('Лидерборд кланов')}
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-theme-muted animate-spin" />
          </div>
        ) : clans.length === 0 ? (
          <p className="text-theme-muted text-sm text-center py-8">{t('Пока нет кланов. Создай первый!')}</p>
        ) : (
          <div className="space-y-2">
            {clans
              .filter((c) => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                return c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q);
              })
              .map((clan, i) => (
              <div
                key={clan.id}
                className={`clan-card flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  clan.isMember
                    ? 'bg-theme-primary-bg border-theme-primary-border'
                    : 'bg-theme-surface2 border-theme-border hover:border-theme-primary'
                }`}
                onClick={() => viewClan(clan)}
              >
                <div className={`w-8 text-center font-bold text-lg shrink-0 ${i < 3 ? 'text-theme-warning' : 'text-theme-muted'}`}>
                  {i + 1}
                </div>
                <div className="px-2 py-1 rounded-md bg-theme-primary text-white text-xs font-bold shrink-0">
                  [{clan.tag}]
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-theme-text font-medium truncate flex items-center gap-1.5">
                    {clan.name}
                    {clan.is_private && <Lock className="w-3.5 h-3.5 text-theme-warning shrink-0" title={t('Закрытый клан — только по приглашению')} />}
                  </p>
                  <p className="text-xs text-theme-muted truncate">{clan.description || t('Без описания')}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="flex items-center gap-1 text-theme-muted">
                    <Users className="w-3.5 h-3.5" />
                    {clan.memberCount}
                  </span>
                  <span className="flex items-center gap-1 text-theme-primary">
                    <Trophy className="w-3.5 h-3.5" />
                    {clan.totalXp} XP
                  </span>
                </div>
                {!clan.isMember && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      joinClan(clan);
                    }}
                    className="px-3 py-1.5 bg-theme-primary text-white rounded-lg text-xs font-medium hover:bg-theme-primary-hover transition-colors shrink-0"
                  >
                    {t('Вступить')}
                  </button>
                )}
                {clan.isMember && (
                  <span className="flex items-center justify-center w-7 h-7 bg-theme-success/15 text-theme-success rounded-lg shrink-0" title={t('Вы в этом клане')}>
                    <Crown className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incoming invites */}
      {myInvites.length > 0 && (
        <div className="glass-surface bg-theme-surface/50 border border-theme-warning/40 rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-theme-text flex items-center gap-2">
            <Mail className="w-4 h-4 text-theme-warning" />
            {t('Приглашения в кланы')}
          </h3>
          {myInvites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 p-2.5 bg-theme-surface2 rounded-xl">
              <div className="min-w-0 flex items-center gap-2">
                <span className="px-2 py-1 rounded-md bg-theme-primary text-white text-xs font-bold shrink-0">
                  [{inv.clan?.tag ?? '???'}]
                </span>
                <p className="text-sm text-theme-text truncate">{inv.clan?.name || t('Неизвестный клан')}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => respondInvite(inv.id, true)}
                  disabled={inviteBusy}
                  className="px-3 py-1.5 bg-theme-success text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> {t('Принять')}
                </button>
                <button
                  onClick={() => respondInvite(inv.id, false)}
                  disabled={inviteBusy}
                  className="px-3 py-1.5 bg-theme-surface2 border border-theme-border rounded-lg text-xs text-theme-muted hover:text-theme-text disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="glass-surface bg-theme-surface border border-theme-border rounded-2xl p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-theme-text font-semibold flex items-center gap-2">
                <Plus className="w-5 h-5 text-theme-primary" /> {t('Новый клан')}
              </h3>
              <button onClick={() => setShowCreate(false)} className="text-theme-muted hover:text-theme-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('Название клана')}
                className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
              />
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder={t('Тег (до 4 символов)')}
                maxLength={4}
                className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary uppercase"
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder={t('Описание клана')}
                rows={3}
                className="w-full px-3 py-2 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary resize-none"
              />
              <label className="flex items-center gap-2 text-sm text-theme-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newPrivate}
                  onChange={(e) => setNewPrivate(e.target.checked)}
                  className="w-4 h-4 accent-theme-primary"
                />
                <Lock className="w-4 h-4 text-theme-warning" />
                {t('Закрытый клан — вступление только по приглашению')}
              </label>
            </div>
            <button
              onClick={createClan}
              className="w-full px-4 py-2 bg-theme-primary text-white rounded-lg text-sm font-medium hover:bg-theme-primary-hover transition-colors"
            >
              {t('Создать клан')}
            </button>
          </div>
        </div>
      )}

      {/* Clan detail modal */}
      {selectedClan && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedClan(null)}
        >
          <div
            className="glass-surface bg-theme-surface border border-theme-border rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-lg bg-theme-primary text-white text-sm font-bold">
                  [{selectedClan.tag}]
                </div>
                <div>
                  <h3 className="text-theme-text font-semibold">{selectedClan.name}</h3>
                  <p className="text-xs text-theme-muted">{selectedClan.totalXp} XP · {selectedClan.memberCount} {t('участников')}</p>
                </div>
              </div>
              <button onClick={() => setSelectedClan(null)} className="text-theme-muted hover:text-theme-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedClan.description && (
              <p className="text-sm text-theme-muted">{selectedClan.description}</p>
            )}

            <div>
              <h4 className="text-xs text-theme-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {t('Участники')}
              </h4>
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-2 bg-theme-surface2 rounded-lg">
                    {m.profile?.avatar_url ? (
                      <img src={m.profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-xs font-bold">
                        {m.profile?.username?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-theme-text truncate">
                        {m.profile?.username || t('Аноним')}
                        {m.profile?.clan_tag && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-theme-primary/15 text-theme-primary text-[10px] font-bold align-middle">
                            [{m.profile.clan_tag}]
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-theme-muted">{t('Ур.')} {m.profile?.level || 1} · {m.profile?.xp || 0} XP</p>
                    </div>
                    {m.role === 'leader' && (
                      <Crown className="w-4 h-4 text-theme-warning shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {selectedClan.isMember && (
              <button
                onClick={() => leaveClan(selectedClan)}
                className="w-full px-4 py-2 bg-theme-danger/15 text-theme-danger rounded-lg text-sm font-medium hover:bg-theme-danger/25 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" /> {t('Покинуть клан')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
        <h3 className="text-sm font-medium text-theme-text mb-2 flex items-center gap-2">
          <Swords className="w-4 h-4 text-theme-primary" />
          {t('Соревнования кланов')}
        </h3>
        <p className="text-xs text-theme-muted">
          {t('Кланы соревнуются по суммарному XP участников. Создавай клан, приглашай друзей и поднимайся в топ!')}
        </p>
      </div>
    </div>
  );
}
