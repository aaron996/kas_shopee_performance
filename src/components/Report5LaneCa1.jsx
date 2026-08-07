import React, { useMemo } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { formatPct, formatVol, formatDiff, formatDateLabel, groupDatesByWeek, getContinuousColorStyle } from '../utils/dataProcessor';

export default function Report5LaneCa1({ ca1Rows = [], searchTerm }) {

  const dates = useMemo(() => [...new Set(ca1Rows.map(r => r.ngay))].sort(), [ca1Rows]);
  const { weekPrev, weekCurrent, d1Date } = useMemo(() => groupDatesByWeek(dates), [dates]);

  const lanes = ['Intra City', 'Cross Metro*', 'Cross Metro', 'Cross Region', 'Intra Region'];

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
        regVolMap[r.vung_giao] = (regVolMap[r.vung_giao] || 0) + r.tong_don;
      }
    });

    const sortedRegions = Object.keys(regVolMap).sort((a, b) => regVolMap[b] - regVolMap[a]);

    // Helper calculate stats
    const getStats = (filterFn, dList) => {
      let tot = 0, ca1 = 0;
      laneData.filter(r => dList.includes(r.ngay) && filterFn(r)).forEach(r => {
        tot += r.tong_don;
        ca1 += r.don_hub_giao_ca1;
      });
      const pct = tot > 0 ? (ca1 / tot) * 100 : null;
      return { tot, ca1, pct };
    };

    // Calculate Table Min / Max Pct for continuous color interpolation
    let laneMinPct = 100, laneMaxPct = 0;
    sortedRegions.forEach(reg => {
      dates.forEach(d => {
        const s = getStats(r => r.vung_giao === reg, [d]);
        if (s.pct !== null && s.pct > 0) { // 0% is outlier
          if (s.pct < laneMinPct) laneMinPct = s.pct;
          if (s.pct > laneMaxPct) laneMaxPct = s.pct;
        }
      });
    });

    if (laneMinPct === 100) laneMinPct = 50;
    if (laneMaxPct === 0) laneMaxPct = 95;

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
              <tr>
                <th rowSpan="2" className="lbl">
                  {laneName.includes('Cross Metro') ? 'Tỉnh Giao' : 'Vùng Giao'}
                </th>
                {weekPrev.length > 0 && <th colSpan={weekPrev.length}>TUẦN W-1</th>}
                <th colSpan={weekCurrent.length}>TUẦN WTD</th>
                <th colSpan="2" style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  WTD % Ca 1
                </th>
                <th rowSpan="2" style={{ width: '80px', fontSize: '0.75rem', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  Tốt nhất<br />6 tuần
                </th>
                <th rowSpan="2" style={{ width: '80px', fontSize: '0.75rem' }}>
                  Cùng ngày<br />tháng trước
                </th>
              </tr>

              <tr>
                {weekPrev.map((d, idx) => (
                  <th key={d} className={idx === 0 ? 'sep' : ''}>{formatDateLabel(d)}</th>
                ))}
                {weekCurrent.map(d => (
                  <th key={d}>{formatDateLabel(d)}</th>
                ))}
                <th style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>% Ca 1</th>
                <th style={{ background: '#00365e' }}>Tổng đơn</th>
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
                {weekCurrent.map(d => {
                  const s = getStats(() => true, [d]);
                  return <td key={d} style={getContinuousColorStyle(s.pct, laneMaxPct, laneMinPct)}>{formatPct(s.pct)}</td>;
                })}
                {(() => {
                  const wtd = getStats(() => true, weekCurrent);
                  return (
                    <>
                      <td className="sep" style={getContinuousColorStyle(wtd.pct, laneMaxPct, laneMinPct)}>{formatPct(wtd.pct)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(wtd.tot)}</td>
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

                // Sample historical comparisons
                const regSample = laneData.find(r => r.vung_giao === reg && r.ngay === d1Date);
                const bestPct = regSample && regSample.best_l6w_vol_ca1 > 0 ? (regSample.best_l6w_ca1 / regSample.best_l6w_vol_ca1) * 100 : null;
                const samePct = regSample && regSample.sameday_lm_vol > 0 ? (regSample.sameday_lm_ca1 / regSample.sameday_lm_vol) * 100 : null;

                const diffBest = regD1.pct !== null && bestPct !== null ? regD1.pct - bestPct : null;
                const diffSame = regD1.pct !== null && samePct !== null ? regD1.pct - samePct : null;

                return (
                  <tr key={reg}>
                    <td className="lbl">{reg}</td>
                    {weekPrev.map((d, idx) => {
                      const s = getStats(r => r.vung_giao === reg, [d]);
                      return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, laneMaxPct, laneMinPct)}>{formatPct(s.pct)}</td>;
                    })}
                    {weekCurrent.map(d => {
                      const s = getStats(r => r.vung_giao === reg, [d]);
                      return <td key={d} style={getContinuousColorStyle(s.pct, laneMaxPct, laneMinPct)}>{formatPct(s.pct)}</td>;
                    })}
                    <td className="sep" style={getContinuousColorStyle(regWtd.pct, laneMaxPct, laneMinPct)}>{formatPct(regWtd.pct)}</td>
                    <td>{formatVol(regWtd.tot)}</td>

                    <td>
                      {diffBest !== null ? (
                        <span className={`diff-badge ${diffBest >= 0 ? 'up' : 'down'}`}>
                          {formatDiff(diffBest)}
                        </span>
                      ) : '–'}
                    </td>
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
