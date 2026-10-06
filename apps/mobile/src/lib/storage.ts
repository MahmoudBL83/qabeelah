import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export const storage = {
  getItem: async (key: string) => {
    if (isWeb) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }

    return SecureStore.getItemAsync(key);
  },

  setItem: async (key: string, value: string) => {
    if (isWeb) {
      try {
        localStorage.setItem(key, value);
      } catch {
        return;
      }
      return;
    }

    await SecureStore.setItemAsync(key, value);
  },

  removeItem: async (key: string) => {
    if (isWeb) {
      try {
        localStorage.removeItem(key);
      } catch {
        return;
      }
      return;
    }

    await SecureStore.deleteItemAsync(key);
  },
};
