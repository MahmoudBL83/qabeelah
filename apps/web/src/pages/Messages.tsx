import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
import { Branch } from '@qabila/types';
import useTenantPrefix from '../hooks/useTenantPrefix';
import Skeleton from '../components/ui/Skeleton';
import TenantLayout from '../components/layout/TenantLayout';

type Scope = 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';

type Participant = {
  _id: string;
  name: string;
  role: string;
  branchId?: string;
};

type ChatMessage = {
  _id: string;
  senderId: string;
  recipientUserId?: string;
  branchId?: string;
  scope: Scope;
  content: string;
  isHidden?: boolean;
  moderationReason?: string;
  createdAt: string;
};

type ConversationSummary = {
  scope: Scope;
  targetUserId?: string;
  targetName?: string;
  unreadCount: number;
  otherReadAt?: string | null;
  lastMessage?: {
    content: string;
    createdAt: string;
    senderName: string;
  } | null;
};

type ConversationsPayload = {
  direct: ConversationSummary[];
  branch: {
    branchId: string;
    unreadCount: number;
    lastReadAt: string | null;
    lastMessage?: {
      content: string;
      createdAt: string;
      senderName: string;
    } | null;
  };
  announcement: {
    unreadCount: number;
    lastReadAt: string | null;
    lastMessage?: {
      content: string;
      createdAt: string;
      senderName: string;
    } | null;
  };
};

type RecentChat = {
  key: string;
  scope: Scope;
  title: string;
  subtitle: string;
  unreadCount: number;
  createdAt: string | null;
  targetUserId?: string;
  branchId?: string;
};

export default function Messages() {
  const { user, logout } = useAuth();
  const { tenantSlug } = useTenantPrefix();
  const location = useLocation();

  const [tenantId, setTenantId] = useState('');
  const [scope, setScope] = useState<Scope>('DIRECT');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationsPayload | null>(null);
  const [branchId, setBranchId] = useState(user?.branchId || 'الفرع الرئيسي');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [jumpingToMessage, setJumpingToMessage] = useState(false);

  const isAdmin = user?.role === 'QABILA_ADMIN' || user?.role === 'SUB_ADMIN' || user?.role === 'SUPER_ADMIN';

  const participantsById = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const participant of participants) map.set(participant._id, participant);
    return map;
  }, [participants]);

  const selectedUser = participants.find((participant) => participant._id === selectedUserId);
  const directSummary = conversations?.direct.find((conversation) => conversation.targetUserId === selectedUserId);
  const [recipientQuery, setRecipientQuery] = useState('');
  const filteredRecipients = participants
    .filter((p) => p._id !== user?.id)
    .filter((p) => p.name.toLowerCase().includes(recipientQuery.toLowerCase()));

  const formatConversationTime = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins}د`;
    if (diffHours < 24) return `منذ ${diffHours}س`;
    return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
  };

  const recentChats = useMemo<RecentChat[]>(() => {
    const directChats = (conversations?.direct || []).map((conversation) => ({
      key: `direct-${conversation.targetUserId}`,
      scope: 'DIRECT' as const,
      title: conversation.targetName || 'محادثة مباشرة',
      subtitle: conversation.lastMessage ? `${conversation.lastMessage.senderName}: ${conversation.lastMessage.content}` : 'ابدأ المحادثة',
      unreadCount: conversation.unreadCount,
      createdAt: conversation.lastMessage?.createdAt || null,
      targetUserId: conversation.targetUserId,
    }));

    const branchChat = conversations?.branch
      ? [{
          key: `branch-${conversations.branch.branchId}`,
          scope: 'BRANCH' as const,
          title: 'مجموعة الفرع',
          subtitle: conversations.branch.lastMessage ? `${conversations.branch.lastMessage.senderName}: ${conversations.branch.lastMessage.content}` : 'محادثة الفرع',
          unreadCount: conversations.branch.unreadCount,
          createdAt: conversations.branch.lastMessage?.createdAt || null,
          branchId: conversations.branch.branchId,
        }]
      : [];

    const announcementChat = isAdmin && conversations?.announcement
      ? [{
          key: 'announcement',
          scope: 'ANNOUNCEMENT' as const,
          title: 'الإعلانات',
          subtitle: conversations.announcement.lastMessage ? `${conversations.announcement.lastMessage.senderName}: ${conversations.announcement.lastMessage.content}` : 'محادثة الإعلانات',
          unreadCount: conversations.announcement.unreadCount,
          createdAt: conversations.announcement.lastMessage?.createdAt || null,
        }]
      : [];

    return [...directChats, ...branchChat, ...announcementChat].sort((a, b) => {
      const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return right - left;
    });
  }, [conversations, isAdmin]);

  const getBranchName = (bId?: string) => {
    if (!bId) return 'الفرع الرئيسي';
    const b = branches.find(br => br._id === bId || br.id === bId);
    return b ? b.name : bId;
  };

  const activeChatTitle = scope === 'DIRECT'
    ? selectedUser?.name || 'اختر محادثة'
    : scope === 'BRANCH'
      ? `مجموعة الفرع: ${getBranchName(branchId)}`
      : 'الإعلانات';

  const activeChatSubtitle = scope === 'DIRECT'
    ? directSummary?.lastMessage
      ? `${directSummary.lastMessage.senderName}: ${directSummary.lastMessage.content}`
      : 'آخر ظهور للمحادثة'
    : scope === 'BRANCH'
      ? conversations?.branch.lastMessage
        ? `${conversations.branch.lastMessage.senderName}: ${conversations.branch.lastMessage.content}`
        : 'رسائل الفرع'
      : conversations?.announcement.lastMessage
        ? `${conversations.announcement.lastMessage.senderName}: ${conversations.announcement.lastMessage.content}`
        : 'رسائل الإعلانات';

  const selectRecentChat = (chat: RecentChat) => {
    setScope(chat.scope);
    setError('');
    if (chat.scope === 'DIRECT') {
      setSelectedUserId(chat.targetUserId || '');
      setRecipientQuery('');
      return;
    }

    if (chat.scope === 'BRANCH') {
      setBranchId(chat.branchId || user?.branchId || 'الفرع الرئيسي');
      return;
    }
  };

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const scopeParam = String(search.get('scope') || '').toUpperCase();
    const targetUserIdParam = search.get('targetUserId') || '';
    const branchIdParam = search.get('branchId') || '';
    const messageIdParam = search.get('messageId') || '';

    if (scopeParam === 'DIRECT') {
      setScope('DIRECT');
      if (targetUserIdParam) setSelectedUserId(targetUserIdParam);
      return;
    }

    if (scopeParam === 'BRANCH') {
      setScope('BRANCH');
      if (branchIdParam) setBranchId(branchIdParam);
      if (messageIdParam) setHighlightedMessageId(messageIdParam);
      return;
    }

    if (scopeParam === 'ANNOUNCEMENT') {
      setScope('ANNOUNCEMENT');
      if (messageIdParam) setHighlightedMessageId(messageIdParam);
    }
  }, [location.search]);

  const refreshConversationSummary = useCallback(async (activeTenantId?: string) => {
    const resolvedTenantId = activeTenantId || tenantId;
    if (!resolvedTenantId) return;
    try {
      const conversationSummary = await apiClient.getMessageConversations(resolvedTenantId);
      setConversations(conversationSummary);
    } catch (err) {
      console.error(err);
    }
  }, [tenantId]);

  const loadMessages = useCallback(async () => {
    if (!tenantId) return;

    setError('');
    try {
      const payload: {
        tenantId: string;
        scope: Scope;
        targetUserId?: string;
        branchId?: string;
      } = {
        tenantId,
        scope,
      };

      if (scope === 'DIRECT') {
        if (!selectedUserId) {
          setMessages([]);
          return;
        }
        payload.targetUserId = selectedUserId;
      }

      if (scope === 'BRANCH') {
        payload.branchId = branchId;
      }

      const data = await apiClient.getMessages(payload);
      setMessages(Array.isArray(data) ? data : []);
      await apiClient.markConversationRead({
        tenantId,
        scope,
        targetUserId: scope === 'DIRECT' ? selectedUserId : undefined,
        branchId: scope === 'BRANCH' ? branchId : undefined,
      });
      await refreshConversationSummary(tenantId);
    } catch (err) {
      console.error(err);
      setError('تعذر تحميل الرسائل حالياً.');
    }
  }, [tenantId, scope, selectedUserId, branchId, refreshConversationSummary]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setLoading(true);
      try {
        const seed = await apiClient.seedDatabase(tenantSlug || user?.tenantSlug);
        if (!seed?.tenantId) return;

        if (!mounted) return;
        setTenantId(seed.tenantId);

        const users = await apiClient.getMessageParticipants(seed.tenantId);
        if (!mounted) return;
        setParticipants(users || []);

        const conversationSummary = await apiClient.getMessageConversations(seed.tenantId);
        if (!mounted) return;
        setConversations(conversationSummary);

        try {
          const branchesData = await apiClient.getBranches(seed.tenantId);
          if (mounted) setBranches(branchesData);
        } catch (e) {
          console.error("Failed to fetch branches", e);
        }

        const defaultDirectTarget = (conversationSummary?.direct || [])
          .slice()
          .sort((left: ConversationSummary, right: ConversationSummary) => {
            const leftTime = left.lastMessage?.createdAt ? new Date(left.lastMessage.createdAt).getTime() : 0;
            const rightTime = right.lastMessage?.createdAt ? new Date(right.lastMessage.createdAt).getTime() : 0;
            return rightTime - leftTime;
          })
          .find((item: ConversationSummary) => item.targetUserId)?.targetUserId || (users || []).find((p: Participant) => p._id !== user?.id)?._id;
        if (defaultDirectTarget) setSelectedUserId(defaultDirectTarget);
      } catch (err) {
        console.error(err);
        if (mounted) setError('تعذر تهيئة مساحة المراسلة.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [tenantSlug, user?.tenantSlug, user?.id]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!tenantId) return;
    const intervalId = window.setInterval(() => {
      void loadMessages();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [tenantId, loadMessages]);

  useEffect(() => {
    // ensure highlighted-message CSS is present
    const id = 'highlighted-message-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
      .highlighted-message { transition: box-shadow 0.2s ease, background-color 0.2s ease; box-shadow: 0 0 0 3px rgba(255,213,79,0.35); background-color: rgba(255,245,157,0.22); border-radius: 8px; }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;

    const closeStream = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const scheduleReconnect = (attempt: number) => {
      if (cancelled) return;
      const nextAttempt = attempt + 1;
      const delayMs = Math.min(1000 * 2 ** attempt, 30000);
      setConnected(false);
      setStreamStatus('reconnecting');
      setReconnectAttempt(nextAttempt);

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      reconnectTimer = window.setTimeout(() => {
        connect(nextAttempt);
      }, delayMs);
    };

    const connect = (attempt = 0) => {
      if (cancelled) return;

      setStreamStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      setReconnectAttempt(attempt);

      const streamUrl = apiClient.getMessageStreamUrl({
        tenantId,
        scope,
        targetUserId: scope === 'DIRECT' ? selectedUserId : undefined,
        branchId: scope === 'BRANCH' ? branchId : undefined,
      });
      if (!streamUrl) {
        setConnected(false);
        setStreamStatus('offline');
        return;
      }

      closeStream();
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setConnected(true);
        setStreamStatus('connected');
        setReconnectAttempt(0);
      };

      eventSource.addEventListener('message.created', () => {
        void loadMessages();
      });
      eventSource.addEventListener('message.updated', () => {
        void loadMessages();
      });

      eventSource.onerror = () => {
        closeStream();
        scheduleReconnect(attempt);
      };
    };

    connect(0);

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      closeStream();
      setConnected(false);
      setStreamStatus('offline');
    };
  }, [tenantId, scope, selectedUserId, branchId, loadMessages]);

  useEffect(() => {
    if (!highlightedMessageId) return;
    setJumpingToMessage(true);
    // attempt to scroll/highlight the message in the UI. If messages are loaded, try to find it.
    setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${highlightedMessageId}"]`);
      if (el && el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlighted-message');
        setTimeout(() => el.classList.remove('highlighted-message'), 4000);
      }
      setJumpingToMessage(false);
      setHighlightedMessageId(null);
    }, 600);
  }, [highlightedMessageId]);

  const sendMessage = async () => {
    if (!tenantId || !content.trim()) return;

    if (scope === 'DIRECT' && !selectedUserId) {
      setError('اختر المستلم أولاً.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const sent = await apiClient.sendMessage({
        tenantId,
        scope,
        content: content.trim(),
        targetUserId: scope === 'DIRECT' ? selectedUserId : undefined,
        branchId: scope !== 'DIRECT' ? branchId : undefined,
      });
      setContent('');
      setMessages((prev) => [...prev, sent]);
    } catch (err: any) {
      console.error(err);
      if (err?.status === 401 || err?.status === 403) {
        try { logout(); } catch {}
      }
      setError('تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  };

  const moderateMessage = async (messageId: string, hide: boolean) => {
    try {
      await apiClient.moderateMessage(messageId, hide, hide ? 'محتوى غير مناسب' : 'إعادة إظهار الرسالة');
      await loadMessages();
    } catch (err) {
      console.error(err);
      setError('تعذر تنفيذ الإشراف على الرسالة.');
    }
  };

  const renderSender = (senderId: string) => {
    if (senderId === user?.id) return 'أنت';
    return participantsById.get(senderId)?.name || 'عضو';
  };

  const chatToolbarButton = (label: string, icon: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-surface-variant bg-surface text-on-surface hover:bg-surface-variant/40 transition-colors"
      aria-label={label}
      title={label}
    >
      <span className="text-sm">{icon}</span>
    </button>
  );

  const chatSkeletons = Array.from({ length: 6 });
  const messageSkeletons = Array.from({ length: 5 });

  return (
    <TenantLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-primary mb-2">المراسلة والتواصل</h2>
            <div className="flex items-center gap-3 text-sm text-on-surface-variant">
              <p>محادثات حديثة، رسائل مباشرة، ومجموعات الأسرة   .</p>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold ${connected ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
                {streamStatus === 'connected' ? 'متصل مباشرة' : streamStatus === 'connecting' ? 'جاري الاتصال' : streamStatus === 'reconnecting' ? `إعادة الاتصال (${reconnectAttempt})` : 'غير متصل'}
              </span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {chatToolbarButton('بحث', '⌕', () => setRecipientQuery((value) => value))}
            {chatToolbarButton('مكالمة', '☎', () => window.alert('مكالمة صوتية قادمة قريباً'))}
            {chatToolbarButton('فيديو', '▣', () => window.alert('مكالمة فيديو قادمة قريباً'))}
            {chatToolbarButton('خيارات', '⋯', () => window.alert('خيارات إضافية قادمة قريباً'))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-4 h-fit lg:sticky lg:top-24">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-on-surface">الدردشات الأخيرة</h3>
              <span className="text-xs text-on-surface-variant">{loading ? '...' : recentChats.length}</span>
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {loading ? (
                chatSkeletons.map((_, index) => (
                  <div key={`chat-skeleton-${index}`} className="rounded-2xl border border-surface-variant bg-surface p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-11 w-11 rounded-full" aria-label="loading-avatar" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Skeleton className="h-4 w-24 rounded" aria-label="loading-line" />
                          <Skeleton className="h-3 w-10 rounded" aria-label="loading-small" />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Skeleton className="h-3 w-36 rounded" aria-label="loading-line-long" />
                          <Skeleton className="h-5 w-6 rounded-full" aria-label="loading-dot" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : recentChats.length > 0 ? recentChats.map((chat) => {
                const active =
                  (chat.scope === 'DIRECT' && scope === 'DIRECT' && selectedUserId === chat.targetUserId) ||
                  (chat.scope === 'BRANCH' && scope === 'BRANCH') ||
                  (chat.scope === 'ANNOUNCEMENT' && scope === 'ANNOUNCEMENT');

                return (
                  <button
                    key={chat.key}
                    type="button"
                    onClick={() => selectRecentChat(chat)}
                    className={`w-full text-right rounded-2xl border px-3 py-3 transition-all ${active ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-surface-variant/30'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-[#111c19] text-[#f2e6cd] flex items-center justify-center font-bold shrink-0">
                        {chat.title.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-on-surface truncate">{chat.title}</span>
                          <span className="text-[11px] text-on-surface-variant whitespace-nowrap">{formatConversationTime(chat.createdAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className="text-xs text-on-surface-variant truncate">{chat.subtitle}</p>
                          {chat.unreadCount > 0 ? (
                            <span className="inline-flex min-w-6 justify-center rounded-full bg-error-container text-on-error-container px-2 py-0.5 text-[11px] font-bold">{chat.unreadCount}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-surface-variant bg-surface p-4 text-sm text-on-surface-variant">
                  لا توجد محادثات بعد.
                </div>
              )}
            </div>
          </aside>

          <section className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => setScope('DIRECT')}
                className={`px-4 py-2 rounded-full text-sm font-bold ${scope === 'DIRECT' ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface'}`}
              >
                رسائل مباشرة
                {conversations?.direct.reduce((sum, item) => sum + item.unreadCount, 0) ? (
                  <span className="mr-2 inline-flex items-center rounded-full bg-error-container text-on-error-container px-2 py-0.5 text-[11px]">
                    {conversations.direct.reduce((sum, item) => sum + item.unreadCount, 0)}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setScope('BRANCH')}
                className={`px-4 py-2 rounded-full text-sm font-bold ${scope === 'BRANCH' ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface'}`}
              >
                مجموعة الفرع
                {conversations?.branch.unreadCount ? (
                  <span className="mr-2 inline-flex items-center rounded-full bg-error-container text-on-error-container px-2 py-0.5 text-[11px]">
                    {conversations.branch.unreadCount}
                  </span>
                ) : null}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setScope('ANNOUNCEMENT')}
                  className={`px-4 py-2 rounded-full text-sm font-bold ${scope === 'ANNOUNCEMENT' ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface'}`}
                >
                  الإعلانات
                  {conversations?.announcement.unreadCount ? (
                    <span className="mr-2 inline-flex items-center rounded-full bg-error-container text-on-error-container px-2 py-0.5 text-[11px]">
                      {conversations.announcement.unreadCount}
                    </span>
                  ) : null}
                </button>
              )}
            </div>

            {jumpingToMessage && (
              <div className="mb-4 rounded-2xl border border-primary bg-primary/10 px-4 py-3 flex items-center gap-2">
                <span className="text-lg">⭐</span>
                <p className="text-sm font-medium text-primary">جاري الانتقال للرسالة المستهدفة...</p>
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-surface-variant bg-surface px-4 py-3 mb-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 rounded" aria-label="loading-title" />
                  <Skeleton className="h-3 w-56 rounded" aria-label="loading-subtitle" />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Skeleton className="h-10 w-10 rounded-full" aria-label="loading-btn" />
                  <Skeleton className="h-10 w-10 rounded-full" aria-label="loading-btn" />
                  <Skeleton className="h-10 w-10 rounded-full" aria-label="loading-btn" />
                  <Skeleton className="h-10 w-10 rounded-full" aria-label="loading-btn" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-surface-variant bg-surface px-4 py-3 mb-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{activeChatTitle}</p>
                  <p className="text-xs text-on-surface-variant truncate">{activeChatSubtitle}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {chatToolbarButton('بحث داخل الدردشة', '⌕', () => window.alert('بحث داخل الدردشة قريباً'))}
                  {chatToolbarButton('اتصال صوتي', '☎', () => window.alert('اتصال صوتي قريباً'))}
                  {chatToolbarButton('اتصال فيديو', '▣', () => window.alert('اتصال فيديو قريباً'))}
                  {chatToolbarButton('مزيد', '⋯', () => window.alert('مزيد من الخيارات قريباً'))}
                </div>
              </div>
            )}

            {loading && scope === 'DIRECT' ? (
              <div className="mb-4">
                <Skeleton className="h-4 w-20 rounded mb-2" aria-label="loading-direct-title" />
                <Skeleton className="h-12 rounded-2xl" aria-label="loading-direct-card" />
                <Skeleton className="mt-2 h-3 w-52 rounded" aria-label="loading-direct-sub" />
              </div>
            ) : scope === 'DIRECT' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-on-surface mb-2">المستلم</label>
                <div className="relative">
                  <input
                    value={recipientQuery}
                    onChange={(e) => setRecipientQuery(e.target.value)}
                    placeholder="ابحث عن عضو بالاسم..."
                    className="w-full border border-surface-variant rounded-2xl bg-surface p-3 text-sm text-on-surface placeholder:text-on-surface-variant"
                  />
                  {recipientQuery && filteredRecipients.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-surface rounded-2xl border border-surface-variant max-h-56 overflow-y-auto shadow-lg">
                      {filteredRecipients.map((p) => (
                        <button
                          key={p._id}
                          onClick={() => {
                            setSelectedUserId(p._id);
                            setRecipientQuery('');
                          }}
                          className="w-full text-right px-4 py-3 hover:bg-surface-variant/40"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-[#111c19] text-[#f2e6cd] flex items-center justify-center text-sm font-bold">{p.name.charAt(0)}</div>
                            <span className="text-sm text-on-surface">{p.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedUser && <p className="text-xs text-on-surface-variant mt-1">المحادثة مع: {selectedUser.name}</p>}
                {directSummary && directSummary.unreadCount > 0 && (
                  <p className="text-xs text-secondary mt-1">رسائل غير مقروءة: {directSummary.unreadCount}</p>
                )}
              </div>
            )}

            {loading && scope !== 'DIRECT' ? (
              <div className="mb-4">
                <Skeleton className="h-4 w-14 rounded mb-2" aria-label="loading-scope-title" />
                <Skeleton className="h-12 rounded-2xl" aria-label="loading-scope-card" />
              </div>
            ) : scope !== 'DIRECT' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-on-surface mb-2">الفرع</label>
                <select
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                  className="w-full border border-surface-variant rounded-2xl bg-surface p-3 text-sm text-on-surface"
                  disabled={!isAdmin && scope === 'BRANCH'}
                >
                  <option value="الفرع الرئيسي">الفرع الرئيسي</option>
                  {branches.map(b => (
                    <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="h-[420px] overflow-y-auto bg-surface rounded-2xl border border-surface-variant p-3 space-y-3">
              {loading ? (
                <div className="space-y-3">
                  {messageSkeletons.map((_, index) => (
                    <div key={`message-skeleton-${index}`} className={`flex ${index % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-3 border border-surface-variant bg-surface-container-lowest ${index % 2 === 0 ? 'w-[72%]' : 'w-[66%]'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Skeleton className="h-3 w-16 rounded" aria-label="loading-msg-meta" />
                          <Skeleton className="h-3 w-3 rounded-full" aria-label="loading-msg-dot" />
                          <Skeleton className="h-3 w-20 rounded" aria-label="loading-msg-time" />
                        </div>
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-full rounded" aria-label="loading-msg-line1" />
                          <Skeleton className="h-3 w-4/5 rounded" aria-label="loading-msg-line2" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-on-surface-variant">لا توجد رسائل بعد.</p>
              ) : (
                messages.map((message) => {
                  const mine = message.senderId === user?.id;
                  return (
                    <div key={message._id} data-message-id={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'bg-[#d9fdd3] text-[#111c19]' : 'bg-surface-container text-on-surface'}`}>
                        <div className="flex items-center gap-2 mb-1 text-xs opacity-80">
                          <span>{renderSender(message.senderId)}</span>
                          <span>•</span>
                          <span>{new Date(message.createdAt).toLocaleString('ar-SA')}</span>
                        </div>

                        {message.isHidden ? (
                          <p className="text-xs italic">تم إخفاء هذه الرسالة بواسطة الإشراف.</p>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        )}

                        {isAdmin && !mine && (
                          <div className="mt-2 flex justify-end gap-2">
                            {!message.isHidden ? (
                              <button
                                type="button"
                                onClick={() => moderateMessage(message._id, true)}
                                className="text-[11px] px-2 py-1 rounded bg-error text-on-error"
                              >
                                إخفاء
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => moderateMessage(message._id, false)}
                                className="text-[11px] px-2 py-1 rounded bg-secondary text-on-secondary"
                              >
                                إظهار
                              </button>
                            )}
                          </div>
                        )}

                        {mine && scope === 'DIRECT' && directSummary?.otherReadAt && new Date(directSummary.otherReadAt) > new Date(message.createdAt) && (
                          <p className="mt-2 text-[11px] opacity-80 text-right">تمت القراءة</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-surface-variant bg-surface p-3">
              {loading ? (
                <div className="space-y-3">
                  <div className="flex gap-2 mb-1">
                    <Skeleton className="h-10 w-10 rounded-full" aria-label="loading-attach" />
                    <Skeleton className="h-10 w-10 rounded-full" aria-label="loading-camera" />
                    <Skeleton className="h-10 w-10 rounded-full" aria-label="loading-emoji" />
                  </div>
                  <Skeleton className="h-24 rounded-2xl" aria-label="loading-textarea" />
                  <div className="flex items-center justify-end gap-2">
                    <Skeleton className="h-11 w-24 rounded-full" aria-label="loading-send" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-3">
                    {chatToolbarButton('مرفق', '＋', () => window.alert('إرفاق ملفات قريباً'))}
                    {chatToolbarButton('كاميرا', '⌾', () => window.alert('الكاميرا قريباً'))}
                    {chatToolbarButton('رمز تعبيري', '☺', () => window.alert('الرموز التعبيرية قريباً'))}
                  </div>
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      placeholder={scope === 'ANNOUNCEMENT' ? 'اكتب إعلاناً للعائلة...' : 'اكتب رسالتك...'}
                      className="flex-1 min-h-[84px] border border-surface-variant rounded-2xl bg-surface p-3 text-sm text-on-surface"
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={sending || !content.trim()}
                      className="px-5 py-3 h-fit rounded-full bg-primary text-on-primary font-bold text-sm disabled:opacity-60"
                    >
                      {sending ? 'إرسال...' : 'إرسال'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="mt-3 rounded border border-error bg-error-container text-on-error-container px-3 py-2 text-sm">
                {error}
              </div>
            )}
          </section>
        </div>
      </div>
    </TenantLayout>
  );
}
