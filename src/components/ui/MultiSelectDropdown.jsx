import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

const PANEL_GAP = 6;
const PANEL_MAX_HEIGHT = 320;

// Multi-select with a searchable checklist in a popover. The panel is
// position:fixed so it is not clipped by a scrolling modal body.
// options: [{ value, label }]; value: string[]; onChange(string[]).
export default function MultiSelectDropdown({ label, options, value, onChange, searchable, placeholder = 'Tìm…' }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelStyle, setPanelStyle] = useState(null);

  const showSearch = searchable ?? options.length > 6;
  const selected = useMemo(() => new Set(value), [value]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => q ? options.filter(o => String(o.label).toLowerCase().includes(q)) : options, [options, q]);
  const allSelected = options.length > 0 && value.length === options.length;
  const visibleAllSelected = visible.length > 0 && visible.every(o => selected.has(o.value));

  const summary = useMemo(() => {
    if (options.length === 0) return 'Không có dữ liệu';
    if (value.length === 0) return 'Chưa chọn';
    if (allSelected) return `Tất cả (${options.length})`;
    const names = options.filter(o => selected.has(o.value)).map(o => o.label);
    return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, [options, value, allSelected, selected]);

  const place = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - PANEL_GAP - 12;
    const above = rect.top - PANEL_GAP - 12;
    const openUp = below < 220 && above > below;
    const maxHeight = Math.max(160, Math.min(PANEL_MAX_HEIGHT, openUp ? above : below));
    setPanelStyle({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - rect.top + PANEL_GAP } : { top: rect.bottom + PANEL_GAP })
    });
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) trigger.current?.focus();
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => { if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) close(); };
    const onScrollOrResize = event => { if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => { if (open && showSearch) searchRef.current?.focus(); }, [open, showSearch]);

  const toggle = (v) => onChange(selected.has(v) ? value.filter(x => x !== v) : [...value, v]);
  const toggleVisible = () => {
    const visibleValues = new Set(visible.map(o => o.value));
    onChange(visibleAllSelected ? value.filter(v => !visibleValues.has(v)) : [...new Set([...value, ...visible.map(o => o.value)])]);
  };

  return <div ref={root} className="msd" onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation(); // keep the surrounding modal open
      close(true);
    }
  }}>
    <button ref={trigger} type="button" className={`msd-trigger ${open ? 'is-open' : ''} ${value.length > 0 && !allSelected ? 'is-filtered' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={`${label}: ${summary}`} disabled={options.length === 0} onClick={() => open ? close() : setOpen(true)}>
      <span className="msd-summary">{summary}</span>
      <ChevronDown size={16} className="msd-chevron" aria-hidden="true" />
    </button>
    {open && panelStyle && createPortal(<div ref={panel} id={id} className="msd-panel" style={panelStyle}>
      {showSearch && <label className="msd-search">
        <Search size={14} aria-hidden="true" />
        <input ref={searchRef} type="text" value={query} placeholder={placeholder} aria-label={`Tìm ${label.toLowerCase()}`} onChange={e => setQuery(e.target.value)} />
      </label>}
      <div className="msd-bulk">
        <button type="button" className="msd-link" disabled={visible.length === 0} onClick={toggleVisible}>
          {q ? (visibleAllSelected ? 'Bỏ chọn kết quả' : `Chọn ${visible.length} kết quả`) : (allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả')}
        </button>
        <span>{value.length}/{options.length} đã chọn</span>
      </div>
      <ul className="msd-list" role="listbox" aria-multiselectable="true" aria-label={label}>
        {visible.map(o => {
          const on = selected.has(o.value);
          return <li key={o.value} role="option" aria-selected={on}>
            <label className={`msd-option ${on ? 'is-on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(o.value)} />
              <span className="msd-box" aria-hidden="true">{on && <Check size={12} strokeWidth={3} />}</span>
              <span className="msd-option-label">{o.label}</span>
            </label>
          </li>;
        })}
        {visible.length === 0 && <li className="msd-empty">Không có kết quả</li>}
      </ul>
    </div>, document.body)}
  </div>;
}
