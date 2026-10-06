import { API_BASE_URL } from '../lib/config';
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/api';
import useTenantPrefix from '../hooks/useTenantPrefix';
import BrandMark from '../components/BrandMark';

export default function JoinFamily() {
  const { tenantPrefix, tenantSlug: initialTenantSlug } = useTenantPrefix();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  const [submitted, setSubmitted] = useState(false);
  const [approvalState, setApprovalState] = useState<'idle' | 'pending' | 'approved' | 'rejected'>('idle');
  const [showPassword, setShowPassword] = useState(false);
  
  // Shared fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  
  // Join fields
  const [relationship, setRelationship] = useState('');
  
  // Create fields
  const [newFamilyName, setNewFamilyName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('العائلة');
  const [tenantId, setTenantId] = useState('');
  const [tenantCoverImage, setTenantCoverImage] = useState('');
  const [tenantCreatedAt, setTenantCreatedAt] = useState<Date | null>(null);
  const approvalPollRef = useRef<number | null>(null);
  const [approvalChecking, setApprovalChecking] = useState(false);

  useEffect(() => {
    const resolveFromHost = async () => {
      if (initialTenantSlug) return;

      const host = window.location.hostname.toLowerCase();
      const isLocalHost = host === 'localhost' || host === '127.0.0.1';
      if (isLocalHost) return;

      try {
        const result = await apiClient.resolveCurrentTenant();
        const resolvedSlug = result?.tenant?.subdomain;
        const resolvedCustom = result?.tenant?.customDomain?.toLowerCase();
        const host = window.location.hostname.toLowerCase();
        if (resolvedSlug) {
          // If the request is already on the tenant's custom domain, keep URL as-is and store resolved tenant
          if (resolvedCustom && host === resolvedCustom) {
            localStorage.setItem('qabila_resolved_tenant', resolvedSlug);
            return;
          }
          navigate(`/${resolvedSlug}/join`, { replace: true });
        }
      } catch {
        // no-op
      }
    };

    resolveFromHost();
  }, [initialTenantSlug, navigate]);

  useEffect(() => {
    const fetchTenant = async () => {
      try {
        const seedResult = await apiClient.seedDatabase(initialTenantSlug);
        if (!seedResult?.tenantId) return;
        setTenantId(seedResult.tenantId);
        const tenant = await apiClient.getTenant(seedResult.tenantId);
        const name = tenant?.name || 'العائلة';
        setTenantName(name);
        if (tenant?.coverImage) {
          setTenantCoverImage(tenant.coverImage);
        }
        if (tenant?.createdAt) {
          setTenantCreatedAt(new Date(tenant.createdAt));
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchTenant();
  }, [initialTenantSlug]);

  useEffect(() => {
    if (approvalState !== 'pending' || !tenantId || !email) return;

    const pollApproval = async () => {
      setApprovalChecking(true);
      try {
        const status = await apiClient.getJoinRequestStatus(tenantId, email);
        if (status.status === 'approved') {
          setApprovalState('approved');
          setSubmitted(true);
          if (approvalPollRef.current) {
            window.clearInterval(approvalPollRef.current);
            approvalPollRef.current = null;
          }
        } else if (status.status === 'rejected') {
          setApprovalState('rejected');
          if (approvalPollRef.current) {
            window.clearInterval(approvalPollRef.current);
            approvalPollRef.current = null;
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setApprovalChecking(false);
      }
    };

    approvalPollRef.current = window.setInterval(pollApproval, 5000);
    pollApproval();

    return () => {
      if (approvalPollRef.current) {
        window.clearInterval(approvalPollRef.current);
        approvalPollRef.current = null;
      }
    };
  }, [approvalState, tenantId, email]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const normalizedPhone = phone.startsWith('+') ? phone : `+966${phone}`;

      if (activeTab === 'join') {
        const seedResult = await apiClient.seedDatabase(initialTenantSlug);
        if (!seedResult?.tenantId) {
          throw new Error('Missing tenantId');
        }

        setTenantId(seedResult.tenantId);
        
        const payload: any = {
          tenantId: seedResult.tenantId,
          fullName,
          email,
          phone: normalizedPhone,
          password
        };
        
        // Only add optional fields if they have values
        if (relationship && relationship.trim()) {
          payload.relationship = relationship.trim();
        }
        
        console.log('[handleSubmit] Submitting join request with payload:', payload);
        
        const response = await fetch(`${API_BASE_URL}/join-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('[handleSubmit] Error response:', errorData);
          
          // Build detailed error message
          let errorMsg = 'تعذر إرسال الطلب: ';
          if (errorData.details) {
            if (Array.isArray(errorData.details)) {
              errorMsg += errorData.details.map((e: any) => `${e.field}: ${e.message}`).join(', ');
            } else {
              errorMsg += errorData.details;
            }
          } else {
            errorMsg += errorData.error || 'خطأ غير معروف';
          }
          
          throw new Error(errorMsg);
        }
        
        await response.json();
        setApprovalState('pending');
        return;
      } else {
        // Mock create family logic (API not implemented yet)
        await new Promise(resolve => setTimeout(resolve, 1500));
        console.log('Creating family:', newFamilyName, fullName, email);
      }

      setSubmitted(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'تعذر إرسال الطلب حالياً، حاول مرة أخرى.';
      console.error('[handleSubmit] Final error:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (approvalState === 'pending') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pattern-dots">
        <div className="bg-surface-container-lowest border border-surface-variant shadow-heritage-md rounded-lg p-10 max-w-lg w-full text-center flex flex-col items-center gap-5">
          <div className="w-20 h-20 rounded-full border-4 border-secondary/20 border-t-secondary animate-spin" />
          <h2 className="text-3xl font-semibold text-primary">طلبك قيد المراجعة</h2>
          <p className="text-on-surface-variant leading-relaxed">
            تم إرسال طلب الانضمام إلى {tenantName}. نحن نتحقق من بياناتك الآن، وسيتم فتح الدخول تلقائياً بعد اعتماد العضوية.
          </p>
          <div className="w-full bg-surface rounded-lg border border-surface-variant p-4 text-right text-sm text-on-surface-variant">
            <div className="font-bold text-on-surface mb-1">حالة التحقق</div>
            {approvalChecking ? 'جارٍ التحقق من حالة الطلب...' : 'سيتم تحديث الحالة تلقائياً عند اعتماد أو رفض الطلب.'}
          </div>
          <div className="w-full bg-surface rounded-lg border border-surface-variant p-4 text-right text-sm text-on-surface-variant">
            <div className="font-bold text-on-surface mb-1">الخطوة الحالية</div>
            بانتظار اعتماد الطلب من إدارة العائلة.
          </div>
          <Link to={`${tenantPrefix}/login`} className="mt-2 px-6 py-2 bg-primary text-on-primary font-medium rounded hover:bg-primary-container transition-colors">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  if (approvalState === 'approved') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pattern-dots">
        <div className="bg-surface-container-lowest border border-surface-variant shadow-heritage-md rounded-lg p-12 max-w-lg w-full text-center flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-secondary-container text-on-secondary-container rounded-full flex items-center justify-center mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-3xl font-semibold text-primary">تم اعتماد العضوية</h2>
          <p className="text-on-surface-variant">تم قبول طلبك بنجاح. يمكنك الآن تسجيل الدخول إلى مساحة العائلة.</p>
          <Link to={`${tenantPrefix}/login`} className="mt-4 px-6 py-2 bg-primary text-on-primary font-medium rounded hover:bg-primary-container transition-colors">
            تسجيل الدخول الآن
          </Link>
        </div>
      </div>
    );
  }

  if (approvalState === 'rejected') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pattern-dots">
        <div className="bg-surface-container-lowest border border-surface-variant shadow-heritage-md rounded-lg p-12 max-w-lg w-full text-center flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-error-container text-on-error-container rounded-full flex items-center justify-center mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-3xl font-semibold text-primary">تم رفض الطلب</h2>
          <p className="text-on-surface-variant">لم تتم الموافقة على الطلب حالياً. يمكنك التواصل مع إدارة العائلة أو إعادة التقديم لاحقاً.</p>
          <Link to={`${tenantPrefix}/join`} className="mt-4 px-6 py-2 bg-primary text-on-primary font-medium rounded hover:bg-primary-container transition-colors">
            إعادة تقديم الطلب
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="bg-surface-container-lowest border border-surface-variant shadow-heritage-md rounded-lg p-12 max-w-lg w-full text-center flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-secondary-container text-on-secondary-container rounded-full flex items-center justify-center mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-3xl font-semibold text-primary">تم إرسال الطلب</h2>
          <p className="text-on-surface-variant">
            {activeTab === 'join' 
              ? `سيتم مراجعة طلبك من قبل مدراء ${tenantName} وتنبيهك فور الموافقة.`
              : `تم استلام طلب تأسيس مساحة ${newFamilyName}، سنتواصل معك قريباً.`}
          </p>
          <Link to={`${tenantPrefix}/home`} className="mt-4 px-6 py-2 bg-primary text-on-primary font-medium rounded hover:bg-primary-container transition-colors">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col lg:flex-row relative pattern-dots">
      
      {/* Mobile Top Header (Hidden on Desktop) */}
      <div className="lg:hidden flex flex-col items-center pt-12 pb-6 px-6 text-center">
        <div className="mb-4">
          <BrandMark className="h-24 w-24" />
        </div>
        <h1 className="text-3xl font-bold mb-2 tracking-tight text-primary">منصة قبيلة</h1>
        <p className="text-on-surface-variant leading-relaxed text-sm">
          انضم إلى الإرث الرقمي لعائلتك ووثق تاريخك للأجيال القادمة.
        </p>
      </div>

      {/* Left Pane (Desktop Only) */}
      <div className="hidden lg:flex flex-col items-center justify-center w-1/2 p-12 bg-surface border-l border-surface-variant">
        
        <div className="mb-10 flex items-center justify-center">
          <BrandMark className="h-64 w-64" />
        </div>


        {/* Icons row at bottom left */}
        <div className="flex items-center gap-8 text-secondary/70">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
      </div>

      {/* Right Pane Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-4 lg:p-12 relative z-10">
        <div className="w-full max-w-md bg-surface-container-lowest lg:bg-transparent rounded-lg border border-surface-variant lg:border-none shadow-heritage-md lg:shadow-none px-6 py-8 lg:p-0">
          
          {/* Form Tabs */}
          <div className="flex bg-surface-variant p-1 rounded-md mb-8">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${activeTab === 'join' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}
              onClick={() => setActiveTab('join')}
            >
              انضمام لعائلة
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${activeTab === 'create' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}
              onClick={() => setActiveTab('create')}
            >
              تأسيس عائلة جديدة
            </button>
          </div>

          <div className="mb-8 text-center lg:text-right">
            <h2 className="text-3xl font-semibold mb-2 text-primary">
              {activeTab === 'join' ? 'طلب انضمام' : 'تأسيس مساحة عائلة'}
            </h2>
            <p className="text-on-surface-variant text-sm">
              {activeTab === 'join' 
                ? 'يرجى إدخال بياناتك بدقة لطلب الوصول إلى منصة العائلة.'
                : 'أنشئ مساحة مخصصة لعائلتك للبدء في توثيق الإرث وبناء الشجرة.'}
            </p>
          </div>

          {/* Alert Box Desktop (Top positioning) */}
          {activeTab === 'join' && (
            <div className="hidden lg:flex items-start gap-3 bg-secondary-container/20 border border-secondary/30 rounded-lg p-5 mb-8 text-on-secondary-container">
              <div className="mt-0.5 shrink-0 text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <div className="text-sm border-r border-secondary/20 pr-3 mr-3 flex-1">
                <strong className="block mb-1 font-bold">تنبيه الإدارة</strong>
                تخضع جميع طلبات التسجيل للمراجعة والتدقيق من قبل مسؤول العائلة لضمان خصوصية وأمن البيانات.
              </div>
            </div>
          )}

          {/* Family Info Card - Show which family user is joining */}
          {activeTab === 'join' && (
            <div className="mb-8 bg-gradient-to-br from-secondary-container/10 to-tertiary-container/10 border border-secondary/20 rounded-lg p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-secondary">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant mb-1">أنت تطلب الانضمام إلى</p>
                  <h3 className="text-xl font-bold text-primary">{tenantName}</h3>
                </div>
              </div>
              {tenantCoverImage && (
                <img 
                  src={tenantCoverImage} 
                  alt={tenantName}
                  className="w-full h-32 object-cover rounded-md"
                />
              )}
              <div className="flex flex-col gap-2 text-sm text-on-surface-variant">
                {tenantCreatedAt && (
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    <span>تم إنشاء العائلة: {tenantCreatedAt.toLocaleDateString('ar-SA')}</span>
                  </div>
                )}
                <p className="text-xs">تقديم طلبك للانضمام سيجعل البيانات الخاصة بك متاحة للمراجعة من قبل مسؤولي العائلة.</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form 
            className="flex flex-col gap-5 lg:gap-6" 
            onSubmit={handleSubmit}
          >
            {error && (
              <div className="bg-error-container text-on-error-container border border-error/20 rounded p-3 text-sm">
                {error}
              </div>
            )}

            {activeTab === 'create' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-on-surface">اسم العائلة</label>
                <input 
                  type="text" 
                  placeholder="مثال: عائلة الأحمدي" 
                  value={newFamilyName}
                  onChange={(event) => setNewFamilyName(event.target.value)}
                  className="w-full border border-surface-variant rounded bg-surface px-4 py-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors" 
                  required
                />
              </div>
            )}

            {/* Full Name */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-on-surface">الاسم الكامل</label>
              <input 
                type="text" 
                placeholder="عبدالله بن أحمد" 
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full border border-surface-variant rounded bg-surface px-4 py-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors" 
                required
              />
            </div>

            {/* Email & Phone flex row on desktop, stack on mobile */}
            <div className="flex flex-col lg:flex-row gap-5 lg:gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-medium text-on-surface lg:text-right hidden lg:block">البريد الإلكتروني</label>
                 <label className="text-sm font-medium text-on-surface lg:hidden">البريد الإلكتروني</label>
                <input 
                  type="email" 
                  placeholder="example@domain.com" 
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full border border-surface-variant rounded bg-surface px-4 py-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors text-left" 
                  dir="ltr"
                  required
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-medium text-on-surface lg:text-right hidden lg:block">رقم الجوال</label>
                <label className="text-sm font-medium text-on-surface lg:hidden">رقم الهاتف</label>
                <div className="flex" dir="ltr">
                  <div className="bg-surface-variant border border-surface-variant border-r-0 rounded-l px-3 py-3 text-sm flex items-center text-on-surface-variant">
                    +966
                  </div>
                  <input 
                    type="tel" 
                    placeholder="5XXXXXXXX" 
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="w-full border border-surface-variant rounded-r bg-surface px-4 py-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors text-left" 
                    required
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-on-surface">كلمة المرور</label>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-surface-variant rounded bg-surface px-4 py-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors pl-10 text-left" 
                  dir="ltr"
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-secondary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    )}
                    {!showPassword && <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />}
                  </svg>
                </button>
              </div>
            </div>

            {/* Relationship (Only for Join) */}
            {activeTab === 'join' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-on-surface">صلة القرابة (اختياري)</label>
                <input 
                  type="text" 
                  placeholder="مثلاً: حفيد أحمد بن محمد" 
                  value={relationship}
                  onChange={(event) => setRelationship(event.target.value)}
                  className="w-full border border-surface-variant rounded bg-surface px-4 py-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors" 
                />
              </div>
            )}

            {/* Submit Button */}
            <button 
              type="submit"
              disabled={loading}
              className={`w-full bg-primary text-on-primary py-3 rounded font-medium text-[15px] transition-colors mt-2 flex items-center justify-center gap-3 lg:mt-4 group ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-container'}`}
            >
              {loading ? 'جارٍ الإرسال...' : (activeTab === 'join' ? 'إرسال طلب الانضمام' : 'تأسيس المساحة')}
            </button>
          </form>

          {/* Links */}
          <div className="mt-8 text-center text-sm">
            <span className="text-on-surface-variant">لديك حساب بالفعل؟ </span>
            <Link to={`${tenantPrefix}/login`} className="text-secondary font-medium hover:underline font-arabic">تسجيل الدخول</Link>
          </div>

        </div>
      </div>
    </div>
  );
}
