import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, rounded } from '../ui/theme';
import { Ionicons } from '@expo/vector-icons';
import BrandMark from '../components/BrandMark';

type ApprovalState = 'pending' | 'approved' | 'rejected';

export default function WaitingApprovalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'WaitingApproval'>>();
  const params = route.params || {};
  const tenantSlug = useMemo(() => (params.tenantSlug || '').trim().toLowerCase(), [params.tenantSlug]);
  const email = useMemo(() => (params.email || '').trim().toLowerCase(), [params.email]);
  const initialState = (params.state || 'pending') as ApprovalState;
  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState('العائلة');
  const [state, setState] = useState<ApprovalState>(initialState);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!tenantSlug) return;

    const loadTenant = async () => {
      try {
        const seed = await apiClient.seedDatabase(tenantSlug);
        if (!seed?.tenantId) return;
        setTenantId(seed.tenantId);
        const tenant = await apiClient.getTenant(seed.tenantId);
        setTenantName(tenant?.name || 'العائلة');
      } catch {
        // no-op
      }
    };

    loadTenant();
  }, [tenantSlug]);

  useEffect(() => {
    if (!tenantId || !email || state !== 'pending') return;

    const poll = async () => {
      try {
        setChecking(true);
        const status = await apiClient.getJoinRequestStatus(tenantId, email);
        if (status.status === 'approved') {
          setState('approved');
        } else if (status.status === 'rejected') {
          setState('rejected');
        }
      } catch {
        // no-op
      } finally {
        setChecking(false);
      }
    };

    const interval = setInterval(poll, 5000);
    poll();

    return () => clearInterval(interval);
  }, [tenantId, email, state]);

  const goToLogin = () => navigation.reset({ index: 0, routes: [{ name: 'Login', params: { tenantSlug } }] });
  const goToJoin = () => navigation.reset({ index: 0, routes: [{ name: 'JoinFamily', params: { tenantSlug } }] });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BrandMark />
          <View style={styles.headerText}>
            <Text style={styles.brandTitle}>قبيلة</Text>
            <Text style={styles.brandSubtitle}>طلبك قيد المراجعة</Text>
          </View>
        </View>

        {state === 'pending' && (
          <>
            <View style={styles.iconCard}>
              {checking ? <ActivityIndicator color={colors.secondary} /> : <Ionicons name="time-outline" size={34} color={colors.secondary} />}
            </View>
            <Text style={styles.title}>بانتظار الموافقة</Text>
            <Text style={styles.subtitle}>
              تم تسجيل حسابك بنجاح، لكن الوصول إلى {tenantName} سيفتح فقط بعد موافقة مسؤول العائلة.
            </Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>حالة الطلب</Text>
              <Text style={styles.infoText}>{checking ? 'جارٍ التحقق من حالة الطلب...' : 'سيتم تحديث الحالة تلقائياً فور الاعتماد أو الرفض.'}</Text>
            </View>
          </>
        )}

        {state === 'approved' && (
          <>
            <View style={[styles.iconCard, styles.approvedCard]}>
              <Ionicons name="checkmark" size={34} color={colors.secondary} />
            </View>
            <Text style={styles.title}>تمت الموافقة</Text>
            <Text style={styles.subtitle}>تم قبول عضويتك. يمكنك الآن تسجيل الدخول إلى مساحة العائلة.</Text>
          </>
        )}

        {state === 'rejected' && (
          <>
            <View style={[styles.iconCard, styles.rejectedCard]}>
              <Ionicons name="close" size={34} color={colors.error} />
            </View>
            <Text style={styles.title}>تم رفض الطلب</Text>
            <Text style={styles.subtitle}>لم تتم الموافقة على الطلب حالياً. يمكنك إعادة التقديم أو التواصل مع المسؤول.</Text>
          </>
        )}

        <TouchableOpacity style={styles.primaryButton} onPress={goToLogin}>
          <Text style={styles.primaryText}>العودة لتسجيل الدخول</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={goToJoin}>
          <Text style={styles.secondaryText}>طلب انضمام جديد</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  headerText: {
    alignItems: 'flex-end',
  },
  brandTitle: {
    ...typography.headlineLg,
    color: colors.primary,
  },
  brandSubtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  iconCard: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: rounded.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  approvedCard: {
    backgroundColor: '#e8f5e9',
  },
  rejectedCard: {
    backgroundColor: '#ffebee',
  },
  title: {
    ...typography.headlineMd,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rounded.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoTitle: {
    ...typography.labelMd,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  infoText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: rounded.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  primaryText: {
    ...typography.button,
    color: colors.surface,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: rounded.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    ...typography.button,
    color: colors.text,
  },
});