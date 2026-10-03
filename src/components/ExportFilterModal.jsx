import React, { useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import ModalDialog from './ui/ModalDialog';
import MultiSelectDropdown from './ui/MultiSelectDropdown';
import DateField from './ui/DateField';

const DAY_MS = 86400000;
const shiftIso = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// Multi-select filter dialog shown before a CSV download.
// fields: [{ key, label, options: [{ value, label }], initial?: string[] }]
// dateRange: { min, max } (YYYY-MM-DD) or null to hide the date filter.
// countRows(filters) -> number of rows the current selection would export.
export default function ExportFilterModal({ isOpen, onClose, title = 'Tải về dữ liệu', fields, dateRange, countRows, onConfirm }) {
  const initialSelection = useMemo(() => Object.fromEntries(fields.map(f => [f.key, f.initial || f.options.map(o => o.value)])), [fields]);
  const [selection, setSelection] = useState(initialSelection);
  const [from, setFrom] = useState(dateRange?.min || '');
  const [to, setTo] = useState(dateRange?.max || '');
  const [wasOpen, setWasOpen] = useState(false);

  // Re-seed defaults (header scope / latest data range) each time the dialog opens.
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setSelection(initialSelection);
    setFrom(dateRange?.min || '');
    setTo(dateRange?.max || '');
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const filters = { selection, from, to };
  const count = isOpen ? countRows(filters) : 0;
  const setField = (key, values) => setSelection(prev => ({ ...prev, [key]: values }));
  const dateInvalid = Boolean(from && to && from > to);

  const presets = dateRange ? [
    { label: '7 ngày gần nhất', from: shiftIso(dateRange.max, -6) < dateRange.min ? dateRange.min : shiftIso(dateRange.max, -6) },
    { label: '30 ngày gần nhất', from: shiftIso(dateRange.max, -29) < dateRange.min ? dateRange.min : shiftIso(dateRange.max, -29) },
    { label: 'Toàn bộ', from: dateRange.min }
  ].filter((p, i, all) => all.findLastIndex(q => q.from === p.from) === i) : []; // short data windows collapse presets onto the same range

  return <ModalDialog isOpen={isOpen} onClose={onClose} titleId="export-filter-title" className="export-filter-card">
    <div className="export-filter-header">
      <h3 id="export-filter-title"><Download size={18} /> {title}</h3>
      <button type="button" className="export-filter-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
    </div>
    <div className="export-filter-body">
      {dateRange && <section className="export-filter-group" aria-labelledby="export-filter-date">
        <h4 id="export-filter-date">Khoảng ngày</h4>
        <div className="export-filter-dates">
          <DateField label="Từ ngày" value={from} min={dateRange.min} max={to || dateRange.max} onChange={setFrom} />
          <span className="export-filter-date-sep" aria-hidden="true">→</span>
          <DateField label="Đến ngày" value={to} min={from || dateRange.min} max={dateRange.max} onChange={setTo} />
        </div>
        <div className="export-filter-presets">
          {presets.map(p => <button key={p.label} type="button" className={`export-filter-preset ${from === p.from && to === dateRange.max ? 'is-active' : ''}`} onClick={() => { setFrom(p.from); setTo(dateRange.max); }}>{p.label}</button>)}
        </div>
        {dateInvalid && <p className="export-filter-error" role="alert">Ngày bắt đầu phải trước ngày kết thúc.</p>}
      </section>}
      <div className="export-filter-fields">
        {fields.map(field => <div key={field.key} className="export-filter-group">
          <h4>{field.label}</h4>
          <MultiSelectDropdown label={field.label} options={field.options} value={selection[field.key] || []} onChange={values => setField(field.key, values)} placeholder={`Tìm ${field.label.toLowerCase()}…`} />
        </div>)}
      </div>
    </div>
    <div className="export-filter-footer">
      <span className={count === 0 ? 'is-empty' : ''}>{count === 0 ? 'Không có dòng nào khớp bộ lọc' : `${count.toLocaleString('vi-VN')} dòng sẽ được tải`}</span>
      <div>
        <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
        <button type="button" className="btn-primary-sleek" disabled={count === 0 || dateInvalid} onClick={() => { onConfirm(filters); onClose(); }}><Download size={14} /> Tải CSV</button>
      </div>
    </div>
  </ModalDialog>;
}
