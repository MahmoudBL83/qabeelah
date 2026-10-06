import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/api';
import { storage } from '../lib/storage';

type TenantSummary = {
  _id: string;
  name: string;
  subdomain: string;
  isActive?: boolean;
};

const STORAGE_KEY = 'qabila.super-admin.selected-tenant-id';

export default function useSuperAdminTenantSelection(enabled: boolean) {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loading, setLoading] = useState(Boolean(enabled));

  useEffect(() => {
    if (!enabled) {
      setTenants([]);
      setSelectedTenantId('');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadTenants = async () => {
      setLoading(true);

      try {
        const tenantList = await apiClient.getTenants();
        if (cancelled) return;

        const normalizedTenants = Array.isArray(tenantList)
          ? tenantList.filter((tenant: TenantSummary | null | undefined) => Boolean(tenant?._id))
          : [];

        setTenants(normalizedTenants);

        const storedTenantId = (await storage.getItem(STORAGE_KEY))?.trim() || '';
        const resolvedTenantId = storedTenantId && normalizedTenants.some((tenant) => tenant._id === storedTenantId)
          ? storedTenantId
          : normalizedTenants[0]?._id || '';

        setSelectedTenantId(resolvedTenantId);

        if (resolvedTenantId) {
          await storage.setItem(STORAGE_KEY, resolvedTenantId);
        } else {
          await storage.removeItem(STORAGE_KEY);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load super-admin tenants', error);
          setTenants([]);
          setSelectedTenantId('');
          await storage.removeItem(STORAGE_KEY);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTenants();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !selectedTenantId) return;

    void storage.setItem(STORAGE_KEY, selectedTenantId);
  }, [enabled, selectedTenantId]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant._id === selectedTenantId) || null,
    [tenants, selectedTenantId]
  );

  return {
    tenants,
    selectedTenantId,
    selectedTenant,
    setSelectedTenantId,
    loading,
  };
}