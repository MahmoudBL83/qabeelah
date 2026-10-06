import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import { apiClient } from '../lib/api';

type ApprovalState = 'pending' | 'approved' | 'rejected';

export default function WaitingApproval() {
  const navigate = useNavigate();
  const { tenantSlug: routeTenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const tenantSlug = useMemo(() => {
    const fromQuery = searchParams.get('tenantSlug') || '';
    return (routeTenantSlug || fromQuery).trim().toLowerCase();
  }, [routeTenantSlug, searchParams]);
  const email = (searchParams.get('email') || '').trim().toLowerCase();
  const initialState = (searchParams.get('state') || 'pending') as ApprovalState;

  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState('العائلة');
  const [state, setState] = useState<ApprovalState>(initialState);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!tenantSlug) return;

    const loadTenant = async () => {
      try {
        const seed = await apiClient.seedDatabase(tenantSlug);
        if (!seed?.tenantId) return;
        setTenantId(seed.tenantId);
        const tenant = await apiClient.getTenant(seed.tenantId);
        setTenantName(tenant?.name || 'العائلة');
      } catch {
        // no-op
      }
    };

    loadTenant();
  }, [tenantSlug]);

  useEffect(() => {
    if (!tenantId || !email || state !== 'pending') return;

    const poll = async () => {
      try {
        setChecking(true);
        const status = await apiClient.getJoinRequestStatus(tenantId, email);
        if (status.status === 'approved') {
          setState('approved');
        } else if (status.status === 'rejected') {
          setState('rejected');
        }
      } catch {
        // no-op
      } finally {
        setChecking(false);
      }
    };

    const interval = window.setInterval(poll, 5000);
    poll();

    return () => window.clearInterval(interval);
  }, [tenantId, email, state]);

  const loginPath = tenantSlug ? `/${tenantSlug}/login` : '/login';
  const joinPath = tenantSlug ? `/${tenantSlug}/join` : '/join';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 pattern-dots">
      <div className="w-full max-w-xl rounded-2xl border border-surface-variant bg-surface-container-lowest p-8 text-center shadow-heritage-md">
        <div className="mb-6 flex items-center justify-center gap-4">
          <BrandMark className="h-16 w-16" />
    
        </div>

        {state === 'pending' && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border-4 border-secondary/20 border-t-secondary animate-spin" />
            <h2 className="mb-3 text-2xl font-semibold text-on-surface">بانتظار الموافقة</h2>
            <p className="mx-auto max-w-lg text-on-surface-variant leading-relaxed">
              تم تسجيل حسابك بنجاح، لكن الوصول إلى {tenantName} سيفتح فقط بعد موافقة مسؤول العائلة.
            </p>
            <div className="mt-6 rounded-xl border border-surface-variant bg-surface p-4 text-right text-sm text-on-surface-variant">
              <div className="mb-1 font-semibold text-on-surface">حالة الطلب</div>
              {checking ? 'جارٍ التحقق من حالة الطلب...' : 'سيتم تحديث الحالة تلقائياً فور الاعتماد أو الرفض.'}
            </div>
          </>
        )}

        {state === 'approved' && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
              ✓
            </div>
            <h2 className="mb-3 text-2xl font-semibold text-on-surface">تمت الموافقة</h2>
            <p className="mx-auto max-w-lg text-on-surface-variant">
              تمت الموافقة على عضويتك. يمكنك الآن تسجيل الدخول إلى مساحة العائلة.
            </p>
          </>
        )}

        {state === 'rejected' && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-error-container text-on-error-container">
              ×
            </div>
            <h2 className="mb-3 text-2xl font-semibold text-on-surface">تم رفض الطلب</h2>
            <p className="mx-auto max-w-lg text-on-surface-variant">
              لم تتم الموافقة على الطلب حالياً. يمكنك التواصل مع مسؤول العائلة أو إعادة التقديم.
            </p>
          </>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to={loginPath} className="rounded-xl bg-primary px-6 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-container hover:text-on-primary-container">
            العودة لتسجيل الدخول
          </Link>
          <Link to={joinPath} className="rounded-xl border border-surface-variant px-6 py-3 font-semibold text-on-surface transition-colors hover:bg-surface">
            طلب انضمام جديد
          </Link>
        </div>

        <button
          type="button"
          className="mt-6 text-sm text-secondary hover:underline"
          onClick={() => navigate(loginPath)}
        >
          الرجوع لصفحة الدخول
        </button>
      </div>
    </div>
  );
}