import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList } from '../navigation/types';
import { colors, typography, spacing, rounded } from '../ui/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserRole } from '@qabila/types';
import { getUserAvatarUrl } from '../lib/user';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../lib/api';
import { useCallback } from 'react';

const getLineageStatusLabel = (status?: string | null) => {
  switch (status) {
    case 'verified':
      return 'موثق';
    case 'pending':
      return 'قيد المراجعة';
    case 'rejected':
      return 'مرفوض';
    case 'unverified':
      return 'غير موثق';
    default:
      return 'غير معروف';
  }
};

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const userAvatar = getUserAvatarUrl(user);
  const [lineageStatus, setLineageStatus] = useState<string>('غير معروف');
  const [selectedProof, setSelectedProof] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [submittingLineage, setSubmittingLineage] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [lineageMessage, setLineageMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchLineageStatus = useCallback(async () => {
    try {
      const tenantId = (user as any)?.tenantId;
      const userId = (user as any)?.id || (user as any)?._id;
      if (!tenantId || !userId) return;

      const status = await apiClient.getMyLineageStatus(tenantId, userId).catch(() => null);
      if (status?.status) {
        setLineageStatus(status.status);
      }
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  useEffect(() => {
    fetchLineageStatus();
  }, [fetchLineageStatus]);

  useFocusEffect(
    useCallback(() => {
      fetchLineageStatus();
    }, [fetchLineageStatus])
  );

  const pickProofImage = async () => {
    setLineageMessage(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedProof({
        uri: asset.uri,
        name: asset.fileName || `lineage-proof-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
    }
  };

  const submitLineageProof = async () => {
    const tenantId = (user as any)?.tenantId;
    const userId = (user as any)?.id || (user as any)?._id;
    if (!tenantId || !userId) {
      const msg = 'تعذر تحديد بيانات المستخدم أو العائلة. أعد تسجيل الدخول وحاول مرة أخرى.';
      setLineageMessage({ type: 'error', text: msg });
      Alert.alert('خطأ', msg);
      return;
    }

    if (!selectedProof) {
      const msg = 'اختر صورة إثبات النسب أولاً.';
      setLineageMessage({ type: 'error', text: msg });
      Alert.alert('تنبيه', msg);
      return;
    }

    setSubmittingLineage(true);
    setLineageMessage(null);
    try {
      const uploadResult = await apiClient.uploadFile(selectedProof as any);
      await apiClient.submitLineageRequest({ tenantId, documents: uploadResult?.url ? [uploadResult.url] : [] });
      setLineageStatus('pending');
      setSelectedProof(null);
      const msg = 'تم إرسال طلب التحقق من النسب بنجاح. سيقوم المشرف بالمراجعة.';
      setLineageMessage({ type: 'success', text: msg });
      Alert.alert('تم الإرسال', msg);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'فشل إرسال طلب التحقق. حاول مرة أخرى.';
      setLineageMessage({ type: 'error', text: msg });
      Alert.alert('خطأ', msg);
    } finally {
      setSubmittingLineage(false);
    }
  };

  const roleLabel = user?.role === UserRole.QABILA_ADMIN
    ? 'مدير العائلة'
    : user?.role === UserRole.SUB_ADMIN
      ? 'مدير الفرع'
      : user?.role === UserRole.SUPER_ADMIN
        ? 'مشرف المنصة'
        : 'عضو العائلة';

  const canManageFamily = user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUB_ADMIN;

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
    <SafeAreaView style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.heroKicker}>الملف الشخصي</Text>
        <Text style={styles.title}>الحساب</Text>
        <Text style={styles.heroSubtitle}>إدارة بياناتك، النسب، والوصول إلى أدوات الإدارة من مكان واحد.</Text>
        <TouchableOpacity style={[styles.headerLogoutButton, loggingOut && styles.headerLogoutButtonDisabled]} onPress={handleLogout} disabled={loggingOut}>
          {loggingOut ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.headerLogoutText}>تسجيل الخروج</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {userAvatar ? (
            <View style={styles.avatarImageWrap}>
              <Image source={{ uri: userAvatar }} style={styles.avatarImage} />
            </View>
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name || 'م').charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.name}>{user?.name || 'مستخدم'}</Text>
          <Text style={styles.role}>{roleLabel}</Text>
          <Text style={styles.email}>{user?.email || 'بدون بريد'}</Text>
          {user?.tenantSlug ? (
            <View style={styles.tenantBadge}>
              <Text style={styles.tenantBadgeText}>{user.tenantSlug}.qabila.com</Text>
            </View>
          ) : null}
        </View>


        <View style={styles.card}>
          <Text style={styles.sectionTitle}>التحقق من النسب</Text>
          <Text style={styles.lineageStatus}>الحالة: {getLineageStatusLabel(lineageStatus)}</Text>

          {lineageMessage ? (
            <View style={[styles.lineageMessageBox, lineageMessage.type === 'success' ? styles.lineageMessageSuccess : styles.lineageMessageError]}>
              <Text style={lineageMessage.type === 'success' ? styles.lineageMessageSuccessText : styles.lineageMessageErrorText}>{lineageMessage.text}</Text>
            </View>
          ) : null}

          {selectedProof ? (
            <View style={styles.previewBox}>
              <Image source={{ uri: selectedProof.uri }} style={styles.previewImage} />
              <Text style={styles.previewText}>{selectedProof.name}</Text>
            </View>
          ) : (
            <Text style={styles.previewHint}>اختر صورة لإثبات النسب، ثم أرسلها للمراجعة.</Text>
          )}

          <TouchableOpacity style={styles.navButton} onPress={pickProofImage}>
            <Text style={styles.navButtonText}>اختيار صورة الإثبات</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, styles.submitButton, (!selectedProof || submittingLineage) && styles.submitButtonDisabled]}
            onPress={submitLineageProof}
            disabled={!selectedProof || submittingLineage}
          >
            {submittingLineage ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.submitButtonText}>إرسال طلب التحقق</Text>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
  },
  heroCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroKicker: {
    ...typography.labelMd,
    color: colors.secondary,
    marginBottom: 4,
  },
  title: {
    ...typography.headlineMd,
    color: colors.primary,
  },
  heroSubtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  headerLogoutButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: rounded.full,
    backgroundColor: colors.error,
  },
  headerLogoutButtonDisabled: {
    opacity: 0.7,
  },
  headerLogoutText: {
    ...typography.labelMd,
    color: colors.surface,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    alignItems: 'center',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: {
    ...typography.headlineLg,
    color: colors.primary,
  },
  avatarImageWrap: {
    width: 70,
    height: 70,
    borderRadius: rounded.full,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  name: {
    ...typography.headlineMd,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  role: {
    ...typography.bodyMd,
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  email: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  tenantBadge: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: rounded.full,
  },
  tenantBadgeText: {
    ...typography.labelMd,
    color: colors.secondary,
  },
  sectionTitle: {
    ...typography.labelMd,
    color: colors.text,
    alignSelf: 'flex-end',
    marginBottom: spacing.sm,
  },
  lineageStatus: {
    ...typography.bodyMd,
    color: colors.secondary,
    alignSelf: 'flex-end',
    marginBottom: spacing.sm,
  },
  lineageMessageBox: {
    width: '100%',
    borderWidth: 1,
    borderRadius: rounded.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  lineageMessageSuccess: {
    backgroundColor: colors.secondaryContainer,
    borderColor: colors.secondary,
  },
  lineageMessageError: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  lineageMessageSuccessText: {
    ...typography.bodyMd,
    color: colors.onSecondaryContainer,
    textAlign: 'right',
  },
  lineageMessageErrorText: {
    ...typography.bodyMd,
    color: colors.surface,
    textAlign: 'right',
  },
  previewBox: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: rounded.md,
    marginBottom: spacing.xs,
  },
  previewText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  previewHint: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  navButton: {
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  navButtonText: {
    ...typography.bodyMd,
    color: colors.text,
  },
  submitButton: {
    backgroundColor: colors.secondary,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...typography.bodyMd,
    color: colors.surface,
  },
});
