import { View, StyleSheet } from 'react-native';
import QabeelaLogo from './QabeelaLogo';

type Props = {
  variant?: 'mark' | 'full';
};

export default function BrandMark({ variant = 'mark' }: Props) {
  const size = variant === 'full' ? 112 : 52;

  return (
    <View style={[styles.wrap, variant === 'full' ? styles.wrapFull : undefined]}>
      <QabeelaLogo size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 56,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapFull: {
    width: 120,
    minHeight: 72,
  },
});
