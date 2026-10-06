import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, User as BaseUser, Branch } from '@qabila/types';
import { colors, spacing, typography } from '../ui/theme';
import ScreenHeader from '../components/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface User extends BaseUser {
  _id: string;
  createdAt: string;
}

export default function BranchManagersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState('العائلة');
  const [searchQuery, setSearchQuery] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const seedResult = await apiClient.seedDatabase();
        if (!seedResult?.tenantId) throw new Error('Missing tenantId');
        setTenantId(seedResult.tenantId);
        const [data, tenant, branchesData] = await Promise.all([
          apiClient.getBranchManagers(seedResult.tenantId),
          apiClient.getTenant(seedResult.tenantId),
          apiClient.getBranches(seedResult.tenantId).catch(() => [])
        ]);
        setManagers(data);
        setTenantName(tenant?.name || 'العائلة');
        setBranches(branchesData);
      } catch (err) {
        console.error(err);
        setError('تعذر تحميل بيانات مديري الفروع.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getBranchName = (branchId?: string) => {
    if (!branchId) return 'الفرع الرئيسي';
    const branch = branches.find(b => b._id === branchId || b.id === branchId);
    return branch ? branch.name : branchId;
  };

  const filteredManagers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return managers;

    return managers.filter((manager) => {
      const branchName = getBranchName(manager.branchId);
      return (
        manager.name?.toLowerCase().includes(query) ||
        manager.email?.toLowerCase().includes(query) ||
        branchName.toLowerCase().includes(query)
      );
    });
  }, [managers, searchQuery, branches]);

  const stats = useMemo(() => {
    const uniqueBranches = new Set(managers.map((manager) => manager.branchId || 'الفرع الرئيسي')).size;
    return [
      { label: 'مدير فرع', value: String(managers.length), icon: 'people-outline' as const },
      { label: 'فروع', value: String(uniqueBranches), icon: 'business-outline' as const },
      { label: 'الحالة', value: loading ? '...' : 'محدث', icon: 'sparkles-outline' as const },
    ];
  }, [managers, loading]);

  const handleCreate = async () => {
    if (user?.role !== UserRole.QABILA_ADMIN) return;
    if (!newName || !newEmail) return;

    setCreating(true);
    try {
      const newManager = await apiClient.createBranchManager({
        tenantId,
        name: newName,
        email: newEmail,
        branchId: newBranch || 'الفرع الرئيسي'
      });
      setManagers((prev) => [newManager, ...prev]);
      setShowForm(false);
      setNewName('');
      setNewEmail('');
      setNewBranch('');
      Alert.alert('نجح', 'تم إضافة مدير الفرع بنجاح');
    } catch (err) {
      console.error(err);
      setError('فشل في إضافة مدير الفرع.');
      Alert.alert('خطأ', 'فشل في إضافة مدير الفرع. تأكد من أن البريد الإلكتروني غير مستخدم مسبقاً.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title={`مديرو فروع ${tenantName}`}
        onBack={() => navigation.goBack()}
        actionLabel={user?.role === UserRole.QABILA_ADMIN ? (showForm ? 'إخفاء' : 'إضافة') : undefined}
        onAction={user?.role === UserRole.QABILA_ADMIN ? () => setShowForm((prev) => !prev) : undefined}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
       

        <View style={styles.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <View style={styles.statIconBox}>
                <Ionicons name={stat.icon} size={16} color={colors.primary} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {user?.role === UserRole.QABILA_ADMIN && showForm && (
          <View style={styles.formCard}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>إضافة مدير فرع</Text>
              <Text style={styles.sectionHint}>سريع ومرتب</Text>
            </View>

            <Text style={styles.label}>الاسم الكامل</Text>
            <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="مثال: أحمد عبد الله" placeholderTextColor={colors.textMuted} />

            <Text style={styles.label}>البريد الإلكتروني</Text>
            <TextInput
              style={styles.input}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="ahmed@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>اسم الفرع (اختياري)</Text>
            <TextInput style={styles.input} value={newBranch} onChangeText={setNewBranch} placeholder="مثال: فرع الرياض" placeholderTextColor={colors.textMuted} />

            <TouchableOpacity style={[styles.primaryButton, creating && styles.primaryButtonDisabled]} onPress={handleCreate} disabled={creating} activeOpacity={0.85}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>إضافة وتأكيد</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.listCard}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث بالاسم أو البريد أو الفرع"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : filteredManagers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>لا يوجد مديري فروع مطابقون للبحث.</Text>
            </View>
          ) : (
            filteredManagers.map((manager) => (
              <View key={manager._id} style={styles.managerCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{manager.name?.[0] || '؟'}</Text>
                </View>
                <View style={styles.managerInfo}>
                  <View style={styles.managerHeaderRow}>
                    <Text style={styles.managerName}>{manager.name}</Text>
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>مدير فرع</Text>
                    </View>
                  </View>
                  <Text style={styles.managerMeta}>{manager.email}</Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>{getBranchName(manager.branchId)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start'
  },
  heroIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroTextWrap: {
    flex: 1,
    gap: 4
  },
  heroLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
    textTransform: 'uppercase'
  },
  heroTitle: {
    ...typography.headlineMd,
    color: colors.text,
  },
  heroSubtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6
  },
  statIconBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statValue: {
    ...typography.labelMd,
    color: colors.text
  },
  statLabel: {
    ...typography.labelMd,
    color: colors.textMuted
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs
  },
  sectionTitle: {
    ...typography.labelMd,
    color: colors.text
  },
  sectionHint: {
    ...typography.labelMd,
    color: colors.textMuted
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center'
  },
  primaryButtonDisabled: {
    opacity: 0.75
  },
  primaryText: {
    ...typography.button,
    color: '#ffffff',
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm
  },
  label: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: 2
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: 2
  },
  managerCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center'
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F1F4FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    fontWeight: '800',
    color: colors.primary,
    fontSize: 16
  },
  managerInfo: {
    flex: 1,
    gap: 4
  },
  managerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  managerName: {
    ...typography.labelMd,
    color: colors.text
  },
  managerMeta: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 17
  },
  rolePill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  rolePillText: {
    ...typography.labelMd,
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  metaPill: {
    backgroundColor: '#F6F7F9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  metaPillText: {
    ...typography.labelMd,
    color: colors.textMuted
  },
  centerState: {
    alignItems: 'center',
    paddingVertical: spacing.lg
  },
  error: {
    ...typography.bodyMd,
    color: colors.error,
    textAlign: 'center'
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center'
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.lg
  }
});
