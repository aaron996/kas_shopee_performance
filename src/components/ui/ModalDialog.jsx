import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { gsap, shouldAnimate } from '../../utils/gsapSetup';

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export default function ModalDialog({
  isOpen,
  onClose,
  titleId,
  descriptionId,
  initialFocusRef,
  className = '',
  dismissible = true,
  children
}) {
  const dialogRef = useRef(null);
  const backdropRef = useRef(null);
  const generatedTitleId = useId();
  const labelledBy = titleId || generatedTitleId;

  // isOpen là "cửa sổ NÊN mở"; isMounted là "node còn trong DOM". Hai thứ này
  // lệch nhau đúng khoảng thời gian chạy animation đóng: trước đây modal
  // `return null` ngay khi isOpen=false nên không thể có exit animation nào cả.
  const [isMounted, setIsMounted] = useState(isOpen);

  // Cập nhật state ngay trong lúc render (không phải trong useEffect) là có
  // chủ đích: effect focus-trap bên dưới query dialogRef.current và chỉ chạy
  // lại khi isOpen đổi. Nếu mount trễ 1 vòng render thì lần đó ref còn null,
  // modal mở ra mà không ai được focus, và effect sẽ không chạy lại để sửa.
  // React xử lý setState kiểu này bằng cách render lại trước khi commit, nên
  // ref đã gắn xong trước lúc layout effect chạy.
  if (isOpen && !isMounted) {
    setIsMounted(true);
  }

  const isClosing = isMounted && !isOpen;

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const initialFocus = initialFocusRef?.current || dialog?.querySelector(focusableSelector);
    initialFocus?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [dismissible, initialFocusRef, isOpen, onClose]);

  // Mở: backdrop mờ dần, card trôi lên. clearProps ở cuối để không còn inline
  // style nào sót lại — vừa cho animation đóng khởi hành từ trạng thái sạch,
  // vừa tránh html-to-image (Report1/Report5) chụp phải transform dở dang.
  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const backdrop = backdropRef.current;
    const card = dialogRef.current;
    if (!backdrop || !card || !shouldAnimate()) return undefined;

    const tl = gsap.timeline();
    tl.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: 0.18, ease: 'power2.out', clearProps: 'opacity' }
    ).fromTo(
      card,
      { opacity: 0, scale: 0.96, y: 8 },
      { opacity: 1, scale: 1, y: 0, duration: 0.26, ease: 'power3.out', clearProps: 'opacity,transform' },
      '<0.02'
    );

    return () => tl.kill();
  }, [isOpen]);

  // Đóng: chạy animation rồi mới tháo node khỏi DOM. Mở lại giữa lúc đang đóng
  // thì cleanup kill timeline này trước khi onComplete kịp chạy, nên không có
  // chuyện modal vừa mở lại đã bị unmount.
  useLayoutEffect(() => {
    if (!isClosing) return undefined;
    const backdrop = backdropRef.current;
    const card = dialogRef.current;
    if (!backdrop || !card || !shouldAnimate()) {
      setIsMounted(false);
      return undefined;
    }

    const tl = gsap.timeline({ onComplete: () => setIsMounted(false) });
    tl.to(card, { opacity: 0, scale: 0.97, y: 4, duration: 0.14, ease: 'power2.in' })
      .to(backdrop, { opacity: 0, duration: 0.14, ease: 'power2.in' }, '<');

    return () => tl.kill();
  }, [isClosing]);

  if (!isMounted) return null;

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      // Trong lúc đóng thì node vẫn còn đó nhưng không còn là dialog đang hoạt
      // động: chặn click (tránh bấm trúng nút vừa mờ đi) và ẩn khỏi screen
      // reader, vốn đã được trả focus về chỗ cũ từ cleanup của effect trên.
      onMouseDown={dismissible && !isClosing ? onClose : undefined}
      style={isClosing ? { pointerEvents: 'none' } : undefined}
      aria-hidden={isClosing ? 'true' : undefined}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className={`modal-card ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}
