import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import TenantLayout from '../components/layout/TenantLayout';
import { apiClient } from '../lib/api';
import { Event } from '@qabila/types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import useTenantPrefix from '../hooks/useTenantPrefix';
import useSuperAdminTenantSelection from '../hooks/useSuperAdminTenantSelection';
import { UserRole } from '@qabila/types';
import { formatDateWithHijri } from '../lib/date';

const statusLabelMap = {
  UPCOMING: 'قادمة',
  ONGOING: 'جارية',
  COMPLETED: 'منتهية',
  CANCELLED: 'ملغاة',
} as const;

const statusStyleMap = {
  UPCOMING: 'bg-blue-100 text-blue-700 border-blue-200',
  ONGOING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-slate-200 text-slate-700 border-slate-300',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
} as const;

export default function OccasionDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const { tenantPrefix } = useTenantPrefix();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const { selectedTenantId, loading: tenantSelectionLoading } = useSuperAdminTenantSelection(Boolean(isSuperAdmin));
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const navigate = useNavigate();
  const toast = useToast();

  const resolveTenantId = async () => {
    if (isSuperAdmin) {
      if (tenantSelectionLoading) return null;
      return selectedTenantId || null;
    }

    if (user?.tenantId) return user.tenantId;

    const seededTenantId = (await apiClient.seedDatabase(tenantPrefix.replace(/^\//, '') || undefined))?.tenantId;
    return seededTenantId || null;
  };

  useEffect(() => {
    const loadEvent = async () => {
      if (!eventId) {
        setError('لم يتم العثور على المناسبة المطلوبة.');
        setLoading(false);
        return;
      }

      if (isSuperAdmin && tenantSelectionLoading) {
        return;
      }

      try {
        const tenantId = await resolveTenantId();
        if (!tenantId) {
          setError('تعذر تحديد مساحة العائلة الخاصة بك.');
          setLoading(false);
          return;
        }

        const data = await apiClient.getEventById(tenantId, eventId);
        setEvent(data);
        setRegistered(Boolean(user?.id && data.registeredUsers?.includes(user.id)));
      } catch (err) {
        console.error(err);
        setError('تعذر تحميل تفاصيل المناسبة.');
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId, isSuperAdmin, selectedTenantId, tenantSelectionLoading, tenantPrefix, user?.tenantId]);

  useEffect(() => {
    if (!event || !user?.id) return;
    setRegistered(Boolean(event.registeredUsers?.includes(user.id)));
  }, [event, user?.id]);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [event?._id, event?.id]);

  // use formatDateWithHijri for combined display
  const formatDate = (isoDate?: string) => (isoDate ? formatDateWithHijri(isoDate).combined : 'غير محدد');

  const galleryImages = event
    ? Array.from(new Set([event.mainImage, ...(event.images || [])].filter(Boolean)))
    : [];
  const effectiveStatus = event?.status || 'UPCOMING';
  const currentImage = galleryImages[currentImageIndex] || galleryImages[0];

  return (
    <TenantLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link to={tenantPrefix ? `${tenantPrefix}/home` : '/occasions'} className="text-secondary text-sm font-bold hover:underline">
            {tenantPrefix ? 'العودة للرئيسية' : 'العودة للمناسبات'}
          </Link>
          <Link to={tenantPrefix ? `${tenantPrefix}/home#events` : '/occasions'} className="text-on-surface-variant text-sm hover:underline">
            قائمة المناسبات
          </Link>
        </div>

        {loading ? (
          <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-6 text-on-surface-variant text-sm">
            جارٍ تحميل التفاصيل...
          </div>
        ) : error ? (
          <div className="bg-error-container border border-error rounded-xl p-6 text-on-error-container text-sm">
            {error}
          </div>
        ) : event ? (
          <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl shadow-sm p-8">
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 bg-secondary/10 text-secondary px-3 py-1 rounded-full text-xs font-bold">
                    مناسبة عائلية
                  </span>
                  <span className={`inline-flex items-center gap-2 border px-3 py-1 rounded-full text-xs font-bold ${statusStyleMap[effectiveStatus as keyof typeof statusStyleMap]}`}>
                    {statusLabelMap[effectiveStatus as keyof typeof statusLabelMap]}
                  </span>
                </div>
                <h1 className="text-3xl font-bold text-on-surface mt-4">{event.title}</h1>
                <p className="text-on-surface-variant text-sm mt-2">{formatDate(event.eventDate)}</p>
              </div>

              {/** Images and header */}
              <div className="flex flex-col gap-4">
                {galleryImages.length > 0 ? (
                  <div className="rounded-xl overflow-hidden border border-surface-variant bg-surface-container-lowest">
                    <div className="relative">
                      <img
                        src={currentImage}
                        alt={event.title}
                        className="w-full h-72 object-cover"
                      />
                      {galleryImages.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCurrentImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white w-10 h-10 flex items-center justify-center hover:bg-black/70"
                            aria-label="الصورة السابقة"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={() => setCurrentImageIndex((prev) => (prev + 1) % galleryImages.length)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white w-10 h-10 flex items-center justify-center hover:bg-black/70"
                            aria-label="الصورة التالية"
                          >
                            ›
                          </button>
                        </>
                      )}
                    </div>

                    {galleryImages.length > 1 && (
                      <div className="flex gap-2 p-3 overflow-x-auto bg-surface">
                        {galleryImages.map((img, idx) => (
                          <button
                            key={`${img}-${idx}`}
                            type="button"
                            onClick={() => setCurrentImageIndex(idx)}
                            className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${idx === currentImageIndex ? 'border-primary' : 'border-transparent opacity-80 hover:opacity-100'}`}
                          >
                            <img src={img} alt={`thumb-${idx}`} className="w-20 h-12 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-surface p-4 rounded-xl border border-surface-variant">
                    <p className="text-xs text-on-surface-variant mb-1">الموقع</p>
                    <p className="text-on-surface font-bold">{event.location || 'سيتم تحديده لاحقاً'}</p>
                  </div>
                  <div className="bg-surface p-4 rounded-xl border border-surface-variant">
                    <p className="text-xs text-on-surface-variant mb-1">الحالة</p>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${statusStyleMap[effectiveStatus as keyof typeof statusStyleMap]}`}>
                      {statusLabelMap[effectiveStatus as keyof typeof statusLabelMap]}
                    </span>
                  </div>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-surface-variant">
                  <h2 className="text-lg font-bold text-on-surface mb-2">الوصف</h2>
                  <p className="text-on-surface-variant text-sm leading-relaxed">
                    {event.description || 'لا توجد تفاصيل إضافية حالياً.'}
                  </p>
                </div>

                {event.googleMapsUrl && (
                  <div className="bg-surface p-4 rounded-xl border border-surface-variant">
                    <h3 className="text-sm text-on-surface-variant mb-2">الموقع على الخريطة</h3>
                    <div className="w-full h-56 overflow-hidden rounded">
                      <iframe
                        title="event-map"
                        src={event.googleMapsUrl}
                        className="w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>
                )}

                <div className="bg-surface p-4 rounded-xl border border-surface-variant flex items-center justify-between">
                  <div>
                    <p className="text-xs text-on-surface-variant">السعة</p>
                    <p className="text-on-surface font-bold">
                      {event.capacity ? `${event.registeredCount || 0} / ${event.capacity}` : 'غير محددة'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {event.registrationRequired ? (
                      <button
                        onClick={async () => {
                          if (!user) return navigate(`${tenantPrefix}/login`);
                          if (processing) return;
                          setProcessing(true);
                          try {
                            const tenantId = await resolveTenantId();
                            if (!tenantId) throw new Error('No tenant');
                            if (!registered) {
                              await apiClient.registerForEvent(event._id || (event as any).id, tenantId);
                              setRegistered(true);
                              setEvent(prev => prev ? { ...prev, registeredCount: (prev.registeredCount || 0) + 1, registeredUsers: [...(prev.registeredUsers || []), user.id] } : prev);
                              toast.show('تم التسجيل بنجاح', 'success');
                            } else {
                              await apiClient.unregisterFromEvent(event._id || (event as any).id, tenantId);
                              setRegistered(false);
                              setEvent(prev => prev ? { ...prev, registeredCount: Math.max((prev.registeredCount || 1) - 1, 0), registeredUsers: (prev.registeredUsers || []).filter(id => id !== user.id) } : prev);
                              toast.show('تم إلغاء التسجيل', 'info');
                            }
                          } catch (err) {
                            console.error(err);
                            setError(err instanceof Error ? err.message : 'حدثت مشكلة أثناء التسجيل. حاول مرة أخرى.');
                          } finally {
                            setProcessing(false);
                          }
                        }}
                        className="px-4 py-2 rounded bg-secondary text-on-secondary text-sm font-semibold disabled:opacity-50"
                        disabled={processing || (event.capacity ? (event.registeredCount || 0) >= event.capacity : false)}
                      >
                        {processing ? 'جارٍ المعالجة…' : registered ? 'إلغاء التسجيل' : 'سجل حضور'}
                      </button>
                    ) : (
                      <span className="text-sm text-on-surface-variant">لا يتطلب التسجيل</span>
                    )}
                  </div>
                </div>

                {user?.role === 'QABILA_ADMIN' && (
                  <div className="flex gap-2">
                    <Link to={`${tenantPrefix}/admin/occasions`} className="px-3 py-2 bg-surface rounded border text-sm font-medium">
                      تحرير المناسبة
                    </Link>
                    <button
                      onClick={async () => {
                        if (!confirm('هل أنت متأكد من حذف هذه المناسبة؟')) return;
                        try {
                          setProcessing(true);
                          const tenantId = isSuperAdmin
                            ? (tenantSelectionLoading ? null : selectedTenantId)
                            : (user.tenantId || (await apiClient.seedDatabase())?.tenantId);
                          if (!tenantId) throw new Error('No tenant');
                          await apiClient.deleteEvent(event._id || (event as any).id, tenantId);
                          toast.show('تم حذف المناسبة', 'success');
                          navigate(`${tenantPrefix}/home#events`);
                        } catch (err) {
                          console.error(err);
                          setError('فشل حذف المناسبة');
                        } finally {
                          setProcessing(false);
                        }
                      }}
                      className="px-3 py-2 bg-error-container text-on-error-container rounded text-sm font-medium"
                    >
                      حذف
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </TenantLayout>
  );
}
