import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography, rounded } from '../ui/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrandMark from '../components/BrandMark';
import { Ionicons } from '@expo/vector-icons';

export default function LandingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.container}>
      <View pointerEvents="none" style={styles.decorTop} />
      <View pointerEvents="none" style={styles.decorBottom} />
      <View style={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.brandWrap}>
            <BrandMark />
          </View>

          <Text style={styles.subtitle}>
            إرث محفوظ، وتاريخ عائلتكم في مكان واحد. تواصل، تعرف، ووثق لتبقـى جذوركم تنبض بالحياة.
          </Text>
        
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')} activeOpacity={0.9}>
            <Ionicons name="arrow-forward" size={18} color={colors.surface} />
            <Text style={styles.primaryText}>دخول العائلة</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('PlatformAdminLogin')} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>دخول مشرف المنصة</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('JoinFamily')} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>طلب انضمام لعائلة</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative'
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  decorTop: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 9999,
    backgroundColor: 'rgba(119, 90, 25, 0.08)'
  },
  decorBottom: {
    position: 'absolute',
    bottom: 60,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.05)'
  },
  heroCard: {
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
  brandWrap: {
    marginBottom: spacing.sm,
  },
  heroPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: rounded.full,
    backgroundColor: colors.secondaryContainer,
    marginBottom: spacing.md,
  },
  heroPillText: {
    ...typography.labelMd,
    color: colors.onSecondaryContainer,
  },
  heroStats: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginTop: spacing.lg,
    width: '100%'
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: spacing.md,
    alignItems: 'center'
  },
  statValue: {
    ...typography.headlineMd,
    color: colors.primary,
  },
  statLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: 2,
  },
  title: {
    ...typography.displayLg,
    color: colors.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyLg,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: spacing.xs,
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
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  secondaryText: {
    ...typography.button,
    color: colors.text,
  },
});
