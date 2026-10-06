import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api';

type ImportedMember = {
  id?: string;
  firstName: string;
  lastName: string;
  birthYear?: number;
  deathYear?: number;
  isLiving?: boolean;
  parentId?: string;
  branchId?: string;
  bio?: string;
  imageSrc?: string;
};

type CsvRow = Record<string, string | number | boolean | null | undefined>;
type SlugAvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

const samplePayload = JSON.stringify(
  [
    { id: 'root', fullName: 'عبدالله بن أحمد', birthYear: 1920, isLiving: false },
    { id: 'child-1', fullName: 'سالم بن عبدالله', parentId: 'root', birthYear: 1950, isLiving: true },
    { id: 'child-2', fullName: 'نورة بنت عبدالله', parentId: 'root', birthYear: 1954, isLiving: true }
  ],
  null,
  2
);

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const normalizeCustomDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/g, '')
    .replace(/\.$/g, '');

const isValidCustomDomain = (value: string) =>
  /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(value) &&
  !value.includes('..') &&
  !value.endsWith('.qabila.com') &&
  value !== 'qabila.com';

const buildFallbackSubdomain = (value: string) => {
  const source = value.trim() || 'family';
  let hash = 0;
  for (const character of source) {
    hash = ((hash << 5) - hash + character.codePointAt(0)!) | 0;
  }
  const suffix = Math.abs(hash).toString(36);
  return `family-${suffix || 'new'}`;
};

const resolveSubdomain = (name: string, subdomain: string) => {
  const candidate = normalizeSlug(subdomain || name);
  if (isValidSubdomain(candidate)) {
    return candidate;
  }

  const nameCandidate = normalizeSlug(name).replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  if (isValidSubdomain(nameCandidate)) {
    return nameCandidate;
  }

  return buildFallbackSubdomain(name || subdomain);
};

const isValidEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

const isValidSubdomain = (value: string) => /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(value);

const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'نعم'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'لا'].includes(normalized)) return false;
  }
  return undefined;
};

const splitFullName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.includes(' ')) {
    return { firstName: trimmed, lastName: '' };
  }

  const lastSpace = trimmed.lastIndexOf(' ');
  return {
    firstName: trimmed.slice(0, lastSpace).trim(),
    lastName: trimmed.slice(lastSpace + 1).trim()
  };
};

const splitCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === ',' && !insideQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
};

const escapeCsvCell = (value: CsvRow[string]) => {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'string' ? value : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildCsv = (rows: CsvRow[]) => {
  const headers = ['id', 'fullName', 'firstName', 'lastName', 'birthYear', 'deathYear', 'isLiving', 'parentId', 'branchId', 'bio', 'imageSrc'];
  const lines = [headers.join(',')];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
  });

  return lines.join('\n');
};

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const normalizeImportedRecord = (record: Record<string, unknown>, familyName: string): ImportedMember | null => {
  const fullName = typeof record.fullName === 'string'
    ? record.fullName.trim()
    : typeof record.name === 'string'
      ? record.name.trim()
      : '';
  const rawFirstName = typeof record.firstName === 'string'
    ? record.firstName.trim()
    : typeof record.first_name === 'string'
      ? record.first_name.trim()
      : '';
  const rawLastName = typeof record.lastName === 'string'
    ? record.lastName.trim()
    : typeof record.last_name === 'string'
      ? record.last_name.trim()
      : '';
  const derivedName = fullName ? splitFullName(fullName) : { firstName: rawFirstName, lastName: rawLastName };
  const firstName = derivedName.firstName || rawFirstName;
  const shouldDefaultFamily = Boolean(rawLastName) || fullName.includes(' ');
  const lastName = derivedName.lastName || rawLastName || (shouldDefaultFamily ? familyName : '');

  if (!firstName) return null;

  return {
    id: typeof record.id === 'string' ? record.id.trim() : undefined,
    firstName,
    lastName,
    birthYear: parseNumber(record.birthYear),
    deathYear: parseNumber(record.deathYear),
    isLiving: parseBoolean(record.isLiving),
    parentId: typeof record.parentId === 'string' ? record.parentId.trim() : undefined,
    branchId: typeof record.branchId === 'string' ? record.branchId.trim() : undefined,
    bio: typeof record.bio === 'string' ? record.bio.trim() : undefined,
    imageSrc: typeof record.imageSrc === 'string' ? record.imageSrc.trim() : typeof record.image === 'string' ? record.image.trim() : undefined
  };
};

const parseMembers = (text: string, format: 'json' | 'csv', familyName: string) => {
  if (!text.trim()) return [] as ImportedMember[];

  if (format === 'json') {
    const parsed = JSON.parse(text) as unknown;
    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { members?: unknown[]; people?: unknown[] }).members)
        ? (parsed as { members: unknown[] }).members
        : Array.isArray((parsed as { members?: unknown[]; people?: unknown[] }).people)
          ? (parsed as { people: unknown[] }).people
          : [];

    return records
      .filter((record): record is Record<string, unknown> => Boolean(record && typeof record === 'object'))
      .map((record) => normalizeImportedRecord(record, familyName))
      .filter((member): member is ImportedMember => Boolean(member));
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const record: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });

    return normalizeImportedRecord(record, familyName);
  }).filter((member): member is ImportedMember => Boolean(member));
};

export default function ImportTenantPage() {
  const toast = useToast();
  const [name, setName] = useState('عائلة جديدة');
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [sourceFormat, setSourceFormat] = useState<'json' | 'csv'>('json');
  const [sourceText, setSourceText] = useState(samplePayload);
  const [coverImage, setCoverImage] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [treeImageFile, setTreeImageFile] = useState<File | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isExtractingTree, setIsExtractingTree] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [adminSecret, setAdminSecret] = useState('');
  const [slugAvailabilityStatus, setSlugAvailabilityStatus] = useState<SlugAvailabilityStatus>('idle');
  const [slugAvailabilityMessage, setSlugAvailabilityMessage] = useState('');

  const normalizedSubdomain = useMemo(() => resolveSubdomain(name, subdomain), [name, subdomain]);
  const parsedMembers = useMemo(() => {
    try {
      return parseMembers(sourceText, sourceFormat, name);
    } catch {
      return [] as ImportedMember[];
    }
  }, [name, sourceFormat, sourceText]);
  const parseError = useMemo(() => {
    try {
      parseMembers(sourceText, sourceFormat, name);
      return '';
    } catch (err) {
      return err instanceof Error ? err.message : 'تعذر قراءة بيانات الاستيراد';
    }
  }, [name, sourceFormat, sourceText]);

  const normalizedCustomDomain = useMemo(
    () => normalizeCustomDomain(customDomain),
    [customDomain]
  );

  const previewCount = useMemo(() => {
    try {
      return parsedMembers.length;
    } catch {
      return 0;
    }
  }, [parsedMembers]);

  useEffect(() => {
    if (!normalizedSubdomain) {
      setSlugAvailabilityStatus('idle');
      setSlugAvailabilityMessage('');
      return;
    }

    if (!isValidSubdomain(normalizedSubdomain)) {
      setSlugAvailabilityStatus('invalid');
      setSlugAvailabilityMessage('استخدم 3-50 حرفًا إنجليزيًا صغيرًا أو رقمًا أو شرطة، بدون شرطة في البداية أو النهاية.');
      return;
    }

    let cancelled = false;
    setSlugAvailabilityStatus('checking');
    setSlugAvailabilityMessage('جارٍ التحقق من توفر الرمز...');

    const timer = window.setTimeout(async () => {
      try {
        const result = await apiClient.checkTenantSlugAvailability(normalizedSubdomain);
        if (cancelled) return;

        setSlugAvailabilityStatus(result.available ? 'available' : 'taken');
        setSlugAvailabilityMessage(
          result.available
            ? 'الرمز متاح ويمكن استخدامه لهذه العائلة.'
            : 'هذا الرمز مستخدم مسبقًا. اختر رمزًا مختلفًا.'
        );
      } catch (availabilityError) {
        if (cancelled) return;

        const status = (availabilityError as { status?: number })?.status;
        setSlugAvailabilityStatus(status === 400 ? 'invalid' : 'error');
        setSlugAvailabilityMessage(
          status === 400
            ? 'رمز العائلة غير صالح.'
            : 'تعذر التحقق الآن. سيتم التحقق مرة أخرى عند إنشاء العائلة.'
        );
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedSubdomain]);

  const isSlugAvailabilityBlocking =
    slugAvailabilityStatus === 'checking' ||
    slugAvailabilityStatus === 'taken' ||
    slugAvailabilityStatus === 'invalid';
  const slugAvailabilityLabel =
    slugAvailabilityStatus === 'checking'
      ? 'جارٍ التحقق'
      : slugAvailabilityStatus === 'available'
        ? 'متاح'
        : slugAvailabilityStatus === 'taken'
          ? 'مستخدم'
          : slugAvailabilityStatus === 'invalid'
            ? 'غير صالح'
            : slugAvailabilityStatus === 'error'
              ? 'تعذر التحقق'
              : 'بانتظار الإدخال';
  const slugAvailabilityClassName =
    slugAvailabilityStatus === 'available'
      ? 'bg-emerald-100 text-emerald-800'
      : slugAvailabilityStatus === 'taken' || slugAvailabilityStatus === 'invalid'
        ? 'bg-red-100 text-red-800'
        : slugAvailabilityStatus === 'checking'
          ? 'bg-secondary/10 text-secondary'
          : 'bg-surface-container-high text-on-surface-variant';

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (file.type.startsWith('image/')) {
        setError('');
        setIsUploadingCover(true);
        setTreeImageFile(file);

        const reader = new FileReader();
        const previewUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => reject(new Error('تعذر قراءة صورة الغلاف'));
          reader.readAsDataURL(file);
        });

        setCoverPreview(previewUrl);

        try {
          const uploadResult = await apiClient.uploadFile(file);
          const uploadedUrl = typeof uploadResult?.url === 'string' ? uploadResult.url : '';
          setCoverImage(uploadedUrl || previewUrl);
          if (!uploadedUrl) {
            toast.show('تمت معاينة صورة الغلاف محليًا فقط', 'info');
          }
        } catch (uploadError) {
          setCoverImage(previewUrl);
          toast.show('تعذر رفع صورة الغلاف، سيتم استخدام المعاينة المحلية فقط', 'info');
        }

        return;
      }

      setTreeImageFile(null);

      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        setSourceText(result);
        setSourceFormat(file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
      };
      reader.readAsText(file);
    } finally {
      setIsUploadingCover(false);
      event.currentTarget.value = '';
    }
  };

  const handleExtractTreeImage = async () => {
    if (!treeImageFile) {
      toast.show('ارفع صورة شجرة أولاً قبل الاستخراج', 'info');
      return;
    }

    setIsExtractingTree(true);
    setError('');

    try {
      const result = await apiClient.extractTreeData(treeImageFile, name.trim() || undefined);
      const members = Array.isArray(result?.members) ? result.members : [];
      setSourceFormat('json');
      setSourceText(JSON.stringify(members, null, 2));

      if (typeof result?.familyName === 'string' && result.familyName.trim() && name.trim() === 'عائلة جديدة') {
        setName(result.familyName.trim());
      }

      toast.show(`تم استخراج ${members.length} عضو من الصورة`, 'success');
    } catch (extractionError) {
      const message = extractionError instanceof Error ? extractionError.message : 'تعذر استخراج الشجرة من الصورة';
      setError(message);
      toast.show(`فشل الاستخراج: ${message}`, 'error');
    } finally {
      setIsExtractingTree(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccessMessage('');
    setAdminSecret('');

    try {
      const trimmedName = name.trim();
      const resolvedSubdomain = resolveSubdomain(trimmedName, subdomain);

      if (!trimmedName) {
        throw new Error('اسم العائلة مطلوب');
      }

      if (!resolvedSubdomain || !isValidSubdomain(resolvedSubdomain)) {
        throw new Error('رمز العائلة غير صالح. استخدم أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط.');
      }

      if (slugAvailabilityStatus === 'taken') {
        throw new Error('رمز العائلة مستخدم مسبقًا. اختر رمزًا مختلفًا.');
      }

      if (slugAvailabilityStatus === 'invalid') {
        throw new Error('رمز العائلة غير صالح. استخدم أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط.');
      }

      const slugAvailability = await apiClient.checkTenantSlugAvailability(resolvedSubdomain);
      if (!slugAvailability.available) {
        throw new Error('رمز العائلة مستخدم مسبقًا. اختر رمزًا مختلفًا.');
      }

      if (normalizedCustomDomain && !isValidCustomDomain(normalizedCustomDomain)) {
        throw new Error('الدومين الكامل غير صالح. استخدم نطاقًا مثل aljazi.com بدون http أو مسارات.');
      }

      if (!adminEmail.trim()) {
        throw new Error('بريد مدير العائلة مطلوب');
      }

      if (!isValidEmail(adminEmail.trim())) {
        throw new Error('بريد مدير العائلة غير صالح');
      }

      if (!adminPassword.trim()) {
        throw new Error('كلمة مرور مدير العائلة مطلوبة');
      }

      if (parseError) {
        throw new Error(parseError);
      }

      const members = sourceText.trim() ? parsedMembers : [];
      const payloadBase = {
        name: trimmedName,
        subdomain: resolvedSubdomain,
        coverImage: coverImage || undefined,
        adminName: adminName || undefined,
        adminEmail: adminEmail.trim(),
        adminPassword: adminPassword,
        members
      };

      const response = await apiClient.importTenant({
        ...payloadBase,
        ...(normalizedCustomDomain ? { customDomain: normalizedCustomDomain } : {}),
        subdomain: resolvedSubdomain
      });

      setSuccessMessage(`تم إنشاء ${response.tenant?.name || name} بنجاح مع ${response.importedMembers || 0} عضو.`);
      if (response.adminAccount) {
        setAdminSecret(`📧 ${response.adminAccount.email} | 🔑 ${adminPassword.trim()}`);
      }
      toast.show('تم إنشاء العائلة بنجاح', 'success');
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : 'فشل الاستيراد';
      const status = (submissionError as { status?: number })?.status;
      const details = (submissionError as { details?: string })?.details;
      const detailedMessage = details ? `${message} (${details})` : message;
      const userFriendlyMessage =
        status === 409 && /admin email/i.test(message)
          ? 'بريد مدير العائلة مستخدم مسبقًا. غيّره ثم أعد المحاولة.'
          : status === 409 && /tenant|subdomain|slug/i.test(message)
            ? 'رمز العائلة مستخدم مسبقًا. اختر رمزًا مختلفًا؛ لن يتم تغييره تلقائيًا.'
            : status === 409 && /custom domain/i.test(message)
              ? 'الدومين الكامل مستخدم مسبقًا لعائلة أخرى.'
            : detailedMessage;

      setError(userFriendlyMessage);
      toast.show(`فشل الاستيراد: ${userFriendlyMessage}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-4 shadow-heritage-sm">
          <p className="text-xs text-on-surface-variant">الاسم الجاهز</p>
          <p className="mt-2 text-lg font-bold text-on-surface">{name.trim() || 'غير محدد'}</p>
        </div>
        <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-4 shadow-heritage-sm">
          <p className="text-xs text-on-surface-variant">رمز العائلة الداخلي</p>
          <p className="mt-2 text-lg font-bold text-on-surface" dir="ltr">{normalizedSubdomain || 'غير جاهز'}</p>
        </div>
        <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-4 shadow-heritage-sm">
          <p className="text-xs text-on-surface-variant">الأعضاء المعاينون</p>
          <p className="mt-2 text-lg font-bold text-secondary">{previewCount}</p>
        </div>
        <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-4 shadow-heritage-sm">
          <p className="text-xs text-on-surface-variant">تنسيق المصدر</p>
          <p className="mt-2 text-lg font-bold text-on-surface">{sourceFormat.toUpperCase()}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
          <h1 className="mt-2 text-3xl font-bold text-on-surface">استيراد عائلة جديدة</h1>
              <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
            أنشئ عائلة جديدة بسرعة عبر JSON أو CSV، واربط لها صورة غلاف، ثم أدخل بيانات مدير العائلة لتسجيل الدخول مباشرة.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/super-admin"
            className="rounded-xl border border-surface-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant/30"
          >
            العودة إلى اللوحة
          </Link>
          <button
            type="button"
            onClick={() => setSourceText(samplePayload)}
            className="rounded-xl bg-secondary/10 px-4 py-2 text-sm font-bold text-secondary transition-colors hover:bg-secondary/20"
          >
            تحميل مثال
          </button>
        </div>
      </div>

      {parseError ? (
        <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {parseError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6 rounded-3xl border border-surface-variant bg-surface-container-lowest p-6 shadow-heritage-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-on-surface">
              <span>اسم العائلة</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                placeholder="عائلة الأحمدي"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-on-surface">
              <span>رمز العائلة الداخلي</span>
              <input
                value={subdomain}
                onChange={(event) => setSubdomain(event.target.value.toLowerCase())}
                className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                placeholder="alahmadi"
                dir="ltr"
              />
              <p className="text-xs text-on-surface-variant">
                رمز ثابت وفريد يستخدم داخليًا في المسارات.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-1 font-bold ${slugAvailabilityClassName}`}>
                  {slugAvailabilityLabel}
                </span>
                <span className="font-mono text-on-surface-variant" dir="ltr">
                  {normalizedSubdomain || 'family-code'}
                </span>
                {slugAvailabilityMessage ? (
                  <span className="text-on-surface-variant">{slugAvailabilityMessage}</span>
                ) : null}
              </div>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-on-surface">
              <span>الدومين الكامل للعائلة (اختياري)</span>
              <input
                value={customDomain}
                onChange={(event) => setCustomDomain(event.target.value)}
                className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                placeholder="aljazi.com"
                dir="ltr"
              />
              <p className="text-xs text-on-surface-variant">
                مثال: aljazi.com. هذا دومين كامل تملكه العائلة، وليس Subdomain على نطاق المنصة. يمكن تعديله والتحقق منه لاحقاً من لوحة إدارة العائلة.
              </p>
            </label>

            <label className="space-y-2 text-sm font-medium text-on-surface">
              <span>تنسيق الملف</span>
              <select
                value={sourceFormat}
                onChange={(event) => setSourceFormat(event.target.value as 'json' | 'csv')}
                className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </label>
          </div>

          <div className="rounded-3xl border border-green-300 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">🔒</span>
              <div>
                <h2 className="font-bold text-green-900">عزل تلقائي لقاعدة البيانات</h2>
                <p className="mt-1 text-sm text-green-800">كل عائلة تحصل تلقائياً على قاعدة بيانات منفصلة بشكل آمن. لا يمكن لأي عائلة أخرى الوصول إلى بيانات هذه العائلة.</p>
                <p className="mt-2 text-xs text-green-700">اسم قاعدة البيانات: <code className="font-mono">qabila_tenant_{'{familyCode}'}</code></p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-on-surface">
              <span>اسم مدير العائلة (اختياري)</span>
              <input
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
                className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                placeholder={`${name} Admin`}
              />
              <p className="mt-1 text-xs text-on-surface-variant">إذا تركته فارغًا فسنستخدم اسم العائلة مع كلمة Admin</p>
            </label>

            <label className="space-y-2 text-sm font-medium text-on-surface">
              <span>بريد مدير العائلة</span>
              <input
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                placeholder="admin@family-domain.com"
                dir="ltr"
              />
              <p className="mt-1 text-xs text-on-surface-variant">هذا البريد سيستخدم لتسجيل دخول مدير العائلة</p>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-on-surface">
              <span>كلمة مرور مدير العائلة</span>
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                placeholder="أدخل كلمة المرور التي سيستخدمها مدير العائلة"
                dir="ltr"
              />
              <p className="mt-1 text-xs text-on-surface-variant">هذه الكلمة ستكون للدخول إلى حساب المدير بعد إنشاء العائلة</p>
            </label>
          </div>

          <label className="block space-y-2 text-sm font-medium text-on-surface">
            <span>الصق بيانات العائلة أو ارفع ملف JSON / CSV</span>
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              rows={14}
              className="w-full rounded-3xl border border-surface-variant bg-surface px-4 py-4 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
              placeholder={'[{"id":"root","fullName":"عبدالله بن أحمد"}]'}
              dir="ltr"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-surface-variant bg-surface px-4 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant/30">
              <span>{isUploadingCover ? 'جارٍ رفع الغلاف...' : 'رفع ملف أو صورة'}</span>
              <input type="file" accept=".json,.csv,.txt,image/*" onChange={handleFileChange} className="hidden" />
            </label>
            <span className="text-xs text-on-surface-variant">
              يمكنك رفع ملف JSON أو CSV لبيانات العائلة، أو صورة لشجرة النسب لاستخراج البيانات منها تلقائيًا.
            </span>
          </div>

          {treeImageFile ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-secondary/20 bg-secondary/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-secondary">صورة جاهزة للاستخراج</p>
                <p className="text-xs text-on-surface-variant">إذا كانت هذه الصورة شجرة نسب، يمكن تحويلها إلى JSON تلقائيًا.</p>
              </div>
              <button
                type="button"
                onClick={handleExtractTreeImage}
                disabled={isExtractingTree || isUploadingCover}
                className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-on-secondary transition-colors hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExtractingTree ? 'جارٍ الاستخراج...' : 'استخراج JSON من الصورة'}
              </button>
            </div>
          ) : null}

          {coverPreview ? (
            <div className="overflow-hidden rounded-3xl border border-surface-variant bg-surface">
              <img src={coverPreview} alt="Cover preview" className="h-56 w-full object-cover" />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
          ) : null}

          {successMessage ? (
            <div className="rounded-2xl border border-secondary/20 bg-secondary/10 px-4 py-3 text-sm text-secondary">
              <div className="font-medium">{successMessage}</div>
              {adminSecret ? (
                <div className="mt-2 space-y-1 text-xs text-on-surface-variant font-mono">
                  <div>بيانات دخول المدير:</div>
                  <div className="bg-on-surface/5 rounded px-2 py-1">{adminSecret}</div>
                  <div className="text-xs text-on-surface-variant">احفظ بيانات الدخول في مكان آمن</div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSubmitting || isUploadingCover || isExtractingTree || isSlugAvailabilityBlocking}
              className="rounded-xl bg-secondary px-5 py-3 text-sm font-bold text-on-secondary transition-colors hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? 'جارٍ الاستيراد...'
                : isUploadingCover
                  ? 'جارٍ رفع الغلاف...'
                  : isExtractingTree
                    ? 'جارٍ استخراج JSON...'
                    : slugAvailabilityStatus === 'checking'
                      ? 'جارٍ التحقق من الرمز...'
                      : 'إنشاء العائلة'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceText('');
                setCoverImage('');
                setCoverPreview('');
                setTreeImageFile(null);
                setError('');
                setSuccessMessage('');
                setAdminSecret('');
              }}
              className="rounded-xl border border-surface-variant bg-surface px-5 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant/30"
            >
              مسح الحقول
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-6 shadow-heritage-sm">
            <p className="text-xs text-on-surface-variant">معاينة سريعة</p>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-on-surface">{name}</p>
                <p className="mt-1 text-xs text-on-surface-variant" dir="ltr">
                  {normalizedCustomDomain || 'لا يوجد نطاق بعد'}
                </p>
              </div>
              <div className="rounded-2xl bg-secondary/10 px-4 py-3 text-center">
                <div className="text-2xl font-bold text-secondary">{previewCount}</div>
                <div className="text-[11px] text-on-surface-variant">عضو جاهز</div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-on-surface-variant">
              <p>• JSON هو الخيار الأفضل لبيانات العائلة الكاملة.</p>
              <p>• CSV مناسب للبيانات البسيطة سطرًا بسطر.</p>
              <p>• إذا أضفت نطاقًا مخصصًا، فسيكون هو عنوان العائلة النهائي.</p>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(`${normalizedSubdomain || 'family'}-template.csv`, buildCsv(parsedMembers.map((member, index) => ({
                id: member.id || `row-${index + 1}`,
                fullName: `${member.firstName} ${member.lastName}`.trim(),
                firstName: member.firstName,
                lastName: member.lastName,
                birthYear: member.birthYear,
                deathYear: member.deathYear,
                isLiving: member.isLiving,
                parentId: member.parentId,
                branchId: member.branchId,
                bio: member.bio,
                imageSrc: member.imageSrc
              }))))}
              className="mt-4 rounded-xl border border-surface-variant bg-surface px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant/30"
            >
              تنزيل نموذج CSV
            </button>
          </div>

          <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-6 shadow-heritage-sm">
            <h2 className="text-lg font-bold text-on-surface">خطوات الاستيراد</h2>
            <div className="mt-4 space-y-3 text-sm text-on-surface-variant">
              <p>1. اكتب اسم العائلة ورمزها.</p>
              <p>2. الصق JSON أو CSV أو ارفع الملف مباشرة.</p>
              <p>3. أضف صورة الغلاف إذا كانت متاحة.</p>
              <p>4. أدخل بريد وكلمة مرور مدير العائلة حتى يتمكن من تسجيل الدخول فورًا بعد الاستيراد.</p>
            </div>
          </div>

          <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest p-6 shadow-heritage-sm">
            <h2 className="text-lg font-bold text-on-surface">معاينة الأعضاء</h2>
            <div className="mt-4 space-y-3">
              {parsedMembers.slice(0, 4).map((member, index) => (
                <div key={`${member.firstName}-${member.lastName}-${index}`} className="rounded-2xl border border-surface-variant bg-surface p-3 text-sm text-on-surface">
                  <div className="font-medium">{member.firstName}</div>
                  <div className="mt-1 text-xs text-on-surface-variant" dir="ltr">
                    {member.parentId ? `parent: ${member.parentId}` : 'root member'}
                    {member.birthYear ? ` • ${member.birthYear}` : ''}
                  </div>
                </div>
              ))}
              {parsedMembers.length === 0 ? (
                <p className="text-sm text-on-surface-variant">لا توجد عناصر جاهزة للمعاينة بعد.</p>
              ) : null}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
