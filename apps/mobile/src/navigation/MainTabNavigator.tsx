import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, rounded } from '../ui/theme';
import { StyleSheet, Text, View } from 'react-native';

// Screens
import TenantHomeScreen from '../screens/TenantHomeScreen';
import OccasionsScreen from '../screens/OccasionsScreen';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import MessagesStackNavigator from './MessagesStackNavigator';
import FamilyTreeScreen from '../screens/FamilyTreeScreen';
import AccountScreen from '../screens/AccountScreen'; 
import NotificationsScreen from '../screens/NotificationsScreen';
import MembersScreen from '../screens/MembersScreen';
import BranchManagersScreen from '../screens/BranchManagersScreen';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import useAuthenticatedEffect from '../hooks/useAuthenticatedEffect';
import { UserRole } from '@qabila/types';
import { PatternDiamondLines } from '../components/Patterns';

const Tab = createBottomTabNavigator();

const iconByRoute: Record<string, keyof typeof Ionicons.glyphMap> = {
  TenantHome: 'home-outline',
  Occasions: 'calendar-outline',
  Approvals: 'people-outline',
  Messages: 'chatbubbles-outline',
  Notifications: 'notifications-outline',
  AdminMembers: 'people-outline',
  AdminBranchManagers: 'business-outline',
  FamilyTree: 'git-network-outline',
  Account: 'person-outline'
};

function TabIcon({
  routeName,
  focused,
  color,
  size,
}: {
  routeName: string;
  focused: boolean;
  color: string;
  size: number;
}) {
  return (
    <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
      <Ionicons
        name={iconByRoute[routeName] || 'ellipse-outline'}
        size={focused ? size + 1 : size}
        color={focused ? colors.surface : color}
      />
    </View>
  );
}

export default function MainTabNavigator() {
  const { user, loading: authLoading } = useAuth();
  const MESSAGING_ENABLED = false; // temporarily disable messaging feature
  const [unreadCount, setUnreadCount] = useState<number | undefined>(undefined);
  const [messagesBadge, setMessagesBadge] = useState<number | undefined>(undefined);
  const canReviewRequests = user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUB_ADMIN;
  const canManageFamily = user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUB_ADMIN;

  const fetchBadge = async () => {
    try {
      const res = await apiClient.getNotifications({ page: 1, limit: 50 });
      const items = res.data || [];
      const unread = items.filter((i: any) => !i.read).length;
      setUnreadCount(unread > 0 ? unread : undefined);
    } catch (err) {
      console.error('Failed to fetch notifications for badge', err);
    }
  };

  useAuthenticatedEffect(() => {
    // if there's no authenticated user, clear badges and don't poll
    if (!user) {
      setUnreadCount(undefined);
      setMessagesBadge(undefined);
      return;
    }

    fetchBadge();
    const id = setInterval(fetchBadge, 15000);

    // poll message conversations for messages badge (only if messaging enabled)
    let mid: any = null;
    if (MESSAGING_ENABLED) {
      const fetchMessagesBadge = async () => {
        try {
          const seed = await apiClient.seedDatabase();
          if (!seed?.tenantId) return;
          const res = await apiClient.getMessageConversations(seed.tenantId);
          const direct = (res?.direct || []).reduce((s: number, c: any) => s + (c.unreadCount || 0), 0);
          const branch = res?.branch?.unreadCount || 0;
          const ann = res?.announcement?.unreadCount || 0;
          const total = direct + branch + ann;
          setMessagesBadge(total > 0 ? total : undefined);
        } catch (err) {
          if ((err as any)?.status === 403) {
            setMessagesBadge(undefined);
            return;
          }
          // ignore other polling failures
        }
      };
      fetchMessagesBadge();
      mid = setInterval(fetchMessagesBadge, 15000);
    }
    return () => {
      clearInterval(id);
      if (mid) clearInterval(mid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tab.Navigator
      initialRouteName="TenantHome"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.surface,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFillObject as any}>
            <PatternDiamondLines opacity={0.05} />
          </View>
        ),
        tabBarStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderTopWidth: 0,
          borderRadius: 28,
          position: 'absolute',
          left: spacing.md,
          right: spacing.md,
          bottom: spacing.md,
          height: 72,
          paddingBottom: spacing.sm,
          paddingTop: spacing.sm,
          paddingHorizontal: spacing.xs,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
          borderRadius: 22,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.secondary,
          color: colors.surface,
          fontSize: 10,
          fontWeight: '700',
          top: 2,
        },
        tabBarLabelStyle: {
          fontFamily: typography.labelMd.fontFamily,
          fontSize: 12,
        },
      }}
    >
      <Tab.Screen
        name="TenantHome"
        component={TenantHomeScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon routeName="TenantHome" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Occasions"
        component={OccasionsScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon routeName="Occasions" focused={focused} color={color} size={size} />
          ),
        }}
      />
      {canReviewRequests ? (
        <Tab.Screen
          name="Approvals"
          component={ApprovalsScreen}
          options={{
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon routeName="Approvals" focused={focused} color={color} size={size} />
            ),
            /* We can use tabBarBadge to show pending request count */
          }}
        />
      ) : null}
      {MESSAGING_ENABLED ? (
        <Tab.Screen
          name="Messages"
          component={MessagesStackNavigator}
          options={{
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon routeName="Messages" focused={focused} color={color} size={size} />
            ),
            tabBarBadge: messagesBadge,
          }}
        />
      ) : null}
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon routeName="Notifications" focused={focused} color={color} size={size} />
          ),
          tabBarBadge: unreadCount,
        }}
      />
      
      <Tab.Screen
        name="FamilyTree"
        component={FamilyTreeScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon routeName="FamilyTree" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon routeName="Account" focused={focused} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconBubbleActive: {
    backgroundColor: colors.secondary,
    shadowColor: colors.secondary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
