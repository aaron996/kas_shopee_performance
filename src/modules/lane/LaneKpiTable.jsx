import React, { useMemo, useState } from 'react';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import DateField from '../../components/ui/DateField';
import StatusNotice from '../../components/ui/StatusNotice';
import KpiMatrixTable from '../ops-metrics/KpiMatrixTable';
import { DayRangeFilter } from '../ops-metrics/DailyRangeKpiTable';
import { WEEKLY_METRICS, addDays } from '../../utils/weeklyKpi';
import {
  LANE_ROW_HEADER, buildLaneMatrix, laneDeliveryPeriods, mondayOf, scopeLaneRowsByHubType
} from '../../utils/laneDelivery';

const TITLES = { d1st: '1st Deli theo lane', dodr: 'ODR theo lane' };
const CLIENT_NOTE = { SPB: 'Shopee Bulky', SPE: 'Shopee Express', ALL: 'Tất cả dịch vụ' };

// Bảng lane dùng cùng khung, bộ lọc và KpiMatrixTable với Chi tiết Vùng/Hub:
// "Theo ngày" mặc định giống Chi tiết Vùng/Hub: tuần trước + tuần hiện tại theo từng ngày, WTD, Tốt nhất 6 tuần,
// Cùng ngày tháng trước; chọn khoảng ngày thì chuyển sang bảng theo ngày có nút Volume. "Theo tuần": mỗi tuần hai cột.
export default function LaneKpiTable({
  metricKey, mode, rows, status, error, onRetry,
  clientFilter = 'ALL', selectedHubTypes = null, isHubTypeFiltered = false,
  formattingRule = null, formattingControl = null
}) {
  const metric = WEEKLY_METRICS[metricKey];
  const unit = mode === 'week' ? 'tuần' : 'ngày';
  const scoped = useMemo(() => scopeLaneRowsByHubType(rows, selectedHubTypes, isHubTypeFiltered), [rows, selectedHubTypes, isHubTypeFiltered]);

  const dates = useMemo(() => laneDeliveryPeriods(scoped, { client: clientFilter, mode: 'day' }), [scoped, clientFilter]);
  const weeks = useMemo(() => laneDeliveryPeriods(scoped, { client: clientFilter, mode: 'week' }), [scoped, clientFilter]);
  const bounds = dates.length ? { min: dates[0], max: dates[dates.length - 1] } : null;

  const [dayRange, setDayRange] = useState({ from: '', to: '', preset: '' });
  const [weekRange, setWeekRange] = useState({ from: '', to: '' });
  const [volumeOverride, setVolumeOverride] = useState(null);

  const weekEnd = start => addDays(start, 6);
  const dayInvalid = Boolean(dayRange.from && dayRange.to && dayRange.from > dayRange.to);
  const weekInvalid = Boolean(weekRange.from && weekRange.to && weekRange.from > weekRange.to);
  const dayCustom = Boolean((dayRange.from || dayRange.to) && !dayInvalid);

  const periods = useMemo(() => {
    if (mode === 'week') {
      if (weekInvalid) return weeks;
      return weeks.filter(w => (!weekRange.from || weekEnd(w) >= weekRange.from) && (!weekRange.to || w <= weekRange.to));
    }
    if (dayCustom) return dates.filter(d => (!dayRange.from || d >= dayRange.from) && (!dayRange.to || d <= dayRange.to));
    const from = dates.length ? addDays(mondayOf(dates[dates.length - 1]), -7) : '';
    return dates.filter(d => d >= from);
  }, [mode, weeks, dates, weekRange, weekInvalid, dayRange, dayCustom]);

  // Bố cục có so sánh chỉ ở "Theo ngày" mặc định; chọn khoảng ngày thì quay về bảng theo ngày thường.
  const benchmark = mode === 'day' && !dayCustom;
  const matrix = useMemo(() => (status === 'loading' && !rows.length ? null : buildLaneMatrix({
    rows: scoped, metricKey, client: clientFilter, mode, periods, benchmark
  })), [status, rows.length, scoped, metricKey, clientFilter, mode, periods, benchmark]);

  // Cùng quy tắc với "Theo ngày" của Chi tiết Vùng/Hub: khoảng <= 7 ngày hiện Volume mặc định.
  const defaultShowVolume = mode === 'week' || (periods.length > 0 && periods.length <= 7);
  const selectionKey = `${mode}:${periods[0] || ''}:${periods[periods.length - 1] || ''}:${defaultShowVolume}`;
  const showVolume = mode === 'week' || benchmark ? true : (volumeOverride?.key === selectionKey ? volumeOverride.show : defaultShowVolume);

  const weekPresets = weeks.length ? [4, 8].filter(n => n < weeks.length).map(n => ({
    label: `${n} tuần gần nhất`, from: weeks[weeks.length - n], to: weekEnd(weeks[weeks.length - 1])
  })).concat([{ label: 'Tất cả', from: '', to: '' }]) : [];

  const rangeFilter = !bounds ? null : mode === 'week' ? (
    <div className="weekly-range" role="group" aria-label="Khoảng ngày">
      <DateField label="Từ ngày" value={weekRange.from} min={weeks[0]} max={weekRange.to || weekEnd(weeks[weeks.length - 1])} onChange={from => setWeekRange(r => ({ ...r, from }))} />
      <span className="weekly-range-sep" aria-hidden="true">→</span>
      <DateField label="Đến ngày" value={weekRange.to} min={weekRange.from || weeks[0]} max={weekEnd(weeks[weeks.length - 1])} onChange={to => setWeekRange(r => ({ ...r, to }))} />
      <div className="weekly-range-presets">
        {weekPresets.map(p => (
          <button key={p.label} type="button" className={`export-filter-preset ${weekRange.from === p.from && weekRange.to === p.to ? 'is-active' : ''}`} onClick={() => setWeekRange({ from: p.from, to: p.to })}>{p.label}</button>
        ))}
      </div>
      {weekInvalid && <p className="export-filter-error" role="alert">Ngày bắt đầu phải trước ngày kết thúc.</p>}
      {!weekInvalid && weeks.length > 0 && periods.length === 0 && <p className="export-filter-error" role="alert">Không có tuần nào trong khoảng này.</p>}
    </div>
  ) : (
    <>
      <DayRangeFilter range={dayRange} onChange={setDayRange} bounds={bounds} />
      {!dayInvalid && dayCustom && periods.length === 0 && <p className="export-filter-error" role="alert">Không có ngày nào trong khoảng này.</p>}
    </>
  );

  const shell = body => (
    <div className="metric-block metric-block-sticky weekly-kpi-block">
      <div className="metric-header detail-metric-toolbar">
        <div className="metric-title">
          <span className="metric-title-text">{TITLES[metricKey]}</span>
          {metric.target != null && <span className="kpi-badge">Target ≥ {metric.target.toFixed(0)}%</span>}
          <span className="kpi-badge weekly-kpi-badge">Theo {unit}</span>
          <span className="kpi-badge weekly-kpi-badge">{CLIENT_NOTE[clientFilter] || clientFilter}</span>
        </div>
        {rangeFilter}
        {formattingControl}
        {mode === 'day' && !benchmark && (
          <button type="button" className="btn-secondary daily-volume-toggle" aria-pressed={showVolume}
            onClick={() => setVolumeOverride({ key: selectionKey, show: !showVolume })}>Volume</button>
        )}
      </div>
      {status === 'error' && (
        <StatusNotice tone="danger" role="alert">
          Không tải được số liệu theo lane{rows.length ? ' — đang hiển thị số đã tải trước đó' : ''}.{' '}
          <button type="button" className="btn-secondary" onClick={onRetry}>Thử lại</button>
          {error?.message ? <span className="lane-error-detail">{error.message}</span> : null}
        </StatusNotice>
      )}
      {body}
    </div>
  );

  if (status === 'loading' && !rows.length) return shell(<LoadingScreen />);
  if (!matrix || matrix.empty) {
    // Lỗi mà chưa có số nào: chỉ báo lỗi, không coi là bảng rỗng.
    if (status === 'error') return shell(null);
    return shell(<div className="weekly-kpi-note">Chưa có số liệu theo lane cho {CLIENT_NOTE[clientFilter] || clientFilter} trong phạm vi đang chọn.</div>);
  }

  return shell(
    <>
      {mode === 'day' && <p className="daily-matrix-hint">Cuộn ngang để xem đủ ngày · Shift + lăn chuột hoặc vuốt ngang</p>}
      <KpiMatrixTable matrix={matrix} formattingRule={formattingRule} lastLabel="kỳ cuối" showVolume={showVolume}
        horizontalScroll={mode === 'day'} rowHeader={LANE_ROW_HEADER} expanderNoun="loại hub" />
      <div className="table-legend">
        <div>* Lane theo ExternalLane_New; bấm tên lane để xem theo loại hub, bấm loại hub để xem theo vùng giao (Toregion_new). Bộ lọc Vùng ở header chưa áp dụng cho bảng này.</div>
        {benchmark && <div>* Tốt nhất 6 tuần: chênh lệch của ngày mới nhất so với ngày cao nhất trong 6 lần cùng thứ trước đó; Cùng ngày tháng trước: so với cùng ngày dương lịch của tháng trước. Tính từ dữ liệu 8 tuần gần nhất của bảng lane.</div>}
      </div>
    </>
  );
}
