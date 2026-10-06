import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { useFonts, IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { ReemKufi_400Regular, ReemKufi_500Medium, ReemKufi_700Bold } from '@expo-google-fonts/reem-kufi';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { navigationRef } from './src/navigation/navigationRef';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const navigateFromNotificationUrl = (url?: string) => {
  if (!url || !navigationRef.isReady()) return;
  const navigation = navigationRef.current as any;
  const parsedUrl = new URL(url, 'https://qabila.app');
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/admin/approvals')) {
    navigation?.navigate('AdminApprovals', {
      lineageRequestId: parsedUrl.searchParams.get('lineageRequestId') || undefined,
    });
    return;
  }

  if (pathname.startsWith('/profile')) {
    navigation?.navigate('MainTabs', { screen: 'Account' });
    return;
  }

  if (pathname.startsWith('/notifications')) {
    navigation?.navigate('MainTabs', { screen: 'Notifications' });
    return;
  }

  if (pathname.startsWith('/messages')) {
    const scope = String(parsedUrl.searchParams.get('scope') || '').toUpperCase();
    const targetUserId = parsedUrl.searchParams.get('targetUserId') || undefined;
    const branchId = parsedUrl.searchParams.get('branchId') || undefined;

    if ((scope === 'DIRECT' && targetUserId) || scope === 'BRANCH' || scope === 'ANNOUNCEMENT') {
      navigation?.navigate('MainTabs', {
        screen: 'Messages',
        params: {
          screen: 'ChatThread',
          params: {
            scope,
            targetUserId,
            branchId,
            title: scope === 'DIRECT' ? 'محادثة مباشرة' : scope === 'BRANCH' ? 'مجموعة الفرع' : 'الإعلانات',
            subtitle: '',
          },
        },
      } as any);
      return;
    }

    navigation?.navigate('MainTabs', { screen: 'Messages' });
  }
};

const navigateFromNotificationPayload = (payload: Record<string, any> = {}) => {
  const url = typeof payload.url === 'string' ? payload.url : undefined;
  if (url) {
    navigateFromNotificationUrl(url);
    return;
  }

  if (!navigationRef.isReady()) return;
  const navigation = navigationRef.current as any;
  const scope = typeof payload.scope === 'string' ? payload.scope.toUpperCase() : undefined;
  const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId : undefined;
  const branchId = typeof payload.branchId === 'string' ? payload.branchId : undefined;

  if ((scope === 'DIRECT' && targetUserId) || scope === 'BRANCH' || scope === 'ANNOUNCEMENT') {
    navigation?.navigate('MainTabs', {
      screen: 'Messages',
      params: {
        screen: 'ChatThread',
        params: {
          scope,
          targetUserId,
          branchId,
          title: scope === 'DIRECT' ? 'محادثة مباشرة' : scope === 'BRANCH' ? 'مجموعة الفرع' : 'الإعلانات',
          subtitle: '',
          messageId: typeof payload.messageId === 'string' ? payload.messageId : undefined,
        },
      },
    } as any);
  }
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'IBMPlexSansArabic-Regular': IBMPlexSansArabic_400Regular,
    'IBMPlexSansArabic-Medium': IBMPlexSansArabic_500Medium,
    'IBMPlexSansArabic-SemiBold': IBMPlexSansArabic_600SemiBold,
    // Reem Kufi for logo text
    'ReemKufi-Regular': ReemKufi_400Regular,
    'ReemKufi-Medium': ReemKufi_500Medium,
    'ReemKufi-Bold': ReemKufi_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = (response.notification.request.content.data as any) || {};
      navigateFromNotificationPayload(payload);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      const payload = (response?.notification.request.content.data as any) || {};
      navigateFromNotificationPayload(payload);
    }).catch(() => {
      // ignore
    });

    return () => {
      responseSubscription.remove();
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <AuthProvider>
        <ThemeProvider>
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </ThemeProvider>
      </AuthProvider>
    </View>
  );
}
