import { useEffect, useId, useRef } from 'react';
import AnimatedIcon from './AnimatedIcon';

// Hover previews the panel; clicking pins it for selection or touch input.
export default function HeaderPopover({ name, icon, label, summary, badge, state, setState, children, status = '', align = 'left' }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const timer = useRef(null);
  const suppressFocus = useRef(false);
  const open = state?.name === name;
  const pinned = open && state.pinned;
  const cancelClose = () => clearTimeout(timer.current);
  const close = () => setState(current => current?.name === name ? null : current);
  const dismissAndFocus = () => {
    suppressFocus.current = true;
    close();
    trigger.current?.focus();
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (!root.current?.contains(document.activeElement)) setState(current => current?.name === name && !current.pinned ? null : current);
    }, 160);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = event => { if (!root.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  });
  return <div ref={root} className={`header-popover ${status}`} onPointerEnter={event => {
    cancelClose();
    if (event.pointerType === 'mouse') setState(current => current?.pinned ? current : { name, pinned: false });
  }} onPointerLeave={scheduleClose} onBlur={scheduleClose} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      dismissAndFocus();
    }
  }}>
    <button ref={trigger} type="button" className={`header-popover-trigger ${open ? 'is-open' : ''}`} aria-label={`${label}: ${summary}`} aria-expanded={open} aria-controls={id} onFocus={() => {
      cancelClose();
      if (!suppressFocus.current) setState(current => ({ name, pinned: current?.name === name && current.pinned }));
    }} onBlur={() => { suppressFocus.current = false; }} onClick={() => {
      cancelClose();
      setState(pinned ? null : { name, pinned: true });
    }}>
      <AnimatedIcon name={icon} size={20} />
      {badge !== undefined && <span className="scope-count">{badge}</span>}
      {status && <span className="sync-status-dot" />}
    </button>
    {open && <section id={id} className={`header-popover-panel align-${align}`} aria-label={label}>
      <div className="popover-heading"><div><strong>{label}</strong><p>{summary}</p></div><button type="button" className="popover-close" aria-label={`Đóng ${label}`} onClick={dismissAndFocus}><AnimatedIcon name="X" size={16} /></button></div>
      {children}
    </section>}
  </div>;
}
