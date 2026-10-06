import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/layout/AdminLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { apiClient } from '../lib/api';
import { Event, UserRole } from '@qabila/types';
import { formatDateWithHijri } from '../lib/date';
import { PatternDiamondGrid, PatternDiamondLines, PatternDiamondRepeat } from '../components/Patterns';
import Skeleton from '../components/ui/Skeleton';

const statusLabelMap: Record<NonNullable<Event['status']>, string> = {
  UPCOMING: 'قادمة',
  ONGOING: 'جارية',
  COMPLETED: 'منتهية',
  CANCELLED: 'ملغاة',
};

const statusStyleMap: Record<NonNullable<Event['status']>, string> = {
  UPCOMING: 'bg-blue-100 text-blue-700 border-blue-200',
  ONGOING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-slate-200 text-slate-700 border-slate-300',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

const statusOrder: Array<'all' | NonNullable<Event['status']>> = ['all', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];

type EventFormState = {
  title: string;
  description: string;
  location: string;
  googleMapsUrl: string;
  eventDate: string;
  capacity: string;
  registrationRequired: boolean;
  status: NonNullable<Event['status']>;
};

const createEmptyForm = (): EventFormState => ({
  title: '',
  description: '',
  location: '',
  googleMapsUrl: '',
  eventDate: '',
  capacity: '',
  registrationRequired: false,
  status: 'UPCOMING',
});

const getEventId = (event: Event) => event._id || event.id || '';

const getPrimaryImage = (event: Event) => event.mainImage || event.images?.[0] || '';

const formatEventDate = (value: string) => formatDateWithHijri(value).combined;

export default function OccasionManagement() {
  const { user } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | NonNullable<Event['status']>>('all');
  const [formData, setFormData] = useState<EventFormState>(createEmptyForm());

  const loadEvents = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.getEvents(user.tenantId, 100);
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'تعذر تحميل المناسبات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) {
      loadEvents();
    }
  }, [user?.tenantId]);

  const resetForm = () => {
    setFormData(createEmptyForm());
    setUploadedImages([]);
    setEditingId(null);
    setError('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setUploadingImages(true);
    setError('');
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const response = await apiClient.uploadFile(file);
        if (response?.url) uploadedUrls.push(response.url);
      }
      setUploadedImages((prev) => [...prev, ...uploadedUrls]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'تعذر رفع الصور');
    } finally {
      setUploadingImages(false);
    }
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (event: Event) => {
    setEditingId(getEventId(event));
    setFormData({
      title: event.title,
      description: event.description || '',
      location: event.location || '',
      googleMapsUrl: event.googleMapsUrl || '',
      eventDate: event.eventDate ? event.eventDate.split('T')[0] : '',
      capacity: event.capacity?.toString() || '',
      registrationRequired: Boolean(event.registrationRequired),
      status: event.status || 'UPCOMING',
    });
    setUploadedImages(event.images?.length ? event.images : event.mainImage ? [event.mainImage] : []);
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.tenantId) return;

    if (!formData.title.trim()) {
      setError('عنوان المناسبة مطلوب');
      return;
    }

    if (!formData.eventDate) {
      setError('تاريخ المناسبة مطلوب');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        tenantId: user.tenantId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        location: formData.location.trim(),
        googleMapsUrl: formData.googleMapsUrl.trim(),
        mainImage: uploadedImages[0] || '',
        images: uploadedImages,
        eventDate: new Date(`${formData.eventDate}T12:00:00`).toISOString(),
        capacity: formData.capacity.trim() ? Number(formData.capacity) : undefined,
        registrationRequired: formData.registrationRequired,
        status: formData.status,
        createdBy: user.id,
      };

      if (editingId) {
        await apiClient.updateEvent(editingId, user.tenantId, payload);
        toast.show('تم تحديث المناسبة بنجاح', 'success');
      } else {
        await apiClient.createEvent(payload);
        toast.show('تمت إضافة المناسبة بنجاح', 'success');
      }

      resetForm();
      setShowForm(false);
      await loadEvents();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'تعذر حفظ المناسبة');
      toast.show('فشل حفظ المناسبة', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!user?.tenantId) return;
    if (!confirm('هل أنت متأكد من حذف هذه المناسبة؟')) return;

    setLoading(true);
    setError('');
    try {
      await apiClient.deleteEvent(eventId, user.tenantId);
      toast.show('تم حذف المناسبة', 'success');
      await loadEvents();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'تعذر حذف المناسبة');
      toast.show('فشل حذف المناسبة', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...events]
      .filter((event) => {
        const matchesStatus = statusFilter === 'all' || (event.status || 'UPCOMING') === statusFilter;
        if (!matchesStatus) return false;

        if (!query) return true;

        const haystack = [
          event.title,
          event.description,
          event.location,
          event.status,
          event.eventDate,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [events, search, statusFilter]);

  const stats = useMemo(() => {
    const upcoming = events.filter((event) => (event.status || 'UPCOMING') === 'UPCOMING').length;
    const ongoing = events.filter((event) => (event.status || 'UPCOMING') === 'ONGOING').length;
    const completed = events.filter((event) => (event.status || 'UPCOMING') === 'COMPLETED').length;
    const registered = events.reduce((sum, event) => sum + (event.registeredCount || 0), 0);
    const images = events.reduce((sum, event) => sum + (event.images?.length || (event.mainImage ? 1 : 0)), 0);

    return { total: events.length, upcoming, ongoing, completed, registered, images };
  }, [events]);

  const featuredEvent = useMemo(() => {
    const upcomingEvent = [...events]
      .filter((event) => (event.status || 'UPCOMING') === 'UPCOMING')
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())[0];

    return upcomingEvent || events[0] || null;
  }, [events]);

  if (user?.role !== UserRole.QABILA_ADMIN) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-on-surface-variant">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-10">
        <div className="overflow-hidden rounded-[28px] border border-surface-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-surface shadow-heritage-sm relative">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <PatternDiamondGrid />
          </div>
          <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-6 p-6 lg:p-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant">
                <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">إدارة المناسبات</span>
                <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">واجهة موحدة</span>
                <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">{events.length} مناسبة</span>
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-black text-primary leading-tight">إدارة المناسبات</h1>
                <p className="mt-3 max-w-2xl text-sm lg:text-base leading-7 text-on-surface-variant">
                  صفحة تحرير حديثة لمتابعة المناسبات، رفع الصور، وتحديث الحالة بطريقة بصرية خفيفة تشبه بقية لوحة الإدارة.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition hover:opacity-95"
                >
                  إضافة مناسبة جديدة
                </button>
                <button
                  type="button"
                  onClick={loadEvents}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full border border-surface-variant bg-surface px-4 py-2.5 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20 disabled:opacity-60"
                >
                  {loading ? 'جارٍ التحديث...' : 'تحديث القائمة'}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'إجمالي المناسبات', value: stats.total, tone: 'text-primary' },
                { label: 'قادمة', value: stats.upcoming, tone: 'text-secondary' },
                { label: 'جارية', value: stats.ongoing, tone: 'text-emerald-700' },
                { label: 'إجمالي الحضور المسجل', value: stats.registered, tone: 'text-error' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-surface-variant bg-surface/90 p-4 shadow-sm backdrop-blur-sm">
                  <p className="text-xs text-on-surface-variant">{card.label}</p>
                  <p className={`mt-1 text-3xl font-black ${card.tone}`}>{loading ? '—' : card.value.toLocaleString('ar-SA')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container shadow-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.9fr] gap-6 items-start">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-5 lg:p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 pointer-events-none">
                <PatternDiamondLines />
              </div>
              <div className="relative z-10 space-y-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-primary">سجل المناسبات</h2>
                    <p className="mt-1 text-xs text-on-surface-variant">ابحث، صفِّ، ثم حرر المناسبة مباشرة من البطاقة.</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="relative">
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ابحث بالعنوان أو الموقع"
                        className="w-full sm:w-72 rounded-2xl border border-surface-variant bg-surface px-4 py-3 pr-10 text-sm text-on-surface outline-none transition focus:border-secondary"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">⌕</span>
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as 'all' | NonNullable<Event['status']>) }
                      className="rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-secondary"
                    >
                      {statusOrder.map((status) => (
                        <option key={status} value={status}>
                          {status === 'all' ? 'كل الحالات' : statusLabelMap[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`event-skeleton-${index}`} className="rounded-3xl border border-surface-variant bg-surface p-5">
                        <div className="flex gap-4">
                          <Skeleton className="h-28 w-28 rounded-2xl" aria-label={`loading-event-image-${index}`} />
                          <div className="flex-1 space-y-3">
                            <Skeleton className="h-5 w-3/5 rounded-full" aria-label={`loading-event-title-${index}`} />
                            <Skeleton className="h-4 w-1/2 rounded-full" aria-label={`loading-event-date-${index}`} />
                            <Skeleton className="h-4 w-full rounded-full" aria-label={`loading-event-desc-${index}`} />
                            <Skeleton className="h-4 w-4/5 rounded-full" aria-label={`loading-event-meta-${index}`} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-surface-variant bg-surface p-8 text-center">
                    <p className="text-base font-semibold text-on-surface">لا توجد مناسبات مطابقة حالياً.</p>
                    <p className="mt-2 text-sm text-on-surface-variant">جرّب تعديل البحث أو أنشئ مناسبة جديدة من الزر العلوي.</p>
                    <button
                      type="button"
                      onClick={openCreateForm}
                      className="mt-5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition hover:opacity-95"
                    >
                      إضافة مناسبة
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredEvents.map((event) => {
                      const eventId = getEventId(event);
                      const image = getPrimaryImage(event);
                      const imageCount = event.images?.length || (event.mainImage ? 1 : 0);
                      const capacity = event.capacity ?? null;
                      const registered = event.registeredCount ?? 0;
                      const registrationRate = capacity ? Math.min(Math.round((registered / capacity) * 100), 100) : null;
                      const status = event.status || 'UPCOMING';

                      return (
                        <article
                          key={eventId}
                          className="overflow-hidden rounded-3xl border border-surface-variant bg-surface-container-lowest shadow-sm transition hover:shadow-md"
                        >
                          <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
                            <div className="relative min-h-[220px] bg-surface-variant/20">
                              {image ? (
                                <img src={image} alt={event.title} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full min-h-[220px] items-center justify-center bg-gradient-to-br from-secondary-container to-surface">
                                  <div className="text-center">
                                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-primary shadow-sm">
                                      ✦
                                    </div>
                                    <p className="text-sm font-bold text-on-surface">لا توجد صورة</p>
                                    <p className="text-xs text-on-surface-variant">يمكن إضافة صورة رئيسية من المحرر</p>
                                  </div>
                                </div>
                              )}
                              <div className="absolute left-3 top-3 flex flex-col gap-2">
                                <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${statusStyleMap[status]}`}>
                                  {statusLabelMap[status]}
                                </span>
                                {event.registrationRequired && (
                                  <span className="rounded-full bg-secondary-container px-3 py-1 text-[11px] font-bold text-on-secondary-container">
                                    التسجيل مطلوب
                                  </span>
                                )}
                              </div>
                              {imageCount > 0 && (
                                <div className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                                  {imageCount} صورة
                                </div>
                              )}
                            </div>

                            <div className="p-5 lg:p-6">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-xs text-on-surface-variant">{formatEventDate(event.eventDate)}</p>
                                    <h3 className="mt-1 text-2xl font-black text-on-surface">{event.title}</h3>
                                  </div>

                                  <div className="flex flex-wrap gap-2 text-xs text-on-surface-variant">
                                    {event.location && (
                                      <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">📍 {event.location}</span>
                                    )}
                                    <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">السعة {capacity ?? 'غير محددة'}</span>
                                    <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">المسجلون {registered}</span>
                                    {registrationRate != null && (
                                      <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">الإشغال {registrationRate}%</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex gap-2 self-start">
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(event)}
                                    className="rounded-full border border-surface-variant bg-surface px-4 py-2 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20"
                                  >
                                    تحرير
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(eventId)}
                                    className="rounded-full border border-error bg-error-container px-4 py-2 text-sm font-bold text-on-error-container transition hover:opacity-90"
                                  >
                                    حذف
                                  </button>
                                </div>
                              </div>

                              {event.description && (
                                <p className="mt-4 max-w-3xl text-sm leading-7 text-on-surface-variant line-clamp-3">
                                  {event.description}
                                </p>
                              )}

                              <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-variant/30">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-secondary to-primary"
                                  style={{ width: `${Math.min(Math.max(registrationRate ?? 0, 0), 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6 sticky top-6 self-start">
            <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 pointer-events-none">
                <PatternDiamondRepeat />
              </div>
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-primary">المحرر السريع</h2>
                    <p className="mt-1 text-xs text-on-surface-variant">أنشئ أو حرر المناسبة من لوحة واحدة.</p>
                  </div>
                  <span className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-bold text-secondary">
                    {editingId ? 'تحرير' : 'إنشاء'}
                  </span>
                </div>

                <div className="rounded-3xl border border-surface-variant bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-on-surface-variant">المناسبة المميزة</p>
                      <p className="mt-1 text-lg font-black text-on-surface">{featuredEvent?.title || 'لا توجد مناسبة حالياً'}</p>
                    </div>
                    {featuredEvent && (
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${statusStyleMap[featuredEvent.status || 'UPCOMING']}`}>
                        {statusLabelMap[featuredEvent.status || 'UPCOMING']}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-on-surface-variant">
                    {featuredEvent ? formatEventDate(featuredEvent.eventDate) : 'سيظهر أول حدث قادم هنا ليسهل التتبع.'}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-surface-variant bg-surface-container-lowest p-3">
                      <p className="text-[11px] text-on-surface-variant">إجمالي الصور</p>
                      <p className="mt-1 text-xl font-black text-primary">{stats.images}</p>
                    </div>
                    <div className="rounded-2xl border border-surface-variant bg-surface-container-lowest p-3">
                      <p className="text-[11px] text-on-surface-variant">منتهية</p>
                      <p className="mt-1 text-xl font-black text-primary">{stats.completed}</p>
                    </div>
                  </div>
                </div>

                {showForm ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-on-surface">عنوان المناسبة *</label>
                      <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-secondary"
                        placeholder="حفل الزفاف"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-on-surface">التاريخ *</label>
                        <input
                          type="date"
                          name="eventDate"
                          value={formData.eventDate}
                          onChange={handleInputChange}
                          className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-secondary"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-on-surface">الحالة</label>
                        <select
                          name="status"
                          value={formData.status}
                          onChange={handleInputChange}
                          className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-secondary"
                        >
                          <option value="UPCOMING">قادمة</option>
                          <option value="ONGOING">جارية</option>
                          <option value="COMPLETED">منتهية</option>
                          <option value="CANCELLED">ملغاة</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-on-surface">الموقع</label>
                        <input
                          type="text"
                          name="location"
                          value={formData.location}
                          onChange={handleInputChange}
                          className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-secondary"
                          placeholder="الرياض، المملكة العربية السعودية"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-on-surface">خريطة جوجل</label>
                        <input
                          type="url"
                          name="googleMapsUrl"
                          value={formData.googleMapsUrl}
                          onChange={handleInputChange}
                          className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-secondary"
                          placeholder="https://maps.google.com/..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-on-surface">السعة</label>
                        <input
                          type="number"
                          name="capacity"
                          value={formData.capacity}
                          onChange={handleInputChange}
                          min="0"
                          className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-secondary"
                          placeholder="500"
                        />
                      </div>
                      <div className="flex items-end rounded-2xl border border-surface-variant bg-surface px-4 py-3">
                        <label className="flex items-center gap-3 text-sm font-medium text-on-surface">
                          <input
                            type="checkbox"
                            name="registrationRequired"
                            checked={formData.registrationRequired}
                            onChange={handleInputChange}
                            className="h-4 w-4 rounded border-surface-variant"
                          />
                          التسجيل مطلوب
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-on-surface">الوصف</label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows={5}
                        className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-secondary resize-none"
                        placeholder="اكتب وصفاً مختصراً للمناسبة..."
                      />
                    </div>

                    <div className="space-y-3 rounded-3xl border border-dashed border-surface-variant bg-surface p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition hover:opacity-95">
                          <span>{uploadingImages ? 'جارٍ الرفع...' : 'رفع الصور'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              const files = event.target.files ? Array.from(event.target.files) : [];
                              handleImageUpload(files);
                              event.target.value = '';
                            }}
                            disabled={uploadingImages}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setUploadedImages([])}
                          disabled={uploadedImages.length === 0}
                          className="rounded-full border border-surface-variant bg-surface px-4 py-2.5 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20 disabled:opacity-50"
                        >
                          مسح الصور
                        </button>
                      </div>

                      <p className="text-xs text-on-surface-variant">يمكن رفع أكثر من صورة، والصورة الأولى تُستخدم كصورة رئيسية.</p>

                      {uploadedImages.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {uploadedImages.map((image, index) => (
                            <div key={`${image}-${index}`} className="overflow-hidden rounded-2xl border border-surface-variant bg-surface-container-lowest">
                              <img src={image} alt={`event-${index}`} className="h-24 w-full object-cover" />
                              <div className="flex items-center justify-between gap-2 px-3 py-2 text-[10px] text-on-surface-variant">
                                <span>{index === 0 ? 'رئيسية' : `صورة ${index + 1}`}</span>
                                <button
                                  type="button"
                                  onClick={() => setUploadedImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                                  className="rounded-full bg-error-container px-2 py-1 text-on-error-container transition hover:opacity-90"
                                >
                                  حذف
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-surface-variant bg-surface-container-lowest p-4 text-center text-xs text-on-surface-variant">
                          لا توجد صور مرفوعة بعد.
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          resetForm();
                          setShowForm(false);
                        }}
                        className="flex-1 rounded-full border border-surface-variant bg-surface px-4 py-3 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 rounded-full bg-secondary px-4 py-3 text-sm font-bold text-on-secondary transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? 'جارٍ الحفظ...' : editingId ? 'تحديث المناسبة' : 'حفظ المناسبة'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 rounded-3xl border border-surface-variant bg-surface p-5">
                    <div>
                      <h3 className="text-base font-bold text-on-surface">لوحة الإضافة السريعة</h3>
                      <p className="mt-1 text-sm leading-7 text-on-surface-variant">
                        افتح المحرر لبدء إضافة مناسبة جديدة أو اختر بطاقة من القائمة لتحريرها فوراً.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-surface-variant bg-surface-container-lowest p-3">
                        <p className="text-[11px] text-on-surface-variant">قادمة</p>
                        <p className="mt-1 text-xl font-black text-primary">{stats.upcoming}</p>
                      </div>
                      <div className="rounded-2xl border border-surface-variant bg-surface-container-lowest p-3">
                        <p className="text-[11px] text-on-surface-variant">الصور</p>
                        <p className="mt-1 text-xl font-black text-primary">{stats.images}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={openCreateForm}
                      className="w-full rounded-full bg-primary px-4 py-3 text-sm font-bold text-on-primary transition hover:opacity-95"
                    >
                      إنشاء مناسبة
                    </button>
                  </div>
                )}
              </div>
            </div>

            {showForm && editingId && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="w-full rounded-full border border-surface-variant bg-surface px-4 py-3 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20"
              >
                إغلاق المحرر
              </button>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}