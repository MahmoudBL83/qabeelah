import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '@qabila/types';
import { colors, spacing } from '../ui/theme';
import Skeleton from '../components/ui/Skeleton';
import ScreenHeader from '../components/ScreenHeader';
import { formatDateWithHijri } from '../lib/date';

type AdminMetrics = {
  totalMembers: number;
  pendingRequests: number;
  adminCount: number;
  upcomingEvents: number;
};

type JoinRequest = {
  _id: string;
  fullName: string;
  email: string;
  relationship?: string;
  createdAt: string;
};

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuth();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [recentRequests, setRecentRequests] = useState<JoinRequest[]>([]);
  const [tenantName, setTenantName] = useState('العائلة');
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const seedResult = await apiClient.seedDatabase();
        if (seedResult?.tenantId) {
          setTenantId(seedResult.tenantId);
          const [metricsData, requestsData, tenant] = await Promise.all([
            apiClient.getAdminMetrics(seedResult.tenantId),
            apiClient.getPendingJoinRequests(seedResult.tenantId, 6),
            apiClient.getTenant(seedResult.tenantId)
          ]);
          setMetrics(metricsData);
          setRecentRequests(requestsData);
          setTenantName(tenant?.name || 'العائلة');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleApprove = async (requestId: string) => {
    if (user?.role !== UserRole.QABILA_ADMIN) {
      setActionError('لا تملك الصلاحية لاعتماد الطلبات.');
      return;
    }

    try {
      await apiClient.updateJoinRequestStatus(requestId, 'approved', tenantId);
      setRecentRequests((prev) => prev.filter((request) => request._id !== requestId));
      setMetrics((prev) => (prev ? { ...prev, pendingRequests: Math.max(prev.pendingRequests - 1, 0) } : prev));
      setActionError('');
      Alert.alert('نجح', 'تم اعتماد الطلب بنجاح');
    } catch (err) {
      console.error(err);
      setActionError('تعذر اعتماد الطلب حالياً.');
      Alert.alert('خطأ', 'فشل اعتماد الطلب. حاول مرة أخرى.');
    }
  };

  const formatDate = (isoDate: string) => formatDateWithHijri(isoDate).combined;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const getFirstNameFromFullName = (fullName?: string) => {
    const trimmed = (fullName || '').trim();
    return trimmed ? trimmed.split(/\s+/)[0] : '—';
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={`لوحة تحكم ${tenantName}`} actionLabel="تسجيل الخروج" onAction={handleLogout} actionLoading={loggingOut} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>الأعضاء المسجلين</Text>
            {loading ? <Skeleton style={styles.metricSkeleton} aria-label="loading-metric-members" /> : <Text style={styles.metricValue}>{metrics?.totalMembers ?? 0}</Text>}
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>الطلبات المعلقة</Text>
            {loading ? <Skeleton style={styles.metricSkeleton} aria-label="loading-metric-requests" /> : <Text style={styles.metricValue}>{metrics?.pendingRequests ?? 0}</Text>}
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>مدراء الفروع</Text>
            {loading ? <Skeleton style={styles.metricSkeleton} aria-label="loading-metric-admins" /> : <Text style={styles.metricValue}>{metrics?.adminCount ?? 0}</Text>}
          </View>
        </View>

        <View style={styles.navRow}>
          {loading ? (
            <>
              <Skeleton style={styles.navButtonSkeleton} aria-label="loading-nav-1" />
              <Skeleton style={styles.navButtonSkeleton} aria-label="loading-nav-2" />
              <Skeleton style={styles.navButtonSkeleton} aria-label="loading-nav-3" />
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('AdminApprovals')}>
                <Text style={styles.navText}>طلبات الانضمام</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => (navigation as any).navigate('MainTabs', { screen: 'AdminMembers' })}>
                <Text style={styles.navText}>الأعضاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => (navigation as any).navigate('MainTabs', { screen: 'AdminBranchManagers' })}>
                <Text style={styles.navText}>مديرو الفروع</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>طلبات الانضمام الحديثة</Text>
          <TouchableOpacity onPress={() => navigation.navigate('AdminApprovals')}>
            <Text style={styles.sectionAction}>عرض الكل</Text>
          </TouchableOpacity>
        </View>

        {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

        {!loading && recentRequests.length > 0 ? (
          <Text style={styles.paginationHint}>يعرض أحدث {Math.min(recentRequests.length, 6)} من {metrics?.pendingRequests || 0} طلب</Text>
        ) : null}

        {loading ? (
          <>
            <Skeleton style={styles.requestCardSkeleton} aria-label="loading-request-1" />
            <Skeleton style={styles.requestCardSkeleton} aria-label="loading-request-2" />
            <Skeleton style={styles.requestCardSkeleton} aria-label="loading-request-3" />
          </>
        ) : recentRequests.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد طلبات انضمام جديدة.</Text>
        ) : (
          recentRequests.map((request) => (
            <View key={request._id} style={styles.requestCard}>
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>{getFirstNameFromFullName(request.fullName)}</Text>
                <Text style={styles.requestMeta}>{request.relationship || 'غير محدد'}</Text>
                <Text style={styles.requestDate}>{formatDate(request.createdAt)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.approveButton, user?.role !== UserRole.QABILA_ADMIN && styles.disabled]}
                disabled={user?.role !== UserRole.QABILA_ADMIN}
                onPress={() => handleApprove(request._id)}
              >
                <Text style={styles.approveText}>قبول</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center'
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textMuted
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 6
  },
  metricSkeleton: {
    marginTop: 8,
    width: 42,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  navButtonSkeleton: {
    flexGrow: 1,
    flexBasis: '30%',
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  navButton: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  navText: {
    fontSize: 12,
    color: colors.text
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text
  },
  sectionAction: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '600'
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md
  },
  requestCardSkeleton: {
    height: 74,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  requestInfo: {
    flex: 1
  },
  requestName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text
  },
  requestMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4
  },
  requestDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2
  },
  approveButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  approveText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12
  },
  error: {
    color: colors.error
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12
  },
  disabled: {
    opacity: 0.5
  },
  paginationHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.sm
  }
});
