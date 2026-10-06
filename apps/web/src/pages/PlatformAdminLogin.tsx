import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

export default function PlatformAdminLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      navigate('/super-admin', { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.platformLogin({ email, password });
      if (response.user?.role !== 'SUPER_ADMIN') {
        throw new Error('هذه الصفحة مخصصة لمشرف المنصة فقط.');
      }

      login(response.token, response.user);
      toast.show('تم تسجيل الدخول كمشرف المنصة', 'success');
      navigate('/super-admin', { replace: true });
    } catch (err: any) {
      const msg = err?.message || 'تعذر تسجيل الدخول الإداري.';
      setError(msg);
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 pattern-dots">
      <div className="bg-surface-container-lowest border border-surface-variant shadow-heritage-md rounded p-8 max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl text-primary font-semibold mb-2">قبيلة</h1>
          <p className="text-on-surface-variant text-sm">بوابة مشرف المنصة</p>
        </div>

        {error && (
          <div className="bg-error-container text-on-error-container p-3 rounded mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-on-surface">البريد الإلكتروني الإداري</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-surface-variant rounded bg-surface p-3 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-colors"
              placeholder="superadmin@qabila.com"
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
            {loading ? 'جارٍ التحقق...' : 'دخول مشرف المنصة'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-on-surface-variant">
          لحسابات العائلات استخدم <Link to="/login" className="text-secondary hover:underline">دخول العائلة</Link>
        </div>
      </div>
    </div>
  );
}
