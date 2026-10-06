import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';

type AuditLogItem = {
  _id: string;
  tenantId?: string;
  type: string;
  description?: string;
  relatedEntityType?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
  userName?: string;
};

export default function SecurityPage() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [showForceOnly, setShowForceOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [geminiHasSavedKey, setGeminiHasSavedKey] = useState(false);
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [geminiSource, setGeminiSource] = useState<'database' | 'environment' | 'missing'>('missing');
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiMessage, setGeminiMessage] = useState('');
  const [tenantBaseDomain, setTenantBaseDomain] = useState('qabila.com');
  const [tenantLoginPath, setTenantLoginPath] = useState('/login');
  const [tenantRoutingSource, setTenantRoutingSource] = useState<'database' | 'environment' | 'missing'>('missing');
  const [tenantRoutingSaving, setTenantRoutingSaving] = useState(false);
  const [tenantRoutingMessage, setTenantRoutingMessage] = useState('');
  const [bunnyApiKeyInput, setBunnyApiKeyInput] = useState('');
  const [bunnyStorageZone, setBunnyStorageZone] = useState('fra1');
  const [bunnyCdnHostname, setBunnyCdnHostname] = useState('https://qabelah.b-cdn.net');
  const [bunnyCdnTokenKey, setBunnyCdnTokenKey] = useState('');
  const [bunnyApiKeyConfigured, setBunnyApiKeyConfigured] = useState(false);
  const [bunnyCdnTokenConfigured, setBunnyCdnTokenConfigured] = useState(false);
  const [bunnySource, setBunnySource] = useState<'database' | 'environment' | 'missing'>('missing');
  const [bunnySaving, setBunnySaving] = useState(false);
  const [bunnyMessage, setBunnyMessage] = useState('');

  const fetchAuditLog = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getAuditLog({ limit: 50, page, type: 'SECURITY_EVENT' });
      let data = res.data || [];
      if (showForceOnly) {
        data = (data as AuditLogItem[]).filter((d) => String(d.description || '').toLowerCase().includes('force'));
      }
      setItems(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  const fetchGeminiSettings = async () => {
    try {
      const settings = await apiClient.getGeminiIntegrationSettings();
      setGeminiHasSavedKey(Boolean(settings.apiKeyConfigured));
      setGeminiApiKeyInput('');
      setGeminiModel(settings.model || 'gemini-2.0-flash');
      setGeminiSource(settings.source || 'missing');
    } catch (err) {
      setGeminiMessage(err instanceof Error ? err.message : 'Failed to load Gemini settings');
    }
  };

  const fetchTenantRoutingSettings = async () => {
    try {
      const settings = await apiClient.getTenantRoutingSettings();
      setTenantBaseDomain(settings.baseDomain || 'qabila.com');
      setTenantLoginPath(settings.loginPath || '/login');
      setTenantRoutingSource(settings.source || 'missing');
    } catch (err) {
      setTenantRoutingMessage(err instanceof Error ? err.message : 'Failed to load tenant routing settings');
    }
  };

  const fetchBunnySettings = async () => {
    try {
      const settings = await apiClient.getBunnySettings();
      setBunnyApiKeyInput(settings.apiKey || '');
      setBunnyStorageZone(settings.storageZone || 'fra1');
      setBunnyCdnHostname(settings.cdnHostname || 'https://qabelah.b-cdn.net');
      setBunnyCdnTokenKey(settings.tokenKey || '');
      setBunnyApiKeyConfigured(Boolean(settings.apiKeyConfigured));
      setBunnyCdnTokenConfigured(Boolean(settings.tokenKeyConfigured));
      setBunnySource(settings.source || 'missing');
    } catch (err) {
      setBunnyMessage(err instanceof Error ? err.message : 'Failed to load Bunny settings');
    }
  };

  const handleSaveGeminiSettings = async () => {
    try {
      setGeminiSaving(true);
      setGeminiMessage('');
      const payload: { apiKey?: string; model?: string } = {};
      if (geminiApiKeyInput.trim()) {
        payload.apiKey = geminiApiKeyInput.trim();
      }
      if (geminiModel.trim()) {
        payload.model = geminiModel.trim();
      }

      if (Object.keys(payload).length === 0) {
        setGeminiMessage('أدخل مفتاحًا جديدًا أو عدّل النموذج قبل الحفظ');
        return;
      }

      const response = await apiClient.saveGeminiIntegrationSettings(payload);
      setGeminiHasSavedKey(Boolean(response.apiKeyConfigured));
      setGeminiApiKeyInput('');
      setGeminiSource(response.source || 'database');
      setGeminiModel(response.model || 'gemini-2.0-flash');
      setGeminiMessage('تم حفظ إعدادات Gemini بنجاح');
    } catch (err) {
      setGeminiMessage(err instanceof Error ? err.message : 'Failed to save Gemini settings');
    } finally {
      setGeminiSaving(false);
    }
  };

  const handleSaveTenantRoutingSettings = async () => {
    try {
      setTenantRoutingSaving(true);
      setTenantRoutingMessage('');
      const payload: { baseDomain?: string; loginPath?: string } = {};

      if (tenantBaseDomain.trim()) {
        payload.baseDomain = tenantBaseDomain.trim();
      }
      if (tenantLoginPath.trim()) {
        payload.loginPath = tenantLoginPath.trim();
      }

      if (Object.keys(payload).length === 0) {
        setTenantRoutingMessage('أدخل نطاقًا أساسيًا أو مسار تسجيل الدخول قبل الحفظ');
        return;
      }

      const response = await apiClient.saveTenantRoutingSettings(payload);
      setTenantBaseDomain(response.baseDomain || 'qabila.com');
      setTenantLoginPath(response.loginPath || '/login');
      setTenantRoutingSource(response.source || 'database');
      setTenantRoutingMessage('تم حفظ إعدادات ربط العائلة بنجاح');
    } catch (err) {
      setTenantRoutingMessage(err instanceof Error ? err.message : 'Failed to save tenant routing settings');
    } finally {
      setTenantRoutingSaving(false);
    }
  };

  const handleSaveBunnySettings = async () => {
    try {
      setBunnySaving(true);
      setBunnyMessage('');
      const payload: { apiKey?: string; storageZone?: string; cdnHostname?: string; tokenKey?: string } = {};

      if (bunnyApiKeyInput.trim()) {
        payload.apiKey = bunnyApiKeyInput.trim();
      }
      if (bunnyStorageZone.trim()) {
        payload.storageZone = bunnyStorageZone.trim();
      }
      if (bunnyCdnHostname.trim()) {
        payload.cdnHostname = bunnyCdnHostname.trim();
      }
      if (bunnyCdnTokenKey.trim()) {
        payload.tokenKey = bunnyCdnTokenKey.trim();
      }

      if (Object.keys(payload).length === 0) {
        setBunnyMessage('أدخل قيمة واحدة على الأقل قبل الحفظ');
        return;
      }

      const response = await apiClient.saveBunnySettings(payload);
      setBunnyApiKeyInput(response.apiKey || bunnyApiKeyInput);
      setBunnyStorageZone(response.storageZone || bunnyStorageZone);
      setBunnyCdnHostname(response.cdnHostname || bunnyCdnHostname);
      setBunnyCdnTokenKey(response.tokenKey || bunnyCdnTokenKey);
      setBunnyApiKeyConfigured(Boolean(response.apiKeyConfigured));
      setBunnyCdnTokenConfigured(Boolean(response.tokenKeyConfigured));
      setBunnySource(response.source || 'database');
      setBunnyMessage('تم حفظ إعدادات Bunny بنجاح');
    } catch (err) {
      setBunnyMessage(err instanceof Error ? err.message : 'Failed to save Bunny settings');
    } finally {
      setBunnySaving(false);
    }
  };

  useEffect(() => {
    fetchAuditLog();
    fetchGeminiSettings();
    fetchTenantRoutingSettings();
    fetchBunnySettings();
  }, [page]);

  const handleClearGeminiKey = async () => {
    try {
      setGeminiSaving(true);
      setGeminiMessage('');
      const response = await apiClient.saveGeminiIntegrationSettings({ clearApiKey: true });
      setGeminiHasSavedKey(Boolean(response.apiKeyConfigured));
      setGeminiApiKeyInput('');
      setGeminiSource(response.source || 'environment');
      setGeminiModel(response.model || 'gemini-2.0-flash');
      setGeminiMessage('تمت إزالة المفتاح المحفوظ والعودة إلى env fallback');
    } catch (err) {
      setGeminiMessage(err instanceof Error ? err.message : 'Failed to clear Gemini key');
    } finally {
      setGeminiSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pattern-dots" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
            <h1 className="mt-2 text-3xl font-bold text-on-surface">لوحة الأمان</h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              مراقبة الحظر، محاولات تجاوز المعدل، وأحداث الأمان المسجلة.
            </p>
          </div>
          <button
            onClick={fetchAuditLog}
            className="rounded-2xl border border-secondary bg-secondary/10 px-4 py-2 text-sm font-medium text-secondary hover:bg-secondary/20"
          >
            تحديث السجل
          </button>
        </div>

        <div className="mb-6 rounded-3xl border border-surface-variant bg-surface-container-lowest p-5 shadow-heritage-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
              <h2 className="text-xl font-bold text-on-surface">إعدادات Gemini OCR</h2>
              <p className="max-w-2xl text-sm text-on-surface-variant">
                ضع مفتاح Gemini هنا بدل env. ستستخدمه عملية استخراج صور شجرة النسب مباشرة من لوحة المشرف العام.
              </p>
              <p className="text-xs text-on-surface-variant">
                المصدر الحالي: <span className="font-semibold text-on-surface">{geminiSource}</span>
              </p>
            </div>

            <div className="grid w-full max-w-xl gap-3">
              <label className="space-y-2 text-sm font-medium text-on-surface">
                <span>Gemini API Key</span>
                <input
                  type="password"
                  value={geminiApiKeyInput}
                  onChange={(event) => setGeminiApiKeyInput(event.target.value)}
                  placeholder={geminiHasSavedKey ? 'مفتاح محفوظ - اكتب مفتاحًا جديدًا لتغييره' : 'أدخل المفتاح'}
                  className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                  dir="ltr"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-on-surface">
                <span>Gemini Model</span>
                <input
                  value={geminiModel}
                  onChange={(event) => setGeminiModel(event.target.value)}
                  placeholder="gemini-2.0-flash"
                  className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                  dir="ltr"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSaveGeminiSettings}
                  disabled={geminiSaving}
                  className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-on-secondary hover:bg-secondary/90 disabled:opacity-50"
                >
                  {geminiSaving ? 'جارٍ الحفظ...' : 'حفظ Gemini'}
                </button>
                <button
                  onClick={handleClearGeminiKey}
                  disabled={geminiSaving || !geminiHasSavedKey}
                  className="rounded-xl border border-surface-variant bg-surface px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-variant/30"
                >
                  إزالة المفتاح المحفوظ
                </button>
              </div>
              {geminiMessage ? (
                <p className="text-sm text-on-surface-variant">{geminiMessage}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-surface-variant bg-surface-container-lowest p-5 shadow-heritage-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
              <h2 className="text-xl font-bold text-on-surface">إعدادات Bunny</h2>
              <p className="max-w-2xl text-sm text-on-surface-variant">
                هذه القيم تتحكم في رفع الملفات وتوليد روابط CDN على مستوى المنصة كلها. أي تعديل هنا سينعكس مباشرة على الرفع والحذف في كل الصفحات.
              </p>
              <p className="text-xs text-on-surface-variant">
                المصدر الحالي: <span className="font-semibold text-on-surface">{bunnySource}</span>
              </p>
            </div>

            <div className="grid w-full max-w-xl gap-3">
              <label className="space-y-2 text-sm font-medium text-on-surface">
                <span>BUNNY_API_KEY</span>
                <input
                  type="password"
                  value={bunnyApiKeyInput}
                  onChange={(event) => setBunnyApiKeyInput(event.target.value)}
                  placeholder={bunnyApiKeyConfigured ? 'مفتاح محفوظ - اكتب مفتاحًا جديدًا لتغييره' : 'أدخل المفتاح'}
                  className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                  dir="ltr"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-on-surface">
                <span>BUNNY_STORAGE_ZONE</span>
                <input
                  value={bunnyStorageZone}
                  onChange={(event) => setBunnyStorageZone(event.target.value)}
                  placeholder="fra1"
                  className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                  dir="ltr"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-on-surface">
                <span>BUNNY_CDN_HOSTNAME</span>
                <input
                  value={bunnyCdnHostname}
                  onChange={(event) => setBunnyCdnHostname(event.target.value)}
                  placeholder="https://ansab.fra1.digitaloceanspaces.com"
                  className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                  dir="ltr"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-on-surface">
                <span>BUNNY_CDN_TOKEN_KEY</span>
                <input
                  type="password"
                  value={bunnyCdnTokenKey}
                  onChange={(event) => setBunnyCdnTokenKey(event.target.value)}
                  placeholder={bunnyCdnTokenConfigured ? 'مفتاح محفوظ - اكتب مفتاحًا جديدًا لتغييره' : 'أدخل المفتاح'}
                  className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                  dir="ltr"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSaveBunnySettings}
                  disabled={bunnySaving}
                  className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-on-secondary hover:bg-secondary/90 disabled:opacity-50"
                >
                  {bunnySaving ? 'جارٍ الحفظ...' : 'حفظ Bunny'}
                </button>
              </div>
              {bunnyMessage ? <p className="text-sm text-on-surface-variant">{bunnyMessage}</p> : null}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-surface-variant bg-surface-container-lowest p-5 shadow-heritage-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs text-on-surface-variant">قبيلة | المشرف العام</p>
              <h2 className="text-xl font-bold text-on-surface">إعدادات النطاق</h2>
              <p className="max-w-2xl text-sm text-on-surface-variant">
                هنا تحدد عنوان المنصة ومسار فتح العائلة. إذا أضفت نطاقًا مخصصًا مثل aljazi.com فسيُستخدم بدل رابط المنصة الافتراضي عند فتح تلك العائلة.
              </p>
              <p className="text-xs text-on-surface-variant">
                مصدر الإعداد: <span className="font-semibold text-on-surface">{tenantRoutingSource}</span>
              </p>
            </div>

            <div className="grid w-full max-w-xl gap-3">
              <label className="space-y-2 text-sm font-medium text-on-surface">
                <span>نطاق المنصة</span>
                <input
                  value={tenantBaseDomain}
                  onChange={(event) => setTenantBaseDomain(event.target.value)}
                  placeholder="qabila.com"
                  className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                  dir="ltr"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-on-surface">
                <span>مسار فتح العائلة</span>
                <input
                  value={tenantLoginPath}
                  onChange={(event) => setTenantLoginPath(event.target.value)}
                  placeholder="/login"
                  className="w-full rounded-2xl border border-surface-variant bg-surface px-4 py-3 text-sm text-on-surface focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25"
                  dir="ltr"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSaveTenantRoutingSettings}
                  disabled={tenantRoutingSaving}
                  className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-on-secondary hover:bg-secondary/90 disabled:opacity-50"
                >
                  {tenantRoutingSaving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
                </button>
              </div>
              {tenantRoutingMessage ? (
                <p className="text-sm text-on-surface-variant">{tenantRoutingMessage}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-surface-variant bg-surface px-4 py-4">
            <h3 className="text-sm font-bold text-on-surface">دليل ربط النطاق المخصص</h3>
            <div className="mt-3 space-y-3 text-sm text-on-surface-variant">
              <p>1. اكتب النطاق الذي تريد استخدامه للعائلة مثل <span className="font-semibold text-on-surface" dir="ltr">aljazi.com</span> أو <span className="font-semibold text-on-surface" dir="ltr">family.aljazi.com</span>.</p>
              <p>2. افتح لوحة إدارة النطاق عند مزود الخدمة وأضف سجل DNS مناسبًا:</p>
              <div className="rounded-xl bg-surface-container-lowest px-4 py-3 font-mono text-xs text-on-surface">
                <p dir="ltr">CNAME  www.aljazi.com  →  your-platform-host.com</p>
                <p dir="ltr" className="mt-1">A/ALIAS  aljazi.com  →  platform IP or provider target</p>
              </div>
              <p>3. إذا كان المزود يدعم التحقق عبر TXT، أضف سجل TXT الذي يظهر في لوحة العائلة ثم اضغط «بدء التحقق» من لوحة العائلة نفسها.</p>
              <p>4. بعد نجاح التحقق، سيفتح الرابط مباشرة على النطاق المخصص بدل عنوان المنصة.</p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-3xl border border-surface-variant bg-surface-container-lowest shadow-heritage-sm">
          <div className="border-b border-surface-variant px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-on-surface">سجل التدقيق الأمني</h2>
                <p className="text-sm text-on-surface-variant">آخر {items.length} حدث أمني</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={showForceOnly} onChange={(e) => { setShowForceOnly(e.target.checked); setPage(1); }} className="h-4 w-4" />
                  <span className="text-sm">عرض أحداث Force-create فقط</span>
                </label>
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  className="rounded-xl border border-surface-variant bg-surface px-3 py-2 disabled:opacity-50"
                >
                  السابق
                </button>
                <span className="text-on-surface-variant">صفحة {page}</span>
                <button
                  disabled={loading || items.length < 50}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-xl border border-surface-variant bg-surface px-3 py-2 disabled:opacity-50"
                >
                  التالي
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-on-surface-variant">جاري تحميل السجل...</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-on-surface-variant">لا توجد أحداث أمنية حتى الآن.</div>
          ) : (
            <div className="divide-y divide-surface-variant">
              {items.map((item) => (
                <div key={item._id} className="grid gap-2 px-5 py-4 md:grid-cols-[160px_1fr_180px] md:items-start">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{item.type}</p>
                    <p className="text-xs text-on-surface-variant">{item.relatedEntityType || 'Security'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-on-surface">{item.description || 'بدون وصف'}</p>
                    {item.metadata ? (
                      <pre className="mt-2 overflow-auto rounded-2xl bg-surface px-3 py-2 text-xs text-on-surface-variant">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  <div className="text-xs text-on-surface-variant md:text-left">
                    <p>{item.userName || 'system'}</p>
                    <p>{item.tenantId || 'global'}</p>
                    <p>{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}