import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
import { colors, spacing, typography, rounded } from '../ui/theme';
import Skeleton from '../components/ui/Skeleton';
import { Animated } from 'react-native';

export default function ChatThreadScreen() {
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const { user, logout } = useAuth();
  const { scope, targetUserId, branchId, title, subtitle } = route.params || {};
  const [tenantId, setTenantId] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState('');
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<any> | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const canLoadDirectThread = scope !== 'DIRECT' || Boolean(targetUserId);

  const renderSender = (message: any) => {
    if (message.senderId === user?.id) return 'أنت';
    if (typeof message.senderName === 'string' && message.senderName.trim().length > 0) return message.senderName;
    if (scope === 'DIRECT') return title || 'عضو';
    if (scope === 'ANNOUNCEMENT') return 'الإعلانات';
    return 'عضو';
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const seed = await apiClient.seedDatabase(user?.tenantSlug);
      if (!seed?.tenantId) return;
      setTenantId(seed.tenantId);
      if (scope === 'DIRECT' && !targetUserId) {
        setMessages([]);
        return;
      }
      const payload: any = { tenantId: seed.tenantId, scope };
      if (scope === 'BRANCH') payload.branchId = branchId;
      const data = await apiClient.getMessages(payload);
      setMessages(Array.isArray(data) ? data : []);
      await apiClient.markConversationRead({ tenantId: seed.tenantId, scope, targetUserId: scope === 'DIRECT' ? targetUserId : undefined, branchId: scope === 'BRANCH' ? branchId : undefined });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantSlug, scope, targetUserId, branchId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!tenantId) return;
    if (!canLoadDirectThread) {
      setStreamStatus('offline');
      return;
    }

    let cancelled = false;

    const closeStream = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const scheduleReconnect = (attempt: number) => {
      if (cancelled) return;
      const nextAttempt = attempt + 1;
      const delayMs = Math.min(1000 * 2 ** attempt, 30000);
      setStreamStatus('reconnecting');
      setReconnectAttempt(nextAttempt);

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = setTimeout(() => {
        void connect(nextAttempt);
      }, delayMs);
    };

    const connect = async (attempt = 0) => {
      if (cancelled) return;
      setStreamStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      setReconnectAttempt(attempt);

      try {
        const url = await apiClient.getMessageStreamUrl({
          tenantId,
          scope,
          targetUserId: scope === 'DIRECT' ? targetUserId : undefined,
          branchId: scope === 'BRANCH' ? branchId : undefined,
        });
        if (!url) {
          setStreamStatus('offline');
          return;
        }

        closeStream();
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.onopen = () => {
          setStreamStatus('connected');
          setReconnectAttempt(0);
        };

        es.addEventListener('message.created', (ev: any) => {
          try {
            const payload = ev?.data ? JSON.parse(ev.data) : null;
            if (payload?.senderId !== user?.id) {
              Alert.alert('رسالة جديدة', `${payload.senderName}: ${payload.content?.slice?.(0, 120) || ''}`);
            }
          } catch (e) {}
          void load();
        });

        es.addEventListener('message.updated', () => {
          void load();
        });

        es.onerror = () => {
          closeStream();
          scheduleReconnect(attempt);
        };
      } catch (err) {
        console.error(err);
        scheduleReconnect(attempt);
      }
    };

    void connect(0);

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      closeStream();
      setStreamStatus('offline');
    };
  }, [tenantId, scope, targetUserId, branchId, load, user?.id, canLoadDirectThread]);

  useEffect(() => {
    // set highlighted id from navigation params on mount
    try {
      const mid = (route?.params as any)?.messageId;
      if (mid && typeof mid === 'string') {
        setHighlightedMessageId(mid);
        // also keep ref for potential future use
        // auto-scroll will be handled when messages load below
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const mid = highlightedMessageId;
    if (!mid) return;
    const idx = messages.findIndex((m) => String(m._id || m.id) === String(mid));
    if (idx >= 0 && listRef.current) {
      try {
        listRef.current.scrollToIndex({ index: idx, animated: true });
      } catch (e) {
        // fallback: scroll to end then try find
        try { listRef.current.scrollToOffset({ offset: 0, animated: true }); } catch (e) {}
      }
      // trigger a pulse animation
      highlightAnim.setValue(0);
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(highlightAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]).start(() => setHighlightedMessageId(null));
    }
  }, [messages, highlightedMessageId]);

  useEffect(() => {
    if (!tenantId) return;
    if (!canLoadDirectThread) return;
    const intervalId = setInterval(() => {
      void load();
    }, 8000);
    return () => clearInterval(intervalId);
  }, [tenantId, load, canLoadDirectThread]);

  const sendMessage = async () => {
    if (!tenantId || !content.trim()) return;
    if (scope === 'DIRECT' && !targetUserId) {
      Alert.alert('محادثة غير صالحة', 'اختر مستلماً لفتح الرسائل المباشرة.');
      return;
    }
    setSending(true);
    try {
      await apiClient.sendMessage({ tenantId, scope, content: content.trim(), targetUserId: scope === 'DIRECT' ? targetUserId : undefined, branchId: scope === 'BRANCH' ? branchId : undefined });
      setContent('');
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>{(title || 'م').charAt(0)}</Text></View>
          <View style={{ marginLeft: spacing.sm }}>
            <Text style={styles.headerTitle}>{title || 'محادثة'}</Text>
            <Text style={styles.headerSubtitle}>{subtitle || ''}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={() => {}}><Ionicons name="call-outline" size={20} color={colors.text} /></TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => {}}><Ionicons name="videocam-outline" size={20} color={colors.text} /></TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => {}}><Ionicons name="ellipsis-vertical" size={20} color={colors.text} /></TouchableOpacity>
        </View>
      </View>

      {(streamStatus !== 'connected' || highlightedMessageId) && (
        <View>
          {streamStatus !== 'connected' && (
            <View style={styles.streamBanner}>
              <Text style={styles.streamBannerText}>
                {streamStatus === 'connecting' ? 'جاري الاتصال بالمحادثة...' : streamStatus === 'reconnecting' ? `انقطع الاتصال، إعادة المحاولة (${reconnectAttempt})` : 'المحادثة تعمل بوضع غير متصل'}
              </Text>
            </View>
          )}
          {highlightedMessageId && (
            <View style={styles.jumpBanner}>
              <Text style={styles.jumpBannerText}>⭐ جاري الانتقال للرسالة المستهدفة...</Text>
            </View>
          )}
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <View style={styles.messagesWrap}>
          {loading ? (
            <View style={{ padding: spacing.md }}>
              <Skeleton style={{ height: 12, width: '50%', borderRadius: 8, marginBottom: spacing.md }} aria-label="loading-thread-title" />
              {[0,1,2,3].map(i => (
                <Skeleton key={i} style={{ height: 84, borderRadius: rounded.lg, marginBottom: spacing.md }} aria-label={`loading-thread-msg-${i}`} />
              ))}
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              inverted
              keyExtractor={(m) => m._id}
              renderItem={({ item }) => {
                const mine = item.senderId === user?.id;
                return (
                  <View style={[styles.messageRow, mine ? styles.ownRow : styles.otherRow]}>
                    {String(item._id || item.id) === String(highlightedMessageId) ? (
                      <Animated.View
                        style={[
                          styles.bubble,
                          mine ? styles.ownBubble : styles.otherBubble,
                          styles.highlightBubble,
                          { transform: [{ scale: highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] },
                        ]}
                      >
                        {!mine && <Text style={styles.senderName}>{renderSender(item)}</Text>}
                        <Text style={styles.messageText}>{item.content}</Text>
                        <Text style={styles.messageTime}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
                      </Animated.View>
                    ) : (
                      <View
                        style={[
                          styles.bubble,
                          mine ? styles.ownBubble : styles.otherBubble,
                        ]}
                      >
                        {!mine && <Text style={styles.senderName}>{renderSender(item)}</Text>}
                        <Text style={styles.messageText}>{item.content}</Text>
                        <Text style={styles.messageTime}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>

        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.iconButton} onPress={() => {}}>
            <Ionicons name="attach" size={22} color={colors.text} />
          </TouchableOpacity>
          <TextInput value={content} onChangeText={setContent} placeholder="اكتب رسالة" placeholderTextColor={colors.textMuted} style={styles.input} multiline />
          <TouchableOpacity onPress={sendMessage} disabled={sending || !content.trim()} style={[styles.sendButton, (sending || !content.trim()) && styles.sendDisabled]}>
            <Ionicons name="send" size={20} color={colors.surface} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm },
  headerAvatarText: { color: colors.surface },
  headerTitle: { ...typography.labelMd, color: colors.text },
  headerSubtitle: { ...typography.bodyMd, color: colors.textMuted },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  iconButton: { padding: 8 },
  messagesWrap: { flex: 1, padding: spacing.md, backgroundColor: colors.background },
  messageRow: { marginVertical: 6, flexDirection: 'row' },
  ownRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', padding: spacing.md, borderRadius: rounded.lg },
  ownBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  senderName: { ...typography.labelMd, color: colors.textMuted, marginBottom: 4 },
  messageText: { ...typography.bodyMd, color: colors.text },
  messageTime: { ...typography.labelMd, color: colors.textMuted, marginTop: 6, textAlign: 'right' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.md, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 40, maxHeight: 120, padding: spacing.md, borderRadius: rounded.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, color: colors.text },
  sendButton: { padding: 10, backgroundColor: colors.primary, borderRadius: rounded.md, marginLeft: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.5 },
  streamBanner: { backgroundColor: '#FFF3CD', borderBottomWidth: 1, borderColor: '#F7D794', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  streamBannerText: { ...typography.labelMd, color: '#8A6D1D', textAlign: 'center' },
  jumpBanner: { backgroundColor: '#E3F2FD', borderBottomWidth: 1, borderColor: '#90CAF9', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  jumpBannerText: { ...typography.labelMd, color: '#1565C0', textAlign: 'center' },
  highlightBubble: { borderWidth: 2, borderColor: '#FFD54F', shadowColor: '#FFD54F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.6, shadowRadius: 6 },
});
