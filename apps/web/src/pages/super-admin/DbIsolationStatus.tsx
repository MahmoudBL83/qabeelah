import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';

interface DbIsolationStatus {
  tenantId: string;
  tenantName: string;
  subdomain: string;
  dbName: string;
  dbIsolationMode: 'shared' | 'dedicated';
  dbStatus: 'pending' | 'ready' | 'failed';
  dbMigratedAt?: string;
  dbLastHealthAt?: string;
  hasConnectionUri: boolean;
}

export default function DbIsolationStatus() {
  const [tenants, setTenants] = useState<DbIsolationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await (apiClient as any).getDbIsolationStatus?.();
      setTenants(res?.tenants || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load DB isolation status');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (tenantId: string) => {
    try {
      setUpdating(prev => new Set([...prev, tenantId]));
      await (apiClient as any).updateTenantDbStatus?.(tenantId);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdating(prev => {
        const next = new Set(prev);
        next.delete(tenantId);
        return next;
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ready: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800'
    };
    return colors[status] || colors.pending;
  };

  const getModeLabel = (mode: string) => {
    return mode === 'dedicated' ? '🔒 مخصص' : '📁 مشترك';
  };

  if (loading) {
    return <div className="p-4 text-center">جاري التحميل...</div>;
  }

  return (
    <div className="rounded-2xl bg-surface p-6 shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-on-surface">عزل قاعدة البيانات</h2>
        <button
          onClick={() => fetchStatus()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
        >
          تحديث
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-100 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant">
              <th className="py-2 px-3 text-right">اسم العائلة</th>
              <th className="py-2 px-3 text-right">النطاق</th>
              <th className="py-2 px-3 text-right">اسم DB</th>
              <th className="py-2 px-3 text-center">الوضع</th>
              <th className="py-2 px-3 text-center">الحالة</th>
              <th className="py-2 px-3 text-center">آخر تحديث</th>
              <th className="py-2 px-3 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.tenantId} className="border-b border-surface-variant hover:bg-surface-dim">
                <td className="py-3 px-3 font-medium">{tenant.tenantName}</td>
                <td className="py-3 px-3 text-on-surface-variant">{tenant.subdomain}</td>
                <td className="py-3 px-3 font-mono text-xs">{tenant.dbName}</td>
                <td className="py-3 px-3 text-center">
                  <span className="text-sm">{getModeLabel(tenant.dbIsolationMode)}</span>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadge(tenant.dbStatus)}`}>
                    {tenant.dbStatus}
                  </span>
                </td>
                <td className="py-3 px-3 text-center text-xs text-on-surface-variant">
                  {tenant.dbLastHealthAt ? new Date(tenant.dbLastHealthAt).toLocaleDateString('ar-EG') : '—'}
                </td>
                <td className="py-3 px-3 text-center">
                  <button
                    onClick={() => handleUpdateStatus(tenant.tenantId)}
                    disabled={updating.has(tenant.tenantId)}
                    className="rounded-lg bg-secondary px-3 py-1 text-xs font-semibold text-on-secondary disabled:opacity-50"
                  >
                    {updating.has(tenant.tenantId) ? 'جاري...' : 'فحص'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-on-surface-variant">
        <p>📌 المشترك: قاعدة بيانات مشتركة مع عائلات أخرى</p>
        <p>🔒 المخصص: قاعدة بيانات منفصلة وآمنة لهذه العائلة</p>
      </div>

      <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
        <strong>معلومة:</strong> استخدم صفحة استيراد العائلة لإنشاء عائلات جديدة بقاعدة بيانات مخصصة.
      </div>
    </div>
  );
}
