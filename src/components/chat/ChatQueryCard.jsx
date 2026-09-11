import React, { useState } from 'react';
import { CalendarDays, Check, Search } from 'lucide-react';
import { buildMetricQuestion, initialMetricQuery, validateMetricQuery } from '../../utils/chatQuery';

function SingleSelect({ field, value, disabled, onChange }) {
  return (
    <fieldset className="chat-query-field" disabled={disabled}>
      <legend>{field.label}</legend>
      <div className="chat-query-options">
        {field.options.map(option => (
          <button
            type="button"
            key={option.id}
            className={value === option.value ? 'is-selected' : ''}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {value === option.value && <Check size={14} aria-hidden="true" />}
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function ChatQueryCard({ interaction, disabled, onSubmit }) {
  const [query, setQuery] = useState(() => initialMetricQuery(interaction));
  const validationMessage = validateMetricQuery(query);
  const isInactive = disabled || interaction.dismissed || Boolean(interaction.selection);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  if (interaction.selection) {
    return (
      <div className="chat-query-card chat-query-card--resolved" aria-label="Lựa chọn đã gửi">
        <Check size={15} aria-hidden="true" />
        <span>Đã chọn: {interaction.selection}</span>
      </div>
    );
  }

  if (interaction.dismissed) {
    return <div className="chat-query-card chat-query-card--dismissed">Đã tiếp tục bằng câu hỏi khác.</div>;
  }

  const updateField = (field, value) => {
    setQuery(current => ({
      ...current,
      [field]: value,
      ...(field === 'dateMode' && value !== 'custom' ? { dateFrom: null, dateTo: null } : {})
    }));
  };

  const submit = event => {
    event.preventDefault();
    if (isInactive || validationMessage) return;
    const message = buildMetricQuestion(query);
    onSubmit(query, message);
  };

  return (
    <form className="chat-query-card" onSubmit={submit} aria-label="Chọn tham số tra cứu KPI">
      {interaction.fields.filter(field => field.type === 'single_select').map(field => (
        <SingleSelect
          key={field.id}
          field={field}
          value={query[field.id]}
          disabled={isInactive}
          onChange={value => updateField(field.id, value)}
        />
      ))}

      {query.dateMode === 'custom' && (
        <fieldset className="chat-query-field chat-query-dates" disabled={isInactive}>
          <legend>Khoảng ngày</legend>
          <label>
            <span>Từ ngày</span>
            <input type="date" value={query.dateFrom || ''} max={query.dateTo || today} onChange={event => updateField('dateFrom', event.target.value || null)} />
          </label>
          <label>
            <span>Đến ngày</span>
            <input type="date" value={query.dateTo || ''} min={query.dateFrom || undefined} max={today} onChange={event => updateField('dateTo', event.target.value || null)} />
          </label>
        </fieldset>
      )}

      <div className="chat-query-footer">
        <span className="chat-query-hint" aria-live="polite">
          {validationMessage || <><CalendarDays size={13} aria-hidden="true" /> Sẵn sàng tra cứu</>}
        </span>
        <button type="submit" className="chat-query-submit" disabled={isInactive || Boolean(validationMessage)}>
          <Search size={15} aria-hidden="true" /> Xem kết quả
        </button>
      </div>
    </form>
  );
}
