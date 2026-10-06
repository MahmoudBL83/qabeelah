import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, typography, rounded } from '../ui/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function PlatformAdminLoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      navigation.reset({ index: 0, routes: [{ name: 'SuperAdminDashboard' }] });
    }
  }, [navigation, user]);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiClient.platformLogin({ email, password });
      if (response.user?.role !== 'SUPER_ADMIN') {
        throw new Error('هذه الصفحة مخصصة لمشرف المنصة فقط.');
      }

      await login(response.token, response.user);
      navigation.reset({ index: 0, routes: [{ name: 'SuperAdminDashboard' }] });
    } catch (err: any) {
      setError(err?.message || 'تعذر تسجيل الدخول الإداري.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>دخول مشرف المنصة</Text>
            <Text style={styles.subtitle}>بوابة إدارية مستقلة لإدارة المنصة بالكامل.</Text>
          </View>

          <View style={styles.formCard}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>البريد الإلكتروني الإداري</Text>
              <TextInput
                style={styles.input}
                placeholder="superadmin@qabila.com"
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
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textAlign="right"
              />
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>دخول المشرف</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.footerLinkContainer}>
              <Text style={styles.footerLinkText}>لحسابات العائلة: <Text style={styles.footerLinkHighlight}>دخول العائلة</Text></Text>
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
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.xl,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
    marginTop: spacing.xxl,
  },
  title: {
    ...typography.headlineLg,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: rounded.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
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
    borderRadius: rounded.md,
    paddingHorizontal: spacing.md,
    height: 48,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: rounded.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
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
