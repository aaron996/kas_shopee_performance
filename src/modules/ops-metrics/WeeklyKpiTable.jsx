import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import DateField from '../../components/ui/DateField';
import { supabase } from '../../utils/supabaseClient';
import { fetchWeeklyRows, buildWeeklyMatrix, WEEKLY_METRICS, clearWeeklyCache } from '../../utils/weeklyKpi';
import { formatPct, formatVol, getHeatTier, getHigherIsWorseTier } from '../../utils/dataProcessor';

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Chế độ "Theo tuần" của Chi tiết Vùng/Hub: mỗi tuần hai cột (% và volume), tối đa 9 tuần
// (tuần hiện tại + 8 tuần nguyên). Dữ liệu từ bảng lịch sử, không phải từ dữ liệu 14 ngày
// của bảng theo ngày, nên không có cột "Tốt nhất 6 tuần" / "Cùng ngày tháng trước".
export default function WeeklyKpiTable({
  metricKey,
  title,
  clientFilter = 'ALL',
  selectedRegions = null,
  selectedHubTypes = null,
  fetchRows = fetchWeeklyRows,
  client = supabase
}) {
  const metric = WEEKLY_METRICS[metricKey];
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ status: 'loading', data: prev.data && prev.data.dataset === metric.dataset ? prev.data : null, error: null }));
    fetchRows(client, metric.dataset)
      .then(data => { if (!cancelled) setState({ status: 'ready', data: { ...data, dataset: metric.dataset }, error: null }); })
      .catch(error => { if (!cancelled) setState({ status: 'error', data: null, error }); });
    return () => { cancelled = true; };
  }, [metric.dataset, attempt, fetchRows, client]);

  // Khoảng ngày: dữ liệu theo tuần nên khoảng được hiểu là "các tuần có ngày nằm trong khoảng".
  const [range, setRange] = useState({ from: '', to: '' });
  const allWeeks = state.data?.weeks;
  const bounds = useMemo(() => (allWeeks?.length
    ? { min: allWeeks[0], max: addDays(allWeeks[allWeeks.length - 1], 6) }
    : null), [allWeeks]);
  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to);
  const visibleWeeks = useMemo(() => {
    if (!allWeeks) return null;
    if (rangeInvalid) return allWeeks;
    return allWeeks.filter(w => (!range.from || addDays(w, 6) >= range.from) && (!range.to || w <= range.to));
  }, [allWeeks, range, rangeInvalid]);
  const isFiltered = Boolean(allWeeks && visibleWeeks && !rangeInvalid && visibleWeeks.length < allWeeks.length);

  const matrix = useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildWeeklyMatrix({
      rows: state.data.rows, weeks: visibleWeeks, metricKey, clientFilter, selectedRegions, selectedHubTypes
    });
  }, [state, visibleWeeks, metricKey, clientFilter, selectedRegions, selectedHubTypes]);

  const presets = allWeeks?.length ? [4, 8].filter(n => n < allWeeks.length).map(n => ({
    label: `${n} tuần gần nhất`, from: allWeeks[allWeeks.length - n], to: bounds.max
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
      {!rangeInvalid && visibleWeeks?.length === 0 && <p className="export-filter-error" role="alert">Không có tuần nào trong khoảng này.</p>}
    </div>
  );

  const shell = body => (
    <div className="metric-block metric-block-sticky weekly-kpi-block">
      <div className="metric-header">
        <div className="metric-title">
          <span className="metric-title-text">{title}</span>
          <span className="metric-title-short">{metric.title}</span>
          {metric.target != null && <span className="kpi-badge">Target ≥ {metric.target.toFixed(0)}%</span>}
          <span className="kpi-badge weekly-kpi-badge">Theo tuần</span>
          {isFiltered && <span className="kpi-badge weekly-kpi-badge">{visibleWeeks.length}/{allWeeks.length} tuần</span>}
        </div>
        {rangeFilter}
      </div>
      {body}
    </div>
  );

  if (state.status === 'loading' && !matrix) {
    return shell(<div className="weekly-kpi-note" role="status">Đang tải số liệu theo tuần…</div>);
  }
  if (state.status === 'error') {
    return shell(
      <div className="weekly-kpi-note" role="alert">
        Không tải được số liệu theo tuần.{' '}
        <button type="button" className="btn-secondary" onClick={() => { clearWeeklyCache(); setAttempt(n => n + 1); }}>Thử lại</button>
      </div>
    );
  }
  if (!matrix || matrix.empty) {
    return shell(<div className="weekly-kpi-note">Chưa có dữ liệu theo tuần cho chỉ số này trong phạm vi đang chọn.</div>);
  }

  const tier = pct => (metric.isFd
    ? getHigherIsWorseTier(pct, 3, matrix.maxPct)
    : getHeatTier(pct, metric.target));
  const heat = (pct, ...extra) => {
    const t = tier(pct);
    const className = [...extra, t > 0 && `heat heat-${t}`, 'grp-start'].filter(Boolean).join(' ');
    return { className };
  };
  const cells = (stats, bold = false) => stats.map((s, i) => (
    <React.Fragment key={matrix.weeks[i].start}>
      <td {...heat(s.pct)}>{formatPct(s.pct)}</td>
      <td style={bold ? { fontWeight: 'bold' } : undefined}>{formatVol(s.tot)}</td>
    </React.Fragment>
  ));

  return shell(
    <div className="mtx-wrap report1-master-table" style={{ '--thead-h': '72px', '--allrow-h': '39px' }}>
      <table className="mtx-table weekly-kpi-table">
        <thead>
          <tr>
            <th rowSpan="2" className="lbl">{metric.isFd ? 'Vùng / Kho giao' : 'Vùng / Hub'}</th>
            {matrix.weeks.map(w => (
              <th key={w.start} colSpan="2" className="grp-start">
                {w.title}{'\n'}{w.range}{w.note ? ` · ${w.note}` : ''}
              </th>
            ))}
          </tr>
          <tr>
            {matrix.weeks.map(w => (
              <React.Fragment key={w.start}>
                <th className="grp-start">%</th>
                <th>Vol</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="all-row">
            <td className="lbl all-row-label">TOÀN QUỐC</td>
            {cells(matrix.all, true)}
          </tr>
          {matrix.miens.map(m => (
            <React.Fragment key={m.mien}>
              <tr className="grp-row">
                <td className="lbl grp-total-label">{m.mien}</td>
                {cells(m.stats)}
              </tr>
              {m.regions.map(reg => {
                const open = !!expanded[reg.region];
                return (
                  <React.Fragment key={reg.region}>
                    <tr>
                      <td className="lbl">
                        <button
                          type="button"
                          className="weekly-kpi-expander"
                          aria-expanded={open}
                          aria-label={`${open ? 'Thu gọn' : 'Mở'} ${metric.isFd ? 'kho giao' : 'hub'} của ${reg.region}`}
                          onClick={() => setExpanded(prev => ({ ...prev, [reg.region]: !prev[reg.region] }))}
                        >
                          <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                          <strong>{reg.region}</strong>
                        </button>
                      </td>
                      {cells(reg.stats)}
                    </tr>
                    {open && reg.hubs.map(hub => (
                      <tr key={hub.id} data-hub-row="true">
                        <td className="lbl weekly-kpi-hub">{hub.name}</td>
                        {cells(hub.stats)}
                      </tr>
                    ))}
                    {open && reg.hubCount > reg.hubs.length && (
                      <tr>
                        <td className="lbl weekly-kpi-hub weekly-kpi-more" colSpan={1 + matrix.weeks.length * 2}>
                          Hiển thị {reg.hubs.length}/{reg.hubCount} (nhiều đơn trễ nhất tuần gần nhất)
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
