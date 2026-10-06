import { API_BASE_URL } from '../lib/config';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TenantLayout from '../components/layout/TenantLayout';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';

export default function NotificationsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const tenantPrefix = useMemo(() => {
    const slug = location.pathname.split('/')[1];
    return slug && !['notifications', 'messages', 'profile', 'tree', 'home', 'occasions', 'admin', 'join', 'login'].includes(slug)
      ? `/${slug}`
      : '';
  }, [location.pathname]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getNotifications({ page: 1, limit: 50 });
      setItems(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('qabila_token');
    const tenantId = String((user as any)?.tenantId || '');
    if (!token || !tenantId) return;

    const stream = new EventSource(
      `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}&tenantId=${encodeURIComponent(tenantId)}`
    );

    stream.addEventListener('ready', fetchNotifications);
    stream.addEventListener('notification.created', fetchNotifications);
    stream.addEventListener('notification.read', fetchNotifications);
    stream.onerror = () => {
      stream.close();
    };

    return () => {
      stream.close();
    };
  }, [user]);

  const markAllRead = async () => {
    try {
      const ids = items.filter((item) => !item.read).map((item) => item._id || item.id);
      if (ids.length === 0) return;
      await apiClient.markNotificationsRead(ids);
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <TenantLayout>
      <div className="p-0 sm:p-2">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-on-surface">الإشعارات</h2>
            <p className="text-sm text-on-surface-variant mt-1">آخر التنبيهات والرسائل المهمة في حسابك.</p>
          </div>
          <button onClick={markAllRead} className="px-4 py-2 bg-secondary text-on-secondary rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
            وضع الكل كمقروء
          </button>
        </div>

        {loading ? (
          <div className="text-on-surface-variant">جاري التحميل...</div>
        ) : (
          <div className="space-y-3">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-surface-variant bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
                لا توجد إشعارات حالياً.
              </div>
            ) : (
              items.map((notification) => {
                const id = notification._id || notification.id;
                return (
                  <div
                    key={id}
                    className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${notification.read ? 'border-surface-variant bg-surface-container-lowest' : 'border-secondary/30 bg-secondary/5'}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-on-surface">{notification.title}</h3>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${notification.read ? 'bg-surface-variant/20 text-on-surface-variant' : 'bg-secondary text-on-secondary'}`}>
                            {notification.read ? 'مقروء' : 'غير مقروء'}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${notification.read ? 'bg-surface-variant/20 text-on-surface-variant' : 'bg-error-container text-on-error-container'}`}>
                            {notification.read ? 'Read' : 'Unread'}
                          </span>
                        </div>
                        <p className="text-sm text-on-surface-variant leading-relaxed">{notification.body}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                          <span>{new Date(notification.createdAt).toLocaleString('ar-SA')}</span>
                          {notification.data?.url ? (
                            <Link to={`${tenantPrefix}${notification.data.url}`} className="text-primary font-medium hover:underline">
                              فتح المصدر
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {notification.data?.url ? (
                          <Link
                            to={`${tenantPrefix}${notification.data.url}`}
                            className="inline-flex items-center rounded-full border border-surface-variant px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-variant/20 transition-colors"
                          >
                            عرض التفاصيل
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </TenantLayout>
  );
}
