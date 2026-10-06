import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TenantLayout from '../components/layout/TenantLayout';
import OccasionsCalendar from '../components/OccasionsCalendar';
import BrandMark from '../components/BrandMark';
import { PatternDiamondGrid, PatternDiamondLines, PatternDiamondRepeat } from '../components/Patterns';
import { apiClient } from '../lib/api';
import { Event } from '@qabila/types';
import { useAuth } from '../contexts/AuthContext';
import useTenantPrefix from '../hooks/useTenantPrefix';
import Skeleton from '../components/ui/Skeleton';
import { formatDateWithHijri } from '../lib/date';

interface Activity {
  _id: string;
  type: string;
  userName: string;
  userAvatar?: string;
  description?: string;
  createdAt: string;
}

export default function TenantHome() {
  const { user } = useAuth();
  const { tenantPrefix, tenantSlug: initialTenantSlug } = useTenantPrefix();
  const [persons, setPersons] = useState<any[]>([]);
  const [tenantName, setTenantName] = useState('العائلة');
  const [tenantArabicName, setTenantArabicName] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantSummary, setTenantSummary] = useState<{ branchCount?: number; memberCount?: number; pendingRequests?: number } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const seedResult = await apiClient.seedDatabase(initialTenantSlug || user?.tenantSlug);
        if (!seedResult?.tenantId) return;

        const requests = [
          apiClient.getPersons(seedResult.tenantId),
          apiClient.getTenant(seedResult.tenantId),
          apiClient.getEvents(seedResult.tenantId, 50),
          apiClient.getActivities(seedResult.tenantId, 10, 0)
        ];

        if (user?.role === 'QABILA_ADMIN' || user?.role === 'SUB_ADMIN') {
          requests.push(apiClient.getAdminMetrics(seedResult.tenantId));
        }

        const results = await Promise.all(requests);
        const [personsData, tenant, eventsData, activitiesData, metrics] = results as [any[], any, Event[], Activity[], any?];

        setPersons(personsData || []);
        setTenantName(tenant?.name || 'العائلة');
        setTenantArabicName(tenant?.arabicName || '');
        setEvents(Array.isArray(eventsData) ? eventsData : []);
        setActivities(Array.isArray(activitiesData) ? activitiesData : []);
        setTenantSummary(
          metrics || {
            memberCount: personsData?.length || 0,
            branchCount: tenant?.branches?.length,
            pendingRequests: undefined
          }
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [initialTenantSlug, user?.role, user?.tenantSlug]);

  const getInitials = (firstName?: string) => {
    return firstName?.trim()?.[0] || '؟';
  };

  const getDisplayFirstName = (person?: any) => person?.firstName?.trim() || '—';

  const recentAdditions = useMemo(() => {
    return [...persons]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 4);
  }, [persons]);

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
  const recentActivities = useMemo(() => activities.slice(0, 5), [activities]);

  const formatEventDay = (isoDate: string) => formatDateWithHijri(isoDate).gregWeekdayShort;
  const formatEventDate = (isoDate: string) => formatDateWithHijri(isoDate).gregDay;
  const formatEventSummary = (isoDate: string) => formatDateWithHijri(isoDate).combined;

  const memberCount = tenantSummary?.memberCount ?? persons.length;
  const branchCount = tenantSummary?.branchCount ?? 0;
  const pendingRequests = tenantSummary?.pendingRequests ?? 0;

  return (
    <TenantLayout>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-10">
          <PatternDiamondGrid />
        </div>
        <div className="absolute -top-20 right-0 h-72 w-72 pointer-events-none opacity-15">
          <PatternDiamondRepeat />
        </div>
        <div className="absolute bottom-0 left-0 h-64 w-64 pointer-events-none opacity-10">
          <PatternDiamondLines />
        </div>

        <div className="relative space-y-6 md:space-y-8">
          <section className="relative overflow-hidden rounded-[2rem] border border-surface-variant bg-gradient-to-br from-secondary-container via-surface to-tertiary-container shadow-sm">
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <PatternDiamondRepeat />
            </div>
            <div className="relative p-6 md:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5 text-right">
                <span className="inline-flex items-center gap-2 rounded-full bg-surface/80 px-3 py-1 text-xs font-bold text-secondary shadow-sm border border-secondary/20 w-fit ml-auto">
                  مساحة العائلة الخاصة
                </span>
                <div className="space-y-4">
                  <div className="w-fit ml-auto text-primary">
                    <BrandMark className="h-20 w-20" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-bold text-on-surface leading-tight">
                    {user?.name?.split(' ')[0] || 'عضو العائلة'}، هذه هي مساحة {tenantArabicName || tenantName}
                  </h2>
                  <p className="max-w-2xl text-sm md:text-base text-on-surface-variant leading-relaxed">
                    واجهة جديدة تجمع الشجرة، المناسبات، الإضافات الحديثة، والنشاط الإداري في شاشة واحدة واضحة وسريعة.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 justify-end">
                  <Link to={`${tenantPrefix}/tree`} className="px-5 py-3 rounded-xl bg-secondary text-on-secondary text-sm font-bold hover:bg-secondary-container hover:text-on-secondary-container transition-colors shadow-sm">
                    استكشاف الشجرة
                  </Link>
                  <Link to={`${tenantPrefix}/occasions`} className="px-5 py-3 rounded-xl border border-surface-variant bg-surface text-on-surface text-sm font-bold hover:bg-surface-variant/20 transition-colors">
                    المناسبات
                  </Link>
                  <Link to={`${tenantPrefix}/profile`} className="px-5 py-3 rounded-xl border border-surface-variant text-sm font-bold text-on-surface hover:bg-surface transition-colors">
                    الملف الشخصي
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-3 md:gap-4">
                <div className="rounded-2xl bg-surface/90 border border-surface-variant p-4 shadow-sm">
                  <p className="text-xs text-on-surface-variant">إجمالي الأعضاء</p>
                  <p className="mt-2 text-3xl font-bold text-on-surface">{memberCount}</p>
                </div>
                <div className="rounded-2xl bg-surface/90 border border-surface-variant p-4 shadow-sm">
                  <p className="text-xs text-on-surface-variant">الفروع</p>
                  <p className="mt-2 text-3xl font-bold text-on-surface">{branchCount || '—'}</p>
                </div>
                <div className="rounded-2xl bg-surface/90 border border-surface-variant p-4 shadow-sm">
                  <p className="text-xs text-on-surface-variant">المناسبات القادمة</p>
                  <p className="mt-2 text-3xl font-bold text-on-surface">{upcomingEvents.length}</p>
                </div>
                <div className="rounded-2xl bg-surface/90 border border-surface-variant p-4 shadow-sm">
                  <p className="text-xs text-on-surface-variant">الطلبات المعلقة</p>
                  <p className="mt-2 text-3xl font-bold text-on-surface">{pendingRequests || '—'}</p>
                </div>
              </div>
            </div>
          </section>

          {loading ? (
            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-variant shadow-sm">
              <div className="space-y-4">
                <Skeleton className="h-6 w-56 rounded" aria-label="loading-tenant-title" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Skeleton className="h-24 rounded-xl" aria-label="loading-card-0" />
                  <Skeleton className="h-24 rounded-xl" aria-label="loading-card-1" />
                  <Skeleton className="h-24 rounded-xl" aria-label="loading-card-2" />
                </div>
                <Skeleton className="h-48 rounded-2xl" aria-label="loading-chart" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 flex flex-col gap-6 order-2 lg:order-1">
                <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-variant shadow-sm relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1 bg-secondary" />
                    <p className="text-xs text-on-surface-variant mb-2">العائلة الحالية</p>
                    <h3 className="text-xl font-bold text-on-surface line-clamp-1">{tenantArabicName || tenantName}</h3>
                    <p className="text-sm text-on-surface-variant mt-2">الواجهة الموحدة لإدارة الشجرة والمناسبات والمتابعة.</p>
                  </div>
                  <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-variant shadow-sm">
                    <p className="text-xs text-on-surface-variant mb-2">الأفراد</p>
                    <h3 className="text-3xl font-bold text-on-surface">{memberCount}</h3>
                    <p className="text-sm text-on-surface-variant mt-2">محدثة من البيانات المحفوظة داخل مساحة العائلة.</p>
                  </div>
                  <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-variant shadow-sm">
                    <p className="text-xs text-on-surface-variant mb-2">المناسبات القادمة</p>
                    <h3 className="text-3xl font-bold text-on-surface">{upcomingEvents.length}</h3>
                    <p className="text-sm text-on-surface-variant mt-2">روابط مباشرة إلى تفاصيل المناسبة والتسجيل فيها.</p>
                  </div>
                  <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-variant shadow-sm">
                    <p className="text-xs text-on-surface-variant mb-2">المناسبات الماضية</p>
                    <h3 className="text-3xl font-bold text-on-surface">{pastEvents.length}</h3>
                    <p className="text-sm text-on-surface-variant mt-2">أرشيف سريع للمناسبات السابقة.</p>
                  </div>
                </section>

                <section className="bg-surface-container-lowest rounded-2xl border border-surface-variant shadow-sm overflow-hidden">
                  <div className="px-5 md:px-6 py-4 border-b border-surface-variant/50 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-on-surface">تقويم العائلة</h3>
                      <p className="text-sm text-on-surface-variant mt-1">عرض بصري سريع لجميع المناسبات في مساحة واحدة.</p>
                    </div>
                    <Link to={`${tenantPrefix}/occasions`} className="text-sm font-bold text-secondary hover:text-secondary/80 transition-colors">
                      المزيد ←
                    </Link>
                  </div>
                  <div className="p-4 md:p-6">
                    <OccasionsCalendar events={events} tenantPrefix={tenantPrefix} />
                  </div>
                </section>

                <section className="bg-surface-container-lowest rounded-2xl border border-surface-variant shadow-sm overflow-hidden">
                  <div className="px-5 md:px-6 py-4 border-b border-surface-variant/50 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-on-surface">المناسبات القادمة</h3>
                      <p className="text-sm text-on-surface-variant mt-1">بطاقات سريعة للوصول إلى أولى المناسبات القادمة.</p>
                    </div>
                    <Link to={`${tenantPrefix}/occasions`} className="text-sm font-bold text-secondary hover:text-secondary/80 transition-colors">
                      كل المناسبات ←
                    </Link>
                  </div>

                  <div className="p-5 md:p-6">
                    {events.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-surface-variant bg-surface p-8 text-center text-sm text-on-surface-variant">
                        لا توجد مناسبات حالياً.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {(upcomingEvents.slice(0, 4).length > 0 ? upcomingEvents.slice(0, 4) : events.slice(0, 4)).map((event, index) => (
                          <Link
                            key={event._id || event.id || index}
                            to={`${tenantPrefix}/events/${event._id || event.id}`}
                            className="group flex items-center gap-4 rounded-2xl border border-surface-variant bg-surface p-4 hover:bg-surface-variant/20 transition-colors"
                          >
                            <div className="w-14 h-14 rounded-xl bg-secondary-container text-on-secondary-container flex flex-col items-center justify-center shrink-0 border border-secondary/20">
                              <span className="text-[10px] font-bold uppercase leading-none">{formatEventDay(event.eventDate)}</span>
                              <span className="text-lg font-bold leading-none mt-1">{formatEventDate(event.eventDate)}</span>
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                              <h3 className="font-bold text-on-surface group-hover:text-secondary transition-colors line-clamp-1">{event.title}</h3>
                              <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">{event.description || 'تفاصيل المناسبة داخل الصفحة.'}</p>
                              <p className="text-[11px] text-on-surface-variant mt-2">{formatEventSummary(event.eventDate)}</p>
                            </div>
                            <div className="text-secondary text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">عرض</div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-variant shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-end mb-2 border-b border-surface-variant/50 pb-4">
                    <div>
                      <h3 className="text-xl font-bold text-on-surface flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-secondary">
                          <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.745.745 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.745.745 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
                          <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121a3.75 3.75 0 0 1 6.568-2.292c-.4.276-.732.5-1.002.822ZM18.918 14.254c.27-.322.602-.546 1.002-.822a3.75 3.75 0 0 1 6.568 2.292l-.01.121a.563.563 0 0 1-.373.486l-.115.04c-.56.196-1.15.34-1.764.44a8.287 8.287 0 0 0-1.308-5.135Z" />
                        </svg>
                        أحدث الإضافات للشجرة
                      </h3>
                      <p className="text-on-surface-variant text-sm mt-1">أفراد العائلة الذين تمت إضافتهم مؤخراً</p>
                    </div>
                    <Link to={`${tenantPrefix}/tree`} className="text-sm font-bold text-secondary hover:text-secondary/80 transition-colors">
                      عرض الشجرة كاملة ←
                    </Link>
                  </div>

                  {recentAdditions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-surface-variant bg-surface p-8 text-center text-sm text-on-surface-variant">
                      لا توجد إضافات حديثة.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {recentAdditions.map((person) => (
                        <div key={person._id} className="bg-surface p-4 rounded-xl border border-surface-variant flex flex-col items-center text-center hover:bg-surface-variant/20 transition-colors">
                          <div className="w-14 h-14 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-lg mb-3 shadow-sm border border-secondary/20">
                            {getInitials(person.firstName)}
                          </div>
                          <span className="font-bold text-sm text-on-surface line-clamp-1">{getDisplayFirstName(person)}</span>
                          <span className="text-[11px] text-on-surface-variant mt-1 bg-surface-variant/50 px-2 py-0.5 rounded-full">
                            {person.birthYear ? `مواليد ${person.birthYear}` : 'سنة الميلاد غير متوفرة'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <aside className="lg:col-span-4 flex flex-col gap-6 order-1 lg:order-2">
                <div className="bg-surface-container-lowest rounded-2xl border border-surface-variant shadow-sm relative overflow-hidden">
                  <div className="absolute inset-y-0 right-0 w-1.5 bg-secondary" />
                  <div className="absolute inset-0 opacity-5 pointer-events-none">
                    <PatternDiamondLines />
                  </div>
                  <div className="relative p-6 space-y-5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-on-surface">لوحة سريعة</h3>
                      <span className="bg-secondary-container text-on-secondary-container p-1.5 rounded-full shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <Link to={`${tenantPrefix}/tree`} className="rounded-xl border border-surface-variant bg-surface p-4 hover:bg-surface-variant/20 transition-colors">
                        <p className="text-[11px] text-on-surface-variant">استكشاف</p>
                        <p className="font-bold text-on-surface mt-1">شجرة العائلة</p>
                      </Link>
                      <Link to={`${tenantPrefix}/occasions`} className="rounded-xl border border-surface-variant bg-surface p-4 hover:bg-surface-variant/20 transition-colors">
                        <p className="text-[11px] text-on-surface-variant">متابعة</p>
                        <p className="font-bold text-on-surface mt-1">المناسبات</p>
                      </Link>
                      <Link to={`${tenantPrefix}/profile`} className="rounded-xl border border-surface-variant bg-surface p-4 hover:bg-surface-variant/20 transition-colors">
                        <p className="text-[11px] text-on-surface-variant">تحديث</p>
                        <p className="font-bold text-on-surface mt-1">الملف الشخصي</p>
                      </Link>
                      <div className="rounded-xl border border-surface-variant bg-surface p-4">
                        <p className="text-[11px] text-on-surface-variant">آخر إضافة</p>
                        <p className="font-bold text-on-surface mt-1 line-clamp-1">
                          {recentAdditions[0] ? getDisplayFirstName(recentAdditions[0]) : 'لا يوجد'}
                        </p>
                      </div>
                    </div>

                    {(user?.role === 'QABILA_ADMIN' || user?.role === 'SUB_ADMIN') && (
                      <div className="rounded-2xl border border-secondary/20 bg-secondary-container/40 p-4 space-y-4">
                        <div>
                          <p className="text-xs font-bold text-secondary uppercase tracking-[0.2em]">إدارة</p>
                          <h4 className="text-lg font-bold text-on-surface mt-1">الأدوات الإدارية السريعة</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          <Link to={`${tenantPrefix}/admin`} className="px-4 py-3 rounded-xl border border-surface-variant bg-surface text-sm font-bold text-on-surface hover:bg-surface-variant/20 transition-colors">
                            لوحة القيادة
                          </Link>
                          <Link to={`${tenantPrefix}/admin/occasions`} className="px-4 py-3 rounded-xl bg-secondary text-on-secondary text-sm font-bold hover:bg-secondary-container hover:text-on-secondary-container transition-colors">
                            إدارة المناسبات
                          </Link>
                          <Link to={`${tenantPrefix}/admin/approvals`} className="px-4 py-3 rounded-xl border border-surface-variant bg-surface text-sm font-bold text-on-surface hover:bg-surface-variant/20 transition-colors">
                            طلبات الانضمام
                          </Link>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl bg-surface p-3 border border-surface-variant">
                            <div className="text-on-surface-variant text-xs">الفروع</div>
                            <div className="text-on-surface font-bold mt-1">{branchCount || '—'}</div>
                          </div>
                          <div className="rounded-xl bg-surface p-3 border border-surface-variant">
                            <div className="text-on-surface-variant text-xs">طلبات</div>
                            <div className="text-on-surface font-bold mt-1">{pendingRequests || '—'}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <section className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-variant shadow-sm flex flex-col gap-4">
                  <h3 className="text-xl font-bold text-on-surface border-b border-surface-variant/50 pb-4 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-secondary">
                      <path d="M12.75 12.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM7.5 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM8.25 17a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM9.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM10.5 17a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM12.75 17a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM14.25 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM15 17a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM16.5 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM16.5 12.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18 17a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM9 9.75a.75.75 0 0 0 0-1.5H7.5a.75.75 0 0 0 0 1.5H9Z" />
                      <path fillRule="evenodd" d="M21 2.25a.75.75 0 0 0-.75-.75H3.75A.75.75 0 0 0 3 2.25v1.5h18V2.25ZM3 6h18v10.5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 16.5V6Z" clipRule="evenodd" />
                    </svg>
                    النشاط الأخير
                  </h3>
                  {recentActivities.length === 0 ? (
                    <div className="text-sm text-on-surface-variant">لا يوجد نشاط حالياً.</div>
                  ) : (
                    <div className="space-y-3">
                      {recentActivities.map((activity) => {
                        const timeAgo = new Date(activity.createdAt);
                        const now = new Date();
                        const diffMs = now.getTime() - timeAgo.getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);

                        let timeText = 'للتو';
                        if (diffMins > 0 && diffMins < 60) timeText = `منذ ${diffMins}د`;
                        else if (diffHours > 0 && diffHours < 24) timeText = `منذ ${diffHours}س`;
                        else if (diffDays > 0) timeText = `منذ ${diffDays}يوم`;

                        return (
                          <div key={activity._id} className="flex gap-3 items-start pb-3 border-b border-surface-variant/30 last:border-0 last:pb-0">
                            <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                              {activity.userName?.[0] || '؟'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-on-surface-variant">{timeText}</p>
                              <p className="text-sm text-on-surface font-bold mt-1 line-clamp-2">
                                {activity.description || activity.type}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {featuredEvent && (
                  <section className="bg-surface-container-lowest border border-surface-variant rounded-2xl overflow-hidden shadow-sm">
                    <div className="relative min-h-[220px] bg-surface">
                      {featuredEvent.mainImage || (featuredEvent.images && featuredEvent.images.length > 0) ? (
                        <img src={featuredEvent.mainImage || featuredEvent.images![0]} alt={featuredEvent.title} className="h-56 w-full object-cover" />
                      ) : (
                        <div className="h-56 flex items-center justify-center bg-gradient-to-br from-secondary-container to-tertiary-container text-6xl">✨</div>
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
                          <p className="mt-1 font-bold text-on-surface">{formatEventSummary(featuredEvent.eventDate)}</p>
                        </div>
                        <div className="rounded-xl bg-surface p-3 border border-surface-variant">
                          <p className="text-[11px] text-on-surface-variant">الموقع</p>
                          <p className="mt-1 font-bold text-on-surface line-clamp-1">{featuredEvent.location || 'غير محدد'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Link
                          to={`${tenantPrefix}/events/${featuredEvent._id || featuredEvent.id}`}
                          className="px-4 py-2 rounded-xl bg-secondary text-on-secondary text-sm font-bold hover:bg-secondary-container hover:text-on-secondary-container transition-colors"
                        >
                          فتح التفاصيل
                        </Link>
                        <Link
                          to={`${tenantPrefix}/occasions`}
                          className="px-4 py-2 rounded-xl border border-surface-variant text-sm font-bold text-on-surface hover:bg-surface transition-colors"
                        >
                          كل المناسبات
                        </Link>
                      </div>
                    </div>
                  </section>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </TenantLayout>
  );
}