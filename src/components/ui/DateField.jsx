import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const PANEL_GAP = 6;
const PANEL_HEIGHT = 330;

const pad = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseIso = (iso) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return match ? { y: +match[1], m: +match[2] - 1, d: +match[3] } : null;
};
export const formatIsoVi = (iso) => {
  const p = parseIso(iso);
  return p ? `${pad(p.d)}/${pad(p.m + 1)}/${p.y}` : '';
};

// Date field with an in-app calendar (replaces the browser-native date input
// so look, locale and min/max behave the same everywhere). Values are ISO
// YYYY-MM-DD strings, like <input type="date">.
export default function DateField({ label, value, onChange, min, max }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 0, m: 0 });
  const [panelStyle, setPanelStyle] = useState(null);

  const openPanel = () => {
    const base = parseIso(value) || parseIso(max) || parseIso(min) || { y: new Date().getFullYear(), m: new Date().getMonth() };
    setView({ y: base.y, m: base.m });
    setOpen(true);
  };
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const openUp = window.innerHeight - rect.bottom < PANEL_HEIGHT + PANEL_GAP + 12 && rect.top > PANEL_HEIGHT;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 288 - 8));
    setPanelStyle({ left, ...(openUp ? { bottom: window.innerHeight - rect.top + PANEL_GAP } : { top: rect.bottom + PANEL_GAP }) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => { if (!root.current?.contains(event.target)) close(); };
    const onScrollOrResize = event => { if (!root.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  const minP = parseIso(min);
  const maxP = parseIso(max);
  const outOfRange = (iso) => (min && iso < min) || (max && iso > max);
  const shiftMonth = (delta) => setView(({ y, m }) => {
    const next = new Date(y, m + delta, 1);
    return { y: next.getFullYear(), m: next.getMonth() };
  });
  const canGoPrev = !minP || (view.y > minP.y || (view.y === minP.y && view.m > minP.m));
  const canGoNext = !maxP || (view.y < maxP.y || (view.y === maxP.y && view.m < maxP.m));

  const firstWeekday = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const today = new Date();
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  return <div ref={root} className="date-field" onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close(true);
    }
  }}>
    <button ref={trigger} type="button" className={`date-field-trigger ${open ? 'is-open' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} aria-label={`${label}: ${value ? formatIsoVi(value) : 'chưa chọn'}`} onClick={() => open ? close() : openPanel()}>
      <span className={value ? '' : 'is-placeholder'}>{value ? formatIsoVi(value) : 'dd/mm/yyyy'}</span>
      <CalendarDays size={15} aria-hidden="true" />
    </button>
    {open && panelStyle && <div id={id} className="date-panel" role="dialog" aria-label={`Chọn ${label.toLowerCase()}`} style={panelStyle}>
      <div className="date-panel-head">
        <button type="button" className="date-nav" aria-label="Tháng trước" disabled={!canGoPrev} onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></button>
        <strong>Tháng {view.m + 1}/{view.y}</strong>
        <button type="button" className="date-nav" aria-label="Tháng sau" disabled={!canGoNext} onClick={() => shiftMonth(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="date-grid" role="grid">
        {WEEKDAYS.map(w => <span key={w} className="date-weekday" aria-hidden="true">{w}</span>)}
        {cells.map((d, i) => {
          if (d === null) return <span key={`blank-${i}`} />;
          const iso = toIso(view.y, view.m, d);
          const disabled = outOfRange(iso);
          return <button key={iso} type="button" className={`date-day ${iso === value ? 'is-selected' : ''} ${iso === todayIso ? 'is-today' : ''}`} disabled={disabled} aria-pressed={iso === value} aria-label={formatIsoVi(iso)} onClick={() => { onChange(iso); close(true); }}>{d}</button>;
        })}
      </div>
      <div className="date-panel-foot">
        {min && <button type="button" className="msd-link" onClick={() => { onChange(min); close(true); }}>Ngày đầu có dữ liệu</button>}
        {max && <button type="button" className="msd-link" onClick={() => { onChange(max); close(true); }}>Ngày mới nhất</button>}
      </div>
    </div>}
  </div>;
}
