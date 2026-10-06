import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from './contexts/ToastContext';
import { UserRole } from "@qabila/types";

import TenantHome from "./pages/TenantHome";
import Occasions from "./pages/Occasions";
import FamilyTree from "./pages/FamilyTree";
import Messages from "./pages/Messages";
import NotificationsPage from "./pages/Notifications.tsx";
import JoinFamily from "./pages/JoinFamily";
import WaitingApproval from "./pages/WaitingApproval";
import Login from "./pages/Login";
import OccasionDetail from "./pages/OccasionDetail";
import UserProfile from "./pages/UserProfile";
import OccasionManagement from "./pages/OccasionManagement";
import AdminDashboard from "./pages/admin/Dashboard";
import Approvals from "./pages/admin/Approvals";
import BranchManagers from "./pages/admin/BranchManagers";
import BranchesAdmin from "./pages/admin/BranchesAdmin";
import Members from "./pages/admin/Members";
import Activities from "./pages/admin/Activities";
import SuperAdminDashboard from "./pages/super-admin/SuperDashboard";
import MotionLoader from "./components/MotionLoader";
import PlatformAdminLogin from "./pages/PlatformAdminLogin";

// Simple Protected Route wrapper
import ForgotPasswordForm from "./components/auth/ForgotPasswordForm";
import PasswordResetForm from "./components/auth/PasswordResetForm";
import EmailVerificationModal from "./components/auth/EmailVerificationModal";

function ProtectedRoute({ children, allowedRoles }: { children: JSX.Element, allowedRoles?: UserRole[] }) {
  const { user, loading } = useAuth();
  
  if (loading) return <MotionLoader />;
  const location = useLocation();
  const maybeSlug = location.pathname.split('/')[1] || '';
  const tenantPrefix = maybeSlug && !['admin', 'login', 'super-admin', 'join', 'platform-admin'].includes(maybeSlug) ? `/${maybeSlug}` : '';
  const isPlatformAdminPath = location.pathname.startsWith('/super-admin');

  if (!user) {
    return <Navigate to={isPlatformAdminPath ? '/platform-admin/login' : `${tenantPrefix}/login`} replace />;
  }

  // Super admin should only access platform routes, not tenant layouts/pages.
  if (user.role === UserRole.SUPER_ADMIN && !isPlatformAdminPath) {
    return <Navigate to="/super-admin" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === UserRole.SUPER_ADMIN) return <Navigate to="/super-admin" replace />;
    return <Navigate to={`${tenantPrefix}/home`} replace />;
  }
  
  return children;
}

function SpaRedirectHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const redirectPath = params.get('__spa_redirect');

    if (!redirectPath) return;

    params.delete('__spa_redirect');
    const remainingQuery = params.toString();
    const target = `${redirectPath}${remainingQuery ? `?${remainingQuery}` : ''}${location.hash}`;

    navigate(target, { replace: true });
  }, [location.hash, location.search, navigate]);

  return null;
}

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center space-y-8 bg-surface">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-4xl text-primary font-semibold">قبيلة</h1>
        <p className="text-xl text-on-surface-variant">
          إرث محفوظ. توثيق الجذور، حفظ الحاضر، وتمهيد الطريق للأجيال القادمة.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link to="/login" className="bg-primary text-on-primary px-8 py-3 rounded text-lg font-medium hover:bg-primary-container hover:text-on-primary-container transition-colors inline-block text-center">
          دخول العائلة
        </Link>
        <Link to="/platform-admin/login" className="bg-surface-container-lowest border border-surface-variant text-on-surface px-8 py-3 rounded text-lg font-medium hover:bg-surface transition-colors inline-block text-center">
          دخول مشرف المنصة
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <SpaRedirectHandler />
        <Routes>
          {/* Public / Semi-Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/:tenantSlug/login" element={<Login />} />
          <Route path="/waiting-approval" element={<WaitingApproval />} />
          <Route path="/:tenantSlug/waiting-approval" element={<WaitingApproval />} />
          <Route path="/platform-admin/login" element={<PlatformAdminLogin />} />
          <Route path="/join" element={<JoinFamily />} />
          <Route path="/:tenantSlug/join" element={<JoinFamily />} />

            {/* Password Reset & Email Verification */}
            <Route path="/forgot-password" element={<ForgotPasswordForm />} />
            <Route path="/reset-password" element={<PasswordResetForm />} />
            <Route path="/verify-email" element={<div><EmailVerificationModal isOpen={true} onClose={() => window.history.back()} /></div>} />
          {/* Protected Tenant App (Members) */}
          <Route 
            path="/home" 
            element={
              <ProtectedRoute>
                <TenantHome />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/home" 
            element={
              <ProtectedRoute>
                <TenantHome />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/occasions"
            element={
              <ProtectedRoute>
                <Occasions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/:tenantSlug/occasions"
            element={
              <ProtectedRoute>
                <Occasions />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/tree" 
            element={
              <ProtectedRoute>
                <FamilyTree />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/tree" 
            element={
              <ProtectedRoute>
                <FamilyTree />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <Messages />
              </ProtectedRoute>
            }
          />
          <Route
            path="/:tenantSlug/messages"
            element={
              <ProtectedRoute>
                <Messages />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/:tenantSlug/notifications"
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <UserProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/:tenantSlug/profile"
            element={
              <ProtectedRoute>
                <UserProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId"
            element={
              <ProtectedRoute>
                <OccasionDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/:tenantSlug/events/:eventId"
            element={
              <ProtectedRoute>
                <OccasionDetail />
              </ProtectedRoute>
            }
          />

          {/* قبيلة: لوحة الإدارة */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN]}>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/admin" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN]}>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/approvals" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN]}>
                <Approvals />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/admin/approvals" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN]}>
                <Approvals />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/occasions" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN]}>
                <OccasionManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/admin/occasions" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN]}>
                <OccasionManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/branch-managers" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN]}>
                <BranchManagers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/admin/branch-managers" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN]}>
                <BranchManagers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/branches" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN]}>
                <BranchesAdmin />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/admin/branches" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN]}>
                <BranchesAdmin />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/members"  
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN]}>
                <Members />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/admin/members" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN]}>
                <Members />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/admin/activities" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN]}>
                <Activities />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/:tenantSlug/admin/activities" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN]}>
                <Activities />
              </ProtectedRoute>
            } 
          />

          {/* Platform Super Admin */}
          
          <Route 
            path="/super-admin/*" 
            element={
              <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
