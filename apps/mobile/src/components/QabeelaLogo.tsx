import { View, Text } from 'react-native';

interface QabeelaLogoProps {
  size?: number;
  color?: string;
}

export default function QabeelaLogo({ size = 80, color = '#16130E' }: QabeelaLogoProps) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: size / 8 }}>
      <Text
        style={{
          fontSize: size * 0.6,
          fontWeight: '700',
          // Use Reem Kufi for Arabic word logo when available
          fontFamily: 'ReemKufi-Bold',
          color,
          marginBottom: size / 8,
        }}
      >
        قبيلة
      </Text>
      <Text
        style={{
          fontSize: size * 0.15,
          color,
          letterSpacing: 3,
          fontWeight: '600',
        }}
      >
        QABEELA
      </Text>
    </View>
  );
}

