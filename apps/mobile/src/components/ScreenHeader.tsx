import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PatternDiamondGrid } from './Patterns';
import { colors, rounded, spacing, typography } from '../ui/theme';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  actionLoading?: boolean;
}

export default function ScreenHeader({ title, onBack, actionLabel, onAction, actionLoading = false }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.patternLayer} pointerEvents="none">
        <PatternDiamondGrid opacity={0.08} />
      </View>
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.iconButton} accessibilityLabel="رجوع">
            <Ionicons name="arrow-forward" size={18} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={styles.titleWrap}>
          <Text style={styles.kicker}>مساحة العائلة</Text>
          <Text style={styles.title}>{title}</Text>
        </View>

        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} style={[styles.buttonAlt, actionLoading && styles.buttonAltDisabled]} disabled={actionLoading}>
            {actionLoading ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={16} color={colors.surface} />
                <Text style={styles.buttonAltText}>{actionLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  patternLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  brandRow: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  brandPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  titleWrap: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  kicker: {
    ...typography.labelMd,
    color: colors.secondary,
    marginBottom: 2,
  },
  title: {
    ...typography.headlineMd,
    color: colors.text,
    textAlign: 'center'
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonAlt: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: rounded.full,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  buttonAltDisabled: {
    opacity: 0.7,
  },
  buttonAltText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700'
  },
  spacer: {
    width: 42
  }
});
