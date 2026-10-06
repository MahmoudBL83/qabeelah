import { useEffect, useState } from 'react';
import { Person, UserRole, Branch } from '@qabila/types';
import { useAuth } from '../../contexts/AuthContext';

interface CreatePersonModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (firstName: string, lastName: string, parentId?: string, branchId?: string, birthYear?: number | null) => Promise<void>;
  parentsList: Person[];
  selectedPersonId?: string | null;
  branches?: Branch[];
}

const getBranchHierarchyName = (branch: Branch, allBranches: Branch[]): string => {
  if (!branch.parentId) return branch.name;
  const parent = allBranches.find(b => (b._id === branch.parentId) || (b.id === branch.parentId));
  if (!parent) return branch.name;
  return `${getBranchHierarchyName(parent, allBranches)} > ${branch.name}`;
};

export default function CreatePersonModal({
  open,
  onClose,
  onSave,
  parentsList = [],
  selectedPersonId = null,
  branches = []
}: CreatePersonModalProps) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [parentId, setParentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [isCustomBranch, setIsCustomBranch] = useState(false);
  const [birthYear, setBirthYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedParent = parentsList.find((person) => String(person._id || person.id) === parentId);
  let parentBranchId = selectedParent?.branchId || user?.branchId || 'الفرع الرئيسي';
  const parentBranchObj = branches.find(b => b._id === parentBranchId || b.id === parentBranchId);
  if (parentBranchObj) {
    parentBranchId = parentBranchObj.name;
  }
  const linkedBranchId = parentBranchId;

  useEffect(() => {
    if (open) {
      setFirstName('');
      setLastName('');
      setParentId(selectedPersonId || '');
      setBirthYear('');
      setBranchId(user?.role === UserRole.SUB_ADMIN ? (user?.branchId || '') : 'الفرع الرئيسي');
      setIsCustomBranch(false);
      setError('');
    }
  }, [open, selectedPersonId, user]);

  useEffect(() => {
    if (!open) return;

    if (parentId) {
      setBranchId(linkedBranchId);
      return;
    }

    setBranchId(user?.role === UserRole.SUB_ADMIN ? (user?.branchId || '') : 'الفرع الرئيسي');
  }, [open, parentId, linkedBranchId, user?.role, user?.branchId]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('الاسم الأول واسم العائلة مطلوبان.');
      return;
    }

    const parsedBirthYear = birthYear.trim() ? Number(birthYear) : null;
    if (birthYear.trim() && Number.isNaN(parsedBirthYear)) {
      setError('سنة الميلاد يجب أن تكون رقماً صالحاً.');
      return;
    }

    setSaving(true);
    try {
      await onSave(
        firstName.trim(),
        lastName.trim(),
        parentId || undefined,
        branchId || 'الفرع الرئيسي',
        parsedBirthYear
      );
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'تعذر إضافة العضو، حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const isSubAdmin = user?.role === UserRole.SUB_ADMIN;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl shadow-xl overflow-hidden" dir="rtl">
        <div className="px-6 py-4 border-b border-surface-variant flex justify-between items-center bg-surface">
          <h3 className="font-bold text-lg text-primary">إضافة عضو جديد للشجرة</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
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
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
                placeholder="مثال: عبدالله"
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">اسم العائلة</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
                placeholder="مثال: بن محمد"
                disabled={saving}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">سنة الميلاد (اختياري)</label>
            <input
              type="number"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
              placeholder="مثال: 1980"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">الوالد/الأم (اختياري)</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
              disabled={saving}
            >
              <option value="">بدون والد (إضافة كجذر)</option>
              {parentsList.map((person) => (
                <option key={person._id || person.id} value={person._id || person.id}>
                  {person.firstName}
                </option>
              ))}
            </select>
            <p className="text-xs text-on-surface-variant mt-1">اختر الوالد/الوالدة من الشجرة الحالية</p>
          </div>

          {!isSubAdmin && parentId && (
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">الفرع المرتبط بالشجرة</label>
              <div className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface-variant/20 text-sm text-on-surface-variant">
                {linkedBranchId}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">الفرع يتبع الوالد/الوالدة المختار من الشجرة</p>
            </div>
          )}

          {!isSubAdmin && !parentId && (
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
                className={`w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary ${isCustomBranch ? 'mb-2' : ''}`}
                disabled={saving}
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
                  className="w-full border border-surface-variant rounded-lg p-2.5 bg-surface focus:outline-none focus:border-secondary"
                  placeholder="اكتب اسم الفرع الجديد..."
                  disabled={saving}
                  autoFocus
                />
              )}
              <p className="text-xs text-on-surface-variant mt-1">اختر فرعاً موجوداً أو أضف فرعاً جديداً.</p>
            </div>
          )}

          {isSubAdmin && (
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">الفرع</label>
              <div className="p-2.5 bg-surface-variant/20 border border-surface-variant rounded-lg text-sm text-on-surface-variant">
                {user?.branchId || 'الفرع الرئيسي'}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">أنت مقيد على فرعك فقط</p>
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2.5 border border-surface-variant text-on-surface-variant font-medium rounded-lg hover:bg-surface transition-colors disabled:opacity-70"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving || !firstName.trim() || !lastName.trim()}
              className="flex-1 py-2.5 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {saving ? 'جارٍ الإضافة...' : 'إضافة العضو'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
