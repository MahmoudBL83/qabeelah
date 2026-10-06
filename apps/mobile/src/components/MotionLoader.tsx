import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export default function MotionLoader() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 480, useNativeDriver: true }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const diamondStyle = (delay: number): any => ({
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
    transform: [
      { rotate: '45deg' },
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.58, 1],
        }),
      },
      { translateY: delay },
    ],
  });

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        <Animated.View style={[styles.diamond, styles.centerDiamond, diamondStyle(0)]} />
        <Animated.View style={[styles.diamond, styles.topLeft, diamondStyle(-24)]} />
        <Animated.View style={[styles.diamond, styles.topRight, diamondStyle(-24)]} />
        <Animated.View style={[styles.diamond, styles.bottomLeft, diamondStyle(24)]} />
        <Animated.View style={[styles.diamond, styles.bottomRight, diamondStyle(24)]} />
      </View>

      <Text style={styles.title}>قبيلة</Text>
      <Text style={styles.subtitle}>جارٍ تجهيز المساحة...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fbf9f4',
    paddingHorizontal: 24,
  },
  grid: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#b98a33',
  },
  centerDiamond: {
    width: 30,
    height: 30,
  },
  topLeft: {
    left: 28,
    top: 28,
  },
  topRight: {
    right: 28,
    top: 28,
  },
  bottomLeft: {
    left: 28,
    bottom: 28,
  },
  bottomRight: {
    right: 28,
    bottom: 28,
  },
  title: {
    marginTop: 24,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: '#111827',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
  },
});