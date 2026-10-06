import React, { createContext, useContext, useState, useCallback } from 'react';

type Toast = { id: string; message: string; type?: 'info'|'success'|'error'; };

const ToastContext = createContext<{ show: (message: string, type?: Toast['type']) => void } | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter(x => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 9999 }}>
        {toasts.map((toast) => (
          <div key={toast.id} style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: toast.type === 'error' ? '#fef2f2' : toast.type === 'success' ? '#ecfdf5' : '#f8fafc', color: toast.type === 'error' ? '#b91c1c' : '#064e3b', boxShadow: '0 6px 18px rgba(2,6,23,0.08)' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{toast.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
