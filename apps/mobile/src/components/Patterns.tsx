import { View, ViewStyle } from 'react-native';

interface PatternProps {
  width?: number | string;
  height?: number | string;
  opacity?: number;
}

/**
 * Diamond and line pattern - warm brown with dark brown diamonds
 */
export function PatternDiamondLines({
  width = '100%',
  height = '100%',
  opacity = 1,
}: PatternProps) {
  const style: ViewStyle = {
    width: width as any,
    height: height as any,
    backgroundColor: '#B58543',
    opacity,
    overflow: 'hidden',
  };

  return (
    <View style={style}>
      {/* This is a simplified pattern - for mobile we use the background color only */}
    </View>
  );
}

/**
 * Diamond grid pattern - light cream with subtle lines and centered brown diamond
 */
export function PatternDiamondGrid({
  width = '100%',
  height = '100%',
  opacity = 1,
}: PatternProps) {
  const style: ViewStyle = {
    width: width as any,
    height: height as any,
    backgroundColor: '#F2EADA',
    opacity,
    overflow: 'hidden',
  };

  return (
    <View style={style}>
      {/* This is a simplified pattern - for mobile we use the background color only */}
    </View>
  );
}

/**
 * Repeating diamond pattern - dark background with repeating brown diamonds
 */
export function PatternDiamondRepeat({
  width = '100%',
  height = '100%',
  opacity = 1,
}: PatternProps) {
  const style: ViewStyle = {
    width: width as any,
    height: height as any,
    backgroundColor: '#16130E',
    opacity,
    overflow: 'hidden',
  };

  return (
    <View style={style}>
      {/* This is a simplified pattern - for mobile we use the background color only */}
    </View>
  );
}
