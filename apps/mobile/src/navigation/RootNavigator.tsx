import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '@qabila/types';
import { RootStackParamList } from './types';

import LandingScreen from '../screens/LandingScreen';
import LoginScreen from '../screens/LoginScreen';
import PlatformAdminLoginScreen from '../screens/PlatformAdminLoginScreen';
import JoinFamilyScreen from '../screens/JoinFamilyScreen';
import WaitingApprovalScreen from '../screens/WaitingApprovalScreen';
import MainTabNavigator from './MainTabNavigator';
import OccasionDetailScreen from '../screens/OccasionDetailScreen';
import BranchManagersScreen from '../screens/BranchManagersScreen';
import MembersScreen from '../screens/MembersScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import SuperAdminDashboardScreen from '../screens/SuperAdminDashboardScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import TenantDetailScreen from '../screens/TenantDetailScreen';
import LoadingScreen from '../screens/LoadingScreen';
import ModerationScreen from '../screens/ModerationScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Landing">
      <Stack.Screen name="Landing" component={LandingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PlatformAdminLogin" component={PlatformAdminLoginScreen} />
      <Stack.Screen name="JoinFamily" component={JoinFamilyScreen} />
      <Stack.Screen name="WaitingApproval" component={WaitingApprovalScreen} />
    </Stack.Navigator>
  );
}

function AppNavigator() {
  const { user } = useAuth();
  
  // Everyone uses MainTab except SuperAdmin for now
  const initialRoute =
    user?.role === UserRole.SUPER_ADMIN
      ? 'SuperAdminDashboard'
      : 'MainTabs';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute as any}>
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminApprovals" component={ApprovalsScreen} />
      <Stack.Screen name="OccasionDetail" component={OccasionDetailScreen} />
      <Stack.Screen name="AdminBranchManagers" component={BranchManagersScreen} />
      <Stack.Screen name="AdminMembers" component={MembersScreen} />
      <Stack.Screen name="SuperAdminDashboard" component={SuperAdminDashboardScreen} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="TenantDetail" component={TenantDetailScreen} />
      <Stack.Screen name="Moderation" component={ModerationScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return user ? <AppNavigator /> : <AuthNavigator />;
}
