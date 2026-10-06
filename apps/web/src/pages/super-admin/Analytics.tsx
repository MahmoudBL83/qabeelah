import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { PatternDiamondGrid, PatternDiamondLines, PatternDiamondRepeat } from '../../components/Patterns';
import Skeleton from '../../components/ui/Skeleton';

type GlobalAnalytics = {
  totalTenants: number;
  totalMembers: number;
  activeTenants: number;
  averageMembersPerTenant: number;
};

export default function Analytics() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadingError, setLoadingError] = useState('');
  const [lastDays, setLastDays] = useState(30);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      setLoadingError('');

      try {
        const data = await apiClient.getGlobalAnalytics(lastDays);
        setAnalytics(data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
        setLoadingError('تعذر تحميل التحليلات حالياً.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [lastDays]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiClient.downloadAnalytics('csv', lastDays);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const formatNumber = (value?: number | null) => {
    const safeValue = Number.isFinite(value as number) ? (value as number) : 0;
    return safeValue.toLocaleString('ar-SA');
  };

  const insights = useMemo(() => {
    if (!analytics) return null;

    const totalTenants = analytics.totalTenants || 0;
    const activeTenants = analytics.activeTenants || 0;
    const totalMembers = analytics.totalMembers || 0;
    const averageMembersPerTenant = analytics.averageMembersPerTenant || 0;

    const activeRate = totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 0;
    const inactiveTenants = Math.max(totalTenants - activeTenants, 0);
    const memberDensity = activeTenants > 0
      ? Math.round(totalMembers / activeTenants)
      : Math.round(averageMembersPerTenant);

    return {
      activeRate,
      inactiveTenants,
      memberDensity,
      platformHealthLabel: activeRate >= 80 ? 'نشاط مرتفع' : activeRate >= 50 ? 'استقرار جيد' : 'يحتاج متابعة',
      platformHealthTone: activeRate >= 80 ? 'text-emerald-700' : activeRate >= 50 ? 'text-secondary' : 'text-error',
    };
  }, [analytics]);

  const rangeOptions = [
    { label: '7 أيام', value: 7 },
    { label: '30 يوماً', value: 30 },
    { label: '90 يوماً', value: 90 },
  ];

  return (
    <div className="space-y-6 pb-8" dir="rtl">
      <section className="overflow-hidden rounded-[28px] border border-surface-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-surface shadow-heritage-sm relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <PatternDiamondGrid />
        </div>
        <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[1.35fr_0.9fr] gap-6 p-6 lg:p-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant">
              <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">المشرف العام</span>
              <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">تحليلات المنصة</span>
              <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">آخر {lastDays} يوم</span>
            </div>

            <div>
              <h1 className="text-3xl lg:text-4xl font-black text-primary leading-tight">التحليلات العامة</h1>
              <p className="mt-3 max-w-2xl text-sm lg:text-base leading-7 text-on-surface-variant">
                لوحة نظرة سريعة تساعدك على فهم نمو المنصة، نشاط العائلات، وكثافة الأعضاء خلال الفترة المحددة.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLastDays(option.value)}
                  className={`rounded-full px-4 py-2.5 text-sm font-bold transition border ${
                    lastDays === option.value
                      ? 'bg-secondary text-on-secondary border-secondary'
                      : 'bg-surface border-surface-variant text-on-surface hover:bg-surface-variant/20'
                  }`}
                >
                  {option.label}
                </button>
              ))}

              <button
                onClick={handleExport}
                disabled={exporting || !analytics}
                className="rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:opacity-95 disabled:opacity-50"
              >
                {exporting ? 'جارٍ التصدير...' : 'تصدير CSV'}
              </button>

              <Link
                to="/super-admin"
                className="rounded-full border border-surface-variant bg-surface px-4 py-2.5 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20"
              >
                العودة
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-surface-variant bg-surface/90 p-4 shadow-sm backdrop-blur-sm">
              <p className="text-xs text-on-surface-variant">إجمالي العائلات</p>
              <p className="mt-1 text-3xl font-black text-primary">{loading ? '—' : formatNumber(analytics?.totalTenants)}</p>
              <p className="mt-3 text-xs text-on-surface-variant">العائلات المسجلة في المنصة</p>
            </div>
            <div className="rounded-2xl border border-surface-variant bg-surface/90 p-4 shadow-sm backdrop-blur-sm">
              <p className="text-xs text-on-surface-variant">إجمالي الأعضاء</p>
              <p className="mt-1 text-3xl font-black text-secondary">{loading ? '—' : formatNumber(analytics?.totalMembers)}</p>
              <p className="mt-3 text-xs text-on-surface-variant">داخل جميع العائلات</p>
            </div>
            <div className="rounded-2xl border border-surface-variant bg-surface/90 p-4 shadow-sm backdrop-blur-sm">
              <p className="text-xs text-on-surface-variant">العائلات النشطة</p>
              <p className="mt-1 text-3xl font-black text-emerald-700">{loading ? '—' : formatNumber(analytics?.activeTenants)}</p>
              <p className="mt-3 text-xs text-on-surface-variant">تُظهر حركة فعلية</p>
            </div>
            <div className="rounded-2xl border border-surface-variant bg-surface/90 p-4 shadow-sm backdrop-blur-sm">
              <p className="text-xs text-on-surface-variant">متوسط الأعضاء</p>
              <p className="mt-1 text-3xl font-black text-error">{loading ? '—' : formatNumber(Math.round(analytics?.averageMembersPerTenant || 0))}</p>
              <p className="mt-3 text-xs text-on-surface-variant">لكل عائلة</p>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-8 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`analytics-skeleton-${index}`} className="rounded-2xl border border-surface-variant bg-surface p-5">
                <Skeleton className="h-4 w-24 rounded-full" aria-label={`loading-analytics-label-${index}`} />
                <Skeleton className="mt-4 h-10 w-28 rounded-full" aria-label={`loading-analytics-value-${index}`} />
                <Skeleton className="mt-4 h-3 w-32 rounded-full" aria-label={`loading-analytics-note-${index}`} />
              </div>
            ))}
          </div>
        </div>
      ) : loadingError ? (
        <div className="rounded-[28px] border border-error bg-error-container p-8 text-center shadow-sm">
          <p className="text-lg font-bold text-on-error-container">{loadingError}</p>
          <p className="mt-2 text-sm text-on-error-container/80">يمكنك العودة للوحة المشرف العام أو إعادة المحاولة بتغيير الفترة.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setLastDays(30)}
              className="rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition hover:opacity-95"
            >
              إعادة التحميل
            </button>
            <button
              onClick={() => navigate('/super-admin')}
              className="rounded-full border border-surface-variant bg-surface px-4 py-2.5 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20"
            >
              العودة للوحة التحكم
            </button>
          </div>
        </div>
      ) : analytics ? (
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 pointer-events-none">
                <PatternDiamondLines />
              </div>
              <div className="relative z-10 flex items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-primary">صحة المنصة</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">مؤشرات مبسطة تساعد على القراءة السريعة.</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${insights?.platformHealthTone || 'text-on-surface-variant'} bg-surface`}>
                  {insights?.platformHealthLabel || 'غير متوفر'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-surface-variant bg-surface p-4">
                  <p className="text-xs text-on-surface-variant">نسبة النشاط</p>
                  <p className="mt-1 text-3xl font-black text-primary">{formatNumber(insights?.activeRate)}%</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-variant/30">
                    <div className="h-full rounded-full bg-gradient-to-r from-secondary to-primary" style={{ width: `${insights?.activeRate ?? 0}%` }} />
                  </div>
                  <p className="mt-3 text-xs text-on-surface-variant">العائلات النشطة من إجمالي العائلات.</p>
                </div>

                <div className="rounded-2xl border border-surface-variant bg-surface p-4">
                  <p className="text-xs text-on-surface-variant">العائلات غير النشطة</p>
                  <p className="mt-1 text-3xl font-black text-error">{formatNumber(insights?.inactiveTenants)}</p>
                  <p className="mt-3 text-xs text-on-surface-variant">بحاجة متابعة أو تفعيل.</p>
                </div>

                <div className="rounded-2xl border border-surface-variant bg-surface p-4">
                  <p className="text-xs text-on-surface-variant">كثافة الأعضاء</p>
                  <p className="mt-1 text-3xl font-black text-secondary">{formatNumber(insights?.memberDensity)}</p>
                  <p className="mt-3 text-xs text-on-surface-variant">متوسط تقريبي للأعضاء لكل عائلة نشطة.</p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-4 pointer-events-none">
                <PatternDiamondRepeat />
              </div>
              <div className="relative z-10 flex items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-primary">مقاييس أساسية</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">أرقام رئيسية مرتبة بصرياً لتقليل الضجيج.</p>
                </div>
                <span className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-bold text-secondary">آخر {lastDays} يوم</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    label: 'إجمالي العائلات',
                    value: analytics.totalTenants,
                    note: 'قاعدة المنصة الحالية',
                    tone: 'text-primary',
                  },
                  {
                    label: 'إجمالي الأعضاء',
                    value: analytics.totalMembers,
                    note: 'جميع الأعضاء عبر العائلات',
                    tone: 'text-secondary',
                  },
                  {
                    label: 'العائلات النشطة',
                    value: analytics.activeTenants,
                    note: 'العائلات التي لديها نشاط',
                    tone: 'text-emerald-700',
                  },
                  {
                    label: 'متوسط الأعضاء لكل عائلة',
                    value: Math.round(analytics.averageMembersPerTenant),
                    note: 'مؤشر كثافة الأسرة الواحدة',
                    tone: 'text-error',
                  },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-surface-variant bg-surface p-5 shadow-sm">
                    <p className="text-xs text-on-surface-variant">{card.label}</p>
                    <p className={`mt-2 text-3xl font-black ${card.tone}`}>{formatNumber(card.value)}</p>
                    <p className="mt-3 text-xs text-on-surface-variant">{card.note}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6 sticky top-6 self-start">
            <section className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-primary">ملخص سريع</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">قراءة إدارية مختصرة للنتيجة الحالية.</p>
                </div>
                <span className="rounded-full border border-surface-variant bg-surface px-3 py-1 text-xs font-bold text-on-surface-variant">
                  {lastDays} يوم
                </span>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-2xl border border-surface-variant bg-surface px-4 py-3">
                  <span className="text-on-surface-variant">متوسط الأعضاء</span>
                  <span className="font-black text-on-surface">{formatNumber(Math.round(analytics.averageMembersPerTenant || 0))}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-surface-variant bg-surface px-4 py-3">
                  <span className="text-on-surface-variant">العائلات النشطة</span>
                  <span className="font-black text-on-surface">{formatNumber(analytics.activeTenants)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-surface-variant bg-surface px-4 py-3">
                  <span className="text-on-surface-variant">نسبة النشاط</span>
                  <span className="font-black text-on-surface">{insights?.activeRate ?? 0}%</span>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm">
              <h2 className="text-lg font-bold text-primary">توصيات واجهة الاستخدام</h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-on-surface-variant">
                <p className="rounded-2xl border border-surface-variant bg-surface p-4">استخدم هذه اللوحة كمدخل سريع قبل الانتقال إلى قائمة العائلات أو الطلبات المعلقة.</p>
                <p className="rounded-2xl border border-surface-variant bg-surface p-4">الفترة الزمنية قابلة للتبديل، لذلك تبقى القراءة قصيرة وواضحة بدون ازدحام بصري.</p>
                <p className="rounded-2xl border border-surface-variant bg-surface p-4">عند الحاجة للتفاصيل الدقيقة، انتقل إلى لوحة المشرف العام أو صفحة العائلة نفسها.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/super-admin" className="rounded-full border border-surface-variant bg-surface px-4 py-2.5 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20">
                  لوحة المشرف
                </Link>
                <Link to="/super-admin/pending-requests" className="rounded-full bg-secondary px-4 py-2.5 text-sm font-bold text-on-secondary transition hover:opacity-95">
                  الطلبات المعلقة
                </Link>
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-10 text-center shadow-sm">
          <p className="text-lg font-bold text-on-surface">فشل تحميل البيانات</p>
          <p className="mt-2 text-sm text-on-surface-variant">تعذر الوصول إلى التحليلات العامة في الوقت الحالي.</p>
          <button
            onClick={() => navigate('/super-admin')}
            className="mt-5 rounded-full bg-secondary px-4 py-2.5 text-sm font-bold text-on-secondary transition hover:opacity-95"
          >
            العودة
          </button>
        </div>
      )}
    </div>
  );
}
