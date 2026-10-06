import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../../lib/api';
import { User as BaseUser, UserRole, Branch } from '@qabila/types';
import { useParams } from 'react-router-dom';

interface User extends BaseUser {
  _id: string;
  createdAt: string;
}
import AdminLayout from '../../components/layout/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateWithHijri } from '../../lib/date';
import { PatternDiamondGrid } from '../../components/Patterns';

export default function Members() {
  const { user } = useAuth();
  const { tenantSlug: routeTenantSlug } = useParams();
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('العائلة');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const seedResult = await apiClient.seedDatabase(routeTenantSlug || user?.tenantSlug);
        if (!seedResult?.tenantId) throw new Error('Missing tenantId');

        const [data, tenant, branchesData] = await Promise.all([
          apiClient.getMembers(seedResult.tenantId, user?.role === 'SUB_ADMIN' ? user.branchId : undefined),
          apiClient.getTenant(seedResult.tenantId),
          apiClient.getBranches(seedResult.tenantId).catch(() => [])
        ]);

        setMembers(data);
        setTenantName(tenant?.name || 'العائلة');
        setBranches(branchesData);
      } catch (err) {
        console.error(err);
        setError('تعذر تحميل بيانات الأعضاء.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.branchId, user?.role, user?.tenantSlug, routeTenantSlug]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join('') || '؟';
  };

  const getBranchName = (branchId?: string) => {
    if (!branchId) return 'الفرع الرئيسي';
    const branch = branches.find(b => b._id === branchId || b.id === branchId);
    return branch ? branch.name : branchId;
  };

  const branchOptions = useMemo(() => {
    const activeBranchIds = members.map((m) => m.branchId).filter(Boolean);
    const validBranchNames = branches
      .filter(b => activeBranchIds.includes(b._id as any) || activeBranchIds.includes(b.id as any))
      .map(b => b.name);
      
    const legacyNames = activeBranchIds.filter(id => !branches.some(b => b._id === id || b.id === id));
    
    return Array.from(new Set([...validBranchNames, ...legacyNames, 'الفرع الرئيسي'] as string[]));
  }, [members, branches]);

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return members.filter((member) => {
      const branchName = getBranchName(member.branchId);
      const matchesBranch = branchFilter === 'all' || branchFilter === branchName;
      const matchesSearch =
        query.length === 0 ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query);
      return matchesBranch && matchesSearch;
    });
  }, [members, branchFilter, searchQuery, branches]);

  const roleLabel = (role?: UserRole) => {
    switch (role) {
      case UserRole.QABILA_ADMIN:
        return 'مدير عائلة';
      case UserRole.SUB_ADMIN:
        return 'مدير فرع';
      default:
        return 'عضو';
    }
  };

  return (
    <AdminLayout>

      <div className="mb-10 text-right">
        <h2 className="text-3xl font-bold mb-2 text-primary">أعضاء {tenantName}</h2>
        <p className="text-on-surface-variant text-sm">
          قائمة بالأعضاء المسجلين في المنصة. عدد الأعضاء: {filteredMembers.length}.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-error-container text-on-error-container border border-error rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm overflow-hidden relative">
        {/* Pattern Background */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <PatternDiamondGrid />
        </div>
        
        <div className="relative z-10">
        {/* Filters Tab */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 border-b border-surface-variant bg-surface">
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-4 py-2 rounded-lg text-sm font-bold ${branchFilter === 'all' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant hover:bg-surface-variant/20'}`}
              onClick={() => setBranchFilter('all')}
            >
              الكل
            </button>
            {branchOptions.map((branch) => (
              <button
                key={branch}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${branchFilter === branch ? 'bg-secondary/20 text-secondary' : 'text-on-surface-variant hover:bg-surface-variant/20'}`}
                onClick={() => setBranchFilter(branch)}
              >
                {branch}
              </button>
            ))}
          </div>
          <div className="relative max-w-xs w-full">
            <input 
              type="text" 
              placeholder="البحث بالاسم..." 
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full bg-surface-variant/30 rounded-full py-2 px-10 text-sm focus:outline-none focus:ring-1 focus:ring-secondary border border-surface-variant" 
            />
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
        </div>

        <table className="w-full text-sm text-right">
          <thead className="bg-surface text-on-surface-variant font-medium border-b border-surface-variant">
            <tr>
              <th className="px-6 py-4">العضو</th>
              <th className="px-6 py-4">الفرع</th>
              <th className="px-6 py-4">الدور</th>
              <th className="px-6 py-4">تاريخ الانضمام</th>
              <th className="px-6 py-4 text-left">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-variant/50">
            {loading ? (
              <tr>
                <td className="px-6 py-8 text-center text-on-surface-variant" colSpan={5}>جارٍ التحميل...</td>
              </tr>
            ) : filteredMembers.length === 0 ? (
              <tr>
                <td className="px-6 py-8 text-center text-on-surface-variant" colSpan={5}>لا يوجد أعضاء مطابقون للبحث.</td>
              </tr>
            ) : (
              filteredMembers.map((member) => (
                <tr key={member._id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border border-secondary/30 bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold">
                      {getInitials(member.name)}
                    </div>
                    <div>
                      <p className="font-bold text-[15px] text-on-surface">{member.name}</p>
                      <p className="text-[11px] text-on-surface-variant" dir="ltr">{member.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">
                    {getBranchName(member.branchId)}
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">
                    {roleLabel(member.role)}
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant text-xs">
                    {formatDateWithHijri(member.createdAt).combined}
                  </td>
                  <td className="px-6 py-4 text-left">
                    <span className="text-secondary font-bold text-xs bg-secondary-container/50 px-3 py-1 rounded-full border border-secondary/20">
                      مفعل
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </AdminLayout>
  );
}
