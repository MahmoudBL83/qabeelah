import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { User as BaseUser, UserRole, Branch } from '@qabila/types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useParams } from 'react-router-dom';

interface User extends BaseUser {
  _id: string;
  createdAt: string;
}
import AdminLayout from '../../components/layout/AdminLayout';
import { formatDateWithHijri } from '../../lib/date';

export default function BranchManagers() {
  const { user } = useAuth();
  const toast = useToast();
  const { tenantSlug: routeTenantSlug } = useParams();
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('العائلة');
  const [tenantId, setTenantId] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const seedResult = await apiClient.seedDatabase(routeTenantSlug || user?.tenantSlug);
        if (!seedResult?.tenantId) throw new Error('Missing tenantId');
        
        setTenantId(seedResult.tenantId);

        const [data, tenant, branchesData] = await Promise.all([
          apiClient.getBranchManagers(seedResult.tenantId),
          apiClient.getTenant(seedResult.tenantId),
          apiClient.getBranches(seedResult.tenantId).catch(() => [])
        ]);

        setManagers(data);
        setTenantName(tenant?.name || 'العائلة');
        setBranches(branchesData);
      } catch (err) {
        console.error(err);
        setError('تعذر تحميل بيانات مديري الفروع.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [routeTenantSlug, user?.tenantSlug]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== UserRole.QABILA_ADMIN) return;
    if (!newName || !newEmail) return;

    setCreating(true);
    try {
      const newManager = await apiClient.createBranchManager({
        tenantId,
        name: newName,
        email: newEmail,
        branchId: newBranch || 'الفرع الرئيسي'
      });
      setManagers([newManager, ...managers]);
      setIsModalOpen(false);
      setNewName('');
      setNewEmail('');
      setNewBranch('');
      toast.show('تم إضافة مدير الفرع بنجاح', 'success');
    } catch (err) {
      console.error(err);
      toast.show('فشل في إضافة مدير الفرع. تأكد من أن البريد الإلكتروني غير مستخدم مسبقاً.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join('') || '؟';
  };

  const canManage = user?.role === UserRole.QABILA_ADMIN;

  return (
    <AdminLayout>
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-2 text-primary">مديرو فروع {tenantName}</h2>
          <p className="text-on-surface-variant text-sm">
            إدارة المشرفين على الفروع المختلفة واعتماد صلاحياتهم.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={!canManage}
          className={`bg-primary text-on-primary px-6 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm ${
            canManage ? 'hover:bg-primary-container' : 'opacity-60 cursor-not-allowed'
          }`}
        >
          + إضافة مدير فرع
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-error-container text-on-error-container border border-error rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm overflow-hidden">
        <div className="px-6 py-3 bg-surface border-b border-surface-variant">
          <p className="text-xs text-on-surface-variant">عدد مديري الفروع: {managers.length}</p>
        </div>
        <table className="w-full text-sm text-right">
          <thead className="bg-surface text-on-surface-variant font-medium border-b border-surface-variant">
            <tr>
              <th className="px-6 py-4">المدير</th>
              <th className="px-6 py-4">الفرع المسؤول عنه</th>
              <th className="px-6 py-4">تاريخ الانضمام</th>
              <th className="px-6 py-4 text-left">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-variant/50">
            {loading ? (
              <tr>
                <td className="px-6 py-8 text-center text-on-surface-variant" colSpan={4}>جارٍ التحميل...</td>
              </tr>
            ) : managers.length === 0 ? (
              <tr>
                <td className="px-6 py-8 text-center text-on-surface-variant" colSpan={4}>لا يوجد مديري فروع حالياً.</td>
              </tr>
            ) : (
              managers.map((manager) => (
                <tr key={manager._id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border border-secondary/30 bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold">
                      {getInitials(manager.name)}
                    </div>
                    <div>
                      <p className="font-bold text-[15px] text-on-surface">{manager.name}</p>
                      <p className="text-[11px] text-on-surface-variant" dir="ltr">{manager.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-surface-variant text-on-surface-variant px-3 py-1 rounded-full text-xs font-medium">
                      {branches.find(b => b._id === manager.branchId || b.id === manager.branchId)?.name || manager.branchId || 'الفرع الرئيسي'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant text-xs">
                    {formatDateWithHijri(manager.createdAt).combined}
                  </td>
                  <td className="px-6 py-4 text-left">
                    <span className="text-secondary font-bold text-xs bg-secondary-container/50 px-3 py-1 rounded-full">
                      نشط
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-xl overflow-hidden" dir="rtl">
            <div className="px-6 py-4 border-b border-surface-variant flex justify-between items-center bg-surface">
              <h3 className="font-bold text-lg text-primary">إضافة مدير فرع جديد</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
                  placeholder="مثال: أحمد عبد الله"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">البريد الإلكتروني</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary text-left"
                  dir="ltr"
                  placeholder="ahmed@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">الفرع</label>
                <select
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
                >
                  <option value="">اختر الفرع...</option>
                  {branches.map(branch => (
                    <option key={branch._id || branch.id} value={branch._id || branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-on-surface-variant mt-1">يجب إنشاء الفروع أولاً من إدارة الفروع.</p>
              </div>

              <div className="mt-4 bg-surface-variant/30 p-3 rounded-lg text-xs text-on-surface-variant border border-surface-variant/50">
                سيتم إنشاء الحساب بكلمة مرور افتراضية: <strong className="font-mono text-on-surface bg-surface px-1 rounded">password123</strong>. يجب على المدير تغييرها بعد الدخول الأول.
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-surface-variant text-on-surface-variant font-medium rounded-lg hover:bg-surface transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-70"
                >
                  {creating ? 'جاري الإضافة...' : 'إضافة وتأكيد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
