import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../lib/api';
import { getUserAvatarUrl } from '../../lib/user';

type ProfileForm = {
  name: string;
  phone: string;
  bio: string;
  location: string;
  avatar: string;
};

export default function SuperAdminProfile() {
  const { user, replaceUser } = useAuth();
  const currentAvatar = getUserAvatarUrl(user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(currentAvatar || null);
  const [formData, setFormData] = useState<ProfileForm>({
    name: user?.name || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    location: user?.location || '',
    avatar: currentAvatar,
  });

  useEffect(() => {
    if (!user) return;
    const avatar = getUserAvatarUrl(user);
    setFormData({
      name: user.name || '',
      phone: user.phone || '',
      bio: user.bio || '',
      location: user.location || '',
      avatar,
    });
    setPreviewImage(avatar || null);
  }, [user]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = (loadEvent.target?.result as string) || '';
      setPreviewImage(result || null);
      setFormData((prev) => ({ ...prev, avatar: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await apiClient.updateUserProfile({
        name: formData.name,
        phone: formData.phone,
        bio: formData.bio,
        location: formData.location,
        avatarUrl: formData.avatar,
      });

      const refreshedUser = await apiClient.getMe();
      replaceUser(refreshedUser);
      setPreviewImage(getUserAvatarUrl(refreshedUser) || null);
      setSuccess('تم تحديث الملف الشخصي بنجاح');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'تعذر تحديث الملف الشخصي');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-2xl border border-surface-variant bg-surface-container-lowest p-6 text-on-surface-variant">
        جارٍ تحميل بيانات الحساب...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-6 shadow-heritage-sm">
        <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
        <h1 className="mt-2 text-3xl font-bold text-on-surface">الملف الشخصي</h1>
        <p className="mt-2 text-sm text-on-surface-variant">تحديث بيانات حساب مشرف المنصة من نفس اللوحة.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-sm text-on-surface">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <aside className="xl:col-span-4">
          <div className="rounded-2xl border border-surface-variant bg-surface-container-lowest p-5 shadow-heritage-sm">
            <h2 className="mb-4 text-lg font-bold text-on-surface">صورة الحساب</h2>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-32 w-32 overflow-hidden rounded-2xl border border-surface-variant bg-surface">
                {previewImage ? (
                  <img src={previewImage} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-secondary-container text-4xl font-black text-on-secondary-container">
                    {user.name?.charAt(0) || 'S'}
                  </div>
                )}
              </div>

              <label htmlFor="super-admin-avatar-input" className="w-full cursor-pointer rounded-xl border-2 border-dashed border-surface-variant bg-surface px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-surface-variant/20">
                تغيير الصورة
              </label>
              <input
                id="super-admin-avatar-input"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </div>
          </div>
        </aside>

        <section className="xl:col-span-8 rounded-2xl border border-surface-variant bg-surface-container-lowest p-5 shadow-heritage-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">الاسم</label>
              <input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
                placeholder="اسم مشرف المنصة"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">البريد الإلكتروني</label>
              <input
                value={user.email || ''}
                disabled
                className="w-full rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface-variant"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">رقم الجوال</label>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
                placeholder="05xxxxxxxx"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">الموقع</label>
              <input
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
                placeholder="المدينة / الدولة"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-on-surface">نبذة</label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleInputChange}
              rows={5}
              className="w-full rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
              placeholder="نبذة مختصرة عنك"
            />
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-secondary px-5 py-2.5 text-sm font-bold text-on-secondary transition hover:bg-secondary/90 disabled:opacity-60"
            >
              {loading ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
