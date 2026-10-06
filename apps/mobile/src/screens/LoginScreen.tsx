import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, typography, rounded } from '../ui/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BrandMark from '../components/BrandMark';

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.seedDatabase().then((seed) => {
      if (seed?.tenantSlug) {
        setTenantSlug(seed.tenantSlug);
      }
    }).catch(() => {});
  }, []);

  const navigateByRole = () => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' as any }] });
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    if (!tenantSlug.trim()) {
      setError('يرجى إدخال رمز العائلة لهذا الحساب.');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      if (tenantSlug.trim().toLowerCase() === 'alahmadi') {
        await apiClient.seedDatabase('alahmadi');
      }

      const response = await apiClient.tenantLogin({
        email: email.trim(),
        password,
        tenantSlug: tenantSlug.trim() || undefined
      });
      if (response.user?.role === 'SUPER_ADMIN') {
        throw new Error('استخدم صفحة مشرف المنصة للدخول الإداري.');
      }
      await login(response.token, response.user);
      navigateByRole();
    } catch (err: any) {
      const message = err?.message || '';
      const code = err?.code || '';

      if (message.includes('401') || message.includes('Invalid credentials')) {
        setError('البريد الإلكتروني أو كلمة المرور أو رمز العائلة غير صحيح.');
      } else if (code === 'JOIN_REQUEST_PENDING' || message.includes('Join request is pending approval')) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'WaitingApproval', params: { tenantSlug: tenantSlug.trim().toLowerCase(), email: email.trim() } as any }],
        });
        return;
      } else if (code === 'JOIN_REQUEST_REJECTED' || message.includes('Join request has been rejected')) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'WaitingApproval', params: { tenantSlug: tenantSlug.trim().toLowerCase(), email: email.trim(), state: 'rejected' } as any }],
        });
        return;
      } else if (message.includes('404') || message.includes('Tenant not found')) {
        setError('رمز العائلة غير موجود. تحقق من الرمز ثم حاول مجدداً.');
      } else if (message.includes('Tenant code is required')) {
        setError('يرجى إدخال رمز العائلة قبل تسجيل الدخول.');
      } else {
        setError(message || 'تعذر تسجيل الدخول. تحقق من البيانات.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View pointerEvents="none" style={styles.decorTop} />
      <View pointerEvents="none" style={styles.decorBottom} />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.heroCard}>
            <View style={styles.brandWrap}>
              <BrandMark />
            </View>
            <Text style={styles.title}>تسجيل الدخول</Text>
            <Text style={styles.subtitle}>الرجاء إدخال بيانات العائلة للمتابعة.</Text>
            <View style={styles.heroPills}>
              <View style={styles.heroPill}><Text style={styles.heroPillText}>وصول آمن</Text></View>
              <View style={styles.heroPillAlt}><Text style={styles.heroPillAltText}>إدارة العائلة</Text></View>
            </View>
          </View>

          <View style={styles.formCard}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>رمز العائلة</Text>
              <TextInput
                style={styles.input}
                placeholder="مثال: alahmadi"
                value={tenantSlug}
                onChangeText={(value) => setTenantSlug(value.toLowerCase())}
                autoCapitalize="none"
                textAlign="right"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>البريد الإلكتروني</Text>
              <TextInput
                style={styles.input}
                placeholder="أدخل بريدك الإلكتروني"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textAlign="right"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>كلمة المرور</Text>
              <TextInput
                style={styles.input}
                placeholder="أدخل كلمة المرور"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textAlign="right"
              />
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>دخول</Text>}
            </TouchableOpacity>

            <View style={styles.quickLogin}>
              <Text style={styles.quickTitle}>دخول سريع (حسابات تجريبية)</Text>
              <View style={styles.quickRow}>
                <TouchableOpacity
                  style={styles.quickButton}
                  onPress={() => {
                    setEmail('admin+alahmadi@qabila.com');
                    setPassword('password123');
                    setTenantSlug('alahmadi');
                  }}
                >
                  <Text style={styles.quickText}>مدير العائلة</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickButton}
                  onPress={() => {
                    setEmail('member+alahmadi@qabila.com');
                    setPassword('password123');
                    setTenantSlug('alahmadi');
                  }}
                >
                  <Text style={styles.quickText}>عضو العائلة</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.quickRow}>
                <TouchableOpacity
                  style={styles.quickButton}
                  onPress={() => {
                    setEmail('branch+alahmadi@qabila.com');
                    setPassword('password123');
                    setTenantSlug('alahmadi');
                  }}
                >
                  <Text style={styles.quickText}>مدير الفرع</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickButton} onPress={() => navigation.navigate('PlatformAdminLogin')}>
                  <Text style={styles.quickText}>بوابة المشرف</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('JoinFamily', { tenantSlug })} style={styles.footerLinkContainer}>
              <Text style={styles.footerLinkText}>ليس لديك حساب؟ <Text style={styles.footerLinkHighlight}>طلب انضمام</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative'
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  decorTop: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 9999,
    backgroundColor: 'rgba(119, 90, 25, 0.08)',
  },
  decorBottom: {
    position: 'absolute',
    bottom: 60,
    left: -40,
    width: 150,
    height: 150,
    borderRadius: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  backButton: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: rounded.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  brandWrap: {
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.headlineLg,
    color: colors.primary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  heroPills: {
    flexDirection: 'row-reverse',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  heroPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: rounded.full,
    backgroundColor: colors.secondaryContainer,
  },
  heroPillAlt: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroPillText: {
    ...typography.labelMd,
    color: colors.onSecondaryContainer,
  },
  heroPillAltText: {
    ...typography.labelMd,
    color: colors.text,
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.labelMd,
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'right',
  },
  input: {
    ...typography.bodyMd,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    height: 48,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryText: {
    ...typography.button,
    color: colors.surface,
  },
  error: {
    ...typography.bodyMd,
    color: colors.error,
    marginBottom: spacing.md,
    textAlign: 'center',
    backgroundColor: '#ffdad6',
    padding: spacing.sm,
    borderRadius: rounded.sm,
  },
  quickLogin: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quickTitle: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginBottom: spacing.md,
    textAlign: 'center'
  },
  quickRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  quickButton: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.sm,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: {
    ...typography.bodyMd,
    fontSize: 14,
    color: colors.text
  },
  footerLinkContainer: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  footerLinkText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  footerLinkHighlight: {
    color: colors.secondary,
    fontFamily: typography.labelMd.fontFamily,
    textDecorationLine: 'underline',
  },
});