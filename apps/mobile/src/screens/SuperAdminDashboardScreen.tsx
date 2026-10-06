import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing } from '../ui/theme';
import ScreenHeader from '../components/ScreenHeader';

type TenantSummary = {
  _id: string;
  name: string;
  subdomain: string;
  isActive: boolean;
  memberCount: number;
};

type PlatformSummary = {
  tenantCount: number;
  pendingJoinRequests: number;
};

export default function SuperAdminDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { logout } = useAuth();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        await apiClient.seedDatabase();
        const [tenantList, summaryData] = await Promise.all([
          apiClient.getTenants(),
          apiClient.getTenantSummary()
        ]);
        setTenants(tenantList);
        setSummary(summaryData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const tenantCount = summary?.tenantCount ?? tenants.length;
  const activeTenants = useMemo(() => tenants.filter((tenant) => tenant.isActive).length, [tenants]);
  const inactiveTenants = Math.max(tenantCount - activeTenants, 0);
  const pendingRequests = summary?.pendingJoinRequests ?? 0;
  const totalMembers = useMemo(
    () => tenants.reduce((total, tenant) => total + (tenant.memberCount || 0), 0),
    [tenants]
  );

  const filteredTenants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const matchesQuery =
        !query || tenant.name.toLowerCase().includes(query) || tenant.subdomain.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && tenant.isActive) ||
        (statusFilter === 'inactive' && !tenant.isActive);
      return matchesQuery && matchesStatus;
    });
  }, [tenants, searchQuery, statusFilter]);

  const formatNumber = (value: number) => value.toLocaleString('ar-SA');

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="لوحة المشرف العام" onBack={() => navigation.goBack()} actionLabel="تسجيل الخروج" onAction={handleLogout} actionLoading={loggingOut} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>إجمالي العائلات</Text>
                <Text style={styles.metricValue}>{formatNumber(tenantCount)}</Text>
                <Text style={styles.metricMeta}>نشطة: {formatNumber(activeTenants)} • غير نشطة: {formatNumber(inactiveTenants)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>إجمالي الأعضاء</Text>
                <Text style={styles.metricValue}>{formatNumber(totalMembers)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>طلبات الانضمام المعلقة</Text>
                <Text style={styles.metricValue}>{formatNumber(pendingRequests)}</Text>
              </View>
            </View>

            <TextInput
              style={styles.search}
              placeholder="ابحث باسم العائلة أو النطاق..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <View style={styles.filterRow}>
              {['all', 'active', 'inactive'].map((value) => (
                <Text
                  key={value}
                  style={[styles.filterTag, statusFilter === value && styles.filterTagActive]}
                  onPress={() => setStatusFilter(value as typeof statusFilter)}
                >
                  {value === 'all' ? 'الكل' : value === 'active' ? 'النشطة' : 'غير النشطة'}
                </Text>
              ))}
            </View>

            {filteredTenants.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد نتائج مطابقة لبحثك.</Text>
            ) : (
              filteredTenants.map((tenant) => (
                <TouchableOpacity
                  key={tenant._id}
                  onPress={() => navigation.navigate('TenantDetail', { tenantId: tenant._id })}
                >
                  <View style={styles.tenantCard}>
                    <View>
                      <Text style={styles.tenantName}>{tenant.name}</Text>
                      <Text style={styles.tenantMeta}>{tenant.subdomain}.qabila.com • {formatNumber(tenant.memberCount)} عضو</Text>
                    </View>
                    <View style={[styles.statusBadge, tenant.isActive ? styles.statusActive : styles.statusInactive]}>
                      <Text style={styles.statusText}>{tenant.isActive ? 'نشطة' : 'غير نشطة'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
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
    gap: spacing.md
  },
  metricsRow: {
    gap: spacing.sm
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6
  },
  metricLabel: {
    fontSize: 12,
    color: colors.textMuted
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary
  },
  metricMeta: {
    fontSize: 11,
    color: colors.textMuted
  },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  filterTag: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 12,
    color: colors.textMuted
  },
  filterTagActive: {
    backgroundColor: colors.primary,
    color: '#ffffff',
    fontWeight: '700'
  },
  tenantCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  tenantName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text
  },
  tenantMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12
  },
  statusActive: {
    backgroundColor: '#dcfce7'
  },
  statusInactive: {
    backgroundColor: colors.surfaceAlt
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12
  }
});
