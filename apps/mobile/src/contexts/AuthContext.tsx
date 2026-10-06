import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { storage } from '../lib/storage';
import { apiClient } from '../lib/api';
import { User } from '@qabila/types';
import { registerDevicePushToken } from '../lib/pushNotifications';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, userData: User) => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  replaceUser: (userData: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  updateUser: () => {},
  replaceUser: () => {},
  logout: async () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pushTokenRegisteredForUser = useRef<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = await storage.getItem('qabila_token');
        if (!token) {
          setLoading(false);
          return;
        }

        const userData = await apiClient.getMe();
        setUser(userData);
      } catch (error) {
        await storage.removeItem('qabila_token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    if (pushTokenRegisteredForUser.current === user.id) return;

    let cancelled = false;

    const registerToken = async () => {
      try {
        await registerDevicePushToken();
        if (!cancelled) {
          pushTokenRegisteredForUser.current = user.id;
        }
      } catch (error) {
        console.error('Failed to register push token', error);
      }
    };

    registerToken();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const login = async (token: string, userData: User) => {
    await storage.setItem('qabila_token', token);
    setUser(userData);
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((currentUser) => (currentUser ? { ...currentUser, ...updates } : currentUser));
  };

  const replaceUser = (userData: User) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      const token = await storage.getItem('qabila_token');
      if (token) {
        try {
          await apiClient.logout();
        } catch (error) {
          console.error('Logout request failed', error);
        }
      }
    } finally {
      await storage.removeItem('qabila_token');
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({ user, loading, login, updateUser, replaceUser, logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
