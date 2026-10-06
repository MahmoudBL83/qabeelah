import { API_BASE_URL } from '../lib/config';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
import { colors, spacing, typography, rounded } from '../ui/theme';
import Skeleton from '../components/ui/Skeleton';
import ScreenHeader from '../components/ScreenHeader';
import { storage } from '../lib/storage';
import { Branch } from '@qabila/types';

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

export default function MessagesScreen() {
  const { user } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const loadMessagesDebounceRef = useRef<number | null>(null);

  const [tenantId, setTenantId] = useState('');
  const [scope, setScope] = useState<Scope>('DIRECT');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<any>(null);
  const [branchId, setBranchId] = useState(user?.branchId || 'الفرع الرئيسي');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [showParticipantPicker, setShowParticipantPicker] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);

  const getBranchName = (id?: string) => {
    if (!id) return 'الفرع الرئيسي';
    const branch = branches.find(b => b._id === id || b.id === id);
    return branch ? branch.name : id;
  };

  const isAdmin = user?.role === 'QABILA_ADMIN' || user?.role === 'SUB_ADMIN' || user?.role === 'SUPER_ADMIN';
  const isClanAdmin = user?.role === 'QABILA_ADMIN' || user?.role === 'SUPER_ADMIN';
  const isSubAdmin = user?.role === 'SUB_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const selectedUser = participants.find((p) => p._id === selectedUserId);
  const directSummary = conversations?.direct?.find((c: ConversationSummary) => c.targetUserId === selectedUserId);

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
    const directChats = (conversations?.direct || []).map((conversation: ConversationSummary) => ({
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

    const announcementChat = isClanAdmin && conversations?.announcement
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
  }, [conversations, isClanAdmin]);

  const activeChatTitle = scope === 'DIRECT'
    ? selectedUser?.name || 'اختر محادثة'
    : scope === 'BRANCH'
      ? 'مجموعة الفرع'
      : 'الإعلانات';

  const activeChatSubtitle = scope === 'DIRECT'
    ? directSummary?.lastMessage
      ? `${directSummary.lastMessage.senderName}: ${directSummary.lastMessage.content}`
      : 'اختر محادثة من الأعلى'
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
      setShowParticipantPicker(false);
      return;
    }
    if (chat.scope === 'BRANCH') {
      setBranchId(chat.branchId || user?.branchId || 'الفرع الرئيسي');
    }
  };

  const chatAction = (title: string) => {
    Alert.alert(title, 'قريباً');
  };

  const loadMessages = useCallback(async () => {
    if (!tenantId) return;
    setError('');

    // Guard: don't call API if required params for scope aren't ready
    if (scope === 'DIRECT' && !selectedUserId) {
      setMessages([]);
      return;
    }
    if (scope === 'BRANCH' && !branchId) {
      setMessages([]);
      return;
    }

    try {
      const payload: any = { tenantId, scope };
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
    } catch (err) {
      if ((err as any)?.status === 403) {
        setMessages([]);
        setError('');
        return;
      }
      console.error(err);
      setError('تعذر تحميل الرسائل حالياً.');
    }
  }, [tenantId, scope, selectedUserId, branchId]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const seed = await apiClient.seedDatabase(user?.tenantSlug);
      if (!seed?.tenantId) return;
      setTenantId(seed.tenantId);
      const [users, conversationSummary, branchesData] = await Promise.all([
        apiClient.getMessageParticipants(seed.tenantId),
        apiClient.getMessageConversations(seed.tenantId),
        apiClient.getBranches(seed.tenantId).catch(() => [])
      ]);
      setParticipants(users || []);
      setConversations(conversationSummary);
      setBranches(branchesData);
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
      if ((err as any)?.status === 403) {
        setParticipants([]);
        setConversations(null);
        setError('');
        return;
      }
      console.error(err);
      setError('تعذر تهيئة مساحة المراسلة.');
    } finally {
      setLoading(false);
    }
  }, [user?.tenantSlug, user?.id]);

  useFocusEffect(useCallback(() => { bootstrap(); }, [bootstrap]));

  useEffect(() => {
    loadMessages();
  }, [tenantId, scope, selectedUserId, branchId, loadMessages]);

  useEffect(() => {
    if (!tenantId) return;
    const setupSSE = async () => {
      try {
        const token = await storage.getItem('qabila_token');
        if (!token) return;
        const params = new URLSearchParams({ tenantId, scope, token });
        if (scope === 'DIRECT' && selectedUserId) params.set('targetUserId', selectedUserId);
        if (scope === 'BRANCH') params.set('branchId', branchId);
        const url = `${API_BASE_URL}/messages/stream?${params.toString()}`;
        const eventSource = new EventSource(url);
        eventSource.addEventListener('ready', () => setConnected(true));
        eventSource.addEventListener('message.created', (ev: any) => {
          // Debounce loadMessages to prevent flickering from rapid SSE events
          if (loadMessagesDebounceRef.current) {
            clearTimeout(loadMessagesDebounceRef.current);
          }
          loadMessagesDebounceRef.current = setTimeout(() => {
            try {
              const payload = ev?.data ? JSON.parse(ev.data) : null;
              const senderName = payload?.senderName || 'عضو';
              const snippet = payload?.content ? (payload.content.length > 80 ? payload.content.slice(0, 80) + '…' : payload.content) : 'لديك رسالة جديدة';
              if (senderName && snippet && payload?.senderId !== user?.id) {
                Alert.alert('رسالة جديدة', `${senderName}: ${snippet}`);
              }
            } catch (e) {
              // ignore parse errors
            }
            loadMessages();
          }, 500);
        });
        eventSource.addEventListener('message.updated', () => {
          if (loadMessagesDebounceRef.current) clearTimeout(loadMessagesDebounceRef.current);
          loadMessagesDebounceRef.current = setTimeout(() => loadMessages(), 500);
        });
        eventSource.onerror = () => setConnected(false);
        eventSourceRef.current = eventSource;
      } catch (err) {
        console.error('SSE setup error:', err);
      }
    };
    setupSSE();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setConnected(false);
      }
    };
  }, [tenantId, scope, selectedUserId, branchId, loadMessages]);

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
      // Optimistically append the sent message to avoid full reload/reset
      setMessages((prev) => [sent, ...prev]);
    } catch (err) {
      console.error(err);
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
    return participants.find((p) => p._id === senderId)?.name || 'عضو';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'للتو';
    if (diffMins < 60) return `منذ ${diffMins}د`;
    if (diffHours < 24) return `منذ ${diffHours}س`;
    if (diffDays < 7) return `منذ ${diffDays}يوم`;
    return date.toLocaleDateString('ar-SA');
  };

  const canModerate = (message: ChatMessage): boolean => {
    if (isSuperAdmin) return true;
    if (isClanAdmin) return true;
    if (isSubAdmin) return scope === 'BRANCH' && message.branchId === user?.branchId;
    return false;
  };

  const directUnreadCount = conversations?.direct?.reduce((sum: number, item: any) => sum + item.unreadCount, 0) || 0;
  const branchUnreadCount = conversations?.branch?.unreadCount || 0;
  const announcementUnreadCount = conversations?.announcement?.unreadCount || 0;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        <ScreenHeader
          title="الرسائل"
          actionLabel={showParticipantPicker ? 'إخفاء' : 'المستلم'}
          onAction={() => setShowParticipantPicker((prev) => !prev)}
        />
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTag}>دردشات حديثة ورسائل مباشرة</Text>
              <Text style={styles.headerSubtitle}>بنمط اجتماعي نظيف وسريع</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.iconButton} onPress={() => chatAction('بحث داخل الدردشة')}>
                <Ionicons name="search" size={18} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => chatAction('مكالمة صوتية')}>
                <Ionicons name="call-outline" size={18} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => chatAction('مكالمة فيديو')}>
                <Ionicons name="videocam-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.connectionRow}>
            <Text style={styles.statusText}>{connected ? 'متصل مباشرة' : 'غير متصل'}</Text>
            <View style={[styles.statusIndicator, { backgroundColor: connected ? colors.secondary : colors.error }]} />
          </View>
        </View>

        <View style={styles.recentChatsWrap}>
          <View style={styles.recentChatsHeader}>
            <Text style={styles.recentChatsTitle}>الدردشات الأخيرة</Text>
            <Text style={styles.recentChatsCount}>{recentChats.length}</Text>
          </View>
          <FlatList
            data={recentChats}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.recentChatsList}
            renderItem={({ item }) => {
              const active =
                (item.scope === 'DIRECT' && scope === 'DIRECT' && selectedUserId === item.targetUserId) ||
                (item.scope === 'BRANCH' && scope === 'BRANCH') ||
                (item.scope === 'ANNOUNCEMENT' && scope === 'ANNOUNCEMENT');

              return (
                <TouchableOpacity style={[styles.recentChatCard, active && styles.recentChatCardActive]} onPress={() => selectRecentChat(item)}>
                  <View style={styles.recentChatAvatar}>
                    <Text style={styles.recentChatAvatarText}>{item.title.charAt(0)}</Text>
                  </View>
                  <Text style={styles.recentChatName} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.recentChatPreview} numberOfLines={2}>{item.subtitle}</Text>
                  <View style={styles.recentChatMetaRow}>
                    <Text style={styles.recentChatTime}>{formatConversationTime(item.createdAt)}</Text>
                    {item.unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View>}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        <View style={styles.tabsContainer}>
          <TouchableOpacity style={[styles.tab, scope === 'DIRECT' && styles.activeTab]} onPress={() => setScope('DIRECT')}>
            <Text style={[styles.tabText, scope === 'DIRECT' && styles.activeTabText]}>رسائل مباشرة</Text>
            {directUnreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{directUnreadCount}</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, scope === 'BRANCH' && styles.activeTab]} onPress={() => setScope('BRANCH')}>
            <Text style={[styles.tabText, scope === 'BRANCH' && styles.activeTabText]}>مجموعة الفرع</Text>
            {branchUnreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{branchUnreadCount}</Text></View>}
          </TouchableOpacity>
          {isClanAdmin && (
            <TouchableOpacity style={[styles.tab, scope === 'ANNOUNCEMENT' && styles.activeTab]} onPress={() => setScope('ANNOUNCEMENT')}>
              <Text style={[styles.tabText, scope === 'ANNOUNCEMENT' && styles.activeTabText]}>الإعلانات</Text>
              {announcementUnreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{announcementUnreadCount}</Text></View>}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.chatHeaderCard}>
          <View style={styles.chatHeaderInfo}>
            <View style={styles.chatHeaderAvatar}><Text style={styles.recentChatAvatarText}>{activeChatTitle.charAt(0)}</Text></View>
            <View style={styles.chatHeaderTextWrap}>
              <Text style={styles.chatHeaderTitle} numberOfLines={1}>{activeChatTitle}</Text>
              <Text style={styles.chatHeaderSubtitle} numberOfLines={1}>{activeChatSubtitle}</Text>
            </View>
          </View>
          <View style={styles.chatHeaderActions}>
            <TouchableOpacity style={styles.iconButton} onPress={() => chatAction('بحث')}>
              <Ionicons name="search" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => chatAction('مزيد من الخيارات')}>
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{connected ? 'متصل مباشرة' : 'غير متصل'}</Text>
          <View style={[styles.statusIndicator, { backgroundColor: connected ? colors.secondary : colors.error }]} />
        </View>
        {/* Recipient selection removed — choosing chat happens on Conversations list screen */}
        {scope !== 'DIRECT' && (
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>الفرع</Text>
            {isClanAdmin && scope === 'BRANCH' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', paddingVertical: 5 }}>
                <TouchableOpacity
                  style={[styles.branchPill, branchId === 'الفرع الرئيسي' && styles.branchPillActive]}
                  onPress={() => setBranchId('الفرع الرئيسي')}
                >
                  <Text style={[styles.branchPillText, branchId === 'الفرع الرئيسي' && styles.branchPillTextActive]}>الفرع الرئيسي</Text>
                </TouchableOpacity>
                {branches.map(b => (
                  <TouchableOpacity
                    key={b._id}
                    style={[styles.branchPill, branchId === b._id && styles.branchPillActive]}
                    onPress={() => setBranchId(b._id || '')}
                  >
                    <Text style={[styles.branchPillText, branchId === b._id && styles.branchPillTextActive]}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.branchInput}>
                {getBranchName(branchId)}
              </Text>
            )}
            {isSubAdmin && <Text style={styles.helperText}>أنت محدود للعمل في فرعك فقط: {getBranchName(branchId)}</Text>}
          </View>
        )}
        {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
        <View style={styles.messagesContainer}>
          {loading && messages.length === 0 ? (
            <View style={{ padding: spacing.md }}>
              <Skeleton style={{ height: 12, width: '60%', borderRadius: 8, marginBottom: spacing.md }} aria-label="loading-title" />
              <View style={{ height: 12 }} />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} style={{ height: 72, borderRadius: 12, marginBottom: spacing.md }} aria-label={`loading-message-${i}`} />
              ))}
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.centerContainer}><Text style={styles.emptyText}>لا توجد رسائل بعد.</Text></View>
          ) : (
            <FlatList data={messages} keyExtractor={(item) => item._id} renderItem={({ item: message }) => {
              const mine = message.senderId === user?.id;
              return (
                <View style={[styles.messageRow, mine ? styles.ownMessageRow : {}]}>
                  <View style={[styles.messageBubble, mine ? styles.ownBubble : styles.otherBubble]}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.messageHeaderText}>{renderSender(message.senderId)}</Text>
                      <Text style={styles.messageTime}>{formatDate(message.createdAt)}</Text>
                    </View>
                    {message.isHidden ? <Text style={styles.hiddenText}>تم إخفاء هذه الرسالة بواسطة الإشراف.</Text> : <Text style={[styles.messageContent, mine && styles.ownBubbleText]}>{message.content}</Text>}
                    {isAdmin && !mine && canModerate(message) && (
                      <View style={styles.moderationButtons}>
                        {!message.isHidden ? (
                          <TouchableOpacity style={styles.hideButton} onPress={() => moderateMessage(message._id, true)}>
                            <Text style={styles.hideButtonText}>إخفاء</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity style={styles.showButton} onPress={() => moderateMessage(message._id, false)}>
                            <Text style={styles.showButtonText}>إظهار</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    {mine && scope === 'DIRECT' && directSummary?.otherReadAt && new Date(directSummary.otherReadAt) > new Date(message.createdAt) &&
                      <Text style={styles.readReceipt}>تمت القراءة</Text>}
                  </View>
                </View>
              );
            }} inverted refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMessages} />} />
          )}
        </View>
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachButton} onPress={() => chatAction('إرفاق ملف')}>
            <Ionicons name="attach" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={() => chatAction('إيموجي')}>
            <Ionicons name="happy-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TextInput style={styles.messageInput} value={content} onChangeText={setContent}
            placeholder={scope === 'ANNOUNCEMENT' ? 'اكتب إعلاناً للعائلة...' : 'اكتب رسالتك...'}
            placeholderTextColor="#888888" multiline maxLength={1000} />
          <TouchableOpacity style={[styles.sendButton, (sending || !content.trim()) && styles.sendButtonDisabled]}
            onPress={sendMessage} disabled={sending || !content.trim()}>
            <Ionicons name="send" size={20} color={colors.surface} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerCard: { padding: spacing.md, borderRadius: rounded.lg, backgroundColor: colors.surface, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  headerTitleWrap: { flex: 1 },
  headerTag: { ...typography.labelMd, color: colors.secondary },
  headerSubtitle: { ...typography.bodyMd, color: colors.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  iconButton: { width: 38, height: 38, borderRadius: rounded.full, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  recentChatsWrap: { marginBottom: spacing.md },
  recentChatsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  recentChatsTitle: { ...typography.labelMd, color: colors.text },
  recentChatsCount: { ...typography.labelMd, color: colors.textMuted },
  recentChatsList: { gap: spacing.sm, paddingVertical: spacing.xs },
  recentChatCard: { width: 150, padding: spacing.sm, borderRadius: rounded.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  recentChatCardActive: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  recentChatAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  recentChatAvatarText: { ...typography.labelMd, color: colors.surface },
  recentChatName: { ...typography.labelMd, color: colors.text },
  recentChatPreview: { ...typography.bodyMd, color: colors.textMuted, marginTop: spacing.xs, minHeight: 32 },
  recentChatMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  recentChatTime: { ...typography.labelMd, color: colors.textMuted },
  tabsContainer: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: rounded.lg, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  activeTab: { backgroundColor: colors.primary },
  tabText: { ...typography.labelMd, color: colors.text },
  activeTabText: { color: colors.surface },
  badge: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs / 2, borderRadius: rounded.full, backgroundColor: colors.error },
  badgeText: { ...typography.labelMd, color: colors.surface },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: rounded.md, marginBottom: spacing.md },
  statusText: { ...typography.bodyMd, color: colors.text },
  statusIndicator: { width: 8, height: 8, borderRadius: 4 },
  chatHeaderCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, marginBottom: spacing.md, borderRadius: rounded.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chatHeaderInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  chatHeaderAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chatHeaderTextWrap: { flex: 1 },
  chatHeaderTitle: { ...typography.labelMd, color: colors.text },
  chatHeaderSubtitle: { ...typography.bodyMd, color: colors.textMuted, marginTop: 2 },
  chatHeaderActions: { flexDirection: 'row', gap: spacing.xs },
  selectorContainer: { marginBottom: spacing.md },
  selectorLabel: { ...typography.labelMd, color: colors.text, marginBottom: spacing.sm },
  selectorButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.md, backgroundColor: colors.surface },
  selectorButtonText: { ...typography.bodyMd, color: colors.text },
  pickerContainer: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.md, backgroundColor: colors.surface, maxHeight: 200 },
  pickerItem: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerItemText: { ...typography.bodyMd, color: colors.text },
  selectedPickerItemText: { ...typography.labelMd, color: colors.primary },
  unreadCountText: { ...typography.labelMd, color: colors.secondary, marginTop: spacing.sm },
  branchInput: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.md, backgroundColor: colors.surfaceAlt, color: colors.text, ...typography.bodyMd, overflow: 'hidden' },
  disabledInput: { opacity: 0.6, backgroundColor: colors.surfaceAlt },
  branchPill: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceAlt, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  branchPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  branchPillText: { ...typography.bodyMd, color: colors.text },
  branchPillTextActive: { color: colors.surface },
  helperText: { ...typography.labelMd, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' },
  messagesContainer: { flex: 1, backgroundColor: colors.surface, borderRadius: rounded.md, marginBottom: spacing.md },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...typography.bodyMd, color: colors.textMuted, marginTop: spacing.md },
  emptyText: { ...typography.bodyMd, color: colors.textMuted },
  errorBox: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: rounded.md, backgroundColor: colors.error, marginBottom: spacing.md },
  errorText: { ...typography.bodyMd, color: colors.surface },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  ownMessageRow: { justifyContent: 'flex-end' },
  messageBubble: { maxWidth: '85%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: rounded.lg },
  ownBubble: { backgroundColor: colors.primary },
  otherBubble: { backgroundColor: colors.surfaceAlt },
  messageHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  messageHeaderText: { ...typography.labelMd, color: colors.textMuted, opacity: 0.8 },
  messageTime: { ...typography.labelMd, color: colors.textMuted, opacity: 0.8 },
  messageContent: { ...typography.bodyMd, color: colors.text },
  ownBubbleText: { color: colors.surface },
  hiddenText: { ...typography.labelMd, fontStyle: 'italic', color: colors.textMuted },
  moderationButtons: { marginTop: spacing.sm, gap: spacing.sm },
  hideButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: rounded.sm, backgroundColor: colors.error },
  hideButtonText: { ...typography.labelMd, color: colors.surface },
  showButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: rounded.sm, backgroundColor: colors.secondary },
  showButtonText: { ...typography.labelMd, color: colors.surface },
  readReceipt: { marginTop: spacing.sm, ...typography.labelMd, color: colors.textMuted, opacity: 0.8, textAlign: 'right' },
  inputContainer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  attachButton: { width: 40, height: 40, borderRadius: rounded.full, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  messageInput: { flex: 1, minHeight: 40, maxHeight: 100, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.md, backgroundColor: colors.surface, color: colors.text, ...typography.bodyMd },
  sendButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: rounded.md, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', height: 40 },
  sendButtonDisabled: { opacity: 0.6 },
});
