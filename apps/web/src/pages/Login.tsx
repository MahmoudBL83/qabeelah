import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
import useTenantPrefix from '../hooks/useTenantPrefix';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const { tenantPrefix, tenantSlug: routeTenantSlug } = useTenantPrefix();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState(routeTenantSlug || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoClan, setDemoClan] = useState('alahmadi');

  useEffect(() => {
    if (user) {
      if (user.role === 'SUPER_ADMIN') {
        navigate('/super-admin');
      } else if (user.role === 'QABILA_ADMIN' || user.role === 'SUB_ADMIN') {
        navigate(`${tenantPrefix}/admin`);
      } else {
        navigate(`${tenantPrefix}/home`);
      }
      return;
    }

    const resolveFromHost = async () => {
      if (routeTenantSlug) return;

      const host = window.location.hostname.toLowerCase();
      const isLocalHost = host === 'localhost' || host === '127.0.0.1';
      if (isLocalHost) return;

      try {
        const result = await apiClient.resolveCurrentTenant();
        const resolvedSlug = result?.tenant?.subdomain;
        const resolvedCustom = result?.tenant?.customDomain?.toLowerCase();
        const host = window.location.hostname.toLowerCase();
        if (resolvedSlug) {
          // If visiting via verified custom domain, persist resolved tenant and avoid path redirect
          if (resolvedCustom && host === resolvedCustom) {
            localStorage.setItem('qabila_resolved_tenant', resolvedSlug);
            setTenantSlug(resolvedSlug);
            return;
          }
          setTenantSlug(resolvedSlug);
          navigate(`/${resolvedSlug}/login`, { replace: true });
        }
      } catch {
        // no-op
      }
    };

    resolveFromHost();
  }, [user, navigate, tenantPrefix, routeTenantSlug]);

  // demoClan controls which demo tenant the quick-login buttons will set


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tenantSlug.trim()) {
      setError('رمز العائلة مطلوب لتسجيل الدخول للعائلات.');
      return;
    }

    if (!email.trim()) {
      setError('البريد الإلكتروني مطلوب.');
      return;
    }

    if (!password) {
      setError('كلمة المرور مطلوبة.');
      return;
    }

    setLoading(true);

    try {
      if (tenantSlug.trim().toLowerCase() === 'alahmadi') {
        await apiClient.seedDatabase('alahmadi');
      }

      const response = await apiClient.tenantLogin({
        email: email.trim(),
        password,
        tenantSlug: tenantSlug.trim() || undefined
      });

      if (response.user.role === 'SUPER_ADMIN') {
        throw new Error('استخدم بوابة مشرف المنصة لتسجيل الدخول الإداري.');
      }

      login(response.token, response.user);
      const tenantPrefix = response.user.tenantSlug ? `/${response.user.tenantSlug}` : '';

      if (response.user.role === 'QABILA_ADMIN' || response.user.role === 'SUB_ADMIN') {
        navigate(`${tenantPrefix}/admin`);
      } else {
        navigate(`${tenantPrefix}/home`);
      }
    } catch (err: any) {
      const errorMsg = err?.message || '';
      const errorCode = err?.code || '';
      
      // Better error messaging for 401 unauthorized
      if (errorMsg.includes('401') || errorMsg.includes('Invalid credentials')) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة. تحقق من البيانات وحاول مجدداً.');
      } else if (errorCode === 'JOIN_REQUEST_PENDING' || errorMsg.includes('Join request is pending approval')) {
        navigate(`${tenantPrefix}/waiting-approval?tenantSlug=${encodeURIComponent(tenantSlug.trim())}&email=${encodeURIComponent(email.trim())}`, { replace: true });
        return;
      } else if (errorCode === 'JOIN_REQUEST_REJECTED' || errorMsg.includes('Join request has been rejected')) {
        navigate(`${tenantPrefix}/waiting-approval?tenantSlug=${encodeURIComponent(tenantSlug.trim())}&email=${encodeURIComponent(email.trim())}&state=rejected`, { replace: true });
        return;
      } else if (errorMsg.includes('404') || errorMsg.includes('Tenant not found')) {
        setError(`رمز العائلة "${tenantSlug}" غير موجود. تحقق من الرمز وحاول مجدداً.`);
      } else if (errorMsg.includes('Server error')) {
        setError('حدث خطأ في الخادم. يرجى محاولة مرة أخرى لاحقاً.');
      } else {
        setError(errorMsg || 'فشل تسجيل الدخول. يرجى التحقق من بيانات الدخول وحاول مجدداً.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 pattern-dots">
      <div className="bg-surface-container-lowest border border-surface-variant shadow-heritage-md rounded p-8 max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl text-primary font-semibold mb-2">قبيلة</h1>
          <p className="text-on-surface-variant text-sm">أهلاً بك في منصة توثيق الإرث</p>
        </div>

        {error && (
          <div className="bg-error-container text-on-error-container p-3 rounded mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-on-surface">رمز العائلة</label>
            <input
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
              className="border border-surface-variant rounded bg-surface p-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors"
              placeholder="مثال: alahmadi"
              dir="ltr"
              readOnly={Boolean(routeTenantSlug)}
            />
          {/* branch choice removed — demoClan selector below controls quick-login demo tenant */}

          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-on-surface">البريد الإلكتروني</label>
            <input 
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-surface-variant rounded bg-surface p-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors"
              placeholder="name@example.com"
              dir="ltr"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-on-surface">كلمة المرور</label>
            <input 
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-surface-variant rounded bg-surface p-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 rounded font-semibold hover:bg-primary-container transition-colors mt-2 disabled:opacity-50"
          >
            {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3 border-t border-surface-variant pt-6">
          <p className="text-sm font-medium text-on-surface text-center mb-2">تسجيل دخول سريع (حسابات تجريبية)</p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <label className="text-xs">اختر قبيلة تجريبية</label>
            <select
              value={demoClan}
              onChange={(e) => setDemoClan(e.target.value)}
              className="border border-surface-variant rounded bg-surface p-2 text-sm outline-none"
            >
              <option value="alahmadi">alahmadi</option>
              <option value="demo">demo</option>
              <option value="demo2">demo2</option>
              <option value="demo3">demo3</option>
              <option value="demo4">demo4</option>
              <option value="demo5">demo5</option>
              <option value="demo6">demo6</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setEmail(`admin+${demoClan}@qabila.com`); setPassword('password123'); setTenantSlug(demoClan); }}
              className="bg-surface-variant text-on-surface-variant text-xs py-2 rounded font-medium hover:bg-secondary hover:text-on-secondary transition-colors"
            >
              مدير العائلة
            </button>
            <button
              type="button"
              onClick={() => { setEmail(`branch+${demoClan}@qabila.com`); setPassword('password123'); setTenantSlug(demoClan); }}
              className="bg-surface-variant text-on-surface-variant text-xs py-2 rounded font-medium hover:bg-secondary hover:text-on-secondary transition-colors"
            >
              مدير الفرع
            </button>
            <button
              type="button"
              onClick={() => { setEmail(`member+${demoClan}@qabila.com`); setPassword('password123'); setTenantSlug(demoClan); }}
              className="bg-surface-variant text-on-surface-variant text-xs py-2 rounded font-medium hover:bg-secondary hover:text-on-secondary transition-colors"
            >
              عضو العائلة
            </button>
            <Link
              to="/platform-admin/login"
              className="bg-secondary/10 text-secondary text-xs py-2 rounded font-medium hover:bg-secondary/20 transition-colors text-center"
            >
              دخول مشرف المنصة
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-on-surface-variant">
            ليس لديك حساب؟ <Link to={`${tenantPrefix}/join`} className="text-secondary hover:underline">طلب انضمام لعائلة</Link>
          </p>
        </div>

          <div className="mt-4 text-center">
            <Link
              to="/forgot-password"
              className="text-xs text-secondary hover:underline"
            >
              هل نسيت كلمة المرور؟
            </Link>
          </div>
      </div>
    </div>
  );
}
