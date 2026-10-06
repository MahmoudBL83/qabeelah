import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TenantLayout from '../components/layout/TenantLayout';
import OccasionsCalendar from '../components/OccasionsCalendar';
import { apiClient } from '../lib/api';
import { Event } from '@qabila/types';
import { useAuth } from '../contexts/AuthContext';
import useTenantPrefix from '../hooks/useTenantPrefix';
import { UserRole } from '@qabila/types';
import useSuperAdminTenantSelection from '../hooks/useSuperAdminTenantSelection';
import { formatDateWithHijri, formatMonthWithHijri } from '../lib/date';
import { PatternDiamondLines, PatternDiamondRepeat } from '../components/Patterns';

export default function Occasions() {
  const { user } = useAuth();
  const { tenantPrefix, tenantSlug: initialTenantSlug } = useTenantPrefix();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const {
    tenants,
    selectedTenantId,
    selectedTenant,
    setSelectedTenantId,
    loading: tenantSelectionLoading,
  } = useSuperAdminTenantSelection(Boolean(isSuperAdmin));
  const [events, setEvents] = useState<Event[]>([]);
  const [tenantName, setTenantName] = useState('العائلة');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (isSuperAdmin && tenantSelectionLoading) return;

      setLoading(true);
      setError('');

      try {
        if (isSuperAdmin) {
          if (!selectedTenantId) {
            setTenantName('العائلة');
            setEvents([]);
            return;
          }

                  {isSuperAdmin && (
                    <section className="mb-6 rounded-2xl border border-surface-variant bg-surface-container-lowest p-4 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-xs text-on-surface-variant">العائلة المعروضة</p>
                          <h2 className="mt-1 text-lg font-bold text-on-surface">{selectedTenant?.name || 'اختر عائلة'}</h2>
                          <p className="mt-1 text-xs text-on-surface-variant">تظهر المناسبات بحسب العائلة المختارة للمشرف العام.</p>
                        </div>
                        <div className="min-w-0 lg:w-80">
                          <label className="mb-1 block text-xs font-medium text-on-surface-variant">تغيير العائلة</label>
                          <select
                            value={selectedTenantId}
                            onChange={(event) => setSelectedTenantId(event.target.value)}
                            className="w-full rounded-xl border border-surface-variant bg-surface px-3 py-2 text-sm text-on-surface shadow-sm focus:border-secondary focus:outline-none"
                          >
                            {tenants.length === 0 ? (
                              <option value="">لا توجد عائلات</option>
                            ) : (
                              tenants.map((tenant) => (
                                <option key={tenant._id} value={tenant._id}>
                                  {tenant.name} · {tenant.subdomain}.qabila.com
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      </div>
                    </section>
                  )}
          const eventData = await apiClient.getEvents(selectedTenantId, 100);
          setTenantName(selectedTenant?.name || 'العائلة');
          setEvents(Array.isArray(eventData) ? eventData : []);
          return;
        }

        const seedResult = await apiClient.seedDatabase(initialTenantSlug || user?.tenantSlug);
        const tenantId = seedResult?.tenantId;

        if (!tenantId) {
          throw new Error('Missing tenantId');
        }

        const [tenant, eventData] = await Promise.all([
          apiClient.getTenant(tenantId),
          apiClient.getEvents(tenantId, 100)
        ]);

        setTenantName(tenant?.name || 'العائلة');
        setEvents(Array.isArray(eventData) ? eventData : []);
      } catch (err) {
        console.error(err);
        setError('تعذر تحميل المناسبات حالياً.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [initialTenantSlug, isSuperAdmin, selectedTenantId, selectedTenant?.name, tenantSelectionLoading, user?.tenantSlug]);

  const upcomingEvents = useMemo(() => {
    const now = new Date().getTime();
    return [...events]
      .filter((event) => new Date(event.eventDate).getTime() >= now)
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [events]);

  const pastEvents = useMemo(() => {
    const now = new Date().getTime();
    return [...events]
      .filter((event) => new Date(event.eventDate).getTime() < now)
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  }, [events]);

  const featuredEvent = upcomingEvents[0] || events[0] || null;
  const currentMonthEvents = events.filter((event) => {
    const date = new Date(event.eventDate);
    const today = new Date();
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  });

  const monthLabel = () => formatMonthWithHijri().combined;

  return (
    <TenantLayout>
      <div className="relative overflow-hidden">
        

        <div className="relative space-y-8">
          <section className="relative overflow-hidden rounded-[2rem] border border-surface-variant bg-gradient-to-br from-secondary-container via-surface to-tertiary-container shadow-sm">
            <div className="absolute inset-0 opacity-25 pointer-events-none">
              <PatternDiamondRepeat />
            </div>
            <div className="relative p-6 md:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
              <div className="lg:col-span-7 space-y-5 text-right">
                <span className="inline-flex items-center gap-2 rounded-full bg-surface/80 px-3 py-1 text-xs font-bold text-secondary shadow-sm border border-secondary/20 w-fit ml-auto">
                  المناسبات الخاصة بـ {tenantName}
                </span>
                <div>
                  <h1 className="text-3xl md:text-5xl font-bold text-on-surface leading-tight">تقويم المناسبات واللحظات العائلية</h1>
                  <p className="mt-4 max-w-2xl text-on-surface-variant text-sm md:text-base leading-relaxed">
                    صفحة مخصصة لعرض المناسبات القادمة والسابقة، مع تقويم شهري سريع، وقائمة تفاعلية تساعدك على الوصول لأي مناسبة خلال ثوانٍ.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 justify-end">
                  <Link to={`${tenantPrefix}/home`} className="px-4 py-2.5 rounded-xl border border-surface-variant bg-surface text-on-surface text-sm font-bold hover:bg-surface-variant/20 transition-colors">
                    العودة للرئيسية
                  </Link>
                  {featuredEvent && (
                    <Link to={`${tenantPrefix}/events/${featuredEvent._id || (featuredEvent as any).id}`} className="px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-sm font-bold hover:bg-secondary-container hover:text-on-secondary-container transition-colors">
                      فتح أول مناسبة قادمة
                    </Link>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-3 md:gap-4">
                <div className="rounded-2xl bg-surface/90 border border-surface-variant p-4 shadow-sm">
                  <p className="text-xs text-on-surface-variant">المناسبات القادمة</p>
                  <p className="mt-2 text-3xl font-bold text-on-surface">{upcomingEvents.length}</p>
                </div>
                <div className="rounded-2xl bg-surface/90 border border-surface-variant p-4 shadow-sm">
                  <p className="text-xs text-on-surface-variant">هذا الشهر</p>
                  <p className="mt-2 text-3xl font-bold text-on-surface">{currentMonthEvents.length}</p>
                </div>
                <div className="rounded-2xl bg-surface/90 border border-surface-variant p-4 shadow-sm">
                  <p className="text-xs text-on-surface-variant">إجمالي المناسبات</p>
                  <p className="mt-2 text-3xl font-bold text-on-surface">{events.length}</p>
                </div>
                <div className="rounded-2xl bg-surface/90 border border-surface-variant p-4 shadow-sm">
                  <p className="text-xs text-on-surface-variant">الماضية</p>
                  <p className="mt-2 text-3xl font-bold text-on-surface">{pastEvents.length}</p>
                </div>
              </div>
            </div>
          </section>

        </div>

        {loading ? (
          <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-8 text-sm text-on-surface-variant shadow-sm mt-6">
            جارٍ تحميل المناسبات...
          </div>
        ) : error ? (
          <div className="bg-error-container border border-error rounded-2xl p-6 text-sm text-on-error-container shadow-sm mt-6">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mt-6 items-start">
            <div className="xl:col-span-7 space-y-6">
              <section className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-4 md:p-6 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 opacity-5 pointer-events-none">
                  <PatternDiamondLines />
                </div>
                <div className="relative">
                  <OccasionsCalendar events={events} tenantPrefix={tenantPrefix} />
                </div>
              </section>

              <section className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-6 shadow-sm" id="upcoming-events">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-xl font-bold text-on-surface">القادمة</h2>
                    <p className="text-sm text-on-surface-variant mt-1">أقرب المناسبات التي يمكنك فتحها أو مشاركتها.</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold">{monthLabel()}</span>
                </div>

                <div className="space-y-3">
                  {upcomingEvents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-surface-variant bg-surface p-8 text-center text-sm text-on-surface-variant">
                      لا توجد مناسبات قادمة حالياً.
                    </div>
                  ) : (
                    upcomingEvents.slice(0, 8).map((event, index) => (
                      <Link
                        key={event._id || (event as any).id || index}
                        to={`${tenantPrefix}/events/${event._id || (event as any).id}`}
                        className="group flex items-center gap-4 rounded-2xl border border-surface-variant bg-surface p-4 hover:bg-surface-variant/20 transition-colors"
                      >
                        <div className="w-14 h-14 rounded-xl bg-secondary-container text-on-secondary-container flex flex-col items-center justify-center shrink-0 border border-secondary/20">
                          <span className="text-[10px] font-bold uppercase leading-none">{formatDateWithHijri(event.eventDate).gregWeekdayShort}</span>
                          <span className="text-lg font-bold leading-none mt-1">{formatDateWithHijri(event.eventDate).gregDay}</span>
                          <span className="text-[9px] text-on-surface-variant mt-0 block">{formatDateWithHijri(event.eventDate).hijriShort}</span>
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <h3 className="font-bold text-on-surface group-hover:text-secondary transition-colors line-clamp-1">{event.title}</h3>
                          <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">{event.description || 'تفاصيل المناسبة داخل الصفحة.'}</p>
                          <p className="text-[11px] text-on-surface-variant mt-2">{formatDateWithHijri(event.eventDate).combined}</p>
                        </div>
                        <div className="text-secondary text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">عرض</div>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            </div>

            <aside className="xl:col-span-5 space-y-6">
              {featuredEvent && (
                <section className="bg-surface-container-lowest border border-surface-variant rounded-2xl overflow-hidden shadow-sm">
                  <div className="relative min-h-[220px] bg-surface">
                    {featuredEvent.mainImage || (featuredEvent.images && featuredEvent.images.length > 0) ? (
                      <img
                        src={featuredEvent.mainImage || featuredEvent.images![0]}
                        alt={featuredEvent.title}
                        className="h-56 w-full object-cover"
                      />
                    ) : (
                      <div className="h-56 flex items-center justify-center bg-gradient-to-br from-secondary-container to-tertiary-container text-6xl">
                        ✨
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5 text-white">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-90">المناسبة المميزة</p>
                      <h3 className="mt-2 text-2xl font-bold">{featuredEvent.title}</h3>
                      <p className="mt-2 text-sm opacity-90 line-clamp-2">{featuredEvent.description || 'مناسبة مختارة للعرض السريع.'}</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-surface p-3 border border-surface-variant">
                        <p className="text-[11px] text-on-surface-variant">التاريخ</p>
                        <p className="mt-1 font-bold text-on-surface">{formatDateWithHijri(featuredEvent.eventDate).combined}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3 border border-surface-variant">
                        <p className="text-[11px] text-on-surface-variant">الموقع</p>
                        <p className="mt-1 font-bold text-on-surface line-clamp-1">{featuredEvent.location || 'غير محدد'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        to={`${tenantPrefix}/events/${featuredEvent._id || (featuredEvent as any).id}`}
                        className="px-4 py-2 rounded-xl bg-secondary text-on-secondary text-sm font-bold hover:bg-secondary-container hover:text-on-secondary-container transition-colors"
                      >
                        فتح التفاصيل
                      </Link>
                      <Link
                        to={`${tenantPrefix}/home#events`}
                        className="px-4 py-2 rounded-xl border border-surface-variant text-sm font-bold text-on-surface hover:bg-surface transition-colors"
                      >
                        العودة للرئيسية
                      </Link>
                    </div>
                  </div>
                </section>
              )}

              <section className="bg-surface-container-lowest border border-surface-variant rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-on-surface">الماضية</h2>
                    <p className="text-sm text-on-surface-variant mt-1">أرشيف سريع لأحدث المناسبات السابقة.</p>
                  </div>
                  <span className="text-xs font-bold text-secondary">{pastEvents.length}</span>
                </div>

                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {pastEvents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-surface-variant bg-surface p-6 text-center text-sm text-on-surface-variant">
                      لا توجد مناسبات سابقة.
                    </div>
                  ) : (
                    pastEvents.slice(0, 8).map((event, index) => (
                      <Link
                        key={event._id || (event as any).id || index}
                        to={`${tenantPrefix}/events/${event._id || (event as any).id}`}
                        className="block rounded-xl border border-surface-variant bg-surface p-4 hover:bg-surface-variant/20 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="text-right min-w-0">
                            <h3 className="font-bold text-sm text-on-surface line-clamp-1">{event.title}</h3>
                            <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">{event.location || 'بدون موقع محدد'}</p>
                          </div>
                          <div className="text-left shrink-0">
                            <p className="text-[11px] text-on-surface-variant">{formatDateWithHijri(event.eventDate).gregDay}</p>
                            <p className="text-xs font-bold text-secondary">{formatDateWithHijri(event.eventDate).gregMonthShort}</p>
                            <p className="text-[9px] text-on-surface-variant mt-1">{formatDateWithHijri(event.eventDate).hijriShort}</p>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </TenantLayout>
  );
}
