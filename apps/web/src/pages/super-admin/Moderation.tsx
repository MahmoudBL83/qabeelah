import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api';

interface TenantRequest {
  _id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  memberCount?: number;
  isActive: boolean;
  createdAt?: string;
}

type SortField = 'createdAt' | 'name' | 'subdomain';
type SortOrder = 'asc' | 'desc';

export default function ModerationQueue() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TenantRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedItem, setSelectedItem] = useState<TenantRequest | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionNotes, setActionNotes] = useState('');

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        setLoading(true);
        const tenants = await apiClient.getTenants();
        const pending = (tenants || []).filter((tenant: TenantRequest) => !tenant.isActive);
        setItems(pending);
        setError('');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchQueue();
  }, []);

  const filteredItems = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      return item.name.toLowerCase().includes(q) || item.subdomain.toLowerCase().includes(q);
    });
  }, [items, filterQuery]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortField, sortOrder]);

  const uniqueTenants = useMemo(() => new Set(items.map((item) => item._id)).size, [items]);
  const selectedCount = selectedItems.size;
  const isAllSelected = sortedItems.length > 0 && selectedCount === sortedItems.length;

  const handleSelectItem = (itemId: string) => {
    const next = new Set(selectedItems);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setSelectedItems(next);
  };

  const handleSelectAll = () => {
    if (isAllSelected) setSelectedItems(new Set());
    else setSelectedItems(new Set(sortedItems.map((item) => item._id)));
  };

  const refreshQueue = async () => {
    const tenants = await apiClient.getTenants();
    const pending = (tenants || []).filter((tenant: TenantRequest) => !tenant.isActive);
    setItems(pending);
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedItem) return;

    try {
      setActionInProgress(true);

      if (action === 'approve') {
        await apiClient.updateTenant(selectedItem._id, { isActive: true });
      } else {
        await apiClient.deleteTenant(selectedItem._id);
      }

      await refreshQueue();
      setSelectedItem(null);
      setActionNotes('');
      setSelectedItems(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleBulkAction = async (action: 'approve' | 'reject') => {
    if (selectedItems.size === 0) return;

    try {
      setActionInProgress(true);
      const selected = sortedItems.filter((item) => selectedItems.has(item._id));
      await Promise.all(
        selected.map((tenant) =>
          action === 'approve'
            ? apiClient.updateTenant(tenant._id, { isActive: true })
            : apiClient.deleteTenant(tenant._id)
        )
      );

      await refreshQueue();
      setSelectedItems(new Set());
      setActionNotes('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionInProgress(false);
    }
  };

  const resetFilters = () => {
    setFilterQuery('');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-5 shadow-heritage-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
            <h1 className="mt-1 text-2xl font-bold text-on-surface">قائمة المراجعة</h1>
            <p className="mt-1 text-sm text-on-surface-variant">طلبات إنشاء العائلات على المنصة فقط. طلبات انضمام الأعضاء تُدار داخل كل عائلة.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/super-admin')}
              className="rounded-xl border border-surface-variant bg-surface px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant/30"
            >
              العودة
            </button>
            <button
              onClick={resetFilters}
              className="rounded-xl border border-secondary/20 bg-secondary/10 px-4 py-2 text-sm font-bold text-secondary transition-colors hover:bg-secondary/20"
            >
              مسح الفلاتر
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-surface-variant bg-surface px-4 py-3">
            <p className="text-xs text-on-surface-variant">كل العناصر</p>
            <p className="mt-1 text-xl font-bold text-on-surface">{items.length}</p>
          </div>
          <div className="rounded-xl border border-surface-variant bg-surface px-4 py-3">
            <p className="text-xs text-on-surface-variant">طلبات الإنشاء</p>
            <p className="mt-1 text-xl font-bold text-on-surface">{items.length}</p>
          </div>
          <div className="rounded-xl border border-surface-variant bg-surface px-4 py-3">
            <p className="text-xs text-on-surface-variant">عائلات متأثرة</p>
            <p className="mt-1 text-xl font-bold text-on-surface">{uniqueTenants}</p>
          </div>
          <div className="rounded-xl border border-surface-variant bg-surface px-4 py-3">
            <p className="text-xs text-on-surface-variant">محدد</p>
            <p className="mt-1 text-xl font-bold text-on-surface">{selectedCount}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-4 shadow-heritage-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">

          <input
            type="text"
            placeholder="بحث باسم العائلة أو النطاق"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary"
          />

          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
          >
            <option value="createdAt">الترتيب: الأحدث</option>
            <option value="name">الترتيب: العائلة</option>
            <option value="subdomain">الترتيب: النطاق</option>
          </select>

          <button
            onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-variant/30"
          >
            {sortOrder === 'asc' ? 'تصاعدي' : 'تنازلي'}
          </button>
        </div>
      </div>

      {selectedItems.size > 0 && (
        <div className="rounded-2xl border border-secondary/20 bg-secondary/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm font-medium text-secondary">تم تحديد {selectedItems.size} عنصر</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleBulkAction('approve')}
                disabled={actionInProgress}
                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                اعتماد جماعي
              </button>
              <button
                onClick={() => handleBulkAction('reject')}
                disabled={actionInProgress}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                رفض جماعي
              </button>
              <button
                onClick={() => setSelectedItems(new Set())}
                disabled={actionInProgress}
                className="rounded-lg border border-surface-variant bg-surface px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-variant/30 disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-10 text-center shadow-heritage-sm">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-secondary/20 border-t-secondary" />
          <p className="text-sm text-on-surface-variant">جاري تحميل قائمة المراجعة...</p>
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-10 text-center shadow-heritage-sm">
          <p className="text-lg font-bold text-on-surface">لا توجد عناصر معلقة</p>
          <p className="mt-2 text-sm text-on-surface-variant">لا يوجد ما يحتاج إجراء حالياً.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <div className="overflow-hidden rounded-3xl border border-surface-variant bg-surface-container-lowest shadow-heritage-sm">
            <div className="flex items-center justify-between border-b border-surface-variant bg-surface px-4 py-3">
              <h2 className="text-base font-bold text-on-surface">العناصر ({sortedItems.length})</h2>
              <label className="flex items-center gap-2 text-xs text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-surface-variant text-secondary focus:ring-secondary"
                />
                تحديد الكل
              </label>
            </div>

            <div className="max-h-[65vh] space-y-2 overflow-y-auto p-3">
              {sortedItems.map((item) => {
                const isSelected = selectedItems.has(item._id);
                const isActive = selectedItem?._id === item._id;

                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className={`w-full rounded-xl border p-3 text-right transition ${
                      isActive ? 'border-secondary ring-1 ring-secondary/30' : 'border-surface-variant'
                    } ${isSelected ? 'bg-secondary/10' : 'bg-surface hover:bg-surface-variant/30'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectItem(item._id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-4 w-4 rounded border-surface-variant text-secondary focus:ring-secondary"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-surface-container-lowest px-2.5 py-1 text-[11px] font-bold text-on-surface-variant">
                              طلب إنشاء عائلة
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-bold text-on-surface">{item.name}</p>
                          <p className="text-xs text-on-surface-variant" dir="ltr">{item.subdomain}.qabila.com</p>
                        </div>
                      </div>
                      <p className="text-xs text-on-surface-variant">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-SA') : '-'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {selectedItem ? (
              <div className="sticky top-6 rounded-3xl border border-surface-variant bg-surface-container-lowest p-5 shadow-heritage-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-on-surface-variant">تفاصيل</p>
                    <h3 className="mt-1 text-xl font-bold text-on-surface">طلب إنشاء عائلة</h3>
                    <p className="mt-1 text-sm text-on-surface-variant">{selectedItem.name}</p>
                  </div>
                  <span className="rounded-full border border-surface-variant bg-surface px-2.5 py-1 text-[11px] font-bold text-on-surface-variant">
                    بانتظار الاعتماد
                  </span>
                </div>

                <div className="mt-4 space-y-2 rounded-xl border border-surface-variant bg-surface p-3 text-sm">
                  <p>
                    <span className="text-on-surface-variant">اسم العائلة:</span>{' '}
                    <span className="font-bold text-on-surface">{selectedItem.name}</span>
                  </p>
                  <p>
                    <span className="text-on-surface-variant">النطاق:</span>{' '}
                    <span className="font-bold text-on-surface" dir="ltr">{selectedItem.subdomain}.qabila.com</span>
                  </p>
                  <p>
                    <span className="text-on-surface-variant">أعضاء مستوردون:</span>{' '}
                    <span className="font-bold text-on-surface">{selectedItem.memberCount || 0}</span>
                  </p>
                  <p>
                    <span className="text-on-surface-variant">وقت الإنشاء:</span>{' '}
                    <span className="font-bold text-on-surface">{selectedItem.createdAt ? new Date(selectedItem.createdAt).toLocaleString('ar-SA') : '-'}</span>
                  </p>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-on-surface-variant">ملاحظات</label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="سبب القرار..."
                    rows={4}
                    className="w-full rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleAction('approve')}
                    disabled={actionInProgress}
                    className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    اعتماد العائلة
                  </button>
                  <button
                    onClick={() => handleAction('reject')}
                    disabled={actionInProgress}
                    className="col-span-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    رفض وحذف الطلب
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-8 text-center shadow-heritage-sm">
                <p className="text-lg font-bold text-on-surface">اختر عنصرًا</p>
                <p className="mt-2 text-sm text-on-surface-variant">سيظهر هنا الملخص وأزرار الإجراء.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}