import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, rounded } from '../../../../apps/mobile/src/ui/theme';

type Props = {
  style?: ViewStyle | ViewStyle[];
  'aria-label'?: string;
};

export default function Skeleton({ style, ...props }: Props) {
  return <View accessible accessibilityLabel={props['aria-label'] || 'loading'} style={[styles.base, style as any]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceAlt,
    opacity: 0.45,
    borderRadius: rounded.md,
  },
});
