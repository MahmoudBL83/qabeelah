import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import useTenantPrefix from '../../hooks/useTenantPrefix';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { UserRole } from '@qabila/types';
import { formatDateWithHijri } from '../../lib/date';
import { PatternDiamondLines, PatternDiamondGrid, PatternDiamondRepeat } from '../../components/Patterns';
import Skeleton from '../../components/ui/Skeleton';

type AdminMetrics = {
  totalMembers: number;
  pendingRequests: number;
  qabilaAdminCount: number;
  subAdminCount?: number;
  upcomingEvents: number;

};

type AdminAnalytics = {
  overview: {
    totalMembers: number;
    livingMembers: number;
    deceasedMembers: number;
    pendingRequests: number;
    adminCount: number;
    upcomingEvents: number;
    totalEvents: number;
    totalEventRegistrations: number;
    avgAttendancePerEvent: number;
    maxGenerations: number;
  };
  activityByDay: Array<{ date: string; count: number }>;
  topActivityTypes: Array<{ type: string; count: number }>;
  memberGrowth: Array<{ month: string; label: string; newMembers: number; totalMembers: number }>;
  eventAttendance: Array<{
    eventId: string;
    title: string;
    eventDate: string;
    registeredCount: number;
    capacity: number | null;
    occupancyRate: number | null;
    status: string;
  }>;
};

type JoinRequest = {
  _id: string;
  fullName: string;
  email: string;
  relationship?: string;
  createdAt: string;
};

const normalizeCustomDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/g, '')
    .replace(/\.$/g, '');

const isValidCustomDomain = (value: string) =>
  /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(value) && !value.includes('..') && !value.endsWith('.qabila.com') && value !== 'qabila.com';

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { tenantPrefix, tenantSlug: initialTenantSlug } = useTenantPrefix();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [recentRequests, setRecentRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reminderRunning, setReminderRunning] = useState(false);
  const [tenantName, setTenantName] = useState('العائلة');
  const [tenantArabicName, setTenantArabicName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [savedCustomDomain, setSavedCustomDomain] = useState('');
  const [domainVerified, setDomainVerified] = useState(false);
  const [verificationInstructions, setVerificationInstructions] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  // Occasions management
  const [showOccasionModal, setShowOccasionModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingOccasion, setEditingOccasion] = useState<any>(null);
  const [occasionForm, setOccasionForm] = useState({
    title: '',
    eventDate: '',
    description: '',
    location: '',
    googleMapsUrl: '',
    mainImage: '',
    images: [] as string[],
    capacity: '',
    registrationRequired: false,
  });
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [dragSavedImageUrl, setDragSavedImageUrl] = useState<string | null>(null);
  const [dragPreviewIndex, setDragPreviewIndex] = useState<number | null>(null);
  const [savingOccasion, setSavingOccasion] = useState(false);

  const moveArrayItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
    if (fromIndex === toIndex) return items;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return items;

    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const seedResult = await apiClient.seedDatabase(initialTenantSlug || user?.tenantSlug);
        if (seedResult.tenantId) {
          setTenantId(seedResult.tenantId);
          const [metricsData, requestsData, tenant] = await Promise.all([
            apiClient.getAdminMetrics(seedResult.tenantId),
            apiClient.getPendingJoinRequests(seedResult.tenantId, 6),
            apiClient.getTenant(seedResult.tenantId)
          ]);
          const branchManagers = user?.role === UserRole.QABILA_ADMIN
            ? await apiClient.getBranchManagers(seedResult.tenantId)
            : [];

          setMetrics(
            user?.role === UserRole.QABILA_ADMIN
              ? { ...metricsData, subAdminCount: branchManagers.length }
              : metricsData
          );
          setRecentRequests(requestsData);
          setTenantName(tenant?.name || 'العائلة');
          setTenantArabicName(tenant?.arabicName || '');
          setTenantSlug(tenant?.subdomain || '');
          setCustomDomain(tenant?.customDomain || '');
          setSavedCustomDomain(tenant?.customDomain || '');
          setDomainVerified(Boolean(tenant?.domainVerified));
          try {
            const analyticsData = await apiClient.getAdminAnalytics(seedResult.tenantId);
            setAnalytics(analyticsData);
          } catch (analyticsErr) {
            console.error('Failed to fetch analytics:', analyticsErr);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [initialTenantSlug, user?.tenantSlug]);

  const handleApprove = async (requestId: string) => {
    if (user?.role !== UserRole.QABILA_ADMIN) {
      setActionError('لا تملك الصلاحية لاعتماد الطلبات.');
      return;
    }

    try {
      await apiClient.updateJoinRequestStatus(requestId, 'approved', tenantId);
      setRecentRequests((prev) => prev.filter((request) => request._id !== requestId));
      setMetrics((prev) =>
        prev ? { ...prev, pendingRequests: Math.max(prev.pendingRequests - 1, 0) } : prev
      );
      setActionError('');
      toast.show('تم اعتماد الطلب بنجاح', 'success');
    } catch (err) {
      console.error(err);
      setActionError('تعذر اعتماد الطلب حالياً.');
      toast.show('فشل اعتماد الطلب', 'error');
    }
  };

  const normalizedCustomDomain = normalizeCustomDomain(customDomain);
  const tenantTreeLink = normalizedCustomDomain && domainVerified
    ? `https://${normalizedCustomDomain}/tree`
    : tenantSlug
      ? `/${tenantSlug}/tree`
      : '/tree';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const isCustomDomainOrigin = Boolean(normalizedCustomDomain && currentHost === normalizedCustomDomain);

  const handleSaveTenant = async () => {
    if (!tenantId) return;
    const normalizedDomain = normalizeCustomDomain(customDomain);
    if (normalizedDomain && !isValidCustomDomain(normalizedDomain)) {
      setActionError('الدومين غير صالح. استخدم نطاقًا حقيقيًا مثل family.example.com بدون http أو مسارات.');
      toast.show('الدومين غير صالح', 'error');
      return;
    }

    setTenantSaving(true);
    try {
      const updated = await apiClient.updateTenant(tenantId, {
        arabicName: tenantArabicName.trim() || undefined,
        customDomain: normalizedDomain || undefined
      });
      setTenantArabicName(updated.arabicName || '');
      setTenantSlug(updated.subdomain || '');
      setCustomDomain(updated.customDomain || '');
      setSavedCustomDomain(updated.customDomain || '');
      setDomainVerified(Boolean(updated.domainVerified));
      if ((updated.customDomain || '') !== savedCustomDomain) {
        setVerificationInstructions(null);
      }
      setActionError('');
      toast.show('تم حفظ بيانات العائلة بنجاح', 'success');
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'تعذر حفظ رابط العائلة حالياً.';
      setActionError(message);
      toast.show(message, 'error');
    } finally {
      setTenantSaving(false);
    }
  };

  const handleStartVerification = async () => {
    if (!tenantId) return;
    const token = localStorage.getItem('qabila_token');
    if (!token) {
      toast.show('يجب تسجيل الدخول قبل بدء التحقق', 'error');
      return;
    }
    setVerifying(true);
    try {
      const normalizedDomain = normalizeCustomDomain(customDomain);
      if (!normalizedDomain || !isValidCustomDomain(normalizedDomain)) {
        toast.show('اكتب دومينًا صالحًا قبل بدء التحقق', 'error');
        setVerifying(false);
        return;
      }

      // If domain changed locally but not saved, save it first
      if (normalizedDomain !== savedCustomDomain.trim()) {
        try {
          const updated = await apiClient.updateTenant(tenantId, {
            customDomain: normalizedDomain
          });
          setCustomDomain(updated.customDomain || '');
          setSavedCustomDomain(updated.customDomain || '');
          setDomainVerified(Boolean(updated.domainVerified));
          setVerificationInstructions(null);
        } catch (saveErr) {
          console.error('Failed to save domain before verification:', saveErr);
          toast.show(saveErr instanceof Error ? saveErr.message : 'فشل حفظ الدومين. حاول مرة أخرى.', 'error');
          setVerifying(false);
          return;
        }
      }

      const res = await apiClient.startDomainVerification(tenantId);
      setVerificationInstructions(res.instructions || null);
      toast.show('تم إنشاء رمز التحقق. اتبع التعليمات.', 'success');
    } catch (err) {
      console.error(err);
      // If unauthorized, prompt re-login
      if ((err as any)?.status === 401) {
        toast.show('انتهت صلاحية الجلسة — سجّل الدخول مجدداً', 'error');
      } else {
        toast.show('فشل بدء التحقق', 'error');
      }
    } finally {
      setVerifying(false);
    }
  };

    // Start verification directly from the tenant admin dashboard.
    const startVerificationFromUi = async () => {
      await handleStartVerification();
    };

  // Occasion handlers
  const clearOccasionDraftImages = () => {
    imagePreviews.forEach((previewUrl) => {
      if (previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (error) {
          console.error('Failed to revoke preview URL', error);
        }
      }
    });
    setSelectedImageFiles([]);
    setImagePreviews([]);
    setDragSavedImageUrl(null);
    setDragPreviewIndex(null);
  };

  const handleOpenOccasionModal = (occasion?: any) => {
    clearOccasionDraftImages();
    if (occasion) {
      const existingImages = Array.isArray(occasion.images)
        ? occasion.images.filter((image: string) => typeof image === 'string' && image.trim())
        : [];
      const normalizedMainImage =
        (typeof occasion.mainImage === 'string' && occasion.mainImage.trim()) ||
        existingImages[0] ||
        '';
      const normalizedImages = Array.from(
        new Set([...(normalizedMainImage ? [normalizedMainImage] : []), ...existingImages])
      );

      setEditingOccasion(occasion);
      setOccasionForm({
        title: occasion.title || '',
        eventDate: occasion.eventDate ? new Date(occasion.eventDate).toISOString().split('T')[0] : '',
        description: occasion.description || '',
        location: occasion.location || '',
        googleMapsUrl: occasion.googleMapsUrl || '',
        mainImage: normalizedMainImage,
        images: normalizedImages,
        capacity: occasion.capacity ? String(occasion.capacity) : '',
        registrationRequired: occasion.registrationRequired || false,
      });
    } else {
      setEditingOccasion(null);
      setOccasionForm({ 
        title: '', 
        eventDate: '', 
        description: '', 
        location: '',
        googleMapsUrl: '',
        mainImage: '',
        images: [],
        capacity: '',
        registrationRequired: false,
      });
    }
    setShowOccasionModal(true);
  };

  const handleSaveOccasion = async () => {
    if (!tenantId || !occasionForm.title.trim() || !occasionForm.eventDate) {
      toast.show('يرجى ملء جميع الحقول المطلوبة', 'error');
      return;
    }

    setSavingOccasion(true);
    try {
      // Upload any newly selected images and merge with existing gallery images.
      let images = Array.from(new Set((occasionForm.images || []).filter(Boolean)));
      let mainImageCandidate = (occasionForm.mainImage || '').trim();
      const uploadedByPreview = new Map<string, string>();

      if (selectedImageFiles && selectedImageFiles.length > 0) {
        try {
          const uploaded: string[] = [];
          for (let i = 0; i < selectedImageFiles.length; i++) {
            const file = selectedImageFiles[i];
            const res = await apiClient.uploadFile(file);
            const uploadedUrl = res && (res.url || res.path || res.fileUrl) ? (res.url || res.path || res.fileUrl) : undefined;
            if (uploadedUrl) {
              uploaded.push(uploadedUrl);
              if (imagePreviews[i]) uploadedByPreview.set(imagePreviews[i], uploadedUrl);
            }
          }

          images = Array.from(new Set([...images, ...uploaded]));
        } catch (imgErr) {
          console.error('Image upload failed', imgErr);
          toast.show('فشل رفع الصور — سيتم حفظ المناسبة بدون بعض الصور', 'error');
        }
      }

      if (mainImageCandidate && uploadedByPreview.has(mainImageCandidate)) {
        mainImageCandidate = uploadedByPreview.get(mainImageCandidate) || mainImageCandidate;
      }

      if (!mainImageCandidate && images.length > 0) {
        mainImageCandidate = images[0];
      }

      if (mainImageCandidate && !images.includes(mainImageCandidate)) {
        images = [mainImageCandidate, ...images];
      }

      images = Array.from(new Set(images.filter(Boolean)));

      const payload: any = {
        title: occasionForm.title.trim(),
        eventDate: new Date(occasionForm.eventDate).toISOString(),
        description: occasionForm.description.trim() || undefined,
        location: occasionForm.location.trim() || undefined,
        googleMapsUrl: occasionForm.googleMapsUrl.trim() || undefined,
        mainImage: mainImageCandidate || undefined,
        images: images.length ? images : undefined,
        capacity: occasionForm.capacity ? parseInt(occasionForm.capacity, 10) : undefined,
        registrationRequired: occasionForm.registrationRequired,
      };

      if (editingOccasion) {
        await apiClient.updateEvent(editingOccasion._id, tenantId, payload);
        toast.show('تم تحديث المناسبة بنجاح', 'success');
      } else {
        await apiClient.createEvent({ ...payload, tenantId });
        toast.show('تم إنشاء المناسبة بنجاح', 'success');
      }

      setShowOccasionModal(false);
      setOccasionForm({ 
        title: '', 
        eventDate: '', 
        description: '', 
        location: '',
        googleMapsUrl: '',
        mainImage: '',
        images: [],
        capacity: '',
        registrationRequired: false,
      });
      clearOccasionDraftImages();
      // Refresh the page to show new/updated event
      window.location.reload();
    } catch (err) {
      console.error(err);
      toast.show('فشل حفظ المناسبة', 'error');
    } finally {
      setSavingOccasion(false);
    }
  };

  const handleDeleteOccasion = async () => {
    if (!editingOccasion?._id || !tenantId) return;
    setSavingOccasion(true);
    try {
      await apiClient.deleteEvent(editingOccasion._id, tenantId);
      toast.show('تم حذف المناسبة بنجاح', 'success');
      setShowDeleteModal(false);
      setEditingOccasion(null);
      setShowOccasionModal(false);
      window.location.reload();
    } catch (err) {
      console.error(err);
      toast.show('فشل حذف المناسبة', 'error');
    } finally {
      setSavingOccasion(false);
    }
  };

  const handleConfirmVerification = async (method: 'dns' | 'http' = 'dns') => {
    if (!tenantId) return;
    setVerifying(true);
    try {
      await apiClient.confirmDomainVerification(tenantId, method);
      setDomainVerified(true);
      setVerificationInstructions(null);
      toast.show('تم تأكيد الدومين', 'success');
    } catch (err) {
      console.error(err);
      if ((err as any)?.status === 401) {
        toast.show('انتهت صلاحية الجلسة — سجّل الدخول مجدداً', 'error');
      } else {
        toast.show('فشل التحقق. جرّب طريقة HTTP أو تأكد من سجل DNS.', 'error');
      }
    } finally {
      setVerifying(false);
    }
  };

  const formatDate = (isoDate: string) => formatDateWithHijri(isoDate).combined;

  const getFirstNameFromFullName = (name?: string) => {
    const trimmed = (name || '').trim();
    return trimmed ? trimmed.split(/\s+/)[0] : '—';
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]);
    return initials.join('') || '؟';
  };

  const handleExportCsv = async () => {
    if (!tenantId) return;

    setExporting(true);
    try {
      const csvBlob = await apiClient.exportAdminAnalyticsCsv(tenantId);
      const downloadUrl = window.URL.createObjectURL(csvBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `qabila-analytics-${tenantSlug || tenantId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.show('تم تصدير تقرير CSV بنجاح', 'success');
    } catch (error) {
      console.error(error);
      toast.show('فشل تصدير CSV', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = () => {
    window.print();
    toast.show('استخدم حفظ كـ PDF من نافذة الطباعة', 'success');
  };

  const handleRunRemindersOnce = async () => {
    if (!tenantId) return;

    setReminderRunning(true);
    try {
      const result = await apiClient.runOneShotReminders(tenantId);
      toast.show(
        `تم تشغيل التذكيرات: ${result.eventsProcessed || 0} حدث، ${result.emailsAttempted || 0} محاولة إرسال`,
        'success'
      );
    } catch (error) {
      console.error(error);
      toast.show('فشل تشغيل دورة التذكيرات', 'error');
    } finally {
      setReminderRunning(false);
    }
  };

  const statusMeta: Record<string, { label: string; className: string }> = {
    UPCOMING: { label: 'قادمة', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    ONGOING: { label: 'جارية', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    COMPLETED: { label: 'منتهية', className: 'bg-slate-200 text-slate-700 border-slate-300' },
    CANCELLED: { label: 'ملغاة', className: 'bg-red-100 text-red-700 border-red-200' },
  };

  const overviewCards = [
    {
      label: 'إجمالي الأعضاء',
      value: metrics?.totalMembers ?? 0,
      hint: 'جميع الأعضاء المسجلين',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-5.33 0-8 2.67-8 6v1h16v-1c0-3.33-2.67-6-8-6Z" />
        </svg>
      ),
      tone: 'text-primary'
    },
    {
      label: 'طلبات معلقة',
      value: metrics?.pendingRequests ?? 0,
      hint: 'بانتظار المراجعة',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 10.59 3.3 3.29-1.41 1.42L11 13V7h2Z" />
        </svg>
      ),
      tone: 'text-error'
    },
    {
      label: 'مدراء الفروع',
      value: metrics?.subAdminCount ?? 0,
      hint: 'إشراف على الفروع',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4s-3 1.57-3 3.5S14.34 11 16 11Zm-8 0c1.66 0 3-1.57 3-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11Zm0 2c-2.67 0-8 1.34-8 4v3h10v-3c0-1.14.4-2.15 1.05-3A12.94 12.94 0 0 0 8 13Zm8 0c-.7 0-1.53.08-2.37.23A5.5 5.5 0 0 1 16 16v4h8v-3c0-2.66-5.33-4-8-4Z" />
        </svg>
      ),
      tone: 'text-secondary'
    },
    {
      label: 'أحداث قادمة',
      value: metrics?.upcomingEvents ?? 0,
      hint: 'الفعاليات التالية',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm13 6H4v12h16V8ZM7 11h4v4H7v-4Z" />
        </svg>
      ),
      tone: 'text-primary'
    },
  ];

  const eventAttendance = analytics?.eventAttendance || [];
  const topActivityTypes = analytics?.topActivityTypes || [];

  return (
    <AdminLayout>
      {/* Logo removed from dashboard per request (logo moved to sidebar/navbar) */}

      <div className="mb-8 overflow-hidden rounded-[28px] border border-surface-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-surface shadow-heritage-sm relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <PatternDiamondGrid />
        </div>
        <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-6 p-6 lg:p-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant">
              <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">لوحة الإدارة</span>
              <span className="rounded-full border border-surface-variant bg-surface px-3 py-1">{tenantArabicName || tenantName}</span>
              <span className="rounded-full border border-surface-variant bg-surface px-3 py-1" dir="ltr">{tenantSlug || 'tree'}</span>
            </div>
            <div>
              <h2 className="text-3xl lg:text-4xl font-black text-primary leading-tight">لوحة تحكم {tenantArabicName || tenantName}</h2>
              <p className="mt-3 max-w-2xl text-sm lg:text-base leading-7 text-on-surface-variant">
                مركز مراقبة بسيط وسريع لإدارة الأعضاء والطلبات والمناسبات. كل شيء هنا مصمم ليعطيك صورة واضحة بدل الجداول الثقيلة.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exporting || loading}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition hover:opacity-95 disabled:opacity-60"
              >
                <span>{exporting ? 'جارٍ التصدير...' : 'تصدير CSV'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-2 rounded-full border border-surface-variant bg-surface px-4 py-2.5 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20"
              >
                تصدير PDF
              </button>
              <button
                type="button"
                onClick={handleRunRemindersOnce}
                disabled={reminderRunning || loading}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-bold text-on-secondary transition hover:opacity-95 disabled:opacity-60"
              >
                <span>{reminderRunning ? 'جارٍ التشغيل...' : 'تشغيل التذكيرات'}</span>
              </button>
            </div>
          </div>

            <div className="grid gap-3 sm:grid-cols-2">
            {overviewCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-surface-variant bg-surface/90 p-4 shadow-sm backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-on-surface-variant">{card.label}</p>
                    <p className={`mt-1 text-3xl font-black ${card.tone}`}>
                      {loading ? <Skeleton className="inline-block h-8 w-28 rounded-md" aria-label="loading-metric" /> : card.value.toLocaleString('ar-SA')}
                    </p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tone === 'text-error' ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'}`}>
                    {card.icon}
                  </div>
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">{card.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="mb-6 rounded-2xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container shadow-sm">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-8">
        <div className="xl:col-span-7 space-y-6">
          

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-4 pointer-events-none">
                <PatternDiamondLines />
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-primary">إحصاءات شجرة العائلة</h3>
                    <p className="text-xs text-on-surface-variant mt-1">نظرة عامة على البنية السكانية</p>
                  </div>
                  <span className="rounded-full border border-surface-variant bg-surface px-3 py-1 text-xs text-on-surface-variant">{analytics?.overview.maxGenerations ?? 0} أجيال</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-surface-variant bg-surface p-4">
                    <p className="text-on-surface-variant text-xs">الأحياء</p>
                    <p className="mt-1 text-xl font-black text-primary">{analytics?.overview.livingMembers ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-surface-variant bg-surface p-4">
                    <p className="text-on-surface-variant text-xs">المتوفون</p>
                    <p className="mt-1 text-xl font-black text-primary">{analytics?.overview.deceasedMembers ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-surface-variant bg-surface p-4">
                    <p className="text-on-surface-variant text-xs">الأحداث القادمة</p>
                    <p className="mt-1 text-xl font-black text-primary">{analytics?.overview.upcomingEvents ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-surface-variant bg-surface p-4">
                    <p className="text-on-surface-variant text-xs">إجمالي الفعاليات</p>
                    <p className="mt-1 text-xl font-black text-primary">{analytics?.overview.totalEvents ?? 0}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-4 pointer-events-none">
                <PatternDiamondRepeat />
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-primary">أكثر أنواع النشاط</h3>
                    <p className="text-xs text-on-surface-variant mt-1">أهم ما يحدث داخل النظام</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {topActivityTypes.length === 0 ? (
                    <p className="text-on-surface-variant text-sm rounded-2xl border border-dashed border-surface-variant bg-surface p-4 text-center">لا توجد بيانات نشاط كافية حالياً.</p>
                  ) : (
                    topActivityTypes.map((item) => (
                      <div key={item.type} className="flex items-center justify-between rounded-2xl border border-surface-variant px-4 py-3 bg-surface">
                        <span className="text-on-surface font-medium">{item.type}</span>
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 px-2 font-black text-primary">{item.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-variant bg-surface/70">
              <div>
                <h3 className="font-bold text-primary">تتبع حضور الفعاليات</h3>
                <p className="text-xs text-on-surface-variant mt-1">آخر الأحداث مع نسبة الإشغال</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant">{eventAttendance.length} فعالية</span>
                {user?.role === UserRole.QABILA_ADMIN && (
                  <button
                    onClick={() => handleOpenOccasionModal()}
                    className="rounded-full bg-primary px-3 py-2 text-xs font-bold text-on-primary transition hover:opacity-95"
                  >
                    + مناسبة جديدة
                  </button>
                )}
              </div>
            </div>

            {eventAttendance.length === 0 ? (
              <div className="p-6 text-center text-on-surface-variant">لا توجد فعاليات كافية للتحليل.</div>
            ) : (
              <div className="divide-y divide-surface-variant/50">
                {eventAttendance.map((event) => {
                  const status = statusMeta[event.status] || statusMeta.UPCOMING;
                  const occupancy = event.occupancyRate ?? 0;

                  return (
                    <div key={event.eventId} className="p-5 hover:bg-surface/50 transition-colors cursor-pointer" onClick={() => user?.role === UserRole.QABILA_ADMIN && handleOpenOccasionModal(event)}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-on-surface">{event.title}</h4>
                            <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${status.className}`}>{status.label}</span>
                          </div>
                          <p className="text-xs text-on-surface-variant">{formatDate(event.eventDate)}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-3 lg:min-w-[340px]">
                          <div className="rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-center">
                            <div className="text-[11px] text-on-surface-variant">المسجلون</div>
                            <div className="mt-1 text-lg font-black text-primary">{event.registeredCount}</div>
                          </div>
                          <div className="rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-center">
                            <div className="text-[11px] text-on-surface-variant">السعة</div>
                            <div className="mt-1 text-lg font-black text-primary">{event.capacity ?? '—'}</div>
                          </div>
                          <div className="rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-center">
                            <div className="text-[11px] text-on-surface-variant">الإشغال</div>
                            <div className="mt-1 text-lg font-black text-secondary">{event.occupancyRate == null ? '—' : `${event.occupancyRate}%`}</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-variant/30">
                        <div className="h-full rounded-full bg-gradient-to-r from-secondary to-primary" style={{ width: `${Math.min(Math.max(occupancy, 0), 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="xl:col-span-5 space-y-6">
          <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm relative overflow-hidden">
            <div className="absolute inset-0 opacity-5 pointer-events-none">
              <PatternDiamondGrid />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-primary">بيانات العائلة</h3>
                  <p className="text-xs text-on-surface-variant mt-1">تعديل الهوية العربية وربط دومين كامل للعائلة</p>
                </div>
                <span className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-bold text-secondary" dir="ltr">{tenantTreeLink}</span>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">اسم العائلة (عربي)</label>
                  <input
                    value={tenantArabicName}
                    onChange={(event) => setTenantArabicName(event.target.value)}
                    className="w-full rounded-2xl border border-surface-variant bg-surface p-3 text-sm outline-none transition focus:border-secondary"
                    placeholder="عائلة الأحمدي"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">رمز العائلة الداخلي</label>
                  <div className="rounded-2xl border border-surface-variant bg-surface-container-low p-3 text-sm text-on-surface" dir="ltr">
                    {tenantSlug || 'غير محدد'}
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    هذا الرمز ثابت بعد إنشاء العائلة ويُستخدم داخليًا فقط. الرابط العام يكون عبر الدومين الكامل بعد التحقق.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">الدومين الكامل للعائلة</label>
                  <input
                    value={customDomain}
                    onChange={(event) => {
                      const nextDomain = normalizeCustomDomain(event.target.value);
                      setCustomDomain(nextDomain);
                      if (nextDomain !== savedCustomDomain) {
                        setDomainVerified(false);
                        setVerificationInstructions(null);
                      }
                    }}
                    disabled={!(user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUPER_ADMIN)}
                    className="w-full rounded-2xl border border-surface-variant bg-surface p-3 text-sm outline-none transition focus:border-secondary"
                    placeholder="family.example.com"
                    dir="ltr"
                  />
                  <p className="mt-1 text-xs text-on-surface-variant">
                    اكتب دومينًا كاملًا تملكه، مثل <span dir="ltr">aljazi.com</span>. لا يتم إنشاء Subdomain على خوادمنا.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    {domainVerified ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">مؤكد</span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">غير مؤكد</span>
                    )}
                  </div>
                  <div>
                      {(user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUPER_ADMIN) && !domainVerified && (
                      <button
                        type="button"
                        onClick={startVerificationFromUi}
                        disabled={verifying || !customDomain}
                        className="rounded-full border border-surface-variant bg-surface px-3 py-2 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20"
                      >
                        {verifying ? 'جارٍ...' : 'بدء التحقق'}
                      </button>
                    )}
                  </div>
                </div>
                {customDomain && (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${isCustomDomainOrigin ? 'border-secondary/30 bg-secondary/10 text-on-surface' : 'border-surface-variant bg-surface text-on-surface-variant'}`}>
                    {isCustomDomainOrigin ? (
                      <div>
                        أنت الآن على الدومين المخصص للعائلة. يمكنك إدارة الموقع والتحقق من الدومين من هنا مباشرة، بدون الرجوع إلى مسار المنصة.
                      </div>
                    ) : (
                      <div>
                        <div className="font-semibold mb-2">ربط الدومين المخصص</div>
                        <ol className="list-decimal pr-4 space-y-2 text-xs text-on-surface-variant">
                          <li>اكتب الدومين الذي تملكه مثل <span dir="ltr">aljazi.com</span>.</li>
                          <li>اضغط <span className="font-semibold">بدء التحقق</span> للحصول على رمز التحقق الخاص بهذا الدومين.</li>
                          <li>من لوحة DNS عند مزود النطاق، أضف سجل TXT بالقيمة التي ستظهر لك، أو ضع ملف التحقق في: <code>/.well-known/qabila-domain-verification.txt</code>.</li>
                          <li>بعد إضافة TXT أو الملف، اضغط <span className="font-semibold">تحقق عبر DNS</span> أو <span className="font-semibold">تحقق عبر HTTP</span>.</li>
                        </ol>
                        <div className="mt-2 text-xs">
                          بعد نجاح التحقق، سيُفتح موقع العائلة على دومينك أنت، مثل <span dir="ltr">https://aljazi.com/tree</span>. رمز العائلة يبقى داخليًا ولا نطلب Subdomain على نطاق المنصة.
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveTenant}
                    disabled={tenantSaving || !(user?.role === UserRole.QABILA_ADMIN || user?.role === UserRole.SUPER_ADMIN)}
                    className="rounded-full bg-secondary px-4 py-2.5 text-sm font-bold text-on-secondary transition disabled:opacity-50"
                  >
                    {tenantSaving ? 'جارٍ الحفظ...' : 'حفظ البيانات'}
                  </button>
                  <a href={tenantTreeLink} target="_blank" rel="noreferrer" className="rounded-full border border-surface-variant bg-surface px-4 py-2.5 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20">
                    فتح الرابط
                  </a>
                </div>
                {verificationInstructions && (
                  <div className="mt-3 rounded-2xl border border-surface-variant bg-surface p-3 text-sm">
                    <div className="mb-2 font-semibold">تعليمات التحقق</div>
                    <div className="text-xs text-on-surface-variant mb-2">
                      <div>TXT: {verificationInstructions.dns}</div>
                      <div>HTTP: {verificationInstructions.http}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleConfirmVerification('dns')} disabled={verifying} className="rounded-full bg-primary px-3 py-2 text-sm font-bold text-on-primary">تحقق عبر DNS</button>
                      <button onClick={() => handleConfirmVerification('http')} disabled={verifying} className="rounded-full border border-surface-variant bg-surface px-3 py-2 text-sm font-bold text-on-surface">تحقق عبر HTTP</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-primary">آخر طلبات الانضمام</h3>
                <p className="text-xs text-on-surface-variant mt-1">مختصر سريع بدل الجدول الطويل</p>
              </div>
              <Link to={`${tenantPrefix}/admin/approvals`} className="text-sm font-bold text-secondary hover:underline">عرض الكل</Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`req-skel-${index}`} className="h-20 rounded-2xl" aria-label="loading-request" />
                ))}
              </div>
            ) : recentRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-surface-variant bg-surface p-5 text-center text-sm text-on-surface-variant">
                لا توجد طلبات انضمام جديدة.
              </div>
            ) : (
              <div className="space-y-3">
                {recentRequests.map((request) => (
                  <div key={request._id} className="rounded-2xl border border-surface-variant bg-surface p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary-container text-sm font-black text-on-secondary-container">
                        {getInitials(getFirstNameFromFullName(request.fullName))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-on-surface">{getFirstNameFromFullName(request.fullName)}</p>
                            <p className="truncate text-[11px] text-on-surface-variant" dir="ltr">{request.email}</p>
                          </div>
                          <span className="whitespace-nowrap rounded-full border border-surface-variant bg-surface-container-lowest px-3 py-1 text-[11px] text-on-surface-variant">
                            {formatDate(request.createdAt)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                            {request.relationship || 'غير محدد'}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className={`rounded-full px-3 py-2 text-xs font-bold transition ${
                                user?.role === UserRole.QABILA_ADMIN ? 'bg-primary text-on-primary hover:opacity-95' : 'cursor-not-allowed bg-surface-variant/30 text-on-surface-variant opacity-60'
                              }`}
                              disabled={user?.role !== UserRole.QABILA_ADMIN}
                              onClick={() => handleApprove(request._id)}
                            >
                              قبول
                            </button>
                            <Link
                              to={`${tenantPrefix}/admin/approvals?requestId=${request._id}`}
                              className="rounded-full border border-surface-variant bg-surface px-3 py-2 text-xs font-bold text-on-surface transition hover:bg-surface-variant/20"
                            >
                              تفاصيل
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Occasions Management Modal */}
      {showOccasionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => {
            if (savingOccasion) return;
            clearOccasionDraftImages();
            setShowOccasionModal(false);
          }}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] rounded-3xl border border-surface-variant bg-surface shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="relative h-full flex flex-col">
              <button
                onClick={() => {
                  if (savingOccasion) return;
                  clearOccasionDraftImages();
                  setShowOccasionModal(false);
                }}
                aria-label="إغلاق"
                className="absolute top-4 left-4 z-40 rounded-full bg-white/6 p-2 text-white hover:bg-white/10"
              >
                ×
              </button>

              <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                <div className="mb-6 flex items-start justify-between gap-4 border-b border-surface-variant pb-4">
                  <div>
                    <h3 className="text-xl font-black text-primary">
                    {editingOccasion ? 'تعديل المناسبة' : 'إنشاء مناسبة جديدة'}
                    </h3>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      صمّم تفاصيل المناسبة وأدر صورها: صورة رئيسية واحدة + معرض صور متعدد.
                    </p>
                  </div>
                  <span className="rounded-full border border-surface-variant bg-surface-container-lowest px-3 py-1 text-xs text-on-surface-variant">
                    {editingOccasion ? 'وضع التعديل' : 'وضع الإنشاء'}
                  </span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  <div className="xl:col-span-7 space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-on-surface">عنوان المناسبة *</label>
                      <input
                        type="text"
                        value={occasionForm.title}
                        onChange={(e) => setOccasionForm({ ...occasionForm, title: e.target.value })}
                        className="w-full rounded-2xl border border-surface-variant bg-surface-container px-4 py-3 text-sm outline-none transition focus:border-secondary"
                        placeholder="عنوان المناسبة"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-on-surface">التاريخ *</label>
                        <input
                          type="date"
                          value={occasionForm.eventDate}
                          onChange={(e) => setOccasionForm({ ...occasionForm, eventDate: e.target.value })}
                          className="w-full rounded-2xl border border-surface-variant bg-surface-container px-4 py-3 text-sm outline-none transition focus:border-secondary"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-on-surface">السعة (اختياري)</label>
                        <input
                          type="number"
                          value={occasionForm.capacity}
                          onChange={(e) => setOccasionForm({ ...occasionForm, capacity: e.target.value })}
                          className="w-full rounded-2xl border border-surface-variant bg-surface-container px-4 py-3 text-sm outline-none transition focus:border-secondary"
                          placeholder="عدد الأماكن المتاحة"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-on-surface">الوصف</label>
                      <textarea
                        value={occasionForm.description}
                        onChange={(e) => setOccasionForm({ ...occasionForm, description: e.target.value })}
                        className="w-full rounded-2xl border border-surface-variant bg-surface-container px-4 py-3 text-sm outline-none transition focus:border-secondary"
                        placeholder="وصف المناسبة"
                        rows={4}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-on-surface">الموقع (اختياري)</label>
                      <input
                        type="text"
                        value={occasionForm.location}
                        onChange={(e) => setOccasionForm({ ...occasionForm, location: e.target.value })}
                        className="w-full rounded-2xl border border-surface-variant bg-surface-container px-4 py-3 text-sm outline-none transition focus:border-secondary"
                        placeholder="مثال: مسجد الحي - صالة الاحتفالات"
                        dir="rtl"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-on-surface">رابط Google Maps (اختياري)</label>
                      <input
                        type="url"
                        value={occasionForm.googleMapsUrl}
                        onChange={(e) => setOccasionForm({ ...occasionForm, googleMapsUrl: e.target.value })}
                        className="w-full rounded-2xl border border-surface-variant bg-surface-container px-4 py-3 text-sm outline-none transition focus:border-secondary"
                        placeholder="https://maps.google.com/..."
                        dir="ltr"
                      />
                    </div>

                    <label className="flex items-center gap-3 rounded-2xl border border-surface-variant bg-surface-container px-4 py-3 cursor-pointer">
                      <input
                        type="checkbox"
                        id="registrationRequired"
                        checked={occasionForm.registrationRequired}
                        onChange={(e) => setOccasionForm({ ...occasionForm, registrationRequired: e.target.checked })}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm font-medium text-on-surface">
                        هل تتطلب المناسبة تسجيل الحاضرين؟
                      </span>
                    </label>
                  </div>

                  <div className="xl:col-span-5">
                    <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-4 lg:p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-base font-bold text-primary">استوديو الصور</h4>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            يدعم صورة رئيسية واحدة ومعرض صور متعدد.
                          </p>
                          <p className="mt-1 text-[11px] text-on-surface-variant">
                            اسحب الصور لإعادة ترتيبها قبل الحفظ.
                          </p>
                        </div>
                        <span className="rounded-full border border-surface-variant bg-surface px-3 py-1 text-[11px] text-on-surface-variant">
                          {occasionForm.images.length + imagePreviews.length} صورة
                        </span>
                      </div>

                      <label className="mb-3 flex min-h-[108px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-surface-variant bg-surface px-4 py-3 text-center text-sm text-on-surface-variant transition hover:border-secondary">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length === 0) return;

                            const previews = files.map((file) => URL.createObjectURL(file));
                            setSelectedImageFiles((prev) => [...prev, ...files]);
                            setImagePreviews((prev) => [...prev, ...previews]);
                            e.currentTarget.value = '';
                          }}
                        />
                        اضغط لإضافة صور متعددة
                      </label>

                      <div className="mb-3 rounded-2xl border border-surface-variant bg-surface p-3">
                        <p className="text-[11px] text-on-surface-variant mb-2">رابط صورة رئيسية مباشر (اختياري)</p>
                        <input
                          type="url"
                          value={occasionForm.mainImage}
                          onChange={(e) => setOccasionForm({ ...occasionForm, mainImage: e.target.value })}
                          className="w-full rounded-xl border border-surface-variant bg-surface-container px-3 py-2 text-xs outline-none focus:border-secondary"
                          placeholder="https://example.com/main-image.jpg"
                          dir="ltr"
                        />
                      </div>

                      {occasionForm.images.length > 0 && (
                        <div className="mb-4">
                          <p className="mb-2 text-xs font-semibold text-on-surface">الصور المحفوظة</p>
                          <div className="grid grid-cols-2 gap-2">
                            {occasionForm.images.map((url, idx) => {
                              const isMain = occasionForm.mainImage === url || (!occasionForm.mainImage && idx === 0);
                              return (
                                <div
                                  key={`${url}-${idx}`}
                                  draggable
                                  onDragStart={() => setDragSavedImageUrl(url)}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={() => {
                                    if (!dragSavedImageUrl || dragSavedImageUrl === url) return;
                                    setOccasionForm((current) => {
                                      const fromIndex = current.images.indexOf(dragSavedImageUrl);
                                      const toIndex = current.images.indexOf(url);
                                      return {
                                        ...current,
                                        images: moveArrayItem(current.images, fromIndex, toIndex),
                                      };
                                    });
                                    setDragSavedImageUrl(null);
                                  }}
                                  onDragEnd={() => setDragSavedImageUrl(null)}
                                  className={`relative h-28 overflow-hidden rounded-xl border bg-surface cursor-move ${dragSavedImageUrl === url ? 'border-secondary ring-2 ring-secondary/40' : 'border-surface-variant'}`}
                                >
                                  <img src={url} alt={`saved-${idx}`} className="h-full w-full object-cover" />
                                  {isMain && (
                                    <span className="absolute right-1 top-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-on-secondary">
                                      رئيسية
                                    </span>
                                  )}
                                  <div className="absolute inset-x-1 bottom-1 flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setOccasionForm((current) => ({
                                        ...current,
                                        mainImage: url,
                                        images: Array.from(new Set([url, ...(current.images || [])]))
                                      }))}
                                      className="flex-1 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white"
                                    >
                                      اجعلها رئيسية
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setOccasionForm((current) => {
                                        const nextImages = (current.images || []).filter((image) => image !== url);
                                        const nextMain = current.mainImage === url ? (nextImages[0] || '') : current.mainImage;
                                        return {
                                          ...current,
                                          images: nextImages,
                                          mainImage: nextMain,
                                        };
                                      })}
                                      className="rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white"
                                    >
                                      حذف
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {imagePreviews.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-on-surface">صور جديدة (قبل الحفظ)</p>
                          <div className="grid grid-cols-2 gap-2">
                            {imagePreviews.map((previewUrl, index) => {
                              const isMain = occasionForm.mainImage === previewUrl;
                              return (
                                <div
                                  key={`${previewUrl}-${index}`}
                                  draggable
                                  onDragStart={() => setDragPreviewIndex(index)}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={() => {
                                    if (dragPreviewIndex === null || dragPreviewIndex === index) return;
                                    setImagePreviews((current) => moveArrayItem(current, dragPreviewIndex, index));
                                    setSelectedImageFiles((current) => moveArrayItem(current, dragPreviewIndex, index));
                                    setDragPreviewIndex(null);
                                  }}
                                  onDragEnd={() => setDragPreviewIndex(null)}
                                  className={`relative h-28 overflow-hidden rounded-xl border bg-surface cursor-move ${dragPreviewIndex === index ? 'border-secondary ring-2 ring-secondary/40' : 'border-surface-variant'}`}
                                >
                                  <img src={previewUrl} alt={`new-${index}`} className="h-full w-full object-cover" />
                                  {isMain && (
                                    <span className="absolute right-1 top-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-on-secondary">
                                      رئيسية
                                    </span>
                                  )}
                                  <div className="absolute inset-x-1 bottom-1 flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setOccasionForm((current) => ({ ...current, mainImage: previewUrl }))}
                                      className="flex-1 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white"
                                    >
                                      اجعلها رئيسية
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const targetUrl = previewUrl;
                                        setImagePreviews((current) => current.filter((_, i) => i !== index));
                                        setSelectedImageFiles((current) => current.filter((_, i) => i !== index));
                                        try {
                                          URL.revokeObjectURL(targetUrl);
                                        } catch (error) {
                                          console.error('Failed to revoke preview URL', error);
                                        }
                                        if (occasionForm.mainImage === targetUrl) {
                                          setOccasionForm((current) => ({ ...current, mainImage: current.images[0] || '' }));
                                        }
                                      }}
                                      className="rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white"
                                    >
                                      حذف
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-surface-variant flex gap-2 justify-end bg-surface">
                {editingOccasion && (
                  <button
                    onClick={() => {
                      setShowDeleteModal(true);
                    }}
                    disabled={savingOccasion}
                    className="rounded-full border border-error bg-error-container px-4 py-2 text-sm font-bold text-on-error-container transition hover:opacity-90 disabled:opacity-50"
                  >
                    حذف
                  </button>
                )}
                <button
                  onClick={() => {
                    if (savingOccasion) return;
                    clearOccasionDraftImages();
                    setShowOccasionModal(false);
                  }}
                  disabled={savingOccasion}
                  className="rounded-full border border-surface-variant bg-surface px-4 py-2 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20 disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSaveOccasion}
                  disabled={savingOccasion}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary transition hover:opacity-95 disabled:opacity-50"
                >
                  {savingOccasion ? 'جارٍ...' : editingOccasion ? 'حفظ التعديلات' : 'إنشاء'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-surface-variant bg-surface p-6 shadow-lg">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-error">تأكيد الحذف</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              هل أنت متأكد من رغبتك في حذف المناسبة <strong>{editingOccasion?.title}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={savingOccasion}
                className="rounded-full border border-surface-variant bg-surface px-4 py-2 text-sm font-bold text-on-surface transition hover:bg-surface-variant/20 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteOccasion}
                disabled={savingOccasion}
                className="rounded-full bg-error px-4 py-2 text-sm font-bold text-on-error transition hover:opacity-95 disabled:opacity-50"
              >
                {savingOccasion ? 'جارٍ الحذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}
      
    </AdminLayout>
  );
}
