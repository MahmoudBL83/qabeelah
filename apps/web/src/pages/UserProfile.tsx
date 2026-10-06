import { useState, useEffect, useCallback } from 'react';
import TenantLayout from '../components/layout/TenantLayout';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { getUserAvatarUrl } from '../lib/user';
import { useLocation, useSearchParams } from 'react-router-dom';

const getLineageStatusMeta = (status?: string | null) => {
  switch (status) {
    case 'verified':
      return {
        label: 'موثق',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500'
      };
    case 'pending':
      return {
        label: 'قيد المراجعة',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500'
      };
    case 'rejected':
      return {
        label: 'مرفوض',
        badgeClass: 'bg-red-100 text-red-800 border-red-200',
        dotClass: 'bg-red-500'
      };
    case 'unverified':
      return {
        label: 'غير موثق',
        badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
        dotClass: 'bg-slate-500'
      };
    default:
      return {
        label: 'غير مُقدم',
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
        dotClass: 'bg-blue-500'
      };
  }
};

const getLineageStatusLabel = (status?: string | null) => {
  switch (status) {
    case 'verified':
      return 'موثق';
    case 'pending':
      return 'قيد المراجعة';
    case 'rejected':
      return 'مرفوض';
    case 'unverified':
      return 'غير موثق';
    default:
      return 'غير مُقدم';
  }
};

export default function UserProfile() {
  const { user, logout, replaceUser } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentAvatar = getUserAvatarUrl(user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    location: user?.location || '',
    avatar: currentAvatar,
  });

  const [previewImage, setPreviewImage] = useState<string | null>(currentAvatar || null);
  const [lineageStatus, setLineageStatus] = useState<string | null>(null);
  const [lineageDocs, setLineageDocs] = useState<File[]>([]);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const lineageStatusMeta = getLineageStatusMeta(lineageStatus);

  const fetchLineageStatus = useCallback(async () => {
    try {
      const tenantId = user?.tenantId as string;
      const userId = (user?.id || (user as any)?._id) as string;
      if (tenantId && userId) {
        const status = await apiClient.getMyLineageStatus(tenantId, userId).catch(() => null);
        if (status && status.status) setLineageStatus(status.status);
      }
    } catch (e) {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        bio: user.bio || '',
        location: user.location || '',
        avatar: currentAvatar,
      });
      setPreviewImage(currentAvatar || null);
    }
  }, [user, currentAvatar]);

  useEffect(() => {
    fetchLineageStatus();
  }, [fetchLineageStatus, location.pathname, searchParams.toString()]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setPreviewImage(result);
        setFormData((prev) => ({
          ...prev,
          avatar: result,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLineageSubmit = async () => {
    if (!user) return;
    if (!lineageDocs || lineageDocs.length === 0) {
      setError('اختر ملفًا واحدًا على الأقل');
      return;
    }

    setUploadingDocs(true);
    setError('');
    setSuccess('');

    try {
      const tenantId = user.tenantId as string;
      const uploadedUrls: string[] = [];

      for (const file of lineageDocs) {
        const res = await apiClient.uploadFile(file);
        if (res && res.url) uploadedUrls.push(res.url);
      }

      await apiClient.submitLineageRequest({ tenantId, documents: uploadedUrls });
      setLineageStatus('pending');
      setSuccess('تم تقديم طلب التحقق. سيقوم المشرف بالمراجعة');
      toast.show('تم إرسال طلب التحقق', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل في رفع أو إرسال الطلب');
      toast.show('فشل إرسال طلب التحقق', 'error');
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const userId = user?.id || user?._id;
      if (!userId) {
        setError('لم يتم العثور على بيانات المستخدم');
        return;
      }

      const updatedUser = await apiClient.updateUserProfile({
        name: formData.name,
        phone: formData.phone,
        bio: formData.bio,
        location: formData.location,
        avatarUrl: formData.avatar,
      }) as { avatarUrl?: string; avatar?: string };

      // Refresh full user profile to avoid partial object mismatch
      try {
        const me = await apiClient.getMe();
        replaceUser(me);
        setPreviewImage(getUserAvatarUrl(me) || null);
      } catch (e) {
        // fallback to returned partial
        replaceUser(updatedUser as any);
        setPreviewImage(getUserAvatarUrl(updatedUser as any) || null);
      }

      setSuccess('تم تحديث الملف الشخصي بنجاح');
      toast.show('تم تحديث الملف الشخصي', 'success');
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تحديث الملف الشخصي');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <TenantLayout>
        <div className="text-center py-12">
          <p className="text-on-surface-variant">جارٍ التحميل...</p>
        </div>
      </TenantLayout>
    );
  }

  return (
    <TenantLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-[28px] border border-surface-variant bg-gradient-to-br from-surface-container-lowest via-surface to-surface-container shadow-heritage-sm p-6 md:p-8">
          <div className="absolute inset-0 opacity-10 pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-2xl border border-surface-variant bg-surface shadow-sm">
                {previewImage ? (
                  <img src={previewImage} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-secondary-container text-3xl font-black text-on-secondary-container">
                    {user.name.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-3xl font-black text-primary">الملف الشخصي</h1>
                <p className="mt-1 text-sm text-on-surface-variant">لوحة حديثة لإدارة حسابك، الصورة، والتحقق من النسب.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold ${lineageStatusMeta.badgeClass}`}>
                    <span className={`h-2 w-2 rounded-full ${lineageStatusMeta.dotClass}`} />
                    {lineageStatusMeta.label}
                  </span>
                  <span className="rounded-full border border-surface-variant bg-surface px-3 py-1 text-on-surface-variant">{user.email}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-surface-variant bg-surface px-5 py-2.5 text-sm font-semibold text-on-surface transition hover:bg-surface-variant/20"
              >
                تسجيل الخروج
              </button>
              <button
                type="submit"
                form="profile-form"
                disabled={loading}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'جارٍ التحديث...' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container shadow-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-sm text-on-surface shadow-sm">
            ✓ {success}
          </div>
        )}

        <form id="profile-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <aside className="xl:col-span-4 space-y-6">
            <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-on-surface">صورة الملف الشخصي</h2>

              <div className="flex flex-col items-center gap-4 text-center">
                <div className="h-36 w-36 overflow-hidden rounded-3xl border border-surface-variant bg-surface shadow-sm">
                  {previewImage ? (
                    <img src={previewImage} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-secondary-container text-4xl font-black text-on-secondary-container">
                      {user.name.charAt(0)}
                    </div>
                  )}
                </div>

                <label
                  htmlFor="avatar-input"
                  className="w-full cursor-pointer rounded-2xl border-2 border-dashed border-surface-variant bg-surface px-4 py-4 transition hover:bg-surface-variant/20"
                >
                  <div className="font-semibold text-on-surface">رفع أو تغيير الصورة</div>
                  <div className="mt-1 text-xs text-on-surface-variant">PNG, JPG, GIF حتى 10MB</div>
                </label>
                <input
                  id="avatar-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>
            </section>

            <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-on-surface">التحقق من النسب</h2>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${lineageStatusMeta.badgeClass}`}>
                  {getLineageStatusLabel(lineageStatus)}
                </span>
              </div>

              <div className="space-y-3">
                <label
                  htmlFor="lineage-docs"
                  className="block cursor-pointer rounded-2xl border border-dashed border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface transition hover:bg-surface-variant/20"
                >
                  اختر ملفات الإثبات (صور أو PDF)
                </label>
                <input
                  id="lineage-docs"
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    setLineageDocs(files);
                  }}
                />

                {lineageDocs.length > 0 && (
                  <div className="rounded-2xl border border-surface-variant bg-surface p-3">
                    <p className="mb-2 text-xs font-semibold text-on-surface-variant">الملفات المختارة</p>
                    <div className="space-y-1 text-xs text-on-surface-variant">
                      {lineageDocs.slice(0, 4).map((doc) => (
                        <div key={`${doc.name}-${doc.size}`} className="truncate">• {doc.name}</div>
                      ))}
                      {lineageDocs.length > 4 && <div>و {lineageDocs.length - 4} ملف/ملفات أخرى</div>}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleLineageSubmit}
                  disabled={uploadingDocs}
                  className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition hover:opacity-95 disabled:opacity-60"
                >
                  {uploadingDocs ? 'جارٍ الإرسال...' : 'إرسال طلب التحقق'}
                </button>
              </div>
            </section>
          </aside>

          <section className="xl:col-span-8 rounded-[24px] border border-surface-variant bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-on-surface">البيانات الشخصية</h2>
              <p className="mt-1 text-sm text-on-surface-variant">حدّث المعلومات القابلة للتعديل لتبقى محدثة داخل العائلة.</p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-on-surface">الاسم الكامل</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-surface-variant bg-surface px-4 py-2.5 text-on-surface outline-none"
                  disabled
                />
                <p className="mt-1 text-xs text-on-surface-variant">الاسم محمي ولا يمكن تغييره</p>
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-on-surface">البريد الإلكتروني</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-surface-variant bg-surface px-4 py-2.5 text-on-surface outline-none"
                  disabled
                />
                <p className="mt-1 text-xs text-on-surface-variant">البريد الإلكتروني محمي ولا يمكن تغييره</p>
              </div>

              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-medium text-on-surface">رقم الهاتف</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-surface-variant bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-secondary"
                  placeholder="+966 55 123 4567"
                />
              </div>

              <div>
                <label htmlFor="location" className="mb-2 block text-sm font-medium text-on-surface">الموقع</label>
                <input
                  id="location"
                  name="location"
                  type="text"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-surface-variant bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-secondary"
                  placeholder="المدينة أو الدولة"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="bio" className="mb-2 block text-sm font-medium text-on-surface">النبذة الشخصية</label>
                <textarea
                  id="bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  rows={6}
                  className="w-full resize-none rounded-xl border border-surface-variant bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-secondary"
                  placeholder="اكتب عن نفسك..."
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-surface-variant pt-5">
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-surface-variant bg-surface px-5 py-2.5 text-sm font-semibold text-on-surface transition hover:bg-surface-variant/20"
              >
                تسجيل الخروج
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'جارٍ التحديث...' : 'حفظ التغييرات'}
              </button>
            </div>
          </section>
        </form>
      </div>
    </TenantLayout>
  );
}
