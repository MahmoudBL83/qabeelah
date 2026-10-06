import { API_BASE_URL } from '../../lib/config';
import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import BrandMark from '../BrandMark';
import { useAuth } from '../../contexts/AuthContext';
import useTenantPrefix from '../../hooks/useTenantPrefix';
import { apiClient } from '../../lib/api';
import { getUserAvatarUrl } from '../../lib/user';

interface TenantLayoutProps {
  children: ReactNode;
}

export default function TenantLayout({ children }: TenantLayoutProps) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [notificationItems, setNotificationItems] = useState<any[]>([]);
  const [notificationUnread, setNotificationUnread] = useState<number | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const { tenantPrefix } = useTenantPrefix();
  const location = useLocation();

  useEffect(() => {
    const load = async () => {
      try {
        const slug = (location.pathname.split('/')[1]) || (user as any)?.tenantSlug;
        await apiClient.seedDatabase(slug || user?.tenantSlug);
      } catch (err) {
        // keep default
      }
    };
    load();
  }, [location.pathname, user?.tenantSlug]);

  useEffect(() => {
    let mounted = true;
    let eventSource: EventSource | null = null;

    const setup = async () => {
      try {
        const slug = (location.pathname.split('/')[1]) || (user as any)?.tenantSlug;
        const seed = await apiClient.seedDatabase(slug || user?.tenantSlug);
        if (!seed?.tenantId) return;

        // initial load
        await apiClient.getMessageConversations(seed.tenantId);

        // SSE subscription for live updates
        const token = localStorage.getItem('qabila_token');
        if (!token) return;
        const params = new URLSearchParams({ tenantId: seed.tenantId, token });
        eventSource = new EventSource(`${API_BASE_URL}/messages/stream?${params.toString()}`);
        eventSource.addEventListener('message.created', async () => {
          // refresh counts
          try {
            await apiClient.getMessageConversations(seed.tenantId);
            if (!mounted) return;

            // browser notification when not on messages page
            if (location.pathname.indexOf('/messages') !== 0 && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification('رسالة جديدة', { body: 'لديك رسالة جديدة في المراسلة.' });
              } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then((perm) => {
                  if (perm === 'granted') new Notification('رسالة جديدة', { body: 'لديك رسالة جديدة في المراسلة.' });
                });
              }
            }
          } catch (e) {
            console.error('failed updating message counts', e);
          }
        });
      } catch (err) {
        // ignore
      }
    };

    setup();

    return () => {
      mounted = false;
      if (eventSource) eventSource.close();
    };
  }, [location.pathname, user?.tenantSlug]);

  useEffect(() => {
    let mounted = true;
    let eventSource: EventSource | null = null;

    const fetchNotifications = async () => {
      try {
        setNotificationsLoading(true);
        const response = await apiClient.getNotifications({ page: 1, limit: 8 });
        if (!mounted) return;
        const items = response?.data || [];
        setNotificationItems(items);
        const unread = items.filter((item: any) => !item.read).length;
        setNotificationUnread(unread > 0 ? unread : null);
      } catch (err) {
        console.error('failed loading notifications', err);
      } finally {
        if (mounted) setNotificationsLoading(false);
      }
    };

    const setup = async () => {
      try {
        const slug = (location.pathname.split('/')[1]) || (user as any)?.tenantSlug;
        const seed = await apiClient.seedDatabase(slug || user?.tenantSlug);
        if (!seed?.tenantId) return;

        await fetchNotifications();

        const token = localStorage.getItem('qabila_token');
        if (!token) return;

        const params = new URLSearchParams({ tenantId: seed.tenantId, token });
        eventSource = new EventSource(`${API_BASE_URL}/notifications/stream?${params.toString()}`);
        eventSource.addEventListener('notification.created', fetchNotifications);
        eventSource.addEventListener('notification.read', fetchNotifications);
        eventSource.addEventListener('ready', fetchNotifications);
      } catch (err) {
        // ignore
      }
    };

    setup();

    return () => {
      mounted = false;
      if (eventSource) eventSource.close();
    };
  }, [location.pathname, user?.tenantSlug]);

  const markVisibleNotificationsRead = async () => {
    try {
      const ids = notificationItems.filter((item: any) => !item.read).map((item: any) => item._id || item.id).filter(Boolean);
      if (ids.length === 0) return;
      await apiClient.markNotificationsRead(ids);
      const refreshed = await apiClient.getNotifications({ page: 1, limit: 8 });
      setNotificationItems(refreshed?.data || []);
      const unread = (refreshed?.data || []).filter((item: any) => !item.read).length;
      setNotificationUnread(unread > 0 ? unread : null);
    } catch (err) {
      console.error('failed marking notifications read', err);
    }
  };

  const NavIcon = ({ name, active }: { name: 'home' | 'tree' | 'occasions' | 'profile' | 'admin'; active: boolean }) => {
    const iconClass = active ? 'text-secondary' : 'text-on-surface-variant';

    switch (name) {
      case 'home':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`w-5 h-5 ${iconClass}`} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.5 12 4l8.25 6.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9.75V20.25h12V9.75" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.25 20.25v-5a2.75 2.75 0 0 1 5.5 0v5" />
          </svg>
        );
      case 'tree':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`w-5 h-5 ${iconClass}`} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v4.25" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.75c-2.8 0-5 2.05-5 4.5 0 1.2.5 2.24 1.35 3.05" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.75c2.8 0 5 2.05 5 4.5 0 1.2-.5 2.24-1.35 3.05" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.35 16.3 6.5 20.25" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.65 16.3l1.85 3.95" />
            <circle cx="12" cy="4.5" r="1.15" fill="currentColor" />
            <circle cx="7.45" cy="13.25" r="1.05" fill="currentColor" />
            <circle cx="16.55" cy="13.25" r="1.05" fill="currentColor" />
          </svg>
        );
      case 'occasions':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`w-5 h-5 ${iconClass}`} aria-hidden="true">
            <rect x="3.75" y="5.25" width="16.5" height="14.25" rx="2.25" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75v3M16.5 3.75v3M3.75 9h16.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 13.5h3M13.5 13.5h3M7.5 17.25h3" />
          </svg>
        );
      case 'profile':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`w-5 h-5 ${iconClass}`} aria-hidden="true">
            <circle cx="12" cy="8.25" r="3.25" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.75 20.25a6.25 6.25 0 0 1 12.5 0" />
          </svg>
        );
      case 'admin':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`w-5 h-5 ${iconClass}`} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.75 4.5 6v6.2c0 4.7 3.1 8.85 7.5 9.95 4.4-1.1 7.5-5.25 7.5-9.95V6L12 2.75Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.75 12.25 11 14.5l4.5-5" />
          </svg>
        );
    }
  };

  // Determine active route for link highlighting
  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Navigation links for both desktop and mobile
  const navLinks = [
    { path: `${tenantPrefix}/home`, label: 'الرئيسية', icon: 'home' as const },
    { path: `${tenantPrefix}/occasions`, label: 'المناسبات', icon: 'occasions' as const },
    { path: `${tenantPrefix}/tree`, label: 'شجرة العائلة', icon: 'tree' as const },
    { path: `${tenantPrefix}/profile`, label: 'الملف الشخصي', icon: 'profile' as const },
    ...(user?.role === 'QABILA_ADMIN' || user?.role === 'SUB_ADMIN' ? [{ path: `${tenantPrefix}/admin`, label: 'لوحة الإدارة', icon: 'admin' as const }] : []),
  ];

  const userAvatar = getUserAvatarUrl(user);
  const notificationBadgeText = notificationUnread && notificationUnread > 9 ? '9+' : notificationUnread;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Header - Navbar */}
        <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-surface-variant/50 shadow-sm">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo / Brand */}
              <Link
                to={`${tenantPrefix}/home`}
                className="flex items-center gap-2 group hover:opacity-80 transition-opacity active:scale-95"
              >
                <BrandMark />
             
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setShowMobileMenu(false)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive(link.path)
                        ? 'bg-[#111c19] text-[#f2e6cd] shadow-sm ring-1 ring-[#c39c3f]/30'
                        : 'text-on-surface hover:bg-surface-variant/30'
                    }`}
                    title={link.label}
                  >
                    <span className="flex items-center gap-2">
                      <NavIcon name={link.icon} active={isActive(link.path)} />
                      <span>{link.label}</span>
                    </span>
                  </Link>
                ))}
              </nav>

              {/* Right Actions */}
              <div className="flex items-center gap-3">
                {/* Mobile Menu Toggle */}
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="md:hidden p-2 rounded-lg hover:bg-surface-variant/30 transition-colors"
                  aria-label="فتح القائمة"
                >
                  <svg
                    className="w-6 h-6 text-on-surface"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>

                {/* Notifications Menu */}
                {user && (
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowNotificationsMenu(!showNotificationsMenu);
                        setShowUserMenu(false);
                        setShowMobileMenu(false);
                      }}
                      className="relative w-10 h-10 rounded-full bg-surface-container-lowest ring-1 ring-surface-variant overflow-hidden flex items-center justify-center text-on-surface font-semibold hover:shadow-md transition-all active:scale-95"
                      aria-label="قائمة الإشعارات"
                      title="الإشعارات"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-on-surface-variant" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 8.25A5.25 5.25 0 0 1 12 3v1.5A3.75 3.75 0 0 0 8.25 8.25v3.5L6.5 13.5v.75h11v-.75l-1.75-1.75v-3.5A3.75 3.75 0 0 0 12 4.5V3a5.25 5.25 0 0 1 5.25 5.25v3.4l1.84 1.84a.75.75 0 0 1-.53 1.28H5.44a.75.75 0 0 1-.53-1.28l1.84-1.84v-3.4Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17.25a2.25 2.25 0 0 0 4.5 0" />
                      </svg>
                      {notificationBadgeText ? (
                        <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 shadow-sm">
                          {notificationBadgeText}
                        </span>
                      ) : null}
                    </button>

                    {showNotificationsMenu && (
                      <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-1rem)] bg-surface-container-lowest border border-surface-variant rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                        <div className="p-4 border-b border-surface-variant/50 bg-surface/30 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-on-surface">الإشعارات</p>
                            <p className="text-xs text-on-surface-variant mt-1">آخر التنبيهات والرسائل المهمة</p>
                          </div>
                          {notificationUnread ? (
                            <span className="inline-flex items-center rounded-full bg-error-container text-on-error-container px-2 py-1 text-[11px] font-semibold">
                              {notificationUnread}
                            </span>
                          ) : null}
                        </div>

                        <div className="max-h-80 overflow-y-auto">
                          {notificationsLoading ? (
                            <div className="p-4 text-sm text-on-surface-variant">جاري تحميل الإشعارات...</div>
                          ) : notificationItems.length === 0 ? (
                            <div className="p-4 text-sm text-on-surface-variant">لا توجد إشعارات حالياً.</div>
                          ) : (
                            <div className="py-2 space-y-1">
                              {notificationItems.map((notification: any) => (
                                <Link
                                  key={notification._id || notification.id}
                                  to={`${tenantPrefix}/notifications`}
                                  onClick={() => {
                                    setShowNotificationsMenu(false);
                                  }}
                                  className={`block px-4 py-3 transition-colors hover:bg-surface-variant/30 ${notification.read ? 'bg-transparent' : 'bg-secondary/5'}`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium text-on-surface truncate">{notification.title}</span>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${notification.read ? 'bg-surface-variant/20 text-on-surface-variant' : 'bg-secondary text-on-secondary'}`}>
                                          {notification.read ? 'مقروء' : 'غير مقروء'}
                                        </span>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${notification.read ? 'bg-surface-variant/20 text-on-surface-variant' : 'bg-error-container text-on-error-container'}`}>
                                          {notification.read ? 'Read' : 'Unread'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-on-surface-variant line-clamp-2">{notification.body}</p>
                                    </div>
                                    <div className="shrink-0 text-[10px] text-on-surface-variant whitespace-nowrap">
                                      {notification.createdAt ? new Date(notification.createdAt).toLocaleDateString('ar-SA') : ''}
                                    </div>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="p-2 border-t border-surface-variant/50 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={markVisibleNotificationsRead}
                            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-surface-variant text-on-surface hover:bg-surface-variant/30 transition-colors"
                          >
                            وضع الظاهر كمقروء
                          </button>
                          <Link
                            to={`${tenantPrefix}/notifications`}
                            onClick={() => setShowNotificationsMenu(false)}
                            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-secondary text-on-secondary text-center hover:opacity-90 transition-opacity"
                          >
                            عرض الكل
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* User Menu */}
                {user && (
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowUserMenu(!showUserMenu);
                        setShowMobileMenu(false);
                      }}
                      className="w-10 h-10 rounded-full bg-[#111c19] ring-1 ring-[#c39c3f]/30 overflow-hidden flex items-center justify-center text-[#f2e6cd] font-semibold hover:shadow-md transition-all active:scale-95"
                      title={user.name}
                      aria-label="قائمة المستخدم"
                    >
                      {userAvatar ? (
                        <img src={userAvatar} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        user.name.charAt(0).toUpperCase()
                      )}
                    </button>

                    {/* User Menu Dropdown */}
                    {showUserMenu && (
                      <div className="absolute left-0 mt-2 w-56 bg-surface-container-lowest border border-surface-variant rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                        {/* User Info */}
                        <div className="p-4 border-b border-surface-variant/50 bg-surface/30">
                          <p className="text-sm font-semibold text-on-surface">{user.name}</p>
                          <p className="text-xs text-on-surface-variant truncate mt-1">{user.email}</p>
                          {user.role && (
                            <span className="inline-block mt-2 px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded">
                              {user.role === 'QABILA_ADMIN' ? 'مسؤول العائلة' : 'عضو'}
                            </span>
                          )}
                        </div>

                        {/* Menu Items */}
                        <nav className="py-2">
                          {navLinks.map((link) => (
                            <Link
                              key={link.path}
                              to={link.path}
                              onClick={() => setShowUserMenu(false)}
                              className={`block px-4 py-2.5 text-sm transition-colors ${
                                isActive(link.path)
                                    ? 'bg-[#111c19]/10 text-[#111c19] font-medium'
                                  : 'text-on-surface hover:bg-surface-variant/30'
                              }`}
                            >
                              <span className="flex items-center gap-3">
                                  <NavIcon name={link.icon} active={isActive(link.path)} />
                                <span>{link.label}</span>

                              </span>
                            </Link>
                          ))}
                        </nav>

                        {/* Logout */}
                        <div className="p-2 border-t border-surface-variant/50">
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              logout();
                            }}
                            className="w-full px-4 py-2.5 text-sm text-error hover:bg-error-container/20 rounded-lg transition-colors text-right font-medium flex items-center gap-2 justify-end"
                          >
                            <span>تسجيل الخروج</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6.75V5.5A1.75 1.75 0 0 1 11.75 3.75h5A1.75 1.75 0 0 1 18.5 5.5v13A1.75 1.75 0 0 1 16.75 20.25h-5A1.75 1.75 0 0 1 10 18.5v-1.25" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 12h-10M7.5 9.5 4.75 12 7.5 14.5" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mobile Menu */}
            {showMobileMenu && (
              <nav className="md:hidden py-4 border-t border-surface-variant/30 space-y-1 animate-in fade-in slide-in-from-top-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setShowMobileMenu(false)}
                    className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive(link.path)
                        ? 'bg-[#111c19] text-[#f2e6cd] shadow-sm ring-1 ring-[#c39c3f]/30'
                        : 'text-on-surface hover:bg-surface-variant/30'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <NavIcon name={link.icon} active={isActive(link.path)} />
                      <span>{link.label}</span>
                    </span>
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 scroll-smooth">
          {children}
        </main>
      </div>
    </div>
  );
}
