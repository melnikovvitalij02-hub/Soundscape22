import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase, checkRateLimit, type ChatMessage, type Sticker } from '@/lib/supabase';
import VIPAvatar from '@/components/VIPAvatar';
import VoiceMessagePlayer from '@/components/VoiceMessagePlayer';
import VoiceRecordButton, { type RecordedVoice } from '@/components/VoiceRecordButton';
import EmojiPicker from '@/components/EmojiPicker';
import { maskProfanity } from '@/lib/profanity';
import { uploadVoiceMessage } from '@/lib/voiceMessages';
import { Send, MessageCircle, Loader2, AlertCircle, Check, Coins, Smile, SmilePlus, X } from 'lucide-react';

export default function ChatPage({ onNavigateToProfile, onNavigateToShop, onNavigateToMessages }: { onNavigateToProfile?: (userId: string) => void; onNavigateToShop?: () => void; onNavigateToMessages?: (userId: string) => void }) {
  const { profile, addXp, addCoins, isGuest } = useAuth();
  const { t } = useLocale();
  const tRef = useRef(t);
  tRef.current = t;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentId, setLastSentId] = useState<string | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [ownedStickerIds, setOwnedStickerIds] = useState<Set<string>>(new Set());
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Anti-spam: temporary mute with live countdown ---
  // When a user trips the 3-second rate limit, they are muted for 5 minutes.
  const MUTE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  const [muteUntil, setMuteUntil] = useState<number | null>(null); // epoch ms when mute ends
  const [muteCountdown, setMuteCountdown] = useState(0); // seconds remaining
  const muteTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (muteUntil === null) {
      if (muteTickRef.current) {
        clearInterval(muteTickRef.current);
        muteTickRef.current = null;
      }
      setMuteCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((muteUntil - Date.now()) / 1000));
      setMuteCountdown(remaining);
      if (remaining <= 0) {
        setMuteUntil(null);
        if (muteTickRef.current) {
          clearInterval(muteTickRef.current);
          muteTickRef.current = null;
        }
      }
    };
    tick();
    muteTickRef.current = window.setInterval(tick, 1000);
    return () => {
      if (muteTickRef.current) {
        clearInterval(muteTickRef.current);
        muteTickRef.current = null;
      }
    };
  }, [muteUntil]);

  const isMuted = muteUntil !== null && Date.now() < muteUntil;

  const fetchMessages = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(50);
    if (fetchError) {
      setError(tRef.current('Не удалось загрузить сообщения. Проверь подключение.'));
    } else if (data) {
      setMessages(data as ChatMessage[]);
    }
    setLoading(false);
  }, []);

  const fetchStickers = useCallback(async () => {
    const [stickersRes, ownedRes] = await Promise.all([
      supabase.from('stickers').select('*').order('price_coins'),
      profile ? supabase.from('user_stickers').select('sticker_id').eq('user_id', profile.id) : Promise.resolve({ data: [], error: null }),
    ]);
    if (stickersRes.data) setStickers(stickersRes.data as Sticker[]);
    if (ownedRes.data) setOwnedStickerIds(new Set((ownedRes.data as { sticker_id: string }[]).map((s) => s.sticker_id)));
  }, [profile]);

  useEffect(() => {
    fetchMessages();
    fetchStickers();

    const channel = supabase
      .channel('chat-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === (payload.new as ChatMessage).id);
            if (exists) return prev;
            return [...prev, payload.new as ChatMessage];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchMessages, fetchStickers]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const lastMessageTimeRef = useRef(0);

  const logCoinTransaction = async (amount: number, type: string, description: string) => {
    if (!profile) return;
    await supabase.from('coin_transactions').insert({
      user_id: profile.id,
      amount: -amount,
      transaction_type: type,
      description,
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || !profile) return;

    // Hard block while muted (spam penalty).
    if (isMuted) {
      const secs = Math.max(1, Math.ceil(((muteUntil ?? 0) - Date.now()) / 1000));
      setError(tRef.current('Вы заглушены за спам. Осталось: ') + `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
      return;
    }

    const now = Date.now();
    if (now - lastMessageTimeRef.current < 3000) {
      // Spam detected: mute the user for 5 minutes with a live countdown.
      setMuteUntil(now + MUTE_DURATION_MS);
      setError(tRef.current('Слишком быстро! Вы заглушены на 5 минут за спам.'));
      return;
    }

    // Length check before censoring so the limit applies to the user's input.
    if (input.trim().length > 500) {
      setError(tRef.current('Сообщение слишком длинное (макс. 500 символов).'));
      return;
    }

    if (!checkRateLimit('chat_message')) {
      setError(tRef.current('Превышен лимит сообщений. Попробуйте позже.'));
      return;
    }

    lastMessageTimeRef.current = now;
    setSending(true);
    setError(null);

    // Profanity is censored (replaced with "***"), not rejected — the message
    // still sends with the banned words masked out.
    const content = maskProfanity(input.trim());
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      user_id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput('');

    const { data, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        content,
        is_premium: profile.is_premium ?? false,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(tRef.current('Сообщение не отправилось. Попробуй ещё раз.'));
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(input.trim());
    } else {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessage) : m)));
      setLastSentId((data as ChatMessage).id);
      await addXp(5);
    }
    setSending(false);
  };

  const sendSticker = async (sticker: Sticker) => {
    if (!profile) return;
    if (!ownedStickerIds.has(sticker.id)) {
      setError(`${tRef.current('Стикер')} «${sticker.name}» ${tRef.current('не куплен. Купите его в магазине.')}`);
      return;
    }

    setSending(true);
    setError(null);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      user_id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      content: sticker.emoji,
      created_at: new Date().toISOString(),
      sticker_id: sticker.id,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setShowStickerPanel(false);

    const { data, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        content: sticker.emoji,
        is_premium: profile.is_premium ?? false,
        sticker_id: sticker.id,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(tRef.current('Стикер не отправился. Попробуй ещё раз.'));
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } else {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessage) : m)));
      setLastSentId((data as ChatMessage).id);
      await addXp(5);
    }
    setSending(false);
  };

  const sendVoice = async (voice: RecordedVoice) => {
    if (!profile) return;
    setError(null);
    const path = await uploadVoiceMessage(profile.id, voice);
    if (!path) {
      setError(tRef.current('Не удалось отправить голосовое сообщение'));
      return;
    }

    const { data, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        content: '',
        is_premium: profile.is_premium ?? false,
        voice_path: path,
        voice_duration: voice.duration,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(tRef.current('Не удалось отправить голосовое сообщение'));
      return;
    }
    setMessages((prev) => [...prev, data as ChatMessage]);
    setLastSentId((data as ChatMessage).id);
    await addXp(5);
  };

  const buySticker = async (sticker: Sticker) => {
    if (!profile) return;
    if (ownedStickerIds.has(sticker.id)) return;
    if (profile.coins < sticker.price_coins) return;
    const { error: buyError } = await supabase
      .from('user_stickers')
      .insert({ user_id: profile.id, sticker_id: sticker.id });
    if (buyError) {
      setError(tRef.current('Не удалось купить стикер.'));
      return;
    }
    await addCoins(-sticker.price_coins);
    await logCoinTransaction(sticker.price_coins, 'sticker_purchase', `${tRef.current('Стикер')}: ${sticker.name}`);
    setOwnedStickerIds((prev) => new Set([...prev, sticker.id]));
  };

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStickerEmoji = (stickerId: string | null | undefined) => {
    if (!stickerId) return null;
    const s = stickers.find((st) => st.id === stickerId);
    return s?.emoji || null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-theme-primary" />
            {t('Глобальный Чат')}
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            {t('Общение с сообществом')}
          </p>
        </div>
      </div>

      <div className="glass-surface bg-theme-surface/50 border border-theme-border rounded-2xl flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-theme-primary animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageCircle className="w-12 h-12 text-theme-muted mb-3" />
              <p className="text-theme-muted text-sm">{t('Сообщений пока нет. Начни разговор первым!')}</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.user_id === profile?.id;
              const isPending = msg.id.startsWith('temp-');
              const justSent = msg.id === lastSentId;
              const isSticker = msg.sticker_id;
              const stickerEmoji = getStickerEmoji(msg.sticker_id);
              return (
                <div key={msg.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                  <VIPAvatar src={msg.avatar_url} alt={msg.username} size={32} isPremium={msg.is_premium} />
                  <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <button
                        onClick={() => !isOwn && (onNavigateToMessages?.(msg.user_id) || onNavigateToProfile?.(msg.user_id))}
                        className={`text-xs font-medium text-theme-text hover:text-theme-primary transition-colors ${isOwn ? 'cursor-default' : 'cursor-pointer underline-offset-2 hover:underline'}`}
                      >
                        {msg.username}
                      </button>
                      <span className="text-[10px] text-theme-muted">{formatTime(msg.created_at)}</span>
                    </div>
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm ${
                        isOwn
                          ? 'chat-bubble-own rounded-tr-sm'
                          : 'chat-bubble-other rounded-tl-sm'
                      } ${isPending ? 'opacity-60' : ''} ${isSticker ? 'bg-transparent p-0' : ''}`}
                    >
                      {isSticker ? (
                        <span className="text-4xl">{stickerEmoji || msg.content}</span>
                      ) : msg.voice_path ? (
                        <VoiceMessagePlayer path={msg.voice_path} duration={msg.voice_duration ?? 0} isMine={isOwn} />
                      ) : (
                        <p className="break-words">{msg.content}</p>
                      )}
                      {isOwn && !isPending && justSent && !isSticker && (
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <Check className="w-3 h-3 text-white/70" />
                          <span className="text-[10px] text-white/70">{t('Отправлено')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="px-4 py-2 bg-theme-danger/10 border-t border-theme-danger/20 flex items-center gap-2 text-theme-danger text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-theme-danger/70 hover:text-theme-danger">✕</button>
          </div>
        )}

        {isMuted && (
          <div className="px-4 py-2 bg-theme-warning/10 border-t border-theme-warning/30 flex items-center gap-2 text-theme-warning text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {t('Вы заглушены за спам. Осталось: ')}
              <span className="font-mono font-bold">
                {Math.floor(muteCountdown / 60)}:{String(muteCountdown % 60).padStart(2, '0')}
              </span>
            </span>
          </div>
        )}

        {showStickerPanel && (
          <div className="border-t border-theme-border p-3 max-h-[200px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-theme-muted">{t('Стикеры')}</span>
              <button onClick={() => setShowStickerPanel(false)} className="text-theme-muted hover:text-theme-text">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {stickers.map((s) => {
                const owned = ownedStickerIds.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => (owned ? sendSticker(s) : buySticker(s))}
                    className={`relative aspect-square rounded-lg flex items-center justify-center text-2xl transition-all ${
                      owned
                        ? 'bg-theme-surface2 hover:bg-theme-primary/20 cursor-pointer'
                        : 'bg-theme-surface2/50 hover:bg-theme-surface2 cursor-pointer'
                    }`}
                    title={owned ? `${t('Отправить')} ${s.name}` : `${t('Купить')} ${s.name} — ${s.price_coins} ${t('монет')}`}
                  >
                    {s.emoji}
                    {!owned && (
                      <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-theme-warning text-black rounded px-1 font-bold flex items-center gap-0.5">
                        <Coins className="w-2 h-2" />{s.price_coins}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {showEmojiPicker && (
          <EmojiPicker onPick={(emoji) => setInput((prev) => prev + emoji)} />
        )}

        {isGuest ? (
          <div className="border-t border-theme-border p-4 text-center">
            <p className="text-sm text-theme-muted mb-3">{t('Войдите в аккаунт, чтобы писать сообщения')}</p>
          </div>
        ) : (
          <div className="border-t border-theme-border p-3 flex gap-2 items-center">
            <button
              onClick={() => { setShowStickerPanel(!showStickerPanel); }}
              disabled={isMuted || isRecording}
              className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                showStickerPanel ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={t('Стикеры')}
            >
              <Smile className="w-5 h-5" />
            </button>
            {!isRecording && (
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                disabled={isMuted}
                aria-label={t('Эмодзи')}
                className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                  showEmojiPicker ? 'bg-theme-primary text-white' : 'bg-theme-surface2 text-theme-muted hover:text-theme-text'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <SmilePlus className="w-5 h-5" />
              </button>
            )}
            {!isRecording && (
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !sending && !isMuted && sendMessage()}
                placeholder={isMuted ? t('Вы заглушены...') : t('Введите сообщение...')}
                disabled={isMuted}
                className="flex-1 min-w-0 px-4 py-2.5 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary focus:ring-1 focus:ring-theme-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              />
            )}
            <VoiceRecordButton
              disabled={isMuted}
              onRecorded={sendVoice}
              onRecordingChange={setIsRecording}
              onError={setError}
            />
            {!isRecording && (
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim() || isMuted}
                className="px-4 py-2.5 bg-theme-primary text-white rounded-xl text-sm font-medium hover:bg-theme-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
