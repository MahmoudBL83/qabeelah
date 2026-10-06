import React, { createContext, useContext } from 'react';

interface ThemeColors {
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  error: string;
  onError: string;
  warning: string;
  info: string;
  success: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  outline: string;
    surfaceVariant: string;
    onSurfaceVariant: string;
  errorContainer: string;
  onErrorContainer: string;
  warningContainer: string;
  onWarningContainer: string;
  infoContainer: string;
  onInfoContainer: string;
  successContainer: string;
  onSuccessContainer: string;
}

interface Theme {
  colors: ThemeColors;
}

const defaultTheme: Theme = {
  colors: {
    primary: '#1F77C4',
    onPrimary: '#FFFFFF',
    secondary: '#6B5B95',
    onSecondary: '#FFFFFF',
    error: '#B3261E',
    onError: '#FFFFFF',
    warning: '#F9A825',
    info: '#0969DA',
    success: '#26A641',
    background: '#FFFBFE',
    onBackground: '#1C1B1F',
    surface: '#FFFBFE',
    onSurface: '#1C1B1F',
    outline: '#79747E',
      surfaceVariant: '#E8DEF8',
      onSurfaceVariant: '#49454E',
    errorContainer: '#F9DEDC',
    onErrorContainer: '#410E0B',
    warningContainer: '#FEF7CD',
    onWarningContainer: '#713B00',
    infoContainer: '#D3E3FD',
    onInfoContainer: '#001945',
    successContainer: '#D3FFCE',
    onSuccessContainer: '#005005',
  },
};

const ThemeContext = createContext<Theme>(defaultTheme);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeContext.Provider value={defaultTheme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
