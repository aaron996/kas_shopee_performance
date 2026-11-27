import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { buildBacklogMatrix, BACKLOG_DAYS, BACKLOG_NOTE } from '../../utils/reverseBacklog';
import { formatVol } from '../../utils/dataProcessor';
import { dayLabel } from '../../utils/weeklyKpi';
import { backlogDeltaProps, backlogHeatProps } from '../../utils/backlogFormatting';
import BacklogFormattingControl, { BacklogFormattingLegend } from './BacklogFormattingControl';

// Tab "Backlog": số đơn tồn tuyệt đối (mau_pud) theo ngày, Toàn quốc > Miền > Vùng > Hub. Không có %, target hay tô nhiệt.
export default function ReverseBacklogMatrix({ rows, dates, selectedRegions, selectedHubTypes, formatting = null }) {
  const { rule = null, saved = null, save, preview } = formatting || {};
  const [expanded, setExpanded] = useState({});
  const shown = useMemo(() => dates.slice(-BACKLOG_DAYS), [dates]);
  const matrix = useMemo(() => buildBacklogMatrix({ rows, dates: shown, selectedRegions, selectedHubTypes }), [rows, shown, selectedRegions, selectedHubTypes]);
  if (matrix.empty) {
    return <div className="metric-block"><div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      Chưa có dữ liệu backlog trong phạm vi đang chọn.</div></div>;
  }
  const last = shown.length - 1;
  const delta = values => (last > 0 && values[last] !== null && values[last - 1] !== null ? values[last] - values[last - 1] : null);
  // Mức tô tương đối theo cấp (Miền / Vùng / Hub) và theo cột: giá trị lớn nhất cùng cấp = màu đậm nhất.
  const scale = { mien: [], region: [], hub: [] };
  const track = (level, values) => {
    const d = delta(values);
    values.forEach((v, i) => { if (typeof v === 'number') scale[level][i] = Math.max(scale[level][i] || 0, v); });
    if (d !== null) scale[level].delta = Math.max(scale[level].delta || 0, Math.abs(d));
  };
  matrix.miens.forEach(mien => {
    track('mien', mien.values);
    mien.regions.forEach(reg => { track('region', reg.values); reg.hubs.forEach(hub => track('hub', hub.values)); });
  });
  const cells = (values, level = null, bold = false) => {
    const d = delta(values);
    return (<>
      {values.map((value, i) => <td key={shown[i]} {...(level ? backlogHeatProps(value, scale[level][i], rule, ...(i === 0 ? ['grp-start'] : [])) : { className: i === 0 ? 'grp-start' : undefined })}
        style={{ ...(level && backlogHeatProps(value, scale[level][i], rule).style), ...(bold ? { fontWeight: 'bold' } : null) }}>{formatVol(value)}</td>)}
      <td {...(level ? backlogDeltaProps(d, scale[level].delta, rule, 'grp-start') : { className: 'grp-start' })}>{d === null ? '–' : `${d > 0 ? '+' : ''}${d.toLocaleString('vi-VN')}`}</td>
    </>);
  };
  return (
    <div className="metric-block metric-block-sticky weekly-kpi-block">
      <div className="metric-header detail-metric-toolbar">
        <div className="metric-title">
          <span className="metric-title-text">Backlog Reverse</span>
          <span className="metric-title-short">Backlog</span>
          <span className="kpi-badge weekly-kpi-badge">Số đơn tồn</span>
        </div>
        {save && <BacklogFormattingControl rule={saved} onSave={save} onPreview={preview} />}
      </div>
      <div className="mtx-wrap report1-master-table daily-matrix-scroll" role="region" tabIndex={0} aria-label="Bảng backlog theo ngày, cuộn ngang để xem đầy đủ">
        <table className="mtx-table weekly-kpi-table">
          <thead><tr>
            <th className="lbl">Vùng / Hub</th>
            {shown.map(date => { const l = dayLabel(date); return <th key={date}>{l.title}{'\n'}{l.range}</th>; })}
            <th className="grp-start">Δ vs ngày trước</th>
          </tr></thead>
          <tbody>
            <tr className="all-row"><td className="lbl all-row-label">TOÀN QUỐC</td>{cells(matrix.all, null, true)}</tr>
            {matrix.miens.map(mien => (
              <React.Fragment key={mien.mien}>
                <tr className="grp-row"><td className="lbl grp-total-label">{mien.mien}</td>{cells(mien.values, 'mien')}</tr>
                {mien.regions.map(reg => {
                  const open = !!expanded[reg.region];
                  return (
                    <React.Fragment key={reg.region}>
                      <tr>
                        <td className="lbl">
                          <button type="button" className="weekly-kpi-expander" aria-expanded={open}
                            aria-label={`${open ? 'Thu gọn' : 'Mở'} hub của ${reg.region}`}
                            onClick={() => setExpanded(prev => ({ ...prev, [reg.region]: !prev[reg.region] }))}>
                            <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                            <strong>{reg.region}</strong>
                          </button>
                        </td>
                        {cells(reg.values, 'region')}
                      </tr>
                      {open && reg.hubs.map(hub => <tr key={hub.id} data-hub-row="true"><td className="lbl weekly-kpi-hub">{hub.name}</td>{cells(hub.values, 'hub')}</tr>)}
                      {open && reg.hubCount > reg.hubs.length && <tr><td className="lbl weekly-kpi-hub weekly-kpi-more" colSpan={shown.length + 2}>
                        Hiển thị {reg.hubs.length}/{reg.hubCount} (backlog cao nhất ngày gần nhất)</td></tr>}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-legend"><div>{BACKLOG_NOTE}</div><BacklogFormattingLegend rule={rule} /></div>
    </div>
  );
}
