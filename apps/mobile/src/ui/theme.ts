export const colors = {
  background: '#fbf9f4',
  surface: '#ffffff',
  surfaceAlt: '#f0eee9', // surface-container
  text: '#1b1c19',
  textMuted: '#444748',
  primary: '#000000',
  primaryDark: '#1c1b1b', // primary-container
  secondary: '#775a19',
  secondaryContainer: '#f5efe4',
  onSecondaryContainer: '#382a00',
  error: '#ba1a1a',
  border: '#c4c7c7' // outline-variant
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  gutter: 24
};

export const rounded = {
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
  full: 9999
};

export const typography = {
  displayLg: {
    fontFamily: 'IBMPlexSansArabic-SemiBold',
    fontSize: 48,
    fontWeight: '600' as const,
    lineHeight: 60,
  },
  headlineLg: {
    fontFamily: 'IBMPlexSansArabic-SemiBold',
    fontSize: 32,
    fontWeight: '600' as const,
    lineHeight: 44,
  },
  headlineMd: {
    fontFamily: 'IBMPlexSansArabic-Medium',
    fontSize: 24,
    fontWeight: '500' as const,
    lineHeight: 32,
  },
  bodyLg: {
    fontFamily: 'IBMPlexSansArabic-Regular',
    fontSize: 18,
    fontWeight: '400' as const,
    lineHeight: 30,
  },
  bodyMd: {
    fontFamily: 'IBMPlexSansArabic-Regular',
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 26,
  },
  labelMd: {
    fontFamily: 'IBMPlexSansArabic-Medium',
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
    letterSpacing: 0.28,
  },
  button: {
    fontFamily: 'IBMPlexSansArabic-Medium',
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
};

