import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function useAuthenticatedEffect(effect: () => (void | (() => void)), deps: any[] = []) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    const cleanup = effect();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, ...deps]);
}
