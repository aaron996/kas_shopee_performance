import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formattingCellProps } from '../../utils/kpiFormatting';
import { KpiFormattingLegend } from './KpiFormattingControl';
import { formatPct, formatVol, formatDiff, formatDateLabel, getHeatTier, getHigherIsWorseTier } from '../../utils/dataProcessor';

// Bảng Toàn quốc > Miền > Vùng > Hub x cột thời gian (mỗi cột hai ô: % và volume), dùng chung cho
// "Theo tuần" (cột = tuần) và "Theo ngày" có khoảng ngày (cột = ngày). `matrix` do buildWeeklyMatrix dựng.
export default function KpiMatrixTable({ matrix, formattingRule = null, lastLabel = 'tuần gần nhất', showVolume = true, horizontalScroll = false, rowHeader = null, expanderNoun = null }) {
  const { metric } = matrix;
  const [expanded, setExpanded] = useState({});

  const tier = pct => (metric.isFd
    ? getHigherIsWorseTier(pct, 3, matrix.maxPct)
    : getHeatTier(pct, metric.target));
  const heatWith = (pct, extra) => {
    if (formattingRule) return formattingCellProps(pct, formattingRule, ...extra);
    const t = tier(pct);
    return { className: [...extra, t > 0 && `heat heat-${t}`].filter(Boolean).join(' ') };
  };
  const heat = (pct, ...extra) => heatWith(pct, [...extra, 'grp-start']);

  // Bố cục có so sánh (`matrix.groups`, hiện dùng cho "Theo ngày" của Lane): cột nhóm theo tuần, ngày mới nhất
  // có thêm volume, rồi WTD, Tốt nhất 6 tuần, Cùng ngày tháng trước — giống "Theo ngày" của Chi tiết Vùng/Hub.
  const bench = Boolean(matrix.groups);
  const lastIdx = matrix.weeks.length - 1;
  const groupOf = i => { let n = 0; for (const g of matrix.groups) { n += g.span; if (i < n) return { g, first: i === n - g.span }; } return { g: null, first: false }; };
  const lastGroupSpan = bench ? matrix.groups[matrix.groups.length - 1].span : 0;
  const diffClass = diff => { const shown = Math.round(diff * 10) / 10; return shown > 0 ? 'up' : shown < 0 ? 'down' : 'flat'; };
  const diffCell = (diff, extra) => (
    <td className={extra}>{diff !== null && diff !== undefined ? <span className={`diff-badge ${diffClass(diff)}`}>{formatDiff(diff)}</span> : '–'}</td>
  );
  const benchCells = (stats, b, bold = false) => (
    <>
      {stats.map((s, i) => {
        const isLast = i === lastIdx;
        const start = groupOf(i).first ? 'grp-start' : isLast && lastGroupSpan > 1 ? 'sep' : null;
        return (
          <React.Fragment key={matrix.weeks[i].start}>
            <td {...heatWith(s.pct, start ? [start] : [])}>{formatPct(s.pct)}</td>
            {isLast && <td style={bold ? { fontWeight: 'bold' } : undefined}>{formatVol(s.tot)}</td>}
          </React.Fragment>
        );
      })}
      <td {...heatWith(b.wtd.pct, ['grp-start'])}>{formatPct(b.wtd.pct)}</td>
      <td style={bold ? { fontWeight: 'bold' } : undefined}>{formatVol(b.wtd.tot)}</td>
      {diffCell(b.diffBest, 'grp-start')}
      {diffCell(b.diffSame)}
    </>
  );
  const rowCells = (stats, b, boldRow = false) => (bench ? benchCells(stats, b, boldRow) : cells(stats, boldRow));
  const colCount = bench ? matrix.weeks.length + 6 : 1 + matrix.weeks.length * (showVolume ? 2 : 1);
  const cells = (stats, bold = false) => stats.map((s, i) => (
    <React.Fragment key={matrix.weeks[i].start}>
      <td {...heat(s.pct)}>{formatPct(s.pct)}</td>
      {showVolume && <td style={bold ? { fontWeight: 'bold' } : undefined}>{formatVol(s.tot)}</td>}
    </React.Fragment>
  ));

  return (
    <>
    <div className={`mtx-wrap report1-master-table${horizontalScroll ? ' daily-matrix-scroll' : ''}`}
      role={horizontalScroll ? 'region' : undefined} tabIndex={horizontalScroll ? 0 : undefined}
      aria-label={horizontalScroll ? 'Bảng performance theo ngày, cuộn ngang để xem đầy đủ' : undefined}
      style={{ '--thead-h': '72px', '--allrow-h': '39px' }}>
      <table className="mtx-table weekly-kpi-table">
        <thead>
          {bench ? (<>
            <tr>
              <th rowSpan="2" className="lbl">{rowHeader || 'Vùng / Hub'}</th>
              {matrix.groups.map((g, gi) => (
                <th key={g.key} colSpan={g.span + (gi === matrix.groups.length - 1 ? 1 : 0)} className="grp-start">{g.title}</th>
              ))}
              <th colSpan="2" rowSpan="2" className="grp-start" style={{ background: 'var(--action-primary-deep)', verticalAlign: 'middle' }}>WTD (CỘNG DỒN)</th>
              <th rowSpan="2" className="col-summary grp-start" style={{ verticalAlign: 'middle' }}>Tốt nhất<br />6 tuần</th>
              <th rowSpan="2" className="col-summary" style={{ verticalAlign: 'middle' }}>Cùng ngày<br />tháng trước</th>
            </tr>
            <tr>
              {matrix.weeks.map((w, i) => {
                const isLast = i === lastIdx;
                const start = groupOf(i).first ? 'grp-start' : isLast && lastGroupSpan > 1 ? 'sep' : undefined;
                return <th key={w.start} data-latest-day={isLast ? true : undefined} colSpan={isLast ? 2 : undefined} className={start}
                  style={isLast ? { background: 'var(--action-primary-hover)' } : undefined}>{formatDateLabel(w.start)}</th>;
              })}
            </tr>
          </>) : (<>
          <tr>
            <th rowSpan="2" className="lbl">{rowHeader || (metric.isFd ? 'Vùng / Kho giao' : 'Vùng / Hub')}</th>
            {matrix.weeks.map(w => (
              <th key={w.start} colSpan={showVolume ? 2 : 1} className="grp-start">
                {w.title}{'\n'}{w.range}{w.note ? ` · ${w.note}` : ''}
              </th>
            ))}
          </tr>
          <tr>
            {matrix.weeks.map(w => (
              <React.Fragment key={w.start}>
                <th className="grp-start">%</th>
                {showVolume && <th>Vol</th>}
              </React.Fragment>
            ))}
          </tr>
          </>)}
        </thead>
        <tbody>
          <tr className="all-row">
            <td className="lbl all-row-label">TOÀN QUỐC</td>
            {rowCells(matrix.all, matrix.allBench, true)}
          </tr>
          {matrix.miens.map(m => (
            <React.Fragment key={m.mien}>
              {/* Nhóm không tên (bảng lane) không có hàng nhóm: dòng con nằm ngay dưới TOÀN QUỐC. */}
              {m.mien && <tr className="grp-row">
                <td className="lbl grp-total-label">{m.mien}</td>
                {rowCells(m.stats, m.bench || matrix.allBench)}
              </tr>}
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
                          aria-label={`${open ? 'Thu gọn' : 'Mở'} ${expanderNoun || (metric.isFd ? 'kho giao' : 'hub')} của ${reg.region}`}
                          onClick={() => setExpanded(prev => ({ ...prev, [reg.region]: !prev[reg.region] }))}
                        >
                          <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                          <strong>{reg.region}</strong>
                        </button>
                      </td>
                      {rowCells(reg.stats, reg.bench)}
                    </tr>
                    {open && reg.hubs.map(hub => {
                      const vungs = hub.vungs || [];
                      const hubOpen = vungs.length > 0 && !!expanded[hub.id];
                      return (
                        <React.Fragment key={hub.id}>
                          <tr data-hub-row="true">
                            <td className="lbl weekly-kpi-hub">
                              {vungs.length ? (
                                <button type="button" className="weekly-kpi-expander" aria-expanded={hubOpen}
                                  aria-label={`${hubOpen ? 'Thu gọn' : 'Mở'} vùng giao của ${hub.name} (${reg.region})`}
                                  onClick={() => setExpanded(prev => ({ ...prev, [hub.id]: !prev[hub.id] }))}>
                                  <ChevronRight size={12} style={{ transform: hubOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                                  {hub.name}
                                </button>
                              ) : hub.name}
                            </td>
                            {rowCells(hub.stats, hub.bench)}
                          </tr>
                          {hubOpen && vungs.map(v => (
                            <tr key={v.id} data-vung-row="true">
                              <td className="lbl weekly-kpi-hub weekly-kpi-vung">{v.name}</td>
                              {rowCells(v.stats, v.bench)}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {open && reg.hubCount > reg.hubs.length && (
                      <tr>
                        <td className="lbl weekly-kpi-hub weekly-kpi-more" colSpan={colCount}>
                          Hiển thị {reg.hubs.length}/{reg.hubCount} (nhiều đơn trễ nhất {lastLabel})
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
    {formattingRule && <div className="table-legend"><KpiFormattingLegend rule={formattingRule} /></div>}
    </>
  );
}
