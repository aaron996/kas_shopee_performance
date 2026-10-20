import LoadingScreen from '../../components/LoadingScreen.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import DateField from '../../components/ui/DateField';
import { supabase } from '../../utils/supabaseClient';
import { fetchDailyRangeRows, datasetFor, buildWeeklyMatrix, dayLabel, WEEKLY_METRICS, clearWeeklyCache, DAILY_MAX_DAYS, addDays } from '../../utils/weeklyKpi';
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
        max={range.to || bounds.max} onChange={from => onChange({ ...range, from, preset: 'custom' })} />
      <span className="weekly-range-sep" aria-hidden="true">→</span>
      <DateField label="Đến ngày" value={range.to} min={range.from || bounds.min}
        max={range.from && addDays(range.from, DAILY_MAX_DAYS - 1) < bounds.max ? addDays(range.from, DAILY_MAX_DAYS - 1) : bounds.max}
        onChange={to => onChange({ ...range, to, preset: 'custom' })} />
      <select className="day-range-preset-select" aria-label="Chọn nhanh khoảng ngày"
        value={range.preset === 'custom' ? 'custom' : (presets.find(p => p.from === range.from && p.to === range.to)?.label || 'custom')}
        onChange={event => {
          const preset = presets.find(p => p.label === event.target.value);
          if (preset) onChange({ from: preset.from, to: preset.to, preset: preset.label });
        }}>
        <option value="custom" disabled>Tùy chọn</option>
        {presets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
      </select>
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
  rangeFilter = null,
  clientFilter = 'ALL',
  selectedRegions = null,
  selectedHubTypes = null,
  fetchRows = fetchDailyRangeRows,
  client = supabase
}) {
  const metric = WEEKLY_METRICS[metricKey];
  const dataset = datasetFor(metric, clientFilter);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const rangeDays = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1;
  const defaultShowVolume = rangeDays > 0 && rangeDays <= 7;
  // A new range restores its default; manual toggles only affect this selection.
  const selectionKey = `${range.from}:${range.to}:${defaultShowVolume}`;
  const [volumeOverride, setVolumeOverride] = useState(null);
  const showVolume = volumeOverride?.key === selectionKey ? volumeOverride.show : defaultShowVolume;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });
    fetchRows(client, dataset, range.from, range.to)
      .then(data => { if (!cancelled) setState({ status: 'ready', data, error: null }); })
      .catch(error => { if (!cancelled) setState({ status: 'error', data: null, error }); });
    return () => { cancelled = true; };
  }, [dataset, range.from, range.to, attempt, fetchRows, client]);

  const matrix = useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildWeeklyMatrix({
      rows: state.data.rows, weeks: state.data.weeks, metricKey, clientFilter, selectedRegions, selectedHubTypes, labelFor: dayLabel
    });
  }, [state, metricKey, clientFilter, selectedRegions, selectedHubTypes]);

  const shell = body => (
    <div className="metric-block metric-block-sticky weekly-kpi-block">
      <div className="metric-header daily-range-header">
        <div className="metric-title">
          <span title={title}>{metric.title}</span>
          {metric.target != null && <span className="kpi-badge">Target ≥ {metric.target.toFixed(0)}%</span>}
          {!rangeFilter && <span className="kpi-badge weekly-kpi-badge">{range.from.split('-').reverse().join('/')} → {range.to.split('-').reverse().join('/')}</span>}
        </div>
        {rangeFilter}
        <button type="button" className="btn-secondary daily-volume-toggle" aria-pressed={showVolume}
          onClick={() => setVolumeOverride({ key: selectionKey, show: !showVolume })}>
          Volume
        </button>
      </div>
      {body}
    </div>
  );

  if (state.status === 'loading') {
    return shell(<LoadingScreen />);
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
      <p className="daily-matrix-hint">Cuộn ngang để xem đủ ngày · Shift + lăn chuột hoặc vuốt ngang</p>
      <KpiMatrixTable matrix={matrix} lastLabel="ngày cuối khoảng" showVolume={showVolume} horizontalScroll />
      <div className="table-legend">
        <div>* Khoảng ngày đọc từ bảng lịch sử nên không có cột WTD, Tốt nhất 6 tuần và Cùng ngày tháng trước.</div>
      </div>
    </>
  );
}
