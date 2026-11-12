import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Palette, X } from 'lucide-react';
import { BACKLOG_FORMAT_MODES, defaultBacklogFormatting } from '../../utils/backlogFormatting';
import './kpiFormatting.css';

const HEX = /^#[0-9a-f]{6}$/i;
const COLOR_FIELDS = {
  delta: [['upColor', 'Màu khi tồn tăng'], ['downColor', 'Màu khi tồn giảm']],
  heat: [['heatLow', 'Màu mức tồn thấp'], ['heatHigh', 'Màu mức tồn cao']]
};
const fieldsFor = mode => (mode === 'delta' ? COLOR_FIELDS.delta : mode === 'heat' ? COLOR_FIELDS.heat : mode === 'both' ? [...COLOR_FIELDS.delta, ...COLOR_FIELDS.heat] : []);

// Nút bảng màu của tab Backlog: tô cột Δ (tăng/giảm) và/hoặc mức tồn theo cấp. Không gọi DB.
export default function BacklogFormattingControl({ rule, onSave, onPreview }) {
  const id = useId();
  const panel = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => rule || defaultBacklogFormatting());
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const close = () => { panel.current?.hidePopover(); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const height = Math.min(panel.current?.offsetHeight || 460, window.innerHeight - 24);
      setPosition({ left: Math.max(12, window.innerWidth - width - 12), top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12)) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    panel.current?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  const fields = fieldsFor(draft.mode);
  const valid = fields.every(([key]) => HEX.test(draft[key]));
  useEffect(() => { onPreview?.(open && valid ? draft : null); }, [open, valid, draft, onPreview]);
  useEffect(() => () => onPreview?.(null), [onPreview]);
  const update = (key, value) => { setDraft(prev => ({ ...prev, [key]: value })); setError(''); };
  return <>
    <button ref={trigger} type="button" className="btn-secondary kpi-format-trigger" aria-expanded={open} aria-controls={id} aria-haspopup="dialog"
      aria-label="Tô màu bảng Backlog" title="Tô màu bảng Backlog" onClick={() => {
        if (open) { close(); return; }
        setDraft(rule || defaultBacklogFormatting()); setError(''); panel.current?.showPopover();
      }}><Palette size={18} aria-hidden="true" /></button>
    {typeof document !== 'undefined' && createPortal(<section ref={panel} id={id} popover="auto" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}
      className="kpi-format-panel" style={position} onToggle={event => setOpen(event.newState === 'open')}>
      <header className="kpi-format-heading"><h3 id={`${id}-title`}>Tô màu bảng · Backlog</h3>
        <button type="button" className="kpi-format-close" aria-label="Đóng cài đặt tô màu" onClick={close}><X size={18} /></button>
      </header>
      <form onSubmit={event => {
        event.preventDefault();
        if (!valid) return;
        try { onSave(draft); close(); } catch { setError('Không lưu được cài đặt. Kiểm tra quyền lưu của trình duyệt rồi thử lại.'); }
      }}>
        <fieldset className="kpi-format-presets"><legend>Tô màu theo</legend>
          <div className="backlog-format-modes">{BACKLOG_FORMAT_MODES.map(mode => (
            <button type="button" key={mode.value} aria-pressed={draft.mode === mode.value} onClick={() => update('mode', mode.value)}>
              <span>{mode.label}</span>{draft.mode === mode.value && <Check size={16} aria-hidden="true" />}
            </button>
          ))}</div>
        </fieldset>
        {fields.length > 0 && <div className="kpi-format-colors">{fields.map(([key, name]) => <div className="kpi-format-field" key={key}><span>{name}</span>
          <span className="kpi-format-color">
            <input type="color" aria-label={name} value={HEX.test(draft[key]) ? draft[key] : '#ffffff'} onInput={event => update(key, event.currentTarget.value)} onChange={event => update(key, event.target.value)} />
            <input type="text" className="kpi-format-hex" aria-label={`Mã ${name.toLowerCase()}`} value={draft[key]} pattern="#[0-9a-fA-F]{6}" maxLength={7} spellCheck={false} onChange={event => update(key, event.target.value)} />
          </span></div>)}</div>}
        {draft.mode === 'app' && <p className="kpi-format-help">Giữ bảng trung tính như hiện tại.</p>}
        {draft.mode !== 'app' && draft.mode !== 'off' && <p className="kpi-format-help">
          {draft.mode !== 'heat' && 'Δ đậm dần theo mức thay đổi so với dòng lớn nhất cùng cấp. '}{draft.mode !== 'delta' && 'Mức tồn đậm dần theo giá trị lớn nhất cùng cấp và cùng ngày.'}</p>}
        {!valid && <p className="kpi-format-error" role="alert">Mã màu gồm # và 6 ký tự hex.</p>}
        {error && <p className="kpi-format-error" role="alert">{error}</p>}
        <footer className="kpi-format-footer">
          <button type="button" className="btn-secondary" onClick={() => { setDraft(defaultBacklogFormatting()); setError(''); }}>Mặc định</button>
          <button type="button" className="btn-secondary" onClick={close}>Hủy</button>
          <button type="submit" className="btn-primary-sleek" disabled={!valid}>Lưu cài đặt</button>
        </footer>
      </form>
    </section>, document.body)}
  </>;
}

export function BacklogFormattingLegend({ rule }) {
  if (!rule) return null;
  if (rule.mode === 'off') return <span>Đã tắt tô màu Backlog.</span>;
  const swatch = color => <span className="legend-box" style={{ background: color }} />;
  return <div className="kpi-format-legend">
    {rule.mode !== 'heat' && <><span className="legend-item">{swatch(rule.upColor)}Δ tăng</span><span className="legend-item">{swatch(rule.downColor)}Δ giảm</span></>}
    {rule.mode !== 'delta' && <span className="legend-item">{swatch(rule.heatLow)}→{swatch(rule.heatHigh)}Mức tồn thấp → cao (theo cấp)</span>}
  </div>;
}
