import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@qabila/types';
import { apiClient } from '../lib/api';
import { registerBrowserPushSubscription, unregisterBrowserPushSubscription } from '../lib/browserPush';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  updateUser: (updates: Partial<User>) => void;
  replaceUser: (userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  updateUser: () => {},
  replaceUser: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('qabila_token');
      try {
        const userData = await apiClient.getMe();
        setUser(userData);
      } catch (error) {
        console.error('Failed to restore session', error);
        if (token) {
          localStorage.removeItem('qabila_token');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const registerPush = async () => {
      try {
        await registerBrowserPushSubscription();
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to register browser push subscription', error);
        }
      }
    };

    registerPush();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const login = (token: string, userData: User) => {
    localStorage.setItem('qabila_token', token);
    setUser(userData);
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((currentUser) => (currentUser ? { ...currentUser, ...updates } : currentUser));
  };

  const replaceUser = (userData: User) => {
    setUser(userData);
  };

  const logout = () => {
    const clearSession = async () => {
      try {
        await unregisterBrowserPushSubscription();
        await apiClient.logout();
      } catch (error) {
        console.error('Logout request failed', error);
      }
      localStorage.removeItem('qabila_token');
      setUser(null);
    };

    void clearSession();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, updateUser, replaceUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
