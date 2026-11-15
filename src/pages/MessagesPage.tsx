import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, type Profile, type PrivateMessage } from '@/lib/supabase';
import { MessageCircle, Send, Search, ArrowLeft, Circle, Check, CheckCheck, SmilePlus, Settings, Ban, Trash2, Flag } from 'lucide-react';
import VoiceMessagePlayer from '@/components/VoiceMessagePlayer';
import VoiceRecordButton, { type RecordedVoice } from '@/components/VoiceRecordButton';
import EmojiPicker from '@/components/EmojiPicker';
import { maskProfanity } from '@/lib/profanity';
import { uploadVoiceMessage } from '@/lib/voiceMessages';
import MessagePrivacyModal from '@/components/MessagePrivacyModal';
import DeleteMessageModal from '@/components/DeleteMessageModal';
import ReportUserModal from '@/components/ReportUserModal';

type Conversation = {
  user: Profile;
  lastMessage: PrivateMessage | null;
  unreadCount: number;
};

type TimelineItem = { key: string; at: string; message: PrivateMessage };

export default function MessagesPage({ initialUserId }: { initialUserId?: string | null }) {
  const { profile, isGuest } = useAuth();
  const { t } = useLocale();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<PrivateMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadConversations = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    // Get all messages involving this user
    const { data: msgs } = await supabase
      .from('private_messages')
      .select('*')
      .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
      .order('created_at', { ascending: false });

    if (!msgs) {
      setLoading(false);
      return;
    }

    // Group by conversation partner
    const partnerIds = new Set<string>();
    (msgs as PrivateMessage[]).forEach((m) => {
      if (m.sender_id === profile.id) partnerIds.add(m.recipient_id);
      else partnerIds.add(m.sender_id);
    });

    // Fetch partner profiles
    const partnerProfiles: Profile[] = [];
    if (partnerIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', [...partnerIds]);
      if (profiles) partnerProfiles.push(...(profiles as Profile[]));
    }

    // Build conversation list
    const convs: Conversation[] = partnerProfiles.map((user) => {
      const userMsgs = (msgs as PrivateMessage[]).filter(
        (m) => m.sender_id === user.id || m.recipient_id === user.id
      );
      const lastMessage = userMsgs[0] || null;
      const unreadCount = userMsgs.filter(
        (m) => m.recipient_id === profile.id && !m.read
      ).length;
      return { user, lastMessage, unreadCount };
    });

    // Sort by last message time
    convs.sort((a, b) => {
      const aTime = a.lastMessage?.created_at || '';
      const bTime = b.lastMessage?.created_at || '';
      return bTime.localeCompare(aTime);
    });

    setConversations(convs);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Subscribe to new messages
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('private-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          loadConversations();
          if (selectedUser) loadMessages(selectedUser.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `sender_id=eq.${profile.id}`,
        },
        () => {
          loadConversations();
          if (selectedUser) loadMessages(selectedUser.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
          filter: `sender_id=eq.${profile.id}`,
        },
        () => {
          if (selectedUser) loadMessages(selectedUser.id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'private_messages' },
        () => {
          loadConversations();
          if (selectedUser) loadMessages(selectedUser.id);
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, selectedUser, loadConversations]);

  const loadMessages = useCallback(async (otherUserId: string) => {
    if (!profile) return;
    const { data } = await supabase
      .from('private_messages')
      .select('*')
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${profile.id})`)
      .order('created_at', { ascending: true });

    if (data) {
      const { data: hides } = await supabase
        .from('private_message_hides')
        .select('message_id')
        .eq('user_id', profile.id);
      const hiddenIds = new Set((hides ?? []).map((h) => h.message_id));
      setMessages((data as PrivateMessage[]).filter((m) => !hiddenIds.has(m.id)));
      // Mark as read
      await supabase
        .from('private_messages')
        .update({ read: true })
        .eq('recipient_id', profile.id)
        .eq('sender_id', otherUserId)
        .eq('read', false);
    }
  }, [profile]);

  useEffect(() => {
    if (selectedUser) {
      loadMessages(selectedUser.id);
    } else {
      setMessages([]);
    }
  }, [selectedUser, loadMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!profile || !selectedUser || !newMessage.trim()) return;
    const content = maskProfanity(newMessage.trim());
    setNewMessage('');

    const { data, error: sendError } = await supabase
      .from('private_messages')
      .insert({
        sender_id: profile.id,
        recipient_id: selectedUser.id,
        content,
      })
      .select('*')
      .maybeSingle();

    if (sendError) {
      setChatError(sendError.message);
      setNewMessage(content);
      return;
    }

    if (data) {
      setMessages((prev) => [...prev, data as PrivateMessage]);
      loadConversations();
    }
  };

  const sendVoice = async ({ blob, mimeType, duration }: RecordedVoice) => {
    if (!profile || !selectedUser) return;
    setChatError(null);
    const path = await uploadVoiceMessage(profile.id, { blob, mimeType, duration });
    if (!path) {
      setChatError(t('Не удалось отправить голосовое сообщение'));
      return;
    }

    const { data, error: insertError } = await supabase
      .from('private_messages')
      .insert({
        sender_id: profile.id,
        recipient_id: selectedUser.id,
        content: '',
        voice_path: path,
        voice_duration: duration,
      })
      .select('*')
      .maybeSingle();

    if (insertError || !data) {
      setChatError(t('Не удалось отправить голосовое сообщение'));
      return;
    }
    setMessages((prev) => [...prev, data as PrivateMessage]);
    loadConversations();
  };

  useEffect(() => {
    if (!profile || !selectedUser) {
      setIsBlocked(false);
      return;
    }
    supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', profile.id)
      .eq('blocked_id', selectedUser.id)
      .maybeSingle()
      .then(({ data }) => setIsBlocked(Boolean(data)));
  }, [profile, selectedUser]);

  const toggleBlock = async () => {
    if (!profile || !selectedUser) return;
    const { error: blockError } = isBlocked
      ? await supabase.from('blocked_users').delete().eq('blocker_id', profile.id).eq('blocked_id', selectedUser.id)
      : await supabase.from('blocked_users').insert({ blocker_id: profile.id, blocked_id: selectedUser.id });
    if (blockError) {
      setChatError(t('Не удалось обновить блокировку'));
      return;
    }
    setIsBlocked(!isBlocked);
  };

  const confirmDelete = async (mode: 'me' | 'everyone') => {
    if (!profile || !messageToDelete) return;
    const target = messageToDelete;
    setDeleting(true);
    setChatError(null);
    let failed = false;
    if (mode === 'me') {
      const { error: hideError } = await supabase
        .from('private_message_hides')
        .insert({ message_id: target.id, user_id: profile.id });
      failed = Boolean(hideError);
    } else {
      const { data: removed, error: removeError } = await supabase
        .from('private_messages')
        .delete()
        .eq('id', target.id)
        .eq('sender_id', profile.id)
        .select('id');
      failed = Boolean(removeError) || !removed?.length;
    }
    setDeleting(false);
    if (failed) {
      setChatError(t('Не удалось удалить сообщение'));
      return;
    }
    setMessageToDelete(null);
    setMessages((prev) => prev.filter((m) => m.id !== target.id));
    loadConversations();
  };

  const searchUsers = async () => {
    if (!searchQuery.trim() || !profile) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${searchQuery}%`)
      .neq('id', profile.id)
      .limit(10);
    if (data) setSearchResults(data as Profile[]);
  };

  const startConversation = (user: Profile) => {
    setSelectedUser(user);
    setSearchQuery('');
    setSearchResults([]);
    loadMessages(user.id);
  };

  useEffect(() => {
    if (!initialUserId || !profile) return;
    supabase.from('profiles').select('*').eq('id', initialUserId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSelectedUser(data as Profile);
          setSearchQuery('');
          setSearchResults([]);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserId, profile]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return t('сейчас');
    if (diff < 3600) return `${Math.floor(diff / 60)} ${t('мин')}`;
    if (diff < 86400) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  };

  const isOnline = (lastSeen: string) => {
    const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    return diff < 300; // online if active within last 5 minutes
  };

  const isRecentlyActive = (lastSeen: string) => {
    const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    return diff < 3600; // recently active within 1 hour
  };

  const formatLastSeen = (lastSeen: string) => {
    const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    if (diff < 60) return t('был(а) недавно');
    if (diff < 3600) return `${t('был(а)')} ${Math.floor(diff / 60)} ${t('мин назад')}`;
    if (diff < 86400) return `${t('был(а)')} ${Math.floor(diff / 3600)} ${t('ч назад')}`;
    return `${t('был(а)')} ${formatTime(lastSeen)}`;
  };

  const timeline: TimelineItem[] = messages.map((message) => ({
    key: message.id,
    at: message.created_at,
    message,
  }));

  const formatMessageTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  };

  if (!profile || isGuest) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-theme-primary" />
            {t('Сообщения')}
          </h1>
        </div>
        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center">
          <MessageCircle className="w-12 h-12 text-theme-muted mx-auto mb-3" />
          <p className="text-theme-muted text-sm mb-4">{t('Войдите в аккаунт, чтобы писать сообщения')}</p>
        </div>
      </div>
    );
  }

  // Chat view
  if (selectedUser) {
    return (
      <div className="space-y-4 pt-4">
        {showReport && (
          <ReportUserModal
            reporterId={profile.id}
            reportedId={selectedUser.id}
            reportedName={selectedUser.username}
            onClose={() => setShowReport(false)}
          />
        )}
        {messageToDelete && (
          <DeleteMessageModal
            isMine={messageToDelete.sender_id === profile.id}
            busy={deleting}
            onDeleteForMe={() => confirmDelete('me')}
            onDeleteForEveryone={() => confirmDelete('everyone')}
            onClose={() => setMessageToDelete(null)}
          />
        )}
        <div className="flex items-center gap-3 min-w-0 pb-3 border-b border-theme-border">
          <button
            onClick={() => setSelectedUser(null)}
            className="p-2 shrink-0 text-theme-muted hover:text-theme-text transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {selectedUser.avatar_url ? (
            <img src={selectedUser.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full shrink-0 bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-sm font-bold">
              {selectedUser.username[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-theme-text font-medium text-sm truncate">{selectedUser.username}</p>
            <div className="flex items-center gap-1.5">
              <Circle
                className={`w-2.5 h-2.5 ${isOnline(selectedUser.last_seen) ? 'fill-theme-success text-theme-success' : 'fill-theme-muted text-theme-muted'}`}
              />
              <span className="text-xs text-theme-muted">
                {isOnline(selectedUser.last_seen) ? t('в сети') : formatLastSeen(selectedUser.last_seen)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-theme-muted hover:text-theme-danger transition-colors"
          >
            <Flag className="w-3.5 h-3.5" />
            {t('Пожаловаться')}
          </button>
          <button
            type="button"
            onClick={toggleBlock}
            className="flex items-center gap-1.5 text-xs font-medium text-theme-muted hover:text-theme-danger transition-colors"
          >
            <Ban className="w-3.5 h-3.5" />
            {isBlocked ? t('Разблокировать') : t('Заблокировать')}
          </button>
        </div>

        <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl flex flex-col h-[calc(100dvh-260px)] min-h-[360px]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {timeline.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-theme-muted text-sm">{t('Нет сообщений. Напиши первым!')}</p>
              </div>
            ) : (
              timeline.map((item) => {
                const msg = item.message;
                const isMine = msg.sender_id === profile.id;
                return (
                  <div key={msg.id} className={`group flex items-center gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                        isMine
                          ? 'bg-theme-primary text-white rounded-br-sm'
                          : 'bg-theme-surface2 text-theme-text rounded-bl-sm'
                      }`}
                    >
                      {msg.voice_path ? (
                        <VoiceMessagePlayer path={msg.voice_path} duration={msg.voice_duration} isMine={isMine} />
                      ) : (
                        <p className="break-words">{msg.content}</p>
                      )}
                      <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-xs ${isMine ? 'text-white/60' : 'text-theme-muted'}`}>
                          {formatMessageTime(msg.created_at)}
                        </span>
                        {isMine && (
                          <span className={msg.read ? 'text-white/80' : 'text-white/50'}>
                            {msg.read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMessageToDelete(msg)}
                      aria-label={t('Удалить сообщение')}
                      className="p-1.5 rounded-lg text-theme-muted opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:text-theme-danger transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {chatError && (
            <p className="px-4 pt-2 text-xs text-theme-danger">{chatError}</p>
          )}
          {isBlocked && (
            <p className="px-4 pt-2 text-xs text-theme-muted">{t('Вы заблокировали этого пользователя')}</p>
          )}
          {showEmojiPicker && (
            <EmojiPicker onPick={(emoji) => setNewMessage((prev) => prev + emoji)} />
          )}
          <div className="border-t border-theme-border p-3 flex items-center gap-2">
            {!isRecording && (
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                aria-label={t('Эмодзи')}
                className={`p-2.5 shrink-0 rounded-xl transition-colors ${showEmojiPicker ? 'bg-theme-primary text-white' : 'bg-theme-surface2 border border-theme-border text-theme-muted hover:text-theme-primary'}`}
              >
                <SmilePlus className="w-5 h-5" />
              </button>
            )}
            {!isRecording && (
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                disabled={isBlocked}
                placeholder={t('Написать сообщение...')}
                className="flex-1 min-w-0 px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary transition-colors"
              />
            )}
            <VoiceRecordButton
              disabled={isBlocked}
              onRecorded={sendVoice}
              onRecordingChange={setIsRecording}
              onError={setChatError}
            />
            {!isRecording && (
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() || isBlocked}
                aria-label={t('Отправить')}
                className="p-2.5 shrink-0 bg-theme-primary text-white rounded-xl hover:bg-theme-primary-hover transition-colors disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Conversation list view
  return (
    <div className="space-y-6">
      {showPrivacy && <MessagePrivacyModal onClose={() => setShowPrivacy(false)} />}
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-theme-primary" />
          {t('Сообщения')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          {t('Личные сообщения с другими пользователями')}
        </p>
        <button
          type="button"
          onClick={() => setShowPrivacy(true)}
          className="mt-3 flex items-center gap-1.5 text-sm font-medium text-theme-muted hover:text-theme-primary transition-colors"
        >
          <Settings className="w-4 h-4" />
          {t('Настройки личных сообщений')}
        </button>
      </div>

      {/* Search users to start a conversation */}
      <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-4">
        <h3 className="text-sm font-medium text-theme-text mb-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-theme-muted" />
          {t('Найти пользователя')}
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
            placeholder={t('Введи имя пользователя...')}
            className="flex-1 px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary transition-colors"
          />
          <button
            onClick={searchUsers}
            className="px-4 py-2.5 bg-theme-primary text-white rounded-xl text-sm font-medium hover:bg-theme-primary-hover transition-colors"
          >
            {t('Найти')}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((user) => (
              <button
                key={user.id}
                onClick={() => startConversation(user)}
                className="w-full flex items-center gap-3 p-2.5 bg-theme-surface2 rounded-lg hover:bg-theme-border transition-colors"
              >
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-xs font-bold">
                    {user.username[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 text-left">
                  <p className="text-sm text-theme-text font-medium">{user.username}</p>
                  <p className="text-xs text-theme-muted">{t('Уровень')} {user.level}</p>
                </div>
                <Circle
                  className={`w-2.5 h-2.5 ${isRecentlyActive(user.last_seen) ? 'fill-theme-success text-theme-success' : 'fill-theme-muted text-theme-muted'}`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Conversations list */}
      <div>
        <h3 className="text-sm font-medium text-theme-muted mb-3">{t('Диалоги')}</h3>
        {loading ? (
          <p className="text-theme-muted text-sm text-center py-8">{t('Загрузка...')}</p>
        ) : conversations.length === 0 ? (
          <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl p-8 text-center">
            <MessageCircle className="w-10 h-10 text-theme-muted mx-auto mb-3" />
            <p className="text-theme-muted text-sm">{t('Пока нет диалогов. Найди пользователя выше, чтобы начать общение!')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <button
                key={conv.user.id}
                onClick={() => startConversation(conv.user)}
                className="w-full glass-surface flex items-center gap-3 p-3 bg-theme-surface/50 border border-theme-border rounded-xl hover:border-theme-primary transition-all"
              >
                {conv.user.avatar_url ? (
                  <img src={conv.user.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-theme-primary to-theme-accent flex items-center justify-center text-white text-sm font-bold">
                    {conv.user.username[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-theme-text font-medium truncate">{conv.user.username}</p>
                    <Circle
                      className={`w-2 h-2 shrink-0 ${isRecentlyActive(conv.user.last_seen) ? 'fill-theme-success text-theme-success' : 'fill-theme-muted text-theme-muted'}`}
                    />
                  </div>
                  <p className="text-xs text-theme-muted truncate">
                    {conv.lastMessage
                      ? (conv.lastMessage.sender_id === profile.id ? t('Ты: ') : '') +
                        (conv.lastMessage.voice_path ? t('Голосовое сообщение') : conv.lastMessage.content)
                      : t('Нет сообщений')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {conv.lastMessage && (
                    <span className="text-xs text-theme-muted">
                      {formatTime(conv.lastMessage.created_at)}
                    </span>
                  )}
                  {conv.unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold bg-theme-primary text-white rounded-full">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
