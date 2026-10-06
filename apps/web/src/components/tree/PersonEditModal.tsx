import { API_BASE_URL } from '../../lib/config';
import { useEffect, useState } from 'react';
import { Person, Branch } from '@qabila/types';


interface PersonEditModalProps {
  person: Person | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Person>) => Promise<void>;
  showBranchField?: boolean;
  branches?: Branch[];
}

const getBranchHierarchyName = (branch: Branch, allBranches: Branch[]): string => {
  if (!branch.parentId) return branch.name;
  const parent = allBranches.find(b => (b._id === branch.parentId) || (b.id === branch.parentId));
  if (!parent) return branch.name;
  return `${getBranchHierarchyName(parent, allBranches)} > ${branch.name}`;
};

export default function PersonEditModal({
  person,
  open,
  onClose,
  onSave,
  showBranchField = false,
  branches = []
}: PersonEditModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [deathYear, setDeathYear] = useState('');
  const [isLiving, setIsLiving] = useState(true);
  const [bio, setBio] = useState('');
  const [imageSrc, setImageSrc] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [branchId, setBranchId] = useState('الفرع الرئيسي');
  const [isCustomBranch, setIsCustomBranch] = useState(false);
  const [spouseIdsInput, setSpouseIdsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !person) return;
    setFirstName(person.firstName || '');
    setLastName(person.lastName || '');
    setBirthYear(person.birthYear ? String(person.birthYear) : '');
    setDeathYear(person.deathYear ? String(person.deathYear) : '');
    setIsLiving(person.isLiving ?? true);
    setBio(person.bio || '');
    setImageSrc(person.imageSrc || '');
    setImagePreview(person.imageSrc || '');
    
    // Resolve branchId to branch name
    let resolvedBranchName = person.branchId || 'الفرع الرئيسي';
    const branchObj = branches.find(b => b._id === person.branchId || b.id === person.branchId);
    if (branchObj) {
      resolvedBranchName = branchObj.name;
    }
    setBranchId(resolvedBranchName);
    
    setIsCustomBranch(false);
    setSpouseIdsInput(Array.isArray((person as any).spouseIds) ? (person as any).spouseIds.join(', ') : '');
    setError('');
  }, [open, person]);

  if (!open || !person) return null;

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Show preview while uploading
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setImagePreview(result);
    };
    reader.readAsDataURL(file);

    // Upload to API
    setUploading(true);
    try {
      const token = localStorage.getItem('qabila_token');
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setImageSrc(data.url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload image';
      setError(errorMessage);
      console.error('Image upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('الاسم الأول واسم العائلة مطلوبان.');
      return;
    }

    const parsedBirth = birthYear.trim() ? Number(birthYear) : null;
    const parsedDeath = deathYear.trim() ? Number(deathYear) : null;

    if (birthYear.trim() && Number.isNaN(parsedBirth)) {
      setError('سنة الميلاد غير صالحة.');
      return;
    }

    if (!isLiving && deathYear.trim() && Number.isNaN(parsedDeath)) {
      setError('سنة الوفاة غير صالحة.');
      return;
    }

    setSaving(true);
    try {
      const updates: Partial<Person> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthYear: parsedBirth,
        deathYear: isLiving ? null : parsedDeath,
        isLiving,
        bio: bio.trim() || undefined,
        imageSrc: imageSrc.trim() || undefined
      };

      if (showBranchField) {
        updates.branchId = branchId.trim() || 'الفرع الرئيسي';
      }

      const spouseIds = spouseIdsInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (spouseIds.length > 0) {
        (updates as any).spouseIds = spouseIds;
      }

      await onSave(updates);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'تعذر حفظ التعديلات، حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-ignore-reels-wheel="true"
      onWheelCapture={(e) => e.stopPropagation()}
      onTouchMoveCapture={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4"
    >
      <div className="bg-surface-container-lowest w-full max-w-lg max-h-[90vh] rounded-2xl shadow-xl overflow-hidden flex flex-col" dir="rtl">
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-surface-variant flex justify-between items-center bg-surface">
          <h3 className="font-bold text-lg text-primary">تعديل بيانات العضو</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div className="bg-error-container text-on-error-container border border-error rounded-lg p-3 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">الاسم الأول</label>
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface text-on-surface focus:outline-none focus:border-secondary"
                placeholder="مثال: عبدالله"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">اسم العائلة</label>
              <input
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface text-on-surface focus:outline-none focus:border-secondary"
                placeholder="مثال: بن محمد"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">سنة الميلاد</label>
              <input
                type="number"
                value={birthYear}
                onChange={(event) => setBirthYear(event.target.value)}
                className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface text-on-surface focus:outline-none focus:border-secondary"
                placeholder="مثال: 1980"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">سنة الوفاة</label>
              <input
                type="number"
                value={deathYear}
                onChange={(event) => setDeathYear(event.target.value)}
                disabled={isLiving}
                className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface text-on-surface focus:outline-none focus:border-secondary disabled:opacity-60"
                placeholder="مثال: 2020"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={isLiving}
              onChange={(event) => setIsLiving(event.target.checked)}
              className="accent-secondary"
            />
            على قيد الحياة
          </label>

          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">نبذة مختصرة</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface text-on-surface focus:outline-none focus:border-secondary"
              placeholder="وصف مختصر عن العضو..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">صورة العضو</label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="h-24 w-24 overflow-hidden rounded-xl border border-surface-variant bg-surface flex-shrink-0">
                {imagePreview ? (
                  <img src={imagePreview} alt="Member preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-secondary">+</div>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-surface-variant bg-surface px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface-variant/20 disabled:opacity-70">
                <span>{uploading ? 'جارٍ الرفع...' : 'رفع صورة'}</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                  disabled={uploading}
                  className="hidden" 
                />
              </label>
            </div>
          </div>

          {showBranchField && (
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">اسم الفرع</label>
              <select
                value={isCustomBranch ? '__NEW__' : branchId}
                onChange={(e) => {
                  if (e.target.value === '__NEW__') {
                    setIsCustomBranch(true);
                    setBranchId('');
                  } else {
                    setIsCustomBranch(false);
                    setBranchId(e.target.value);
                  }
                }}
                className={`w-full border border-surface-variant rounded-lg p-2.5 bg-surface text-on-surface focus:outline-none focus:border-secondary ${isCustomBranch ? 'mb-2' : ''}`}
                disabled={saving || uploading}
              >
                <option value="" disabled>اختر الفرع...</option>
                {branches.map((branch) => (
                  <option key={branch._id || branch.id} value={branch._id || branch.id}>
                    {getBranchHierarchyName(branch, branches)}
                  </option>
                ))}
                <option value="__NEW__" className="text-secondary font-bold">+ إضافة فرع جديد...</option>
              </select>
              
              {isCustomBranch && (
                <input
                  type="text"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface text-on-surface focus:outline-none focus:border-secondary"
                  placeholder="اكتب اسم الفرع الجديد..."
                  disabled={saving || uploading}
                  autoFocus
                />
              )}
            </div>
          )}

          
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || uploading}
              className="flex-1 py-2.5 border border-surface-variant text-on-surface-variant font-medium rounded-lg hover:bg-surface transition-colors disabled:opacity-70"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 py-2.5 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-70"
            >
              {saving ? 'جارٍ الحفظ...' : uploading ? 'جارٍ الرفع...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
