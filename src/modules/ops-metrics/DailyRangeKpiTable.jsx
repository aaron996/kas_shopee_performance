import React, { useEffect, useMemo, useState } from 'react';
import DateField from '../../components/ui/DateField';
import { supabase } from '../../utils/supabaseClient';
import { fetchDailyRangeRows, buildWeeklyMatrix, dayLabel, WEEKLY_METRICS, clearWeeklyCache, DAILY_MAX_DAYS, addDays } from '../../utils/weeklyKpi';
import KpiMatrixTable from './KpiMatrixTable';

// Cụm lọc khoảng ngày của "Theo ngày". `bounds` là ngày đầu/cuối có thể chọn của chỉ số đang xem.
export function DayRangeFilter({ range, onChange, bounds }) {
  const invalid = Boolean(range.from && range.to && range.from > range.to);
  const presets = [7, 14, 30].map(n => ({ label: `${n} ngày gần nhất`, from: addDays(bounds.max, -(n - 1)), to: bounds.max }))
    .concat([{ label: 'Mặc định', from: '', to: '' }]);
  return (
    <div className="weekly-range day-range" role="group" aria-label="Khoảng ngày">
      <DateField label="Từ ngày" value={range.from}
        min={range.to ? (addDays(range.to, -(DAILY_MAX_DAYS - 1)) > bounds.min ? addDays(range.to, -(DAILY_MAX_DAYS - 1)) : bounds.min) : bounds.min}
        max={range.to || bounds.max} onChange={from => onChange({ ...range, from })} />
      <span className="weekly-range-sep" aria-hidden="true">→</span>
      <DateField label="Đến ngày" value={range.to} min={range.from || bounds.min}
        max={range.from && addDays(range.from, DAILY_MAX_DAYS - 1) < bounds.max ? addDays(range.from, DAILY_MAX_DAYS - 1) : bounds.max}
        onChange={to => onChange({ ...range, to })} />
      <div className="weekly-range-presets">
        {presets.map(p => (
          <button key={p.label} type="button" className={`export-filter-preset ${range.from === p.from && range.to === p.to ? 'is-active' : ''}`} onClick={() => onChange({ from: p.from, to: p.to })}>{p.label}</button>
        ))}
      </div>
      {invalid && <p className="export-filter-error" role="alert">Ngày bắt đầu phải trước ngày kết thúc.</p>}
    </div>
  );
}

// "Theo ngày" khi có khoảng ngày: đọc hub-ngày từ bảng lịch sử (không phải bảng 14 ngày có benchmark),
// nên không có cột WTD, "Tốt nhất 6 tuần" và "Cùng ngày tháng trước". Mỗi ngày hai cột (% và volume).
export default function DailyRangeKpiTable({
  metricKey,
  title,
  range,
  clientFilter = 'ALL',
  selectedRegions = null,
  selectedHubTypes = null,
  fetchRows = fetchDailyRangeRows,
  client = supabase
}) {
  const metric = WEEKLY_METRICS[metricKey];
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });
    fetchRows(client, metric.dataset, range.from, range.to)
      .then(data => { if (!cancelled) setState({ status: 'ready', data, error: null }); })
      .catch(error => { if (!cancelled) setState({ status: 'error', data: null, error }); });
    return () => { cancelled = true; };
  }, [metric.dataset, range.from, range.to, attempt, fetchRows, client]);

  const matrix = useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildWeeklyMatrix({
      rows: state.data.rows, weeks: state.data.weeks, metricKey, clientFilter, selectedRegions, selectedHubTypes, labelFor: dayLabel
    });
  }, [state, metricKey, clientFilter, selectedRegions, selectedHubTypes]);

  const shell = body => (
    <div className="metric-block metric-block-sticky weekly-kpi-block">
      <div className="metric-header">
        <div className="metric-title">
          <span className="metric-title-text">{title}</span>
          <span className="metric-title-short">{metric.title}</span>
          {metric.target != null && <span className="kpi-badge">Target ≥ {metric.target.toFixed(0)}%</span>}
          <span className="kpi-badge weekly-kpi-badge">{range.from.split('-').reverse().join('/')} → {range.to.split('-').reverse().join('/')}</span>
        </div>
      </div>
      {body}
    </div>
  );

  if (state.status === 'loading') {
    return shell(<div className="weekly-kpi-note" role="status">Đang tải số liệu theo ngày…</div>);
  }
  if (state.status === 'error') {
    return shell(
      <div className="weekly-kpi-note" role="alert">
        Không tải được số liệu theo ngày.{' '}
        <button type="button" className="btn-secondary" onClick={() => { clearWeeklyCache(); setAttempt(n => n + 1); }}>Thử lại</button>
      </div>
    );
  }
  if (!matrix || matrix.empty) {
    return shell(<div className="weekly-kpi-note">Không có dữ liệu trong khoảng ngày này với phạm vi đang chọn.</div>);
  }
  return shell(
    <>
      <KpiMatrixTable matrix={matrix} lastLabel="ngày cuối khoảng" />
      <div className="table-legend">
        <div>* Khoảng ngày đọc từ bảng lịch sử nên không có cột WTD, Tốt nhất 6 tuần và Cùng ngày tháng trước.</div>
      </div>
    </>
  );
}
