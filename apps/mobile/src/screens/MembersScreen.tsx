import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, User as BaseUser, Branch } from '@qabila/types';
import { colors, spacing, typography } from '../ui/theme';
import ScreenHeader from '../components/ScreenHeader';
import QabeelaLogo from '../components/QabeelaLogo';

interface User extends BaseUser {
  _id: string;
  createdAt: string;
}

export default function MembersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const seedResult = await apiClient.seedDatabase();
        if (!seedResult?.tenantId) throw new Error('Missing tenantId');

        const [data, branchesData] = await Promise.all([
          apiClient.getMembers(seedResult.tenantId, user?.role === UserRole.SUB_ADMIN ? user.branchId : undefined),
          apiClient.getBranches(seedResult.tenantId).catch(() => [])
        ]);

        setMembers(data);
        setBranches(branchesData);
      } catch (err) {
        console.error(err);
        setError('تعذر تحميل بيانات الأعضاء.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.branchId, user?.role]);

  const getBranchName = (branchId?: string) => {
    if (!branchId) return 'الفرع الرئيسي';
    const branch = branches.find(b => b._id === branchId || b.id === branchId);
    return branch ? branch.name : branchId;
  };

  const branchOptions = useMemo(() => {
    const branchCounts = new Map<string, number>();
    members.forEach((member) => {
      const branchName = getBranchName(member.branchId);
      branchCounts.set(branchName, (branchCounts.get(branchName) || 0) + 1);
    });

    return [
      { key: 'all', label: 'الكل', count: members.length },
      ...Array.from(branchCounts.entries()).map(([branch, count]) => ({ key: branch, label: branch, count })),
    ];
  }, [members, branches]);

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return members.filter((member) => {
      const branchName = getBranchName(member.branchId);
      const matchesBranch = branchFilter === 'all' || branchFilter === branchName;
      const matchesSearch =
        !query || member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query);
      return matchesBranch && matchesSearch;
    });
  }, [members, branchFilter, searchQuery, branches]);

  const roleLabel = (role?: UserRole) => {
    switch (role) {
      case UserRole.QABILA_ADMIN:
        return 'مدير عائلة';
      case UserRole.SUB_ADMIN:
        return 'مدير فرع';
      default:
        return 'عضو';
    }
  };

  const stats = useMemo(() => {
    const uniqueBranches = new Set(members.map((member) => member.branchId || 'الفرع الرئيسي')).size;
    const admins = members.filter((member) => member.role === UserRole.QABILA_ADMIN).length;
    return [
      { label: 'الأعضاء', value: String(members.length), icon: 'people-outline' as const },
      { label: 'الفروع', value: String(uniqueBranches), icon: 'git-branch-outline' as const },
      { label: 'المدراء', value: String(admins), icon: 'shield-checkmark-outline' as const },
    ];
  }, [members]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="الأعضاء" onBack={() => navigation.goBack()} />
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

        <View style={styles.panelCard}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="البحث بالاسم أو البريد..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.branchRow} contentContainerStyle={styles.branchRowContent}>
            {branchOptions.map((branch) => {
              const active = branchFilter === branch.key;
              return (
                <TouchableOpacity
                  key={branch.key}
                  style={[styles.branchButton, active && styles.branchActive]}
                  onPress={() => setBranchFilter(branch.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.branchText, active && styles.branchTextActive]}>{branch.label}</Text>
                  <Text style={[styles.branchCount, active && styles.branchCountActive]}>{branch.count}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.listCard}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : filteredMembers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>لا يوجد أعضاء مطابقون للبحث.</Text>
            </View>
          ) : (
            filteredMembers.map((member) => (
              <View key={member._id} style={styles.memberCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{member.name?.[0] || '؟'}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <View style={styles.memberHeaderRow}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>{roleLabel(member.role)}</Text>
                    </View>
                  </View>
                  <Text style={styles.memberEmail}>{member.email}</Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>{getBranchName(member.branchId)}</Text>
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
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  logoWrap: {
    width: 92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    paddingVertical: spacing.sm,
  },
  heroTextWrap: {
    flex: 1,
    gap: 4,
  },
  heroLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
    textTransform: 'uppercase',
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
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  statIconBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    ...typography.labelMd,
    color: colors.text,
  },
  statLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  panelCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
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
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: 2,
  },
  branchRow: {
    marginTop: 2,
  },
  branchRowContent: {
    gap: 10,
    paddingRight: 4,
  },
  branchButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  branchActive: {
    backgroundColor: colors.primary,
  },
  branchText: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  branchTextActive: {
    color: '#ffffff',
  },
  branchCount: {
    ...typography.labelMd,
    color: colors.textMuted,
    backgroundColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  branchCountActive: {
    color: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F1F4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '800',
    color: colors.primary,
    fontSize: 16,
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  memberHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  memberName: {
    ...typography.labelMd,
    color: colors.text,
  },
  memberEmail: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  rolePill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rolePillText: {
    ...typography.labelMd,
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  metaPill: {
    backgroundColor: '#F6F7F9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillText: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  centerState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  error: {
    ...typography.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.lg,
  },
});
