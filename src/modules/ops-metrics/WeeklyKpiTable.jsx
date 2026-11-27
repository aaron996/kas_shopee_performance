import LoadingScreen from '../../components/LoadingScreen.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import DateField from '../../components/ui/DateField';
import { supabase } from '../../utils/supabaseClient';
import { fetchWeeklyRows, fetchMonthlyRows, fetchDetailRows, effectiveDetailScope, monthEnd, monthLabel, datasetFor, buildWeeklyMatrix, WEEKLY_METRICS, clearWeeklyCache } from '../../utils/weeklyKpi';
import KpiMatrixTable from './KpiMatrixTable';
import { PUD_NOTE } from '../../utils/pud';
import ScopeBadges from './ScopeBadges';

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const periodEndOf = (start, isMonth) => (isMonth ? monthEnd(start) : addDays(start, 6));

// Chế độ "Theo tuần" / "Theo tháng" của Chi tiết Vùng/Hub: mỗi tuần hai cột (% và volume), tối đa 9 tuần
// (tuần hiện tại + 8 tuần nguyên). Dữ liệu từ bảng lịch sử, không phải từ dữ liệu 14 ngày
// của bảng theo ngày, nên không có cột "Tốt nhất 6 tuần" / "Cùng ngày tháng trước".
export default function WeeklyKpiTable({
  metricKey,
  title,
  formattingRule = null,
  formattingControl = null,
  clientFilter = 'ALL',
  selectedRegions = null,
  selectedHubTypes = null,
  detailScope = null,
  period = 'week',
  fetchRows = period === 'month' ? fetchMonthlyRows : fetchWeeklyRows,
  client = supabase
}) {
  const isMonth = period === 'month';
  const unit = isMonth ? 'tháng' : 'tuần';
  const metric = WEEKLY_METRICS[metricKey];
  const dataset = datasetFor(metric, clientFilter);
  // KAS-317: bật Province/Lane thì cộng tuần từ bảng chi tiết (không benchmark), tắt thì giữ luồng cũ.
  const scope = useMemo(() => effectiveDetailScope(dataset, detailScope), [dataset, detailScope]);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${period}:${dataset}:${scope.key}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ key: requestKey, status: 'loading', data: prev.data && prev.data.dataset === dataset && prev.data.period === period && prev.data.scopeKey === scope.key ? prev.data : null, error: null }));
    (scope.active
      ? fetchDetailRows(client, dataset, period, { provinces: scope.provinces, lanes: scope.lanes })
      : fetchRows(client, dataset))
      .then(data => { if (!cancelled) setState({ key: requestKey, status: 'ready', data: { ...data, dataset, period, scopeKey: scope.key }, error: null }); })
      .catch(error => { if (!cancelled) setState({ key: requestKey, status: 'error', data: null, error }); });
    return () => { cancelled = true; };
  }, [requestKey, dataset, period, scope, attempt, fetchRows, client]);

  // Khoảng ngày: dữ liệu theo tuần nên khoảng được hiểu là "các tuần có ngày nằm trong khoảng".
  const [range, setRange] = useState({ from: '', to: '' });
  const allWeeks = state.key === requestKey ? state.data?.weeks : null;
  const bounds = useMemo(() => (allWeeks?.length
    ? { min: allWeeks[0], max: periodEndOf(allWeeks[allWeeks.length - 1], isMonth) }
    : null), [allWeeks, isMonth]);
  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to);
  const visibleWeeks = useMemo(() => {
    if (!allWeeks) return null;
    if (rangeInvalid) return allWeeks;
    return allWeeks.filter(w => (!range.from || periodEndOf(w, isMonth) >= range.from) && (!range.to || w <= range.to));
  }, [allWeeks, range, rangeInvalid, isMonth]);
  const isFiltered = Boolean(allWeeks && visibleWeeks && !rangeInvalid && visibleWeeks.length < allWeeks.length);

  const matrix = useMemo(() => {
    if (state.key !== requestKey || state.status !== 'ready') return null;
    return buildWeeklyMatrix({
      rows: state.data.rows, weeks: visibleWeeks, metricKey, clientFilter, selectedRegions, selectedHubTypes,
      ...(isMonth ? { labelFor: monthLabel } : {})
    });
  }, [state, requestKey, visibleWeeks, metricKey, clientFilter, selectedRegions, selectedHubTypes, isMonth]);

  const presetCounts = isMonth ? [3] : [4, 8];
  const presets = allWeeks?.length ? presetCounts.filter(n => n < allWeeks.length).map(n => ({
    label: `${n} ${unit} gần nhất`, from: allWeeks[allWeeks.length - n], to: bounds.max
  })).concat([{ label: 'Tất cả', from: '', to: '' }]) : [];

  const rangeFilter = bounds && (
    <div className="weekly-range" role="group" aria-label="Khoảng ngày">
      <DateField label="Từ ngày" value={range.from} min={bounds.min} max={range.to || bounds.max} onChange={from => setRange(r => ({ ...r, from }))} />
      <span className="weekly-range-sep" aria-hidden="true">→</span>
      <DateField label="Đến ngày" value={range.to} min={range.from || bounds.min} max={bounds.max} onChange={to => setRange(r => ({ ...r, to }))} />
      <div className="weekly-range-presets">
        {presets.map(p => (
          <button key={p.label} type="button" className={`export-filter-preset ${range.from === p.from && range.to === p.to ? 'is-active' : ''}`} onClick={() => setRange({ from: p.from, to: p.to })}>{p.label}</button>
        ))}
      </div>
      {rangeInvalid && <p className="export-filter-error" role="alert">Ngày bắt đầu phải trước ngày kết thúc.</p>}
      {!rangeInvalid && visibleWeeks?.length === 0 && <p className="export-filter-error" role="alert">Không có {unit} nào trong khoảng này.</p>}
    </div>
  );

  const shell = body => (
    <div className="metric-block metric-block-sticky weekly-kpi-block">
      <div className="metric-header detail-metric-toolbar">
        <div className="metric-title">
          <span className="metric-title-text">{title}</span>
          <span className="metric-title-short">{metric.title}</span>
          {metric.target != null && <span className="kpi-badge">Target ≥ {metric.target.toFixed(0)}%</span>}
          <span className="kpi-badge weekly-kpi-badge">Theo {unit}</span>
          {scope.active && <ScopeBadges scope={scope} />}
          {isFiltered && <span className="kpi-badge weekly-kpi-badge">{visibleWeeks.length}/{allWeeks.length} {unit}</span>}
        </div>
        {rangeFilter}
        {formattingControl}
      </div>
      {body}
      {metricKey === 'pud' && <div className="table-legend"><div>{PUD_NOTE}</div></div>}
      {scope.active && <div className="table-legend"><div>* Đang lọc theo Province/Lane: số liệu lấy từ bảng chi tiết, không có benchmark ở mức tỉnh/lane.</div></div>}
    </div>
  );

  if (state.key !== requestKey || (state.status === 'loading' && !matrix)) {
    return shell(<LoadingScreen />);
  }
  if (state.status === 'error') {
    return shell(
      <div className="weekly-kpi-note" role="alert">
        Không tải được số liệu theo {unit}.{' '}
        <button type="button" className="btn-secondary" onClick={() => { clearWeeklyCache(); setAttempt(n => n + 1); }}>Thử lại</button>
      </div>
    );
  }
  if (!matrix || matrix.empty) {
    return shell(<div className="weekly-kpi-note">Chưa có dữ liệu theo {unit} cho chỉ số này trong phạm vi đang chọn.</div>);
  }

  return shell(<KpiMatrixTable matrix={matrix} formattingRule={formattingRule} />);
}
