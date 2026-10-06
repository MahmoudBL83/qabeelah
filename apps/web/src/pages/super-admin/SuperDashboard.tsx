import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../lib/api';
import BrandMark from '../../components/BrandMark';
import ImportTenantPage from './ImportTenant';
import Analytics from './Analytics';
import Moderation from './Moderation';
import NotificationsPage from './Notifications';
import SecurityPage from './Security';
import SuperAdminProfile from './Profile';

type TenantSummary = {
  _id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  coverImage?: string;
  isActive: boolean;
  memberCount: number;
  createdAt?: string;
};

type PlatformSummary = {
  tenantCount: number;
  pendingJoinRequests: number;
};

type JoinRequest = {
  _id: string;
  fullName: string;
  email?: string;
  phone?: string;
  relationship?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
};

export default function SuperDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<TenantSummary | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);
  const [modalJoinRequests, setModalJoinRequests] = useState<JoinRequest[]>([]);
  const [statusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const getFirstNameFromFullName = (name?: string) => {
    const trimmed = (name || '').trim();
    return trimmed ? trimmed.split(/\s+/)[0] : '—';
  };

  const isImportPage = location.pathname.startsWith('/super-admin/import');
  const isPendingRequestsPage = location.pathname === '/super-admin/pending-requests';
  const isOverviewPage = location.pathname === '/super-admin' || location.pathname === '/super-admin/';
  const isAnalyticsPage = location.pathname === '/super-admin/analytics';
  const isModerationPage = location.pathname === '/super-admin/moderation';
  const isNotificationsPage = location.pathname === '/super-admin/notifications';
  const isSecurityPage = location.pathname === '/super-admin/security';
  const isProfilePage = location.pathname === '/super-admin/profile';

  const refreshData = async () => {
    try {
      const [tenantList, summaryData] = await Promise.all([
        apiClient.getTenants(),
        apiClient.getTenantSummary()
      ]);
      setTenants(tenantList);
      setSummary(summaryData);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const openTenantModal = async (id: string) => {
    setModalOpen(true);
    setSelectedTenantId(id);
    setTenantLoading(true);
    try {
      const [t, reqs] = await Promise.all([apiClient.getTenant(id), apiClient.getAllJoinRequests(id)]);
      setSelectedTenant(t as TenantSummary);
      setModalJoinRequests(reqs || []);
    } catch (err) {
      console.error('[SuperDashboard] failed to load tenant details', err);
    } finally {
      setTenantLoading(false);
    }
  };

  const closeTenantModal = () => {
    setModalOpen(false);
    setSelectedTenantId(null);
    setSelectedTenant(null);
    setModalJoinRequests([]);
  };

  const handleDeleteTenant = async (tenant: TenantSummary) => {
    const confirmDelete = window.confirm(`هل تريد حذف عائلة "${tenant.name}" نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`);
    if (!confirmDelete) return;

    try {
      setDeletingTenantId(tenant._id);
      await apiClient.deleteTenant(tenant._id);

      if (selectedTenantId === tenant._id) {
        closeTenantModal();
      }

      await refreshData();
    } catch (err) {
      console.error('[SuperDashboard] failed to delete tenant', err);
      alert((err as Error).message || 'تعذر حذف العائلة حالياً');
    } finally {
      setDeletingTenantId(null);
    }
  };

  const handleApproveModal = async (requestId: string) => {
    if (!selectedTenantId) return;
    try {
      await apiClient.approveJoinRequest(selectedTenantId, requestId);
      setModalJoinRequests(reqs => reqs.map(r => r._id === requestId ? { ...r, status: 'approved' } : r));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectModal = async (requestId: string) => {
    if (!selectedTenantId) return;
    try {
      await apiClient.rejectJoinRequest(selectedTenantId, requestId);
      setModalJoinRequests(reqs => reqs.map(r => r._id === requestId ? { ...r, status: 'rejected' } : r));
    } catch (err) {
      console.error(err);
    }
  };

  const tenantCount = summary?.tenantCount ?? tenants.length;
  const activeTenants = useMemo(() => tenants.filter((tenant) => tenant.isActive).length, [tenants]);
  const inactiveTenants = Math.max(tenantCount - activeTenants, 0);
  const pendingRequests = inactiveTenants;
  const totalMembers = useMemo(
    () => tenants.reduce((total, tenant) => total + (tenant.memberCount || 0), 0),
    [tenants]
  );
  const activityPercent = tenantCount ? Math.round((activeTenants / tenantCount) * 100) : 0;

  const filteredTenants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const matchesQuery = !query || tenant.name.toLowerCase().includes(query) || tenant.subdomain.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && tenant.isActive) || (statusFilter === 'inactive' && !tenant.isActive);
      return matchesQuery && matchesStatus;
    });
  }, [tenants, searchQuery, statusFilter]);

  const topTenants = useMemo(
    () => [...tenants].sort((a, b) => b.memberCount - a.memberCount).slice(0, 4),
    [tenants]
  );


  const domainReadyCount = useMemo(
    () => tenants.filter((tenant) => Boolean(tenant.customDomain)).length,
    [tenants]
  );

  const formatNumber = (value: number) => value.toLocaleString('ar-SA');

  return (
    <div className="min-h-screen bg-background pattern-dots" dir="rtl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:py-10">
        <aside className="lg:w-72 lg:shrink-0">
          <div className="sticky top-6 space-y-5 rounded-3xl border border-surface-variant bg-surface-container-lowest p-5 shadow-heritage-sm max-h-[calc(100vh-4rem)] overflow-y-auto">
            <Link to="/super-admin" className="flex items-center gap-3 rounded-2xl transition-opacity hover:opacity-80">
              <BrandMark className="h-12 w-12" />
              <div>
                <p className="text-sm font-bold text-on-surface">قبيلة</p>
                <p className="text-xs text-on-surface-variant">مشرف المنصة</p>
              </div>
            </Link>

            <nav className="space-y-2">
              <button onClick={() => navigate('/super-admin')} className={`w-full text-right block rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${isOverviewPage && !isImportPage ? 'bg-secondary text-on-secondary' : 'text-on-surface hover:bg-surface-variant/30'}`}>
                نظرة عامة
              </button>
             
              <Link to="/super-admin/import" className={`block rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${isImportPage ? 'bg-secondary text-on-secondary' : 'text-on-surface hover:bg-surface-variant/30'}`}>
                استيراد عائلة
              </Link>
              <button onClick={() => navigate('/super-admin/analytics')} className={`w-full text-right block rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${isAnalyticsPage ? 'bg-secondary text-on-secondary' : 'text-on-surface hover:bg-surface-variant/30'}`}>
                التحليلات
              </button>
              <button onClick={() => navigate('/super-admin/moderation')} className={`w-full text-right block rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${isModerationPage ? 'bg-secondary text-on-secondary' : 'text-on-surface hover:bg-surface-variant/30'}`}>
               طلبات إنشاء العائلات
              </button>
          
              <button onClick={() => navigate('/super-admin/security')} className={`w-full text-right block rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${isSecurityPage ? 'bg-secondary text-on-secondary' : 'text-on-surface hover:bg-surface-variant/30'}`}>
                الأمان
              </button>
            </nav>

            <div className="rounded-2xl bg-surface border border-surface-variant p-4">
              <p className="text-xs text-on-surface-variant">ملخص المنصة</p>
              <div className="mt-3 grid gap-3 text-sm text-on-surface">
                <div className="flex items-center justify-between">
                  <span>العائلات</span>
                  <span className="font-bold">{formatNumber(tenantCount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>النطاقات الجاهزة</span>
                  <span className="font-bold">{formatNumber(domainReadyCount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>الطلبات المعلقة</span>
                  <span className="font-bold">{formatNumber(pendingRequests)}</span>
                </div>
                {modalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/40" onClick={closeTenantModal} />
                    <div className="relative max-w-3xl w-full bg-surface-container-lowest border border-surface-variant rounded-2xl shadow-heritage-sm p-6 z-10">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-xs text-on-surface-variant">تفاصيل العائلة</p>
                          <h3 className="text-xl font-bold text-on-surface">{tenantLoading ? 'جاري التحميل...' : selectedTenant?.name}</h3>
                          <p className="text-sm text-on-surface-variant mt-1">{selectedTenant?.subdomain}.qabila.com</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={closeTenantModal} className="rounded-lg px-3 py-1 text-sm border border-surface-variant bg-surface text-on-surface">إغلاق</button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="bg-surface border border-surface-variant rounded-2xl p-4">
                          <p className="text-xs text-on-surface-variant">الأعضاء</p>
                          <p className="text-2xl font-bold text-on-surface mt-2">{selectedTenant?.memberCount ?? 0}</p>
                        </div>
                        <div className="bg-surface border border-surface-variant rounded-2xl p-4">
                          <p className="text-xs text-on-surface-variant">الحالة</p>
                          <p className="mt-2">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${selectedTenant?.isActive ? 'bg-secondary/15 text-secondary' : 'bg-surface-variant/40 text-on-surface-variant'}`}>
                              {selectedTenant?.isActive ? 'نشطة' : 'غير نشطة'}
                            </span>
                          </p>
                        </div>
                        <div className="bg-surface border border-surface-variant rounded-2xl p-4">
                          <p className="text-xs text-on-surface-variant">إنشئت في</p>
                          <p className="text-sm text-on-surface-variant mt-2">{selectedTenant?.createdAt ? new Date(selectedTenant.createdAt).toLocaleDateString('ar-SA') : '--'}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-surface-variant p-4">
                        <h4 className="text-sm font-bold mb-3">طلبات الانضمام ({modalJoinRequests.length})</h4>
                        {modalJoinRequests.length === 0 ? (
                          <p className="text-on-surface-variant">لا توجد طلبات</p>
                        ) : (
                          <div className="space-y-3">
                            {modalJoinRequests.map((r) => (
                              <div key={r._id} className="flex items-center justify-between bg-surface p-3 rounded-lg">
                                <div>
                                  <p className="font-medium text-on-surface">{getFirstNameFromFullName(r.fullName)}</p>
                                  <p className="text-xs text-on-surface-variant">{r.email ?? r.phone}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {r.status === 'pending' ? (
                                    <>
                                      <button onClick={() => handleApproveModal(r._id)} className="rounded-lg bg-green-600 text-white px-3 py-1 text-xs">موافقة</button>
                                      <button onClick={() => handleRejectModal(r._id)} className="rounded-lg bg-red-600 text-white px-3 py-1 text-xs">رفض</button>
                                    </>
                                  ) : (
                                    <span className="text-xs text-on-surface-variant">{r.status === 'approved' ? 'موافق عليه' : 'مرفوض'}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            

            <button onClick={logout} className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant/30">
              تسجيل الخروج
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {isImportPage ? (
            <div className="space-y-6">
              <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-6 shadow-heritage-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
                    <h1 className="mt-2 text-3xl font-bold text-on-surface">استيراد عائلة جديدة</h1>
                    <p className="mt-2 text-sm text-on-surface-variant">أنشئ عائلة جديدة بسرعة، ثم عد للوحة أو راجع طلبات إنشاء العائلات.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => navigate('/super-admin')} className="rounded-xl border border-surface-variant bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-variant/30">
                      العودة للنظرة العامة
                    </button>
                    <button onClick={() => navigate('/super-admin/moderation')} className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-on-secondary hover:bg-secondary/90">
                      مراجعة طلبات العائلات
                    </button>
                  </div>
                </div>
              </div>

              <ImportTenantPage />
            </div>
          ) : isAnalyticsPage ? (
            <Analytics />
          ) : isModerationPage ? (
            <Moderation />
          ) : isNotificationsPage ? (
            <NotificationsPage />
          ) : isSecurityPage ? (
            <SecurityPage />
          ) : isProfilePage ? (
            <SuperAdminProfile />
          ) : isPendingRequestsPage ? (
            <Moderation />
          ) : (
            <>
              <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
                  <h1 className="mt-2 text-3xl font-bold text-on-surface">لوحة تحكم المشرف العام</h1>
                  <p className="mt-2 text-sm text-on-surface-variant">متابعة المنصة والعائلات النشطة</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link to="/super-admin/import" className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-on-secondary hover:bg-secondary/90">
                    استيراد عائلة
                  </Link>
                  <button onClick={logout} className="rounded-xl border border-surface-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-variant/30">
                    تسجيل الخروج
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-5 shadow-heritage-sm">
                  <p className="text-xs text-on-surface-variant">إجمالي العائلات</p>
                  <p className="text-3xl font-bold text-on-surface mt-2">{formatNumber(tenantCount)}</p>
                  <p className="text-xs text-on-surface-variant mt-3">نشطة: {formatNumber(activeTenants)} • غير نشطة: {formatNumber(inactiveTenants)}</p>
                </div>
                <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-5 shadow-heritage-sm">
                  <p className="text-xs text-on-surface-variant">إجمالي الأعضاء</p>
                  <p className="text-3xl font-bold text-on-surface mt-2">{formatNumber(totalMembers)}</p>
                  <p className="text-xs text-on-surface-variant mt-3">مجمّع من كافة العائلات</p>
                </div>
                <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-5 shadow-heritage-sm">
                  <p className="text-xs text-on-surface-variant">طلبات إنشاء العائلات المعلقة</p>
                  <p className="text-3xl font-bold text-on-surface mt-2">{formatNumber(pendingRequests)}</p>
                  <p className="text-xs text-on-surface-variant mt-3">بانتظار المراجعة</p>
                </div>
                <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-5 shadow-heritage-sm">
                  <p className="text-xs text-on-surface-variant">مؤشر النشاط</p>
                  <p className="text-3xl font-bold text-on-surface mt-2">{formatNumber(activityPercent)}%</p>
                  <div className="mt-3 h-2 rounded-full bg-surface-variant/40 overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: `${activityPercent}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-surface-container-lowest border border-surface-variant rounded-3xl p-6 shadow-heritage-sm overflow-hidden">
                  {/* Header */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-on-surface">العائلات المسجلة</h3>
                        <p className="text-xs text-on-surface-variant mt-1">إدارة وتتبع جميع العائلات على المنصة</p>
                      </div>
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-secondary/15 text-secondary font-bold text-sm">
                        {formatNumber(filteredTenants.length)}
                      </span>
                    </div>
                  </div>

                  {/* Search & Filter Bar */}
                  <div className="flex flex-col gap-3 mb-6">
                    <div className="relative">
                      <svg className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-on-surface-variant" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input 
                        type="text" 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        placeholder="ابحث باسم العائلة أو النطاق الفرعي..." 
                        className="w-full bg-surface border border-surface-variant rounded-xl py-3 px-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent transition-all"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant">يتم عرض {formatNumber(filteredTenants.length)} من {formatNumber(tenants.length)} عائلة</span>
                      {searchQuery && (
                        <button 
                          onClick={() => setSearchQuery('')}
                          className="text-secondary hover:underline font-medium"
                        >
                          مسح البحث
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tenants List */}
                  <div className="space-y-2">
                    {filteredTenants.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 bg-surface border border-surface-variant/50 rounded-2xl">
                        <svg className="w-12 h-12 text-surface-variant/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 21l-4.35-4.35m0 0A7.5 7.5 0 103.65 3.65a7.5 7.5 0 0012.3 12.3z" />
                        </svg>
                        <p className="text-sm font-medium text-on-surface-variant mb-1">لا توجد نتائج</p>
                        <p className="text-xs text-on-surface-variant/70">لم نجد عائلات تطابق بحثك</p>
                      </div>
                    ) : (
                      filteredTenants.map((tenant, idx) => (
                        <div 
                          key={tenant._id} 
                          className="group relative bg-surface border border-surface-variant hover:border-secondary/30 rounded-xl p-4 transition-all duration-200 hover:shadow-md hover:bg-surface/80"
                        >
                          <div className="flex items-center justify-between">
                            {/* Left Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3">
                                {/* Avatar/Icon */}
                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-secondary/15 flex items-center justify-center">
                                  <span className="text-sm font-bold text-secondary">{idx + 1}</span>
                                </div>
                                
                                {/* Info */}
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-on-surface truncate">{tenant.name}</p>
                                  <p className="text-xs text-on-surface-variant truncate mt-0.5">{tenant.subdomain}.qabila.com</p>
                                </div>
                              </div>
                            </div>

                            {/* Right Content */}
                            <div className="flex items-center gap-2 ml-4">
                              {/* Members Badge */}
                              <div className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-full bg-surface-variant/20 text-xs text-on-surface-variant">
                                
                                <span className="font-medium">{formatNumber(tenant.memberCount)} عضو</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDeleteTenant(tenant)}
                                disabled={deletingTenantId === tenant._id}
                                className="rounded-full border border-error/20 bg-error-container px-3 py-1 text-xs font-bold text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingTenantId === tenant._id ? 'جارٍ الحذف...' : 'حذف'}
                              </button>

                              {/* Status Badge */}
                              <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                                tenant.isActive 
                                  ? 'bg-secondary/20 text-secondary' 
                                  : 'bg-surface-variant/40 text-on-surface-variant'
                              }`}>
                                {tenant.isActive ? 'نشطة' : 'غير نشطة'}
                              </span>

                              
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Review Points Card */}
                  <div className="bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20 rounded-3xl p-6 shadow-heritage-sm overflow-hidden relative">
                    {/* Background accent */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/5 rounded-full -mr-12 -mt-12"></div>
                    
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-on-surface">نقاط المراجعة</h3>
                        <div className="p-2 rounded-lg bg-secondary/20">
                          <svg className="w-5 h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        {/* Pending Requests Item */}
                        <div className="bg-surface border border-surface-variant rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-on-surface">طلبات إنشاء العائلات</span>
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-secondary/20 text-secondary text-xs font-bold">
                              {formatNumber(pendingRequests)}
                            </span>
                          </div>
                          <p className="text-xs text-on-surface-variant mb-3">بانتظار المراجعة والموافقة</p>
                          <button 
                            onClick={() => navigate('/super-admin/moderation')}
                            className="w-full py-2.5 rounded-xl text-xs font-bold bg-secondary text-on-secondary hover:bg-secondary/90 transition-colors duration-200"
                          >
                            عرض الطلبات
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Families Card */}
                  <div className="bg-surface-container-lowest border border-surface-variant rounded-3xl p-6 shadow-heritage-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-on-surface">أفضل العائلات</h3>
                        <p className="text-xs text-on-surface-variant mt-1">حسب عدد الأعضاء</p>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/15">
                        <svg className="w-5 h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {topTenants.length === 0 ? (
                        <div className="text-center py-6 text-on-surface-variant">
                          <p className="text-sm">لا توجد عائلات حالياً</p>
                        </div>
                      ) : (
                        topTenants.map((tenant, i) => (
                          <div 
                            key={tenant._id} 
                            className="flex items-center gap-3 bg-surface border border-surface-variant hover:border-secondary/30 rounded-xl p-3 transition-all duration-200 group cursor-pointer"
                            onClick={() => openTenantModal(tenant._id)}
                          >
                            {/* Rank Badge */}
                            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              i === 0 ? 'bg-amber-500/20 text-amber-600' :
                              i === 1 ? 'bg-slate-400/20 text-slate-600' :
                              i === 2 ? 'bg-amber-600/20 text-amber-700' :
                              'bg-secondary/15 text-secondary'
                            }`}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                            </div>

                            {/* Name */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-on-surface truncate group-hover:text-secondary transition-colors">{tenant.name}</p>
                            </div>

                            {/* Members Count */}
                            <div className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10">
                              <svg className="w-3 h-3 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM9 16a4 4 0 1-8 0 4 4 0 018 0zm6-7a3 3 0 11-6 0 3 3 0 016 0zM17 16a4 4 0 11-8 0 4 4 0 018 0z" />
                              </svg>
                              <span className="text-xs font-bold text-secondary">{formatNumber(tenant.memberCount)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

