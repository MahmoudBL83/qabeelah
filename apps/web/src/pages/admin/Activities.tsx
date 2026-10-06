import { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { apiClient } from '../../lib/api';
import useTenantPrefix from '../../hooks/useTenantPrefix';

interface Activity {
  _id: string;
  type: string;
  userName?: string;
  userId?: string;
  description?: string;
  relatedType?: string;
  relatedId?: string;
  createdAt: string;
}

export default function ActivitiesPage() {
  const { tenantSlug } = useTenantPrefix();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const seed = await apiClient.seedDatabase(tenantSlug);
        if (seed?.tenantId) {
          const data = await apiClient.getActivities(seed.tenantId, 50, 0);
          setActivities(data || []);
        }
      } catch (err) {
        console.error('Failed to load activities', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantSlug]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">سجلات النشاط</h1>
            <p className="text-sm text-on-surface-variant">عرض أحدث الإجراءات والتغييرات في مساحة العائلة</p>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-variant bg-surface-container-lowest p-4">
          {loading ? (
            <div className="text-sm text-on-surface-variant">جارٍ التحميل...</div>
          ) : activities.length === 0 ? (
            <div className="text-sm text-on-surface-variant">لا توجد سجلات نشاط بعد.</div>
          ) : (
            <>
              <p className="text-xs text-on-surface-variant mb-3">يعرض أحدث {activities.length} من 50 سجل</p>
              <ul className="space-y-3">
                {activities.map((a) => (
                  <li key={a._id} className="p-3 bg-surface rounded-lg border border-surface-variant">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{a.type}</div>
                        <div className="text-xs text-on-surface-variant">{a.userName || a.userId || 'نظام'}</div>
                      </div>
                      <div className="text-xs text-on-surface-variant">{new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                    {a.description ? <div className="mt-2 text-sm text-on-surface">{a.description}</div> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
