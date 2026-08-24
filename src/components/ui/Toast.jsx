import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

// Thay cho alert()/window.alert() rải rác khắp app — alert() chặn cả UI (kể
// cả các tab khác nếu chạy trong iframe embed) và trông như lỗi trình duyệt
// chứ không phải thông báo của app. Toast không chặn, tự biến mất, và có thể
// xếp chồng nhiều cái cùng lúc (vd 2 request copy ảnh liên tiếp).
const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};

const DEFAULT_DURATION = 4200;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message, opts = {}) => {
    const { tone = 'info', duration = DEFAULT_DURATION, title = null } = opts;
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, tone, title }]);
    if (duration !== Infinity) {
      window.setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Thông báo">
        {toasts.map(t => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div key={t.id} className={`toast-item toast-item--${t.tone}`} role={t.tone === 'error' || t.tone === 'warning' ? 'alert' : 'status'}>
              <Icon size={18} className="toast-icon" />
              <div className="toast-body">
                {t.title && <div className="toast-title">{t.title}</div>}
                <div className="toast-message">{t.message}</div>
              </div>
              <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** @returns {(message: string, opts?: {tone?: 'success'|'error'|'warning'|'info', duration?: number, title?: string}) => void} */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail soft: một toast bị nuốt còn tốt hơn app crash vì thiếu Provider.
    return (message) => console.warn('[toast] ToastProvider chưa được mount:', message);
  }
  return ctx;
}
