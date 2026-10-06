import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import AdminLayout from '../../components/layout/AdminLayout';

export default function TenantsList() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiClient.getTenants();
        setTenants(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleReverify = async (id: string) => {
    const token = localStorage.getItem('qabila_token');
    if (!token) {
      alert('يجب تسجيل الدخول كمشرف لمنصة أو كمالك العائلة لبدء التحقق');
      return;
    }
    try {
      await apiClient.startDomainVerification(id);
      alert('Verification started — instruct the tenant owner to complete steps');
    } catch (err) {
      console.error(err);
      const status = (err as any)?.status;
      if (status === 401) alert('غير مصرح: سجّل الدخول مجدداً');
      else alert('Failed to start verification');
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">قائمة العائلات</h2>
        {loading ? (
          <div>جارٍ التحميل...</div>
        ) : (
          <div className="space-y-3">
            {tenants.map((t) => (
              <div key={t._id} className="rounded-2xl border p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">{t.name} ({t.subdomain})</div>
                  <div className="text-sm text-on-surface-variant">{t.customDomain || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div>{t.domainVerified ? 'مؤكد' : 'غير مؤكد'}</div>
                  <button className="rounded-full border px-3 py-2" onClick={() => handleReverify(t._id)}>إعادة التحقق</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
