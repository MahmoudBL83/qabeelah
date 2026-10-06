import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../../lib/api';
import AdminLayout from '../../components/layout/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { UserRole } from '@qabila/types';
import { useParams, useSearchParams } from 'react-router-dom';
import { formatDateWithHijri } from '../../lib/date';

type JoinRequest = {
  _id: string;
  fullName: string;
  email: string;
  phone: string;
  relationship?: string;
  notes?: string;
  documents?: string[];
  createdAt: string;
};

type PersonOption = {
  _id: string;
  firstName: string;
  lastName: string;
};

type LineageRequest = {
  _id: string;
  userId?: {
    _id?: string;
    name?: string;
    email?: string;
    phone?: string;
  } | string;
  documents?: string[];
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  notes?: string;
  reviewedAt?: string;
  createdAt: string;
};

const getLineageStatusLabel = (status: LineageRequest['status']) => {
  switch (status) {
    case 'verified':
      return 'موثق';
    case 'pending':
      return 'قيد المراجعة';
    case 'rejected':
      return 'مرفوض';
    case 'unverified':
    default:
      return 'غير موثق';
  }
};

const getLineageStatusClass = (status: LineageRequest['status']) => {
  switch (status) {
    case 'verified':
      return 'bg-primary text-on-primary';
    case 'pending':
      return 'bg-secondary-container text-secondary';
    case 'rejected':
      return 'bg-error text-on-error';
    case 'unverified':
    default:
      return 'bg-surface-variant text-on-surface-variant';
  }
};

type ApprovalModal = {
  requestId: string;
  fullName: string;
  addToTree: boolean;
  selectedParentId: string | null;
} | null;

export default function Approvals() {
  const { user } = useAuth();
  const { tenantSlug: routeTenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'direct' | 'other'>('all');
  const [tenantId, setTenantId] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [approvalModal, setApprovalModal] = useState<ApprovalModal>(null);
  const [parentsList, setParentsList] = useState<PersonOption[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [lineageRequests, setLineageRequests] = useState<LineageRequest[]>([]);
  const [selectedLineageId, setSelectedLineageId] = useState<string | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageActionId, setLineageActionId] = useState('');
  const [lineageNotes, setLineageNotes] = useState('');
  const requestIdFromQuery = searchParams.get('requestId');
  const lineageRequestIdFromQuery = searchParams.get('lineageRequestId');

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const seedResult = await apiClient.seedDatabase(routeTenantSlug || user?.tenantSlug);
        if (!seedResult?.tenantId) {
          throw new Error('Missing tenantId');
        }
        setTenantId(seedResult.tenantId);

        const [data] = await Promise.all([
          apiClient.getPendingJoinRequests(seedResult.tenantId, 50)
        ]);
        setRequests(data);
        const initialSelectedRequest = requestIdFromQuery
          ? data.find((request: JoinRequest) => request._id === requestIdFromQuery) ?? data[0]
          : data[0];
        setSelectedId(initialSelectedRequest?._id ?? null);
      } catch (err) {
        console.error(err);
        setError('تعذر تحميل طلبات الانضمام.');
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [routeTenantSlug, requestIdFromQuery, user?.tenantSlug]);

  useEffect(() => {
    const fetchLineageRequests = async () => {
      if (!tenantId) return;
      try {
        setLineageLoading(true);
        const data = await apiClient.getPendingLineageRequests(tenantId);
        setLineageRequests(data);
        const initialSelectedLineage = lineageRequestIdFromQuery
          ? data.find((request: LineageRequest) => request._id === lineageRequestIdFromQuery) ?? data[0]
          : data[0];
        setSelectedLineageId(initialSelectedLineage?._id ?? null);
        setLineageNotes(initialSelectedLineage?.notes || '');
      } catch (err) {
        console.error(err);
      } finally {
        setLineageLoading(false);
      }
    };

    fetchLineageRequests();
  }, [tenantId]);

  useEffect(() => {
    if (requests.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !requests.some((request) => request._id === selectedId)) {
      setSelectedId(requests[0]._id);
    }
  }, [requests, selectedId]);

  useEffect(() => {
    if (!requestIdFromQuery || requests.length === 0) return;

    const queryMatch = requests.find((request) => request._id === requestIdFromQuery);
    if (queryMatch) {
      setSelectedId(queryMatch._id);
    }
  }, [requestIdFromQuery, requests]);

  useEffect(() => {
    if (!lineageRequestIdFromQuery || lineageRequests.length === 0) return;

    const queryMatch = lineageRequests.find((request) => request._id === lineageRequestIdFromQuery);
    if (queryMatch) {
      setSelectedLineageId(queryMatch._id);
      setLineageNotes(queryMatch.notes || '');
    }
  }, [lineageRequestIdFromQuery, lineageRequests]);

  const selectedRequest = requests.find((request) => request._id === selectedId) ?? null;
  const selectedLineageRequest = lineageRequests.find((request) => request._id === selectedLineageId) ?? null;

  const toast = useToast();

  const canManageGlobal = user?.role === UserRole.QABILA_ADMIN || (user?.role === UserRole.SUB_ADMIN && user?.tenantId && user.tenantId === tenantId);

  const openApprovalModal = async (requestId: string, fullName: string) => {
    try {
      setLoadingParents(true);
      const persons = await apiClient.getPersons(tenantId);
      setParentsList(persons);
      setApprovalModal({
        requestId,
        fullName,
        addToTree: false,
        selectedParentId: null
      });
    } catch (err) {
      console.error(err);
      toast.show('فشل تحميل قائمة الأسرة', 'error');
    } finally {
      setLoadingParents(false);
    }
  };

  const handleDecision = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!canManageGlobal) {
      setError('لا تملك الصلاحية لاتخاذ هذا الإجراء.');
      return;
    }

    // If approving and user wants to add to tree, show modal
    if (status === 'approved' && !approvalModal) {
      const request = requests.find(r => r._id === requestId);
      if (request) {
        openApprovalModal(requestId, request.fullName);
      }
      return;
    }

    try {
      setActionLoadingId(requestId);
      
      // Update join request status
      await apiClient.updateJoinRequestStatus(requestId, status, tenantId);

      // If approving and user selected to add to tree, create the person
      if (status === 'approved' && approvalModal?.addToTree && approvalModal?.selectedParentId) {
        const [firstName, ...lastNameParts] = approvalModal.fullName.split(' ');
        const lastName = lastNameParts.join(' ') || '';
        
        await apiClient.createPerson({
          tenantId,
          firstName,
          lastName: lastName || 'unknown',
          parentId: approvalModal.selectedParentId
        });
        
        toast.show('تم اعتماد الطلب وإضافة العضو للشجرة العائلية', 'success');
      } else {
        toast.show(status === 'approved' ? 'تم اعتماد الطلب بنجاح' : 'تم رفض الطلب', status === 'approved' ? 'success' : 'info');
      }

      setRequests((prev) => prev.filter((request) => request._id !== requestId));
      setApprovalModal(null);
    } catch (err) {
      console.error(err);
      setError('تعذر تحديث حالة الطلب.');
      toast.show('فشل تحديث حالة الطلب', 'error');
    } finally {
      setActionLoadingId('');
    }
  };

  const formatDate = (isoDate: string) => formatDateWithHijri(isoDate).combined;

  const getFirstNameFromFullName = (name?: string) => {
    const trimmed = (name || '').trim();
    return trimmed ? trimmed.split(/\s+/)[0] : '—';
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join('') || '؟';
  };

  const documentCount = selectedRequest?.documents?.length ?? 0;
  const matchScore = selectedRequest
    ? Math.min(95, 55 + documentCount * 12 + (selectedRequest.notes ? 5 : 0))
    : 0;
  const matchLabel = selectedRequest
    ? `${matchScore.toLocaleString('ar-SA')}% مرجح`
    : 'غير متوفر';

  const filteredRequests = requests.filter((request) => {
    if (filter === 'all') return true;
    const relation = (request.relationship || '').toLowerCase();
    const isDirect = /ابن|بنت|حفيد|والد|والدة|أب|أم/.test(relation);
    return filter === 'direct' ? isDirect : !isDirect;
  });

  const directRequestsCount = useMemo(
    () => requests.filter((request) => /ابن|بنت|حفيد|والد|والدة|أب|أم/.test((request.relationship || '').toLowerCase())).length,
    [requests]
  );

  const averageDocuments = useMemo(() => {
    if (requests.length === 0) return 0;
    const totalDocuments = requests.reduce((sum, request) => sum + (request.documents?.length || 0), 0);
    return Math.round(totalDocuments / requests.length);
  }, [requests]);

  const lineageAverageDocuments = useMemo(() => {
    if (lineageRequests.length === 0) return 0;
    const totalDocuments = lineageRequests.reduce((sum, request) => sum + (request.documents?.length || 0), 0);
    return Math.round(totalDocuments / lineageRequests.length);
  }, [lineageRequests]);

  const handleLineageDecision = async (requestId: string, status: 'pending' | 'verified' | 'rejected') => {
    if (!tenantId || !canManageGlobal) return;
    try {
      setLineageActionId(requestId);
      await apiClient.updateLineageRequestStatus(tenantId, requestId, status, lineageNotes);
      setLineageRequests((prev) => prev.map((request) => request._id === requestId ? { ...request, status, notes: lineageNotes, reviewedAt: new Date().toISOString() } : request));
      toast.show(status === 'verified' ? 'تم اعتماد التحقق من النسب' : status === 'rejected' ? 'تم رفض التحقق من النسب' : 'تمت إعادة الطلب للمراجعة', 'success');
    } catch (err) {
      console.error(err);
      toast.show('فشل تحديث حالة التحقق من النسب', 'error');
    } finally {
      setLineageActionId('');
    }
  };

  const decisionHint = selectedRequest
    ? selectedRequest.notes
      ? 'هذه الطلبية تحتوي على ملاحظات داعمة. راجع الوثائق ثم اتخذ القرار.'
      : 'لا توجد ملاحظات إضافية. راجع الصلة والوثائق قبل الاعتماد.'
    : 'اختر طلباً من الجدول لعرض تفاصيله.';
  
  return (
    <AdminLayout>
      <div className="mb-8 text-right space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold mb-3">
              مراجعة الانضمام
            </span>
            <h2 className="text-3xl font-bold mb-2 text-primary">طلبات الانضمام المعلقة</h2>
            <p className="text-on-surface-variant text-sm max-w-2xl">
              لديك {loading ? '...' : requests.length} طلباً جديداً بحاجة للمراجعة والتدقيق في النسب، مع ملخص سريع يساعدك على اتخاذ القرار بسرعة.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="min-w-[120px] rounded-2xl border border-surface-variant bg-surface-container-lowest px-4 py-3 shadow-sm">
              <p className="text-[11px] text-on-surface-variant">إجمالي الطلبات</p>
              <p className="text-2xl font-bold text-on-surface">{loading ? '...' : requests.length}</p>
            </div>
            <div className="min-w-[120px] rounded-2xl border border-surface-variant bg-surface-container-lowest px-4 py-3 shadow-sm">
              <p className="text-[11px] text-on-surface-variant">الأقارب المباشرون</p>
              <p className="text-2xl font-bold text-on-surface">{loading ? '...' : directRequestsCount}</p>
            </div>
            <div className="min-w-[120px] rounded-2xl border border-surface-variant bg-surface-container-lowest px-4 py-3 shadow-sm">
              <p className="text-[11px] text-on-surface-variant">متوسط الوثائق</p>
              <p className="text-2xl font-bold text-on-surface">{loading ? '...' : averageDocuments}</p>
            </div>
          </div>
      </div>
        {error && (
          <div className="bg-error-container text-on-error-container border border-error rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

      </div>

      <div className="flex flex-col xl:flex-row gap-8">
        
        {/* Right List Panel */}
        <div className="flex-1 order-2 xl:order-1 bg-surface-container-lowest rounded-lg border border-surface-variant shadow-sm overflow-hidden">
           {/* Filters Tab */}
           <div className="flex items-center justify-between p-4 border-b border-surface-variant bg-surface">
             <div className="flex gap-4">
               <button
                 className={`px-5 py-2 rounded-lg text-sm font-bold ${filter === 'all' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant hover:bg-surface-variant/20'}`}
                 onClick={() => setFilter('all')}
               >
                 الكل
               </button>
               <button
                 className={`px-5 py-2 rounded-lg text-sm font-medium ${filter === 'direct' ? 'bg-secondary/20 text-secondary' : 'text-on-surface-variant hover:bg-surface-variant/20'}`}
                 onClick={() => setFilter('direct')}
               >
                 أقارب مباشرون
               </button>
               <button
                 className={`px-5 py-2 rounded-lg text-sm font-medium ${filter === 'other' ? 'bg-secondary/20 text-secondary' : 'text-on-surface-variant hover:bg-surface-variant/20'}`}
                 onClick={() => setFilter('other')}
               >
                 أخرى
               </button>
             </div>
           </div>

           <table className="w-full text-sm text-right">
              <thead className="bg-surface text-on-surface-variant font-medium border-b border-surface-variant text-xs">
                <tr>
                  <th className="px-6 py-4">مقدم الطلب</th>
                  <th className="px-6 py-4">الصلة المزعومة</th>
                  <th className="px-6 py-4">التاريخ</th>
                  <th className="px-6 py-4 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-variant/50">
                {loading ? (
                  <tr>
                    <td className="px-6 py-8 text-center text-on-surface-variant text-sm" colSpan={4}>
                      جارٍ تحميل الطلبات...
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td className="px-6 py-8 text-center text-on-surface-variant text-sm" colSpan={4}>
                      لا توجد طلبات مطابقة حالياً.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => (
                    <tr
                      key={request._id}
                      className={`cursor-pointer transition-colors ${request._id === selectedId ? 'bg-surface-variant/20 relative' : 'hover:bg-surface/50'}`}
                      onClick={() => setSelectedId(request._id)}
                    >
                      <td className="px-6 py-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md border border-secondary/30 bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold">
                          {getInitials(getFirstNameFromFullName(request.fullName))}
                        </div>
                        <div>
                          <p className="font-bold text-[15px] text-on-surface">{getFirstNameFromFullName(request.fullName)}</p>
                          <p className="text-[11px] text-on-surface-variant" dir="ltr">{request.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-surface-variant text-on-surface-variant px-3 py-1 rounded text-xs">
                          {request.relationship || 'غير محدد'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant text-xs text-center pr-10">
                        {formatDate(request.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-left">
                        <div className="flex gap-2 justify-end">
                          <button
                            className={`bg-primary text-on-primary px-5 py-2 rounded text-xs transition-colors ${
                              canManageGlobal && actionLoadingId !== request._id ? 'hover:bg-primary-container' : 'opacity-60 cursor-not-allowed'
                            }`}
                              disabled={!canManageGlobal || actionLoadingId === request._id}
                            onClick={(event) => {
                              event.stopPropagation();
                              openApprovalModal(request._id, request.fullName);
                            }}
                          >
                              {actionLoadingId === request._id ? 'جارٍ الحفظ...' : 'قبول'}
                          </button>
                          <button
                            className={`border border-surface-variant text-on-surface-variant bg-surface px-5 py-2 rounded text-xs transition-colors ${
                                canManageGlobal && actionLoadingId !== request._id ? 'hover:bg-surface-variant/20' : 'opacity-60 cursor-not-allowed'
                            }`}
                              disabled={!canManageGlobal || actionLoadingId === request._id}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDecision(request._id, 'rejected');
                            }}
                          >
                              {actionLoadingId === request._id ? 'جارٍ الحفظ...' : 'رفض'}
                          </button>
                        </div>
                      </td>
                      {request._id === selectedId && (
                        <td className="absolute inset-y-0 right-0 w-1 bg-secondary"></td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
           </table>
        </div>

        {/* Left Detail Inspector Panel */}
        <div className="w-full xl:w-80 flex flex-col gap-6 order-1 xl:order-2">
          
          {/* Profile Card */}
          <div className="bg-surface-container-lowest border border-surface-variant shadow-sm rounded-lg p-6 text-center relative overflow-hidden">
             <div className="w-24 h-24 mx-auto rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center text-3xl font-bold shadow-md mb-4 relative z-10">
               {selectedRequest ? getInitials(getFirstNameFromFullName(selectedRequest.fullName)) : '؟'}
             </div>
             <h3 className="text-xl font-bold mb-1 text-on-surface">{selectedRequest ? getFirstNameFromFullName(selectedRequest.fullName) : '—'}</h3>
             <p className="text-xs text-on-surface-variant mb-6">مقدمة طلب انضمام</p>

            <div className="flex flex-wrap gap-2 justify-center mb-5">
              <span className="px-3 py-1 rounded-full bg-surface-variant text-on-surface-variant text-[11px] font-bold">
                {selectedRequest?.relationship || 'غير محدد'}
              </span>
              <span className="px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold">
                {documentCount} وثائق
              </span>
            </div>

            <div className="bg-surface p-4 rounded-lg text-sm text-on-surface-variant mb-6 relative border border-surface-variant">
              <span className="absolute -top-2.5 right-4 bg-surface-container-lowest px-2 text-[10px] text-primary font-bold">الصلة الموضحة</span>
              {selectedRequest?.notes || 'لا توجد تفاصيل إضافية.'}
            </div>

            {selectedRequest?.documents && selectedRequest.documents.length > 0 && (
              <div className="bg-surface p-4 rounded-lg text-right text-sm border border-surface-variant">
                <div className="font-bold text-on-surface mb-2">الوثائق المرفقة</div>
                <div className="flex flex-col gap-2">
                  {selectedRequest.documents.map((d, i) => (
                    <a key={i} href={d} target="_blank" rel="noreferrer" className="text-primary underline text-sm">
                      عرض الوثيقة #{i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-surface p-4 rounded-lg text-right text-xs text-on-surface-variant mb-6 border border-surface-variant">
              <div className="font-bold text-on-surface mb-1">مساعدة سريعة</div>
              {decisionHint}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-surface border border-surface-variant p-3 rounded-lg flex flex-col items-center justify-center">
                <span className="text-[10px] text-on-surface-variant mb-1">الوثائق</span>
                <span className="text-secondary font-bold text-sm">{documentCount} ملفات<br/>مرفقة</span>
              </div>
              <div className="bg-surface border border-surface-variant p-3 rounded-lg flex flex-col items-center justify-center">
                <span className="text-[10px] text-on-surface-variant mb-1">تطابق النسب</span>
                <span className="text-on-surface font-bold text-sm">{matchLabel}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                className={`bg-secondary text-on-secondary py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 ${selectedRequest && canManageGlobal ? 'hover:bg-secondary-container transition-colors' : 'opacity-60 cursor-not-allowed'}`}
                disabled={!selectedRequest || !canManageGlobal}
                onClick={() => selectedRequest && openApprovalModal(selectedRequest._id, selectedRequest.fullName)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                اعتماد العضوية فوراً
              </button>
              <button
                className={`border border-error text-error py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 ${selectedRequest && canManageGlobal ? 'hover:bg-error-container transition-colors' : 'opacity-60 cursor-not-allowed'}`}
                disabled={!selectedRequest || !canManageGlobal}
                onClick={() => selectedRequest && handleDecision(selectedRequest._id, 'rejected')}
              >
                رفض الطلب
              </button>
            </div>

            {selectedRequest && (
              <div className="mt-4 rounded-lg border border-surface-variant bg-surface p-4 text-right text-sm">
                <div className="font-bold text-on-surface mb-2">البيانات الأساسية</div>
                <div className="grid grid-cols-1 gap-2 text-on-surface-variant text-xs">
                  <div className="flex justify-between gap-3"><span>البريد</span><span dir="ltr">{selectedRequest.email}</span></div>
                  <div className="flex justify-between gap-3"><span>الهاتف</span><span dir="ltr">{selectedRequest.phone}</span></div>
                  <div className="flex justify-between gap-3"><span>التاريخ</span><span>{formatDate(selectedRequest.createdAt)}</span></div>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-lg border border-surface-variant bg-surface-container-lowest p-4 text-right">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold text-on-surface">التحقق من النسب</div>
                  <div className="text-xs text-on-surface-variant">{lineageLoading ? 'جارٍ التحميل...' : `${lineageRequests.length} طلبات`}</div>
                </div>
                <div className="text-xs text-on-surface-variant">متوسط المرفقات: {lineageAverageDocuments}</div>
              </div>

              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                {lineageRequests.length === 0 ? (
                  <div className="text-xs text-on-surface-variant">لا توجد طلبات تحقق حالياً.</div>
                ) : (
                  lineageRequests.map((request) => {
                    const requester = typeof request.userId === 'string' ? null : request.userId;
                    return (
                      <button
                        key={request._id}
                        type="button"
                        onClick={() => {
                          setSelectedLineageId(request._id);
                          setLineageNotes(request.notes || '');
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-right transition-colors ${selectedLineageId === request._id ? 'border-secondary bg-secondary-container/20' : 'border-surface-variant bg-surface hover:bg-surface-variant/20'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-on-surface">
                            {requester?.name || requester?.email || 'مستخدم غير محدد'}
                          </div>
                          <span className={`text-[10px] rounded-full px-2 py-0.5 ${getLineageStatusClass(request.status)}`}>{getLineageStatusLabel(request.status)}</span>
                        </div>
                        <div className="text-[11px] text-on-surface-variant mt-1 flex items-center justify-between gap-2">
                          <span>{requester?.phone || ''}</span>
                          <span>{request.documents?.length || 0} مرفقات</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedLineageRequest && (
                <div className="mt-4 border-t border-surface-variant pt-4 space-y-3">
                  <div className="text-xs text-on-surface-variant">
                    {typeof selectedLineageRequest.userId === 'string' ? selectedLineageRequest.userId : selectedLineageRequest.userId?.email || ''}
                  </div>

                  {selectedLineageRequest.documents && selectedLineageRequest.documents.length > 0 && (
                    <div className="space-y-2">
                      {selectedLineageRequest.documents.map((documentUrl, index) => (
                        <a key={index} href={documentUrl} target="_blank" rel="noreferrer" className="block text-primary underline text-xs">
                          مستند النسب #{index + 1}
                        </a>
                      ))}
                    </div>
                  )}

                  <textarea
                    value={lineageNotes}
                    onChange={(e) => setLineageNotes(e.target.value)}
                    rows={3}
                    placeholder="ملاحظات المراجعة"
                    className="w-full rounded-lg border border-surface-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={!canManageGlobal || lineageActionId === selectedLineageRequest._id}
                      onClick={() => handleLineageDecision(selectedLineageRequest._id, 'pending')}
                      className="rounded-lg border border-surface-variant px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-variant/20 disabled:opacity-60"
                    >
                      إعادة
                    </button>
                    <button
                      type="button"
                      disabled={!canManageGlobal || lineageActionId === selectedLineageRequest._id}
                      onClick={() => handleLineageDecision(selectedLineageRequest._id, 'verified')}
                      className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-on-secondary hover:bg-secondary-container disabled:opacity-60"
                    >
                      اعتماد
                    </button>
                    <button
                      type="button"
                      disabled={!canManageGlobal || lineageActionId === selectedLineageRequest._id}
                      onClick={() => handleLineageDecision(selectedLineageRequest._id, 'rejected')}
                      className="rounded-lg border border-error px-3 py-2 text-xs font-medium text-error hover:bg-error-container disabled:opacity-60"
                    >
                      رفض
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      {approvalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-container-lowest border border-surface-variant rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-on-surface mb-4">تأكيد الاعتماد</h2>
            
            <div className="bg-surface border border-surface-variant rounded-lg p-4 mb-6">
              <p className="text-sm text-on-surface-variant">مقدم الطلب</p>
              <p className="text-lg font-bold text-on-surface">{getFirstNameFromFullName(approvalModal.fullName)}</p>
            </div>

            <div className="space-y-4 mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={approvalModal.addToTree}
                  onChange={(e) => setApprovalModal({
                    ...approvalModal,
                    addToTree: e.target.checked,
                    selectedParentId: e.target.checked ? approvalModal.selectedParentId : null
                  })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm font-medium text-on-surface">إضافة للشجرة العائلية</span>
              </label>

              {approvalModal.addToTree && (
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-2">الوالد</label>
                  <select
                    value={approvalModal.selectedParentId || ''}
                    onChange={(e) => setApprovalModal({
                      ...approvalModal,
                      selectedParentId: e.target.value || null
                    })}
                    disabled={loadingParents}
                    className="w-full bg-surface border border-surface-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
                  >
                    <option value="">{loadingParents ? 'جاري التحميل...' : 'اختر الوالد'}</option>
                    {parentsList.map((person) => (
                      <option key={person._id} value={person._id}>
                          {person.firstName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setApprovalModal(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-surface-variant text-on-surface hover:bg-surface-variant/20 text-sm font-medium transition-colors"
                disabled={actionLoadingId === approvalModal.requestId}
              >
                إلغاء
              </button>
              <button
                onClick={() => handleDecision(approvalModal.requestId, 'approved')}
                disabled={actionLoadingId === approvalModal.requestId || (approvalModal.addToTree && !approvalModal.selectedParentId)}
                className="flex-1 px-4 py-2 rounded-lg bg-secondary text-on-secondary hover:bg-secondary-container text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {actionLoadingId === approvalModal.requestId ? 'جاري الحفظ...' : 'اعتماد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}