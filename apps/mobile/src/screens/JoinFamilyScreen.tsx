import { useEffect, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { colors, spacing, typography, rounded } from '../ui/theme';
import ScreenHeader from '../components/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BrandMark from '../components/BrandMark';

export default function JoinFamilyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const params = (route.params || {}) as { tenantSlug?: string };
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  const [submitted, setSubmitted] = useState(false);
  const [approvalState, setApprovalState] = useState<'idle' | 'pending' | 'approved' | 'rejected'>('idle');
  const [approvalChecking, setApprovalChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [relationship, setRelationship] = useState('');
  const [newFamilyName, setNewFamilyName] = useState('');
  const [inputTenantSlug, setInputTenantSlug] = useState(params.tenantSlug || '');
  const [tenantName, setTenantName] = useState('العائلة');
  const [tenantId, setTenantId] = useState('');

  const resolvedTenantSlug = (params.tenantSlug || inputTenantSlug).trim().toLowerCase();

  useEffect(() => {
    const loadTenant = async () => {
      try {
        if (!resolvedTenantSlug) return;
        const seedResult = await apiClient.seedDatabase(resolvedTenantSlug);
        if (!seedResult?.tenantId) return;
        setTenantId(seedResult.tenantId);
        const tenant = await apiClient.getTenant(seedResult.tenantId);
        setTenantName(tenant?.name || 'العائلة');
      } catch {
        // no-op
      }
    };

    loadTenant();
  }, [resolvedTenantSlug]);

  useEffect(() => {
    if (!tenantId || !email || approvalState !== 'pending') return;

    const poll = async () => {
      try {
        setApprovalChecking(true);
        const status = await apiClient.getJoinRequestStatus(tenantId, email.trim().toLowerCase());
        if (status.status === 'approved') {
          setApprovalState('approved');
        } else if (status.status === 'rejected') {
          setApprovalState('rejected');
        }
      } catch {
        // no-op
      } finally {
        setApprovalChecking(false);
      }
    };

    const interval = setInterval(poll, 5000);
    poll();

    return () => clearInterval(interval);
  }, [tenantId, email, approvalState]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const normalizedPhone = phone.startsWith('+') ? phone : `+966${phone}`;

      if (activeTab === 'join') {
        if (!resolvedTenantSlug) {
          throw new Error('يرجى إدخال رمز العائلة أولاً.');
        }

        const seedResult = await apiClient.seedDatabase(resolvedTenantSlug);
        if (!seedResult?.tenantId) throw new Error('Missing tenantId');
        setTenantId(seedResult.tenantId);

        try {
          const status = await apiClient.getJoinRequestStatus(seedResult.tenantId, email.trim().toLowerCase());
          if (status.status === 'pending') {
            setApprovalState('pending');
            return;
          }

          if (status.status === 'approved') {
            setApprovalState('approved');
            return;
          }
        } catch {
          // If no previous request exists, continue and submit a new one.
        }

        const mobilePayload: any = {
          tenantId: seedResult.tenantId,
          fullName,
          email,
          phone: normalizedPhone,
          password
        };
        
        // Only add optional fields if they have values
        if (relationship && relationship.trim()) {
          mobilePayload.relationship = relationship.trim();
        }

        await apiClient.submitJoinRequest(mobilePayload);
        setApprovalState('pending');
        return;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        console.log('Creating family', newFamilyName, fullName, email, password);
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال الطلب حالياً، حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  if (approvalState === 'pending') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pendingHeader}>
          <BrandMark />
          <View style={styles.pendingBrandText}>
            <Text style={styles.brandTitle}>قبيلة</Text>
            <Text style={styles.brandSubtitle}>جسر بين الإرث والهوية الرقمية</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Landing')}>
            <Ionicons name="menu" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.pendingContent} showsVerticalScrollIndicator={false}>
          <View style={styles.pendingIconCard}>
            <View style={styles.pendingIconBox}>
              <Ionicons name="time-outline" size={34} color={colors.secondary} />
            </View>
          </View>

          <Text style={styles.pendingTitle}>بانتظار الموافقة</Text>
          <Text style={styles.pendingSubtitle}>
            طلب الانضمام إلى {tenantName} قيد المراجعة. سنفتح الدخول فور اعتماد العضوية.
          </Text>

          <View style={styles.pendingInfoCard}>
            <View style={styles.pendingInfoHeader}>
              <Ionicons name="information-circle-outline" size={20} color={colors.secondary} />
              <Text style={styles.pendingInfoTitle}>تحديث الحالة</Text>
            </View>
            <Text style={styles.pendingInfoText}>
              {approvalChecking ? 'جارٍ التحقق من حالة الطلب...' : 'يتم فحص حالة الطلب تلقائياً كل بضع ثوانٍ.'}
            </Text>
          </View>

          <TouchableOpacity style={styles.primaryButtonDark} onPress={() => navigation.navigate('Login', { tenantSlug: resolvedTenantSlug })}>
            <Text style={styles.primaryButtonDarkText}>العودة لتسجيل الدخول</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (approvalState === 'approved') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pendingHeader}>
          <BrandMark />
          <View style={styles.pendingBrandText}>
            <Text style={styles.brandTitle}>قبيلة</Text>
            <Text style={styles.brandSubtitle}>جسر بين الإرث والهوية الرقمية</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Login', { tenantSlug: resolvedTenantSlug })}>
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.pendingContent}>
          <Text style={styles.pendingTitle}>تمت الموافقة</Text>
          <Text style={styles.pendingSubtitle}>تم قبول طلبك، يمكنك الآن تسجيل الدخول إلى مساحة العائلة.</Text>
          <TouchableOpacity style={styles.primaryButtonDark} onPress={() => navigation.navigate('Login', { tenantSlug: resolvedTenantSlug })}>
            <Text style={styles.primaryButtonDarkText}>تسجيل الدخول الآن</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (approvalState === 'rejected') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pendingHeader}>
          <BrandMark />
          <View style={styles.pendingBrandText}>
            <Text style={styles.brandTitle}>قبيلة</Text>
            <Text style={styles.brandSubtitle}>جسر بين الإرث والهوية الرقمية</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Landing')}>
            <Ionicons name="menu" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.pendingContent}>
          <Text style={styles.pendingTitle}>تم رفض الطلب</Text>
          <Text style={styles.pendingSubtitle}>يمكنك تحديث البيانات وإعادة إرسال طلب انضمام جديد.</Text>
          <TouchableOpacity style={styles.primaryButtonDark} onPress={() => setApprovalState('idle')}>
            <Text style={styles.primaryButtonDarkText}>إعادة التقديم</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pendingHeader}>
          <BrandMark />
          <View style={styles.pendingBrandText}>
            <Text style={styles.brandTitle}>قبيلة</Text>
            <Text style={styles.brandSubtitle}>جسر بين الإرث والهوية الرقمية</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Landing')}>
            <Ionicons name="menu" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.pendingContent} showsVerticalScrollIndicator={false}>
          <View style={styles.pendingIconCard}>
            <View style={styles.pendingIconBox}>
              <Ionicons name="clipboard-outline" size={34} color={colors.secondary} />
            </View>
          </View>

          <Text style={styles.pendingTitle}>طلبك قيد المراجعة</Text>
          <Text style={styles.pendingSubtitle}>
            {activeTab === 'join'
              ? `تم استلام طلب الانضمام إلى مساحة عائلة ${tenantName} بنجاح. سنقوم بإشعارك بمجرد موافقة مسؤول العائلة على طلبك.`
              : `تم استلام طلب تأسيس مساحة ${newFamilyName}. سنتواصل معك قريباً لاستكمال الإجراءات.`}
          </Text>

          <View style={styles.pendingInfoCard}>
            <View style={styles.pendingInfoHeader}>
              <Ionicons name="information-circle-outline" size={20} color={colors.secondary} />
              <Text style={styles.pendingInfoTitle}>ماذا سيحدث بعد ذلك؟</Text>
            </View>

            <View style={styles.pendingInfoItem}>
              <View style={styles.pendingInfoIcon}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.secondary} />
              </View>
              <Text style={styles.pendingInfoText}>
                سيقوم المسؤول بمراجعة هويتك لضمان خصوصية البيانات العائلية.
              </Text>
            </View>

            <View style={styles.pendingDivider} />

            <View style={styles.pendingInfoItem}>
              <View style={styles.pendingInfoIcon}>
                <Ionicons name="notifications-outline" size={20} color={colors.secondary} />
              </View>
              <Text style={styles.pendingInfoText}>
                ستتلقى إشعاراً فورياً على هاتفك وبريدك الإلكتروني فور اكتمال المراجعة.
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryButtonDark} onPress={() => navigation.navigate('Landing')}>
            <Text style={styles.primaryButtonDarkText}>العودة للرئيسية</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="طلب انضمام" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'join' && styles.tabButtonActive]}
            onPress={() => setActiveTab('join')}
          >
            <Text style={[styles.tabText, activeTab === 'join' && styles.tabTextActive]}>انضمام لعائلة</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'create' && styles.tabButtonActive]}
            onPress={() => setActiveTab('create')}
          >
            <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>تأسيس عائلة جديدة</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {activeTab === 'create' && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>اسم العائلة</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: عائلة الأحمدي"
              value={newFamilyName}
              onChangeText={setNewFamilyName}
            />
          </View>
        )}

        {activeTab === 'join' && !params.tenantSlug && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>رمز العائلة</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: alahmadi"
              value={inputTenantSlug}
              onChangeText={(value) => setInputTenantSlug(value.toLowerCase())}
              autoCapitalize="none"
            />
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>الاسم الكامل</Text>
          <TextInput
            style={styles.input}
            placeholder="عبدالله بن أحمد"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            style={styles.input}
            placeholder="example@domain.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>رقم الجوال</Text>
          <TextInput
            style={styles.input}
            placeholder="5XXXXXXXX"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {activeTab === 'join' && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>صلة القرابة (اختياري)</Text>
            <TextInput
              style={styles.input}
              placeholder="مثلاً: حفيد أحمد بن محمد"
              value={relationship}
              onChangeText={setRelationship}
            />
          </View>
        )}

        <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>إرسال الطلب</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pendingBrandText: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  brandTitle: {
    ...typography.headlineMd,
    color: colors.text,
  },
  brandSubtitle: {
    ...typography.labelMd,
    color: colors.textMuted,
    fontSize: 11,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  pendingIconCard: {
    width: 110,
    height: 110,
    borderRadius: 18,
    backgroundColor: '#f4ede1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  pendingIconBox: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTitle: {
    ...typography.headlineLg,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  pendingSubtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  pendingInfoCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  pendingInfoHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pendingInfoTitle: {
    ...typography.headlineMd,
    fontSize: 20,
    color: colors.secondary,
  },
  pendingInfoItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  pendingInfoIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#f5efe4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingInfoText: {
    ...typography.bodyMd,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  pendingDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  primaryButtonDark: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonDarkText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.surface,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    marginBottom: spacing.lg
  },
  tabButton: {
    flex: 1,
    marginBottom: 6,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.labelMd,
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  primaryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md
  },
  successCard: {
    margin: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.md
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary
  },
  successText: {
    textAlign: 'center',
    color: colors.textMuted,
    lineHeight: 22
  }
});
