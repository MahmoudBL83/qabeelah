import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { Branch, UserRole } from '@qabila/types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useParams } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';

export default function BranchesAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const { tenantSlug: routeTenantSlug } = useParams();
  
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('العائلة');

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [routeTenantSlug, user?.tenantSlug]);

  const fetchData = async () => {
    try {
      const resolvedTenantId = user?.tenantId || (await apiClient.seedDatabase(routeTenantSlug || user?.tenantSlug))?.tenantId;
      if (!resolvedTenantId) throw new Error('Missing tenantId');

      const [tenant, branchesData] = await Promise.all([
        apiClient.getTenant(resolvedTenantId),
        apiClient.getBranches(resolvedTenantId).catch(() => [])
      ]);

      setTenantName(tenant?.name || 'العائلة');
      setBranches(branchesData);
    } catch (err) {
      console.error(err);
      setError('تعذر تحميل بيانات الفروع.');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingBranch(null);
    setBranchName('');
    setParentId('');
    setIsModalOpen(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setParentId(branch.parentId || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return;

    setSaving(true);
    try {
      if (editingBranch) {
        await apiClient.updateBranch(editingBranch._id || editingBranch.id!, {
          name: branchName,
          parentId: parentId || null
        });
        toast.show('تم تحديث الفرع بنجاح', 'success');
      } else {
        await apiClient.createBranch({
          name: branchName,
          parentId: parentId || undefined
        });
        toast.show('تم إضافة الفرع بنجاح', 'success');
      }
      setIsModalOpen(false);
      fetchData(); // Refresh to get proper tree structure
    } catch (err) {
      console.error(err);
      toast.show('حدث خطأ أثناء الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الفرع؟')) return;
    try {
      await apiClient.deleteBranch(id);
      toast.show('تم حذف الفرع', 'success');
      fetchData();
    } catch (err: any) {
      toast.show(err.message || 'فشل في حذف الفرع', 'error');
    }
  };

  const canManage = user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUPER_ADMIN;

  // Build Tree Structure
  const buildTree = (branchesList: Branch[], parent: string | undefined = undefined): any[] => {
    return branchesList
      .filter(b => b.parentId === parent)
      .map(b => ({
        ...b,
        children: buildTree(branchesList, b._id || b.id)
      }));
  };

  const tree = buildTree(branches);

  const renderTree = (nodes: any[], level = 0) => {
    return nodes.map(node => (
      <div key={node._id || node.id} className="border-r-2 border-surface-variant pr-4 my-3" style={{ marginRight: level > 0 ? '1rem' : '0' }}>
        <div className="flex items-center justify-between bg-surface p-3 rounded-lg border border-surface-variant shadow-sm hover:border-secondary/30 transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-secondary"></div>
            <span className="font-bold text-on-surface">{node.name}</span>
            <span className="text-xs text-on-surface-variant bg-surface-variant px-2 py-0.5 rounded-full">
              {node.children.length} فروع فرعية
            </span>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <button onClick={() => openEditModal(node)} className="text-secondary hover:underline text-xs font-bold">تعديل</button>
              <button onClick={() => handleDelete(node._id || node.id)} className="text-error hover:underline text-xs font-bold">حذف</button>
            </div>
          )}
        </div>
        {node.children && node.children.length > 0 && (
          <div className="mr-2">
            {renderTree(node.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <AdminLayout>
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-2 text-primary">الهيكل العائلي لـ {tenantName}</h2>
          <p className="text-on-surface-variant text-sm">
            إدارة هيكل العائلة من قبائل، فخوذ، وفروع.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          disabled={!canManage}
          className={`bg-primary text-on-primary px-6 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm ${
            canManage ? 'hover:bg-primary-container' : 'opacity-60 cursor-not-allowed'
          }`}
        >
          + إضافة فرع / قبيلة
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-error-container text-on-error-container border border-error rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-6">
        {loading ? (
          <p className="text-center text-on-surface-variant py-8">جارٍ التحميل...</p>
        ) : tree.length === 0 ? (
          <p className="text-center text-on-surface-variant py-8">لم يتم إضافة أي فروع بعد.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {renderTree(tree)}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-xl overflow-hidden" dir="rtl">
            <div className="px-6 py-4 border-b border-surface-variant flex justify-between items-center bg-surface">
              <h3 className="font-bold text-lg text-primary">{editingBranch ? 'تعديل الفرع' : 'إضافة فرع جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                ✕
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">اسم الفرع / القبيلة</label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
                  placeholder="مثال: فخذ آل فلان"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">يتبع لـ (الفرع الأب)</label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
                >
                  <option value="">-- فرع رئيسي (لا يتبع لأحد) --</option>
                  {branches
                    .filter(b => b._id !== editingBranch?._id && b.id !== editingBranch?.id) // Prevent self-nesting
                    .map(b => (
                    <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs text-on-surface-variant mt-1">إذا تركته فارغاً سيعتبر فرعاً رئيسياً.</p>
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
                  disabled={saving}
                  className="flex-1 py-2.5 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-70"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
