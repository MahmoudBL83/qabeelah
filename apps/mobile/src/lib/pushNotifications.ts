import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiClient } from './api';

export const registerDevicePushToken = async () => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  const expoPushToken = tokenResponse.data;
  await apiClient.registerPushToken(expoPushToken, 'expo');
  return expoPushToken;
};
