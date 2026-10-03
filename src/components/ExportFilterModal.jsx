import React, { useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import ModalDialog from './ui/ModalDialog';

// Multi-select filter dialog shown before a CSV download.
// fields: [{ key, label, options: [{ value, label }], initial?: string[] }]
// dateRange: { min, max } (YYYY-MM-DD) or null to hide the date filter.
// countRows(filters) -> number of rows the current selection would export.
export default function ExportFilterModal({ isOpen, onClose, title = 'Tải về dữ liệu', fields, dateRange, countRows, onConfirm }) {
  const initialSelection = useMemo(() => Object.fromEntries(fields.map(f => [f.key, f.initial || f.options.map(o => o.value)])), [fields]);
  const [selection, setSelection] = useState(initialSelection);
  const [from, setFrom] = useState(dateRange?.min || '');
  const [to, setTo] = useState(dateRange?.max || '');
  const [search, setSearch] = useState({});
  const [wasOpen, setWasOpen] = useState(false);

  // Re-seed defaults (header scope / latest data range) each time the dialog opens.
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setSelection(initialSelection);
    setFrom(dateRange?.min || '');
    setTo(dateRange?.max || '');
    setSearch({});
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const filters = { selection, from, to };
  const count = isOpen ? countRows(filters) : 0;
  const setField = (key, values) => setSelection(prev => ({ ...prev, [key]: values }));
  const toggle = (key, value) => {
    const current = selection[key] || [];
    setField(key, current.includes(value) ? current.filter(v => v !== value) : [...current, value]);
  };

  return <ModalDialog isOpen={isOpen} onClose={onClose} titleId="export-filter-title" className="export-filter-card">
    <div className="export-filter-header">
      <h3 id="export-filter-title"><Download size={18} /> {title}</h3>
      <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
    </div>
    <div className="export-filter-body">
      {dateRange && <fieldset className="export-filter-group">
        <legend>Khoảng ngày</legend>
        <div className="export-filter-dates">
          <label>Từ <input type="date" value={from} min={dateRange.min} max={to || dateRange.max} onChange={e => setFrom(e.target.value)} /></label>
          <label>Đến <input type="date" value={to} min={from || dateRange.min} max={dateRange.max} onChange={e => setTo(e.target.value)} /></label>
        </div>
      </fieldset>}
      {fields.map(field => {
        const selected = selection[field.key] || [];
        const q = (search[field.key] || '').trim().toLowerCase();
        const visible = q ? field.options.filter(o => String(o.label).toLowerCase().includes(q)) : field.options;
        const allSelected = selected.length === field.options.length;
        return <fieldset key={field.key} className="export-filter-group">
          <legend>{field.label} <span className="export-filter-count">{selected.length}/{field.options.length}</span></legend>
          <div className="export-filter-tools">
            {field.options.length > 8 && <input type="search" placeholder={`Tìm ${field.label.toLowerCase()}…`} value={search[field.key] || ''} onChange={e => setSearch(prev => ({ ...prev, [field.key]: e.target.value }))} />}
            <button type="button" className="popover-text-action" onClick={() => setField(field.key, allSelected ? [] : field.options.map(o => o.value))}>{allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>
          </div>
          <div className="export-filter-options">
            {visible.map(o => <label key={o.value} className="export-filter-chip"><input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(field.key, o.value)} /><span>{o.label}</span></label>)}
            {visible.length === 0 && <span className="export-filter-empty">Không có kết quả</span>}
          </div>
        </fieldset>;
      })}
    </div>
    <div className="export-filter-footer">
      <span>{count.toLocaleString('vi-VN')} dòng sẽ được tải</span>
      <div>
        <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
        <button type="button" className="nav-btn primary" disabled={count === 0} onClick={() => { onConfirm(filters); onClose(); }}><Download size={14} /> Tải CSV</button>
      </div>
    </div>
  </ModalDialog>;
}
