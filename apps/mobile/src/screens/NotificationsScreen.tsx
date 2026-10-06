import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { colors, spacing, typography, rounded } from '../ui/theme';
import ScreenHeader from '../components/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type NotificationItem = {
  _id?: string;
  id?: string;
  title?: string;
  body?: string;
  read?: boolean;
  type?: string;
  createdAt?: string;
  data?: Record<string, any>;
};

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.getNotifications({ page: 1, limit: 50 });
      setItems(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      if ((err as any)?.status === 403) {
        setItems([]);
        setError('');
        return;
      }
      console.error(err);
      setError('تعذر تحميل الإشعارات حالياً. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  const markRead = async (id: string) => {
    try {
      await apiClient.markNotificationsRead([id]);
      await fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const unreadCount = items.filter((item) => !item.read).length;

  const openNotificationTarget = (item: NotificationItem) => {
    const data = item.data || {};
    const url = typeof data.url === 'string' ? data.url : '';

    if (url) {
      const parsedUrl = new URL(url, 'https://qabila.app');
      const pathname = parsedUrl.pathname;

      if (pathname.startsWith('/admin/approvals')) {
        (navigation as any).navigate('AdminApprovals', {
          lineageRequestId: parsedUrl.searchParams.get('lineageRequestId') || undefined,
        });
        return;
      }

      if (pathname.startsWith('/profile')) {
        (navigation as any).navigate('Account');
        return;
      }

      if (pathname.startsWith('/notifications')) {
        (navigation as any).navigate('Notifications');
        return;
      }

      if (pathname.startsWith('/messages')) {
        const scope = String(parsedUrl.searchParams.get('scope') || '').toUpperCase();
        const targetUserId = parsedUrl.searchParams.get('targetUserId') || undefined;
        const branchId = parsedUrl.searchParams.get('branchId') || undefined;

        if ((scope === 'DIRECT' && targetUserId) || scope === 'BRANCH' || scope === 'ANNOUNCEMENT') {
          (navigation as any).navigate('Messages', {
            screen: 'ChatThread',
            params: {
              scope,
              targetUserId,
              branchId,
              title: scope === 'DIRECT' ? 'محادثة مباشرة' : scope === 'BRANCH' ? 'مجموعة الفرع' : 'الإعلانات',
              subtitle: '',
              messageId: typeof data.messageId === 'string' ? data.messageId : undefined,
            },
          });
          return;
        }

        (navigation as any).navigate('Messages');
        return;
      }
    }

    const scope = typeof data.scope === 'string' ? data.scope.toUpperCase() : '';
    const targetUserId = typeof data.targetUserId === 'string' ? data.targetUserId : undefined;
    const branchId = typeof data.branchId === 'string' ? data.branchId : undefined;

    if ((scope === 'DIRECT' && targetUserId) || scope === 'BRANCH' || scope === 'ANNOUNCEMENT') {
      (navigation as any).navigate('Messages', {
        screen: 'ChatThread',
        params: {
          scope,
          targetUserId,
          branchId,
          title: scope === 'DIRECT' ? 'محادثة مباشرة' : scope === 'BRANCH' ? 'مجموعة الفرع' : 'الإعلانات',
          subtitle: '',
          messageId: typeof data.messageId === 'string' ? data.messageId : undefined,
        },
      });
    }
  };

  const formatDate = (dateValue?: string) => {
    if (!dateValue) return 'غير محدد';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'غير محدد';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'للتو';
    if (diffMins < 60) return `منذ ${diffMins}د`;
    if (diffHours < 24) return `منذ ${diffHours}س`;
    if (diffDays < 30) return `منذ ${diffDays}يوم`;
    return date.toLocaleDateString('ar-SA');
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="الإشعارات" />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>جارٍ تحميل الإشعارات...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => String(item._id || item.id || `${item.title || 'notification'}-${index}`)}
          contentContainerStyle={styles.contentContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotifications} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد إشعارات بعد</Text>
              <Text style={styles.emptySubtitle}>
                ستظهر هنا التنبيهات الجديدة الخاصة بحسابك والعائلة.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                const id = item._id || item.id;
                if (id && !item.read) {
                  void markRead(id);
                }
                openNotificationTarget(item);
              }}
              activeOpacity={0.7}
              style={[styles.notificationCard, !item.read && styles.notificationCardUnread]}
            >
              <View style={styles.notificationContent}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notificationTitle, !item.read && styles.notificationTitleUnread]}>
                    {item.title || 'إشعار'}
                  </Text>
                  {item.body ? (
                    <Text style={styles.notificationBody} numberOfLines={2}>
                      {item.body}
                    </Text>
                  ) : null}
                  <Text style={styles.notificationTime}>{formatDate(item.createdAt)}</Text>
                </View>
                {!item.read && <View style={styles.unreadDot} />}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    ...typography.bodyMd,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: rounded.md,
    backgroundColor: colors.error,
  },
  errorText: {
    color: colors.surface,
    ...typography.bodyMd,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.headlineMd,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  notificationCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rounded.md,
    padding: spacing.md,
  },
  notificationCardUnread: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.secondary,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  notificationTitle: {
    ...typography.bodyMd,
    color: colors.text,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  notificationTitleUnread: {
    fontWeight: '800',
    color: colors.text,
  },
  notificationBody: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    lineHeight: 20,
    fontSize: 14,
  },
  notificationTime: {
    ...typography.labelMd,
    color: colors.textMuted,
    fontSize: 12,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: rounded.full,
    backgroundColor: colors.secondary,
    marginTop: spacing.sm,
  },
});
