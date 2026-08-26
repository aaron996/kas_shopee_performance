import React, { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { gsap, shouldAnimate } from '../../utils/gsapSetup';

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

/**
 * Một toast, tự lo animation vào/ra của chính nó.
 *
 * Tách thành component riêng vì animation RA cần một node còn sống để chạy:
 * bản cũ xoá toast khỏi array là nó biến mất tức thời, không có cách nào
 * animate. Giờ `dismiss` chỉ bật cờ `exiting`, node ở lại ~200ms cho tween
 * chạy xong rồi mới gọi `onExited` để provider xoá thật.
 */
function ToastItem({ toast, onDismiss, onExited }) {
  const ref = useRef(null);
  const Icon = ICONS[toast.tone] || Info;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !shouldAnimate()) return undefined;
    // clearProps để không còn inline transform/opacity sót lại sau khi vào —
    // tween ra bên dưới nhờ vậy khởi hành từ trạng thái sạch.
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: -8, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out', clearProps: 'opacity,transform' }
    );
    return () => tween.kill();
  }, []);

  useLayoutEffect(() => {
    if (!toast.exiting) return undefined;
    const el = ref.current;
    if (!el || !shouldAnimate()) {
      onExited(toast.id);
      return undefined;
    }
    // Trượt sang phải rồi mờ đi: hướng ra khỏi màn hình, khác hẳn hướng vào
    // (trượt xuống từ trên) nên mắt phân biệt được "cái mới đến" với "cái vừa đi".
    const tween = gsap.to(el, {
      opacity: 0,
      x: 24,
      scale: 0.98,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => onExited(toast.id)
    });
    return () => tween.kill();
  }, [toast.exiting, toast.id, onExited]);

  return (
    <div
      ref={ref}
      className={`toast-item toast-item--${toast.tone}`}
      role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'}
      style={toast.exiting ? { pointerEvents: 'none' } : undefined}
    >
      <Icon size={18} className="toast-icon" />
      <div className="toast-body">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div className="toast-message">{toast.message}</div>
      </div>
      <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Đóng thông báo">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  // remove = tháo khỏi DOM thật (sau khi animation ra xong).
  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // dismiss = "hãy biến đi", chỉ bật cờ. Gọi 2 lần (hết giờ + user bấm X) là
  // vô hại: lần thứ hai không đổi gì nên effect animation không chạy lại.
  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)));
  }, []);

  // showToast phải giữ nguyên identity giữa các lần render — App.jsx đưa nó
  // vào deps của useEffect (auth listener), đổi identity là effect đó chạy lại
  // mỗi render. dismiss/remove đều useCallback([]) nên chuỗi này ổn định.
  const showToast = useCallback((message, opts = {}) => {
    const { tone = 'info', duration = DEFAULT_DURATION, title = null } = opts;
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, tone, title, exiting: false }]);
    if (duration !== Infinity) {
      window.setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Thông báo">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} onExited={remove} />
        ))}
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
