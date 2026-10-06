import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { apiClient } from '../lib/api';
import { colors, spacing, typography, rounded } from '../ui/theme';
import Skeleton from '../components/ui/Skeleton';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../contexts/AuthContext';

export default function ConversationsListScreen() {
  const { user } = useAuth();
  const navigation: any = useNavigation();
  const isAdmin = user?.role === 'QABILA_ADMIN' || user?.role === 'SUB_ADMIN' || user?.role === 'SUPER_ADMIN';
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const seed = await apiClient.seedDatabase(user?.tenantSlug);
      if (!seed?.tenantId) return;
      const res = await apiClient.getMessageConversations(seed.tenantId);
      setConversations(res);
    } catch (err) {
      if ((err as any)?.status === 403) {
        setConversations(null);
        return;
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantSlug]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const recentChats = React.useMemo(() => {
    if (!conversations) return [];
    const directChats = (conversations.direct || []).map((c: any) => ({
      key: `direct-${c.targetUserId}`,
      scope: 'DIRECT',
      title: c.targetName || 'محادثة مباشرة',
      subtitle: c.lastMessage ? `${c.lastMessage.senderName}: ${c.lastMessage.content}` : 'ابدأ المحادثة',
      unreadCount: c.unreadCount,
      createdAt: c.lastMessage?.createdAt || null,
      targetUserId: c.targetUserId,
    }));
    const branch = conversations.branch ? [{ key: `branch-${conversations.branch.branchId}`, scope: 'BRANCH', title: 'مجموعة الفرع', subtitle: conversations.branch.lastMessage ? `${conversations.branch.lastMessage.senderName}: ${conversations.branch.lastMessage.content}` : 'محادثة الفرع', unreadCount: conversations.branch.unreadCount, branchId: conversations.branch.branchId }] : [];
    const ann = isAdmin && conversations.announcement
      ? [{ key: 'announcement', scope: 'ANNOUNCEMENT', title: 'الإعلانات', subtitle: conversations.announcement.lastMessage ? `${conversations.announcement.lastMessage.senderName}: ${conversations.announcement.lastMessage.content}` : 'الإعلانات', unreadCount: conversations.announcement.unreadCount }]
      : [];
    return [...directChats, ...branch, ...ann].sort((a, b) => {
      const la = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const lb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return lb - la;
    });
  }, [conversations, isAdmin]);

  const openChat = (chat: any) => {
    if (chat.scope === 'DIRECT' && !chat.targetUserId) {
      Alert.alert('محادثة غير صالحة', 'لا يمكن فتح هذه المحادثة لأن المستلم غير محدد.');
      return;
    }
    navigation.navigate('ChatThread', {
      scope: chat.scope,
      targetUserId: chat.targetUserId,
      branchId: chat.branchId,
      title: chat.title,
      subtitle: chat.subtitle,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="الرسائل" actionLabel="تحديث" onAction={load} actionLoading={loading} />
      <View style={styles.content}>
        {loading ? (
          <View>
            <Skeleton style={{ height: 12, width: '40%', borderRadius: 8, marginBottom: spacing.md }} aria-label="loading-title" />
            {[0,1,2].map(i => (
              <Skeleton key={i} style={{ height: 72, borderRadius: rounded.lg, marginBottom: spacing.md }} aria-label={`loading-convo-${i}`} />
            ))}
          </View>
        ) : (
          <FlatList
            data={recentChats}
            keyExtractor={(i) => i.key}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.item} onPress={() => openChat(item)}>
                <View style={styles.avatarContainer}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{item.title.charAt(0)}</Text></View>
                </View>
                <View style={styles.meta}>
                  <View style={styles.metaTop}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.itemTime}>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : ''}</Text>
                  </View>
                  <Text style={styles.itemSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                </View>
                {item.unreadCount > 0 ? (
                  <View style={styles.unreadWrap}><Text style={styles.badgeText}>{item.unreadCount}</Text></View>
                ) : (
                  <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  title: { ...typography.headlineMd, color: colors.text },
  subtitle: { ...typography.bodyMd, color: colors.textMuted, marginTop: 4 },
  content: { flex: 1, padding: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  /* avatar (moved further down with slightly larger size) */
  meta: { flex: 1 },
  itemTitle: { ...typography.labelMd, color: colors.text, flex: 1 },
  itemSubtitle: { ...typography.bodyMd, color: colors.textMuted, marginTop: 2 },
  metaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  itemTime: { ...typography.labelMd, color: colors.textMuted },
  avatarContainer: { width: 56, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.surface, ...typography.labelMd },
  unreadWrap: { minWidth: 30, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs/2, borderRadius: rounded.full, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.surface, ...typography.labelMd },
});
