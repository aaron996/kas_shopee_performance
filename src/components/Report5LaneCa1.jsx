import React, { useMemo } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { formatPct, formatVol, formatDiff, formatDateLabel, groupDatesByWeek, getContinuousColorStyle } from '../utils/dataProcessor';

export default function Report5LaneCa1({ ca1Rows = [], searchTerm }) {

  const dates = useMemo(() => [...new Set(ca1Rows.map(r => r.ngay))].sort(), [ca1Rows]);
  const { weekPrev, weekCurrent, d1Date } = useMemo(() => groupDatesByWeek(dates), [dates]);

  // Split weekCurrent into days up to D-2 and D-1 separately (matching 4 chỉ số layout)
  const weekCurBeforeD1 = useMemo(() => weekCurrent.slice(0, -1), [weekCurrent]);

  const lanes = ['Intra City', 'Cross Metro*', 'Cross Metro', 'Cross Region', 'Intra Region'];

  // Flexible column value extractor (handles different column naming between default & live sheet)
  const getVal = (r, primary, fallback) => {
    if (r[primary] !== undefined && r[primary] !== null) return Number(r[primary]) || 0;
    if (fallback && r[fallback] !== undefined && r[fallback] !== null) return Number(r[fallback]) || 0;
    return 0;
  };

  const renderLaneTable = (laneName) => {
    let laneData = ca1Rows.filter(r => r.lane === laneName);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      laneData = laneData.filter(r => r.vung_giao.toLowerCase().includes(term));
    }

    // Get list of regions/provinces for this lane sorted by D-1 volume descending
    const regVolMap = {};
    laneData.forEach(r => {
      if (r.ngay === d1Date) {
        regVolMap[r.vung_giao] = (regVolMap[r.vung_giao] || 0) + getVal(r, 'tong_don');
      }
    });

    const sortedRegions = Object.keys(regVolMap).sort((a, b) => regVolMap[b] - regVolMap[a]);

    // Helper calculate stats for a filter function across a list of dates
    const getStats = (filterFn, dList) => {
      let tot = 0, ca1 = 0;
      laneData.filter(r => dList.includes(r.ngay) && filterFn(r)).forEach(r => {
        tot += getVal(r, 'tong_don');
        ca1 += getVal(r, 'don_hub_giao_ca1');
      });
      const pct = tot > 0 ? (ca1 / tot) * 100 : null;
      return { tot, ca1, pct };
    };

    // Calculate Table Min / Max Pct for continuous color interpolation (per lane)
    let laneMinPct = 100, laneMaxPct = 0;
    sortedRegions.forEach(reg => {
      dates.forEach(d => {
        const s = getStats(r => r.vung_giao === reg, [d]);
        if (s.pct !== null && s.pct > 0) {
          if (s.pct < laneMinPct) laneMinPct = s.pct;
          if (s.pct > laneMaxPct) laneMaxPct = s.pct;
        }
      });
    });
    // Also check TOÀN LANE stats for min/max
    dates.forEach(d => {
      const s = getStats(() => true, [d]);
      if (s.pct !== null && s.pct > 0) {
        if (s.pct < laneMinPct) laneMinPct = s.pct;
        if (s.pct > laneMaxPct) laneMaxPct = s.pct;
      }
    });

    if (laneMinPct === 100) laneMinPct = 50;
    if (laneMaxPct === 0) laneMaxPct = 95;

    // Label for column 1 depends on lane type
    const col1Label = (laneName.includes('Cross Metro')) ? 'Tỉnh Giao' : 'Vùng Giao';

    return (
      <div className="metric-block" key={laneName}>
        <div className="metric-header">
          <div className="metric-title">
            <ArrowRightLeft size={18} style={{ color: '#F15A22' }} />
            <span>Lane: {laneName}</span>
            <span className="kpi-badge">Cutoff 09:00 AM</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            % Đơn về hub giao trước Ca 1 (09:00 sáng ngày SLA)
          </div>
        </div>

        <div className="mtx-wrap">
          <table className="mtx-table">
            <thead>
              {/* Row 1: Week Group Headers — matching 4 chỉ số layout */}
              <tr>
                <th rowSpan="2" className="lbl">{col1Label}</th>
                {weekPrev.length > 0 && (
                  <th colSpan={weekPrev.length} style={{ borderRight: '1.5px solid rgba(255,255,255,0.4)' }}>
                    TUẦN W-1 (TRỌN VẸN)
                  </th>
                )}
                {weekCurBeforeD1.length > 0 && (
                  <th colSpan={weekCurBeforeD1.length + 2}>TUẦN HIỆN TẠI</th>
                )}
                {/* WTD header group */}
                <th colSpan="2" rowSpan="2" style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)', verticalAlign: 'middle' }}>
                  WTD (CỘNG DỒN)
                </th>
                {/* Best 6W & Sameday LM */}
                <th rowSpan="2" style={{ width: '80px', fontSize: '0.75rem', borderLeft: '1.5px solid rgba(255,255,255,0.4)', verticalAlign: 'middle' }}>
                  Tốt nhất<br />6 tuần
                </th>
                <th rowSpan="2" style={{ width: '80px', fontSize: '0.75rem', verticalAlign: 'middle' }}>
                  Cùng ngày<br />tháng trước
                </th>
              </tr>

              {/* Row 2: Individual Date Headers */}
              <tr>
                {weekPrev.map((d, idx) => (
                  <th key={d} className={idx === 0 ? 'sep' : ''}>{formatDateLabel(d)}</th>
                ))}
                {weekCurBeforeD1.map(d => (
                  <th key={d}>{formatDateLabel(d)}</th>
                ))}
                {/* D-1 header */}
                <th colSpan="2" style={{ background: '#004b82', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  {formatDateLabel(d1Date)}
                </th>
              </tr>
            </thead>

            <tbody>
              {/* TOÀN LANE ROW */}
              <tr className="all-row">
                <td className="lbl">TOÀN LANE ({laneName})</td>
                {weekPrev.map((d, idx) => {
                  const s = getStats(() => true, [d]);
                  return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, laneMaxPct, laneMinPct)}>{formatPct(s.pct)}</td>;
                })}
                {weekCurBeforeD1.map(d => {
                  const s = getStats(() => true, [d]);
                  return <td key={d} style={getContinuousColorStyle(s.pct, laneMaxPct, laneMinPct)}>{formatPct(s.pct)}</td>;
                })}
                {(() => {
                  const d1S = getStats(() => true, [d1Date]);
                  const wtdS = getStats(() => true, weekCurrent);
                  return (
                    <>
                      <td className="sep" style={getContinuousColorStyle(d1S.pct, laneMaxPct, laneMinPct)}>{formatPct(d1S.pct)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(d1S.tot)}</td>
                      <td className="sep" style={getContinuousColorStyle(wtdS.pct, laneMaxPct, laneMinPct)}>{formatPct(wtdS.pct)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(wtdS.tot)}</td>
                      <td>–</td>
                      <td>–</td>
                    </>
                  );
                })()}
              </tr>

              {/* REGION / PROVINCE ROWS */}
              {sortedRegions.map(reg => {
                const regD1 = getStats(r => r.vung_giao === reg, [d1Date]);
                const regWtd = getStats(r => r.vung_giao === reg, weekCurrent);

                // Historical comparison — flexible column names (live: best_l6w_vol / samedaylastmonth_vol)
                const regSample = laneData.find(r => r.vung_giao === reg && r.ngay === d1Date);
                const bestVol = regSample ? (getVal(regSample, 'best_l6w_vol_ca1', 'best_l6w_vol')) : 0;
                const bestCa1 = regSample ? (getVal(regSample, 'best_l6w_ca1')) : 0;
                const sameVol = regSample ? (getVal(regSample, 'sameday_lm_vol', 'samedaylastmonth_vol')) : 0;
                const sameCa1 = regSample ? (getVal(regSample, 'sameday_lm_ca1', 'samedaylastmonth_ca1')) : 0;

                const bestPct = bestVol > 0 ? (bestCa1 / bestVol) * 100 : null;
                const samePct = sameVol > 0 ? (sameCa1 / sameVol) * 100 : null;

                const diffBest = regD1.pct !== null && bestPct !== null ? regD1.pct - bestPct : null;
                const diffSame = regD1.pct !== null && samePct !== null ? regD1.pct - samePct : null;

                return (
                  <tr key={reg}>
                    <td className="lbl"><strong>{reg}</strong></td>
                    {weekPrev.map((d, idx) => {
                      const s = getStats(r => r.vung_giao === reg, [d]);
                      return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, laneMaxPct, laneMinPct)}>{formatPct(s.pct)}</td>;
                    })}
                    {weekCurBeforeD1.map(d => {
                      const s = getStats(r => r.vung_giao === reg, [d]);
                      return <td key={d} style={getContinuousColorStyle(s.pct, laneMaxPct, laneMinPct)}>{formatPct(s.pct)}</td>;
                    })}
                    {/* D-1 */}
                    <td className="sep" style={getContinuousColorStyle(regD1.pct, laneMaxPct, laneMinPct)}>{formatPct(regD1.pct)}</td>
                    <td>{formatVol(regD1.tot)}</td>
                    {/* WTD */}
                    <td className="sep" style={getContinuousColorStyle(regWtd.pct, laneMaxPct, laneMinPct)}>{formatPct(regWtd.pct)}</td>
                    <td>{formatVol(regWtd.tot)}</td>

                    {/* Best 6W Diff */}
                    <td>
                      {diffBest !== null ? (
                        <span className={`diff-badge ${diffBest >= 0 ? 'up' : 'down'}`}>
                          {formatDiff(diffBest)}
                        </span>
                      ) : '–'}
                    </td>
                    {/* Sameday LM Diff */}
                    <td>
                      {diffSame !== null ? (
                        <span className={`diff-badge ${diffSame >= 0 ? 'up' : 'down'}`}>
                          {formatDiff(diffSame)}
                        </span>
                      ) : '–'}
                    </td>
                  </tr>
                );
              })}

              {/* SẢN LƯỢNG (TỔNG ĐƠN) ROW — Volume Row at Bottom */}
              <tr className="all-row" style={{ borderTop: '2px solid #cbd5e1' }}>
                <td className="lbl" style={{ fontStyle: 'italic' }}>Sản lượng (tổng đơn)</td>
                {weekPrev.map((d, idx) => {
                  const s = getStats(() => true, [d]);
                  return <td key={d} className={idx === 0 ? 'sep' : ''} style={{ fontWeight: 600 }}>{formatVol(s.tot)}</td>;
                })}
                {weekCurBeforeD1.map(d => {
                  const s = getStats(() => true, [d]);
                  return <td key={d} style={{ fontWeight: 600 }}>{formatVol(s.tot)}</td>;
                })}
                {(() => {
                  const d1S = getStats(() => true, [d1Date]);
                  const wtdS = getStats(() => true, weekCurrent);
                  return (
                    <>
                      <td className="sep" style={{ fontWeight: 'bold' }}>{formatVol(d1S.ca1)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(d1S.tot)}</td>
                      <td className="sep" style={{ fontWeight: 'bold' }}>{formatVol(wtdS.ca1)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(wtdS.tot)}</td>
                      <td>–</td>
                      <td>–</td>
                    </>
                  );
                })()}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-legend">
          <div className="legend-items">
            <span style={{ fontWeight: 600, color: '#334155' }}>Thang màu liên tục (Trắng → Đỏ):</span>
            <div className="legend-item">
              <div className="legend-box" style={{ background: '#FFFFFF' }}></div>
              <span>Cao nhất ({laneMaxPct.toFixed(1)}%)</span>
            </div>
            <div className="legend-item">
              <div className="legend-box" style={{ background: '#E8362C' }}></div>
              <span>Thấp nhất ({laneMinPct.toFixed(1)}%)</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <ArrowRightLeft size={22} style={{ color: '#F15A22' }} />
          % ca 1 theo lane
        </h2>
        <div className="section-desc">
          Tỷ lệ đơn hàng về đến hub giao trước 09:00 sáng ngày SLA giao (Ca 1 cutoff), phân theo 5 loại Lane.
        </div>
      </div>

      {lanes.map(lane => renderLaneTable(lane))}
    </div>
  );
}
