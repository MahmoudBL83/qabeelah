import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function useTenantPrefix() {
  const { tenantSlug: routeTenantSlug } = useParams();
  const { user } = useAuth();
  const resolvedFromHost = typeof window !== 'undefined' ? localStorage.getItem('qabila_resolved_tenant') : null;
  const tenantSlug = routeTenantSlug || user?.tenantSlug || (resolvedFromHost || '');
  const tenantPrefix = tenantSlug ? `/${tenantSlug}` : '';
  return { tenantPrefix, tenantSlug };
}

export default useTenantPrefix;
