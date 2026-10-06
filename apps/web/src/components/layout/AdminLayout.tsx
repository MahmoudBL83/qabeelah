import { ReactNode, useEffect, useState } from 'react';
import QabeelaLogo from '../QabeelaLogo';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useTenantPrefix from '../../hooks/useTenantPrefix';
import { apiClient } from '../../lib/api';
import { getUserAvatarUrl } from '../../lib/user';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { tenantPrefix } = useTenantPrefix();
  const [tenantName, setTenantName] = useState('قبيلة');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const seed = await apiClient.seedDatabase(user?.tenantSlug);
        if (seed?.tenantId) {
          const tenant = await apiClient.getTenant(seed.tenantId);
          if (mounted) setTenantName(tenant?.arabicName || tenant?.name || 'قبيلة');
        }
      } catch (e) {
        // ignore
      }
    };
    load();
    return () => { mounted = false; };
  }, [user?.tenantSlug]);

  useEffect(() => {
    setShowMobileMenu(false);
    setShowUserMenu(false);
  }, [location.pathname]);

  const userAvatar = getUserAvatarUrl(user);

  const isActive = (path: string) => location.pathname === path;

  const adminNavLinks = [
    { to: `${tenantPrefix}/admin`, label: 'لوحة القيادة' },
    { to: `${tenantPrefix}/admin/approvals`, label: 'طلبات الانضمام' },
    { to: `${tenantPrefix}/admin/activities`, label: 'سجلات النشاط' },
    ...(user?.role === 'QABILA_ADMIN'
      ? [
          { to: `${tenantPrefix}/admin/branches`, label: 'إدارة الفروع' },
          { to: `${tenantPrefix}/admin/branch-managers`, label: 'مديرو الفروع' },
        ]
      : []),
    { to: `${tenantPrefix}/admin/members`, label: 'الأعضاء' },
    ...(user?.role === 'SUPER_ADMIN' ? [{ to: `${tenantPrefix}/admin/tenants`, label: 'قائمة العائلات' }] : []),
    { to: `${tenantPrefix}/profile`, label: 'الملف الشخصي' },
    { to: `${tenantPrefix}/home`, label: 'العودة للتطبيق' },
  ];

  const NavItem = ({ to, label, active }: { to: string; label: string; active: boolean }) => (
    <Link 
      to={to} 
      className={`relative flex items-center px-6 py-3 text-sm font-medium transition-colors ${
        active ? 'text-secondary bg-surface-variant/30' : 'text-on-surface hover:text-secondary hover:bg-surface-variant/20'
      }`}
    >
      {active && <div className="absolute right-0 top-0 bottom-0 w-1 bg-secondary rounded-l-sm" />}
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Right Sidebar */}
      <aside className="w-64 bg-surface-container-lowest border-l border-surface-variant hidden lg:flex flex-col sticky top-0 h-screen overflow-hidden shadow-heritage-sm shrink-0">
        <div className="p-6 pb-6 flex items-center gap-4 border-b border-surface-variant/50">
          <div className="w-20 h-20 flex items-center justify-center flex-shrink-0">
            <QabeelaLogo size="medium" className="text-primary" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-xl font-bold text-primary tracking-tight leading-tight">إدارة</h1>
            <p className="text-sm font-semibold text-primary">{tenantName}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">لوحة التحكم</p>
          </div>
        </div>
        
        {user && (
          <div className="px-6 py-4 flex items-center gap-3 border-b border-surface-variant/50">
            <div className="w-10 h-10 rounded-full bg-secondary-container overflow-hidden flex items-center justify-center text-on-secondary-container font-semibold flex-shrink-0">
              {userAvatar ? (
                <img src={userAvatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0)
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-on-surface">{user.name}</span>
              <span className="text-xs text-on-surface-variant truncate w-32">
                {user.role === 'QABILA_ADMIN' ? 'مدير عائلة' : 'مدير فرع'}
              </span>
            </div>
          </div>
        )}

        <nav className="flex flex-col gap-1 flex-1 py-2 overflow-y-auto min-h-0">
          <div className="px-6 pt-2 pb-1 text-[10px] font-bold tracking-[0.2em] text-on-surface-variant uppercase">عام</div>
          <NavItem to={`${tenantPrefix}/admin`} label="لوحة القيادة" active={isActive(`${tenantPrefix}/admin`) || isActive('/admin')} />
          <NavItem to={`${tenantPrefix}/admin/approvals`} label="طلبات الانضمام" active={isActive(`${tenantPrefix}/admin/approvals`) || isActive('/admin/approvals')} />
          <NavItem to={`${tenantPrefix}/admin/activities`} label="سجلات النشاط" active={isActive(`${tenantPrefix}/admin/activities`) || isActive('/admin/activities')} />

          <div className="px-6 pt-4 pb-1 text-[10px] font-bold tracking-[0.2em] text-on-surface-variant uppercase">إدارة</div>
          {user?.role === 'QABILA_ADMIN' && (
            <>
              <NavItem to={`${tenantPrefix}/admin/branches`} label="إدارة الفروع" active={isActive(`${tenantPrefix}/admin/branches`) || isActive('/admin/branches')} />
              <NavItem to={`${tenantPrefix}/admin/branch-managers`} label="مديرو الفروع" active={isActive(`${tenantPrefix}/admin/branch-managers`) || isActive('/admin/branch-managers')} />
            </>
          )}
          <NavItem to={`${tenantPrefix}/admin/members`} label="الأعضاء" active={isActive(`${tenantPrefix}/admin/members`) || isActive('/admin/members')} />
          <NavItem to={`${tenantPrefix}/profile`} label="الملف الشخصي" active={isActive(`${tenantPrefix}/profile`) || isActive('/profile')} />

          <div className="mt-3 border-t border-surface-variant/30 mx-4"></div>
          <NavItem to={`${tenantPrefix}/home`} label="العودة للتطبيق" active={false} />
        </nav>

        {user && (
          <div className="p-6 border-t border-surface-variant/50 mt-auto">
            <button 
              onClick={logout}
              className="w-full py-3 text-sm text-error hover:bg-error-container hover:text-on-error-container rounded-lg transition-colors text-right px-4 font-medium"
            >
              تسجيل الخروج
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden relative pattern-dots">
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="lg:hidden bg-surface-container-lowest border-b border-surface-variant sticky top-0 z-30">
          <div className="p-4 flex justify-between items-center">
            <button
              onClick={() => {
                setShowMobileMenu((prev) => !prev);
                setShowUserMenu(false);
              }}
              className="p-2 rounded-lg hover:bg-surface-variant/30 transition-colors"
              aria-label="فتح القائمة"
            >
              <svg className="w-6 h-6 text-on-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <h1 className="text-lg font-bold text-primary">إدارة {tenantName}</h1>

            {user ? (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowUserMenu((prev) => !prev);
                    setShowMobileMenu(false);
                  }}
                  className="w-9 h-9 rounded-full bg-secondary-container overflow-hidden flex items-center justify-center text-on-secondary-container font-semibold"
                  aria-label="قائمة المستخدم"
                >
                  {userAvatar ? (
                    <img src={userAvatar} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    user.name.charAt(0)
                  )}
                </button>

                {showUserMenu && (
                  <div className="absolute left-0 mt-2 w-52 bg-surface-container-lowest border border-surface-variant rounded-xl shadow-lg overflow-hidden z-40">
                    <div className="p-3 border-b border-surface-variant/50">
                      <p className="text-sm font-semibold text-on-surface">{user.name}</p>
                      <p className="text-xs text-on-surface-variant truncate mt-1">{user.email}</p>
                    </div>
                    <nav className="py-1">
                      <Link
                        to={`${tenantPrefix}/profile`}
                        className="block px-4 py-2.5 text-sm text-on-surface hover:bg-surface-variant/20"
                        onClick={() => setShowUserMenu(false)}
                      >
                        الملف الشخصي
                      </Link>
                      <Link
                        to={`${tenantPrefix}/home`}
                        className="block px-4 py-2.5 text-sm text-on-surface hover:bg-surface-variant/20"
                        onClick={() => setShowUserMenu(false)}
                      >
                        العودة للتطبيق
                      </Link>
                    </nav>
                    <div className="p-2 border-t border-surface-variant/50">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          logout();
                        }}
                        className="w-full px-4 py-2.5 text-sm text-error hover:bg-error-container/20 rounded-lg transition-colors text-right font-medium"
                      >
                        تسجيل الخروج
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-9" />
            )}
          </div>

          {showMobileMenu && (
            <nav className="px-3 pb-3 border-t border-surface-variant/50 space-y-1">
              {adminNavLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setShowMobileMenu(false)}
                  className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive(link.to) ? 'bg-secondary-container text-secondary' : 'text-on-surface hover:bg-surface-variant/20'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </header>

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 relative z-10">
          {children}
        </main>
      </div>
    </div>
  );
}
