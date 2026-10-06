import { API_BASE_URL } from '../../lib/config';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../lib/api';

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
      const ids = items.filter(i => !i.read).map(i => i._id || i.id);
      if (ids.length === 0) return;
      await apiClient.markNotificationsRead(ids);
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">الإشعارات</h2>
        <button onClick={markAllRead} className="px-3 py-2 bg-secondary text-on-secondary rounded">وضع الكل كمقروء</button>
      </div>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <div key={n._id || n.id} className={`p-4 rounded-lg border ${n.read ? 'bg-surface' : 'bg-surface-variant'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-sm text-on-surface-variant">{n.body}</div>
                </div>
                <div className="text-xs text-on-surface-variant">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
