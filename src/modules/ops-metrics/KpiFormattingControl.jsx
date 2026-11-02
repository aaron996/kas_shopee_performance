import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Palette, X } from 'lucide-react';
import { defaultFormatting, FORMATTING_MODES, formattingColor } from '../../utils/kpiFormatting';
import './kpiFormatting.css';

const COLOR_PRESETS = [
  { name: 'Trắng → xanh lá', mode: 'above', lowColor: '#ffffff', midColor: '#ffffff', highColor: '#57bb8a' },
  { name: 'Trắng → vàng', mode: 'above', lowColor: '#ffffff', midColor: '#ffffff', highColor: '#ffd666' },
  { name: 'Trắng → đỏ', mode: 'above', lowColor: '#ffffff', midColor: '#ffffff', highColor: '#e67c73' },
  { name: 'Xanh lá → trắng', mode: 'below', lowColor: '#57bb8a', midColor: '#ffffff', highColor: '#ffffff' },
  { name: 'Vàng → trắng', mode: 'below', lowColor: '#ffd666', midColor: '#ffffff', highColor: '#ffffff' },
  { name: 'Đỏ → trắng', mode: 'below', lowColor: '#e67c73', midColor: '#ffffff', highColor: '#ffffff' },
  { name: 'Đỏ → trắng → xanh lá', mode: 'three', lowColor: '#e67c73', midColor: '#ffffff', highColor: '#57bb8a' },
  { name: 'Xanh lá → vàng → đỏ', mode: 'three', lowColor: '#57bb8a', midColor: '#ffd666', highColor: '#e67c73' },
  { name: 'Xanh dương → trắng → tím', mode: 'three', lowColor: '#6d9eeb', midColor: '#ffffff', highColor: '#a78bfa' }
];
function ColorStrip({ rule }) {
  const preview = { ...rule, threshold: 50, spread: 50 };
  const values = rule.mode === 'below' ? [0, 12.5, 25, 37.5, 50] : rule.mode === 'above' ? [50, 62.5, 75, 87.5, 100] : [0, 25, 50, 75, 100];
  return <span className="kpi-color-strip" aria-hidden="true">{values.map(value => <span key={value} style={{ backgroundColor: formattingColor(value, preview) }} />)}</span>;
}

export function KpiFormattingLegend({ rule }) {
  if (!rule) return null;
  if (rule.mode === 'off') return <span>Đã tắt tô màu KPI.</span>;
  const low = Math.max(0, rule.threshold - rule.spread);
  const high = Math.min(100, rule.threshold + rule.spread);
  const values = rule.mode === 'below' ? [low, rule.threshold] : rule.mode === 'above' ? [rule.threshold, high] : [low, rule.threshold, high];
  return <div className="kpi-format-legend">
    <span>{FORMATTING_MODES.find(m => m.value === rule.mode)?.label}:</span>
    {values.map((value, i) => <span className="legend-item" key={i}>
      <span className="legend-box" style={{ background: formattingColor(value, rule) }} />
      {value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%
    </span>)}
  </div>;
}

export default function KpiFormattingControl({ metricKey, label, rule, onSave, onPreview }) {
  const id = useId();
  const panel = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => rule || defaultFormatting(metricKey));
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const close = () => { panel.current?.hidePopover(); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return undefined;
    const positionPanel = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const height = Math.min(panel.current?.offsetHeight || 560, window.innerHeight - 24);
      setPosition({ left: Math.max(12, window.innerWidth - width - 12),
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12)) });
    };
    positionPanel();
    const observer = new ResizeObserver(positionPanel);
    if (panel.current) observer.observe(panel.current);
    panel.current?.querySelector('.kpi-format-presets button')?.focus({ preventScroll: true });
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
    };
  }, [open]);
  const update = (key, value) => { setDraft(prev => ({ ...prev, [key]: value })); setError(''); };
  const enabled = draft.mode !== 'off';
  const valid = !enabled || (Number.isFinite(draft.threshold) && draft.threshold >= 0 && draft.threshold <= 100
    && Number.isFinite(draft.spread) && draft.spread >= 0.1 && draft.spread <= 100
    && ['lowColor', 'midColor', 'highColor'].every(key => /^#[0-9a-f]{6}$/i.test(draft[key])));
  const colors = draft.mode === 'three'
    ? [['lowColor', 'Màu thấp'], ['midColor', 'Màu tại mốc KPI'], ['highColor', 'Màu cao']]
    : [['lowColor', draft.mode === 'below' ? 'Màu dưới KPI' : 'Màu tại / dưới KPI'], ['highColor', draft.mode === 'below' ? 'Màu tại / trên KPI' : 'Màu trên KPI']];
  useEffect(() => {
    onPreview?.(metricKey, open && valid ? draft : null);
  }, [open, valid, draft, metricKey, onPreview]);
  useEffect(() => () => onPreview?.(metricKey, null), [metricKey, onPreview]);
  return <>
    <button ref={trigger} type="button" className="btn-secondary kpi-format-trigger" aria-expanded={open}
      aria-controls={id} aria-haspopup="dialog" aria-label={`Tô màu bảng ${label}`} title={`Tô màu bảng ${label}`} onClick={() => {
        if (open) { close(); return; }
        setDraft(rule || defaultFormatting(metricKey)); setError(''); panel.current?.showPopover();
      }}><Palette size={18} aria-hidden="true" /></button>
    {typeof document !== 'undefined' && createPortal(<section ref={panel} id={id} popover="auto" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}
      className="kpi-format-panel" style={position} onToggle={event => setOpen(event.newState === 'open')}>
      <header className="kpi-format-heading"><div><h3 id={`${id}-title`}>Tô màu bảng · {label}</h3>
        </div>
        <button type="button" className="kpi-format-close" aria-label="Đóng cài đặt tô màu" onClick={close}><X size={18} /></button>
      </header>
      <form onSubmit={event => {
        event.preventDefault();
        if (!valid) return;
        try { onSave(metricKey, draft); close(); }
        catch { setError('Không lưu được cài đặt. Kiểm tra quyền lưu của trình duyệt rồi thử lại.'); }
      }}>
          <fieldset className="kpi-format-presets"><legend>Chọn dải màu</legend>
            <div>{COLOR_PRESETS.map(preset => {
              const selected = draft.mode === preset.mode && ['lowColor', 'highColor', ...(preset.mode === 'three' ? ['midColor'] : [])].every(key => draft[key].toLowerCase() === preset[key]);
              return <button type="button" key={preset.name} aria-label={preset.name} aria-pressed={selected} title={preset.name}
                onClick={() => { setDraft(prev => ({ ...prev, ...preset })); setError(''); }}>
                <ColorStrip rule={preset} />{selected && <Check size={16} className="kpi-preset-check" aria-hidden="true" />}
              </button>;
            })}</div>
          </fieldset>
        {enabled && <>
          <div className="kpi-format-numbers">
            <label className="kpi-format-field">Mốc tô màu (%)
              <input type="number" min="0" max="100" step="0.1" required value={Number.isFinite(draft.threshold) ? draft.threshold : ''}
                onChange={event => update('threshold', event.target.value === '' ? NaN : Number(event.target.value))} />
            </label>
          </div>
          <div className="kpi-format-colors">{colors.map(([key, name]) => <div className="kpi-format-field" key={key}><span>{name}</span>
            <span className="kpi-format-color"><input type="color" aria-label={name} value={/^#[0-9a-f]{6}$/i.test(draft[key]) ? draft[key] : '#ffffff'} onInput={event => update(key, event.currentTarget.value)} onChange={event => update(key, event.target.value)} />
              <input type="text" className="kpi-format-hex" aria-label={`Mã ${name.toLowerCase()}`} value={draft[key]} pattern="#[0-9a-fA-F]{6}" maxLength={7} spellCheck={false} onChange={event => update(key, event.target.value)} /></span>
          </div>)}</div>
        </>}
        <label className="kpi-format-off"><input type="checkbox" checked={!enabled} onChange={event => update('mode', event.target.checked ? 'off' : defaultFormatting(metricKey).mode)} />Không tô màu</label>
        {!valid && <p className="kpi-format-error" role="alert">Mốc từ 0 đến 100%; mã màu gồm # và 6 ký tự hex.</p>}
        {error && <p className="kpi-format-error" role="alert">{error}</p>}
        <footer className="kpi-format-footer">
          <button type="button" className="btn-secondary" onClick={() => { setDraft(defaultFormatting(metricKey)); setError(''); }}>Mặc định</button>
          <button type="button" className="btn-secondary" onClick={close}>Hủy</button>
          <button type="submit" className="btn-primary-sleek" disabled={!valid}>Lưu cài đặt</button>
        </footer>
      </form>
    </section>, document.body)}
  </>;
}
