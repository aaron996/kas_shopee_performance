import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Layers, HelpCircle } from 'lucide-react';
import { MIEN_REGIONS, MIEN_ORDER, TARGET_KPIS } from '../data/defaultDataset';
import { formatPct, formatVol, formatDiff, formatDateLabel, groupDatesByWeek, getContinuousColorStyle } from '../utils/dataProcessor';

export default function Report1MienVungHub({ pickRows, deliRows, clientFilter, searchTerm }) {
  const [expandedRegions, setExpandedRegions] = useState({});

  const toggleRegion = (regKey) => {
    setExpandedRegions(prev => ({ ...prev, [regKey]: !prev[regKey] }));
  };

  const expandAll = () => {
    const all = {};
    MIEN_ORDER.forEach(mien => {
      MIEN_REGIONS[mien].forEach(r => { all[r] = true; });
    });
    setExpandedRegions(all);
  };

  const collapseAll = () => {
    setExpandedRegions({});
  };

  // Filter rows by client
  const filteredPick = useMemo(() => {
    let list = clientFilter === 'ALL' ? pickRows : pickRows.filter(r => r.client_name === clientFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(r => r.region.toLowerCase().includes(term) || r.hub.toLowerCase().includes(term));
    }
    return list;
  }, [pickRows, clientFilter, searchTerm]);

  const filteredDeli = useMemo(() => {
    let list = clientFilter === 'ALL' ? deliRows : deliRows.filter(r => r.client_name === clientFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(r => r.region.toLowerCase().includes(term) || r.hub.toLowerCase().includes(term));
    }
    return list;
  }, [deliRows, clientFilter, searchTerm]);

  // Extract date list
  const pickDates = useMemo(() => [...new Set(filteredPick.map(r => r.report_date))].sort(), [filteredPick]);
  const deliDates = useMemo(() => [...new Set(filteredDeli.map(r => r.report_date))].sort(), [filteredDeli]);

  const { weekPrev: pWPrev, weekCurrent: pWCur, d1Date: pD1 } = useMemo(() => groupDatesByWeek(pickDates), [pickDates]);
  const { weekPrev: dWPrev, weekCurrent: dWCur, d1Date: dD1 } = useMemo(() => groupDatesByWeek(deliDates), [deliDates]);

  // Render individual matrix table component
  const renderMetricTable = (title, metricKey, isDeli = false) => {
    const rows = isDeli ? filteredDeli : filteredPick;
    const dateList = isDeli ? deliDates : pickDates;
    const weekPrev = isDeli ? dWPrev : pWPrev;
    const weekCur = isDeli ? dWCur : pWCur;
    const d1Date = isDeli ? dD1 : pD1;
    const target = TARGET_KPIS[title] || 90.0;

    const totalCol = isDeli ? 'mau_del' : 'mau_pu';
    const ontimeCol = metricKey === '1st' ? (isDeli ? 'ontime_del_1st' : 'ontime_pu_1st') : (isDeli ? 'ontime_del_odr' : 'ontime_pu_opr');

    // Aggregate totals by date & entity
    // We compute: Region-level data, Miền-level data, TOÀN QUỐC data, and Hub-level data
    const dateEntityMap = {}; // key: ${entityType}_${entityId}_${dateStr}

    let tableMinPct = target;

    rows.forEach(r => {
      const d = r.report_date;
      const reg = r.region;
      const hub = r.hub;
      const mien = Object.keys(MIEN_REGIONS).find(m => MIEN_REGIONS[m].includes(reg)) || 'Miền Khác';

      const tot = r[totalCol] || 0;
      const ont = r[ontimeCol] || 0;

      // Hub level
      const hKey = `HUB_${reg}_${hub}_${d}`;
      if (!dateEntityMap[hKey]) dateEntityMap[hKey] = { tot: 0, ont: 0 };
      dateEntityMap[hKey].tot += tot;
      dateEntityMap[hKey].ont += ont;

      // Region level
      const rKey = `REG_${reg}_${d}`;
      if (!dateEntityMap[rKey]) dateEntityMap[rKey] = { tot: 0, ont: 0, bestVol: 0, bestOnt: 0, sameVol: 0, sameOnt: 0 };
      dateEntityMap[rKey].tot += tot;
      dateEntityMap[rKey].ont += ont;

      if (d === d1Date) {
        const bVolKey = metricKey === '1st' ? 'best_l6w_vol_1st' : (isDeli ? 'best_l6w_vol_odr' : 'best_l6w_vol_opr');
        const bOntKey = metricKey === '1st' ? 'best_l6w_ontime_1st' : (isDeli ? 'best_l6w_ontime_odr' : 'best_l6w_ontime_opr');
        const sOntKey = metricKey === '1st' ? 'sameday_lm_ontime_1st' : (isDeli ? 'sameday_lm_ontime_odr' : 'sameday_lm_ontime_opr');

        dateEntityMap[rKey].bestVol += (r[bVolKey] || 0);
        dateEntityMap[rKey].bestOnt += (r[bOntKey] || 0);
        dateEntityMap[rKey].sameVol += (r.sameday_lm_vol || 0);
        dateEntityMap[rKey].sameOnt += (r[sOntKey] || 0);
      }

      // Mền level
      const mKey = `MIEN_${mien}_${d}`;
      if (!dateEntityMap[mKey]) dateEntityMap[mKey] = { tot: 0, ont: 0 };
      dateEntityMap[mKey].tot += tot;
      dateEntityMap[mKey].ont += ont;

      // Toàn quốc level
      const tKey = `TQ_TQ_${d}`;
      if (!dateEntityMap[tKey]) dateEntityMap[tKey] = { tot: 0, ont: 0 };
      dateEntityMap[tKey].tot += tot;
      dateEntityMap[tKey].ont += ont;
    });

    // Helper to calculate Pct & Vol for an entity across a list of dates
    const calcStats = (keyPrefix, dates) => {
      let tot = 0, ont = 0;
      dates.forEach(d => {
        const item = dateEntityMap[`${keyPrefix}_${d}`];
        if (item) {
          tot += item.tot;
          ont += item.ont;
        }
      });
      const pct = tot > 0 ? (ont / tot) * 100 : null;
      if (pct !== null && pct < tableMinPct) tableMinPct = pct;
      return { tot, ont, pct };
    };

    // Calculate Table Min Pct for continuous color interpolation
    MIEN_ORDER.forEach(mien => {
      MIEN_REGIONS[mien].forEach(reg => {
        dateList.forEach(d => {
          const item = dateEntityMap[`REG_${reg}_${d}`];
          if (item && item.tot > 0) {
            const p = (item.ont / item.tot) * 100;
            if (p < tableMinPct) tableMinPct = p;
          }
        });
      });
    });

    return (
      <div className="metric-block" key={title}>
        <div className="metric-header">
          <div className="metric-title">
            <span>{title}</span>
            <span className="kpi-badge">Target ≥ {target.toFixed(0)}%</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-secondary" onClick={expandAll}>Mở tất cả Hubs</button>
            <button className="btn-secondary" onClick={collapseAll}>Thu gọn về Vùng</button>
          </div>
        </div>

        <div className="mtx-wrap">
          <table className="mtx-table">
            <thead>
              {/* Row 1: Week Titles */}
              <tr>
                <th rowSpan="2" className="lbl">Miền / Vùng / Hub</th>
                {weekPrev.length > 0 && (
                  <th colSpan={weekPrev.length} style={{ borderRight: '1.5px solid rgba(255,255,255,0.4)' }}>
                    TUẦN W-1 (TRỌN VẸN)
                  </th>
                )}
                {/* Week Cur: daily dates up to day before D-1 */}
                {weekCur.slice(0, -1).length > 0 && (
                  <th colSpan={weekCur.slice(0, -1).length}>TUẦN HIỆN TẠI</th>
                )}
                {/* Header merge for D-1 Date + Vol D-1 */}
                <th colSpan="2" style={{ background: '#004b82', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  {formatDateLabel(d1Date)}
                </th>
                {/* Header merge for WTD % + Vol WTD */}
                <th colSpan="2" style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  WTD (CỘNG DỒN)
                </th>
                {/* Best 6W & Sameday */}
                <th rowSpan="2" style={{ width: '80px', fontSize: '0.75rem', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  Tốt nhất<br />6 tuần
                </th>
                <th rowSpan="2" style={{ width: '80px', fontSize: '0.75rem' }}>
                  Cùng ngày<br />tháng trước
                </th>
              </tr>

              {/* Row 2: Daily Dates */}
              <tr>
                {weekPrev.map((d, idx) => (
                  <th key={d} className={idx === 0 ? 'sep' : ''}>{formatDateLabel(d)}</th>
                ))}
                {weekCur.slice(0, -1).map(d => (
                  <th key={d}>{formatDateLabel(d)}</th>
                ))}
                {/* D-1 headers */}
                <th style={{ background: '#004b82', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>% Ontime</th>
                <th style={{ background: '#004b82' }}>Vol D-1</th>
                {/* WTD headers */}
                <th style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>% WTD</th>
                <th style={{ background: '#00365e' }}>Vol WTD</th>
              </tr>
            </thead>

            <tbody>
              {/* 1. TOÀN QUỐC ROW */}
              <tr className="all-row">
                <td className="lbl">TOÀN QUỐC</td>
                {weekPrev.map((d, idx) => {
                  const s = calcStats('TQ_TQ', [d]);
                  return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                })}
                {weekCur.slice(0, -1).map(d => {
                  const s = calcStats('TQ_TQ', [d]);
                  return <td key={d} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                })}
                {/* D-1 */}
                {(() => {
                  const d1S = calcStats('TQ_TQ', [d1Date]);
                  const wtdS = calcStats('TQ_TQ', weekCur);
                  return (
                    <>
                      <td className="sep" style={getContinuousColorStyle(d1S.pct, target, tableMinPct)}>{formatPct(d1S.pct)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(d1S.tot)}</td>
                      <td className="sep" style={getContinuousColorStyle(wtdS.pct, target, tableMinPct)}>{formatPct(wtdS.pct)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(wtdS.tot)}</td>
                      <td>–</td>
                      <td>–</td>
                    </>
                  );
                })()}
              </tr>

              {/* 2. MIỀN & VÙNG ROWS */}
              {MIEN_ORDER.map(mien => {
                const mienStats = calcStats(`MIEN_${mien}`, weekCur);
                return (
                  <React.Fragment key={mien}>
                    {/* Miền Header Row */}
                    <tr className="grp-row">
                      <td className="lbl" style={{ color: '#0063AA' }}>{mien}</td>
                      {weekPrev.map((d, idx) => {
                        const s = calcStats(`MIEN_${mien}`, [d]);
                        return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                      })}
                      {weekCur.slice(0, -1).map(d => {
                        const s = calcStats(`MIEN_${mien}`, [d]);
                        return <td key={d} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                      })}
                      {(() => {
                        const d1S = calcStats(`MIEN_${mien}`, [d1Date]);
                        const wtdS = mienStats;
                        return (
                          <>
                            <td className="sep" style={getContinuousColorStyle(d1S.pct, target, tableMinPct)}>{formatPct(d1S.pct)}</td>
                            <td>{formatVol(d1S.tot)}</td>
                            <td className="sep" style={getContinuousColorStyle(wtdS.pct, target, tableMinPct)}>{formatPct(wtdS.pct)}</td>
                            <td>{formatVol(wtdS.tot)}</td>
                            <td>–</td>
                            <td>–</td>
                          </>
                        );
                      })()}
                    </tr>

                    {/* Vùng Rows inside Miền */}
                    {MIEN_REGIONS[mien].map(reg => {
                      const isExpanded = !!expandedRegions[reg];
                      const d1RegData = dateEntityMap[`REG_${reg}_${d1Date}`] || { tot: 0, ont: 0, bestVol: 0, bestOnt: 0, sameVol: 0, sameOnt: 0 };
                      const regD1Pct = d1RegData.tot > 0 ? (d1RegData.ont / d1RegData.tot) * 100 : null;

                      // Calculate comparison diffs
                      const bestPct = d1RegData.bestVol > 0 ? (d1RegData.bestOnt / d1RegData.bestVol) * 100 : null;
                      const samePct = d1RegData.sameVol > 0 ? (d1RegData.sameOnt / d1RegData.sameVol) * 100 : null;

                      const diffBest = regD1Pct !== null && bestPct !== null ? regD1Pct - bestPct : null;
                      const diffSame = regD1Pct !== null && samePct !== null ? regD1Pct - samePct : null;

                      const regWtd = calcStats(`REG_${reg}`, weekCur);

                      // Get Top 10 Hubs for this region sorted by absolute late volume on D-1
                      const hubMap = {};
                      rows.filter(r => r.region === reg).forEach(r => {
                        if (!hubMap[r.hub]) hubMap[r.hub] = 0;
                        if (r.report_date === d1Date) {
                          const tot = r[totalCol] || 0;
                          const ont = r[ontimeCol] || 0;
                          hubMap[r.hub] += (tot - ont);
                        }
                      });

                      const top10Hubs = Object.keys(hubMap)
                        .sort((a, b) => hubMap[b] - hubMap[a])
                        .slice(0, 10);

                      return (
                        <React.Fragment key={reg}>
                          <tr>
                            <td className="lbl">
                              <button className="toggle-btn" onClick={() => toggleRegion(reg)}>
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                              <strong>{reg}</strong>
                            </td>
                            {weekPrev.map((d, idx) => {
                              const s = calcStats(`REG_${reg}`, [d]);
                              return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                            })}
                            {weekCur.slice(0, -1).map(d => {
                              const s = calcStats(`REG_${reg}`, [d]);
                              return <td key={d} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                            })}
                            {/* D-1 & WTD */}
                            <td className="sep" style={getContinuousColorStyle(regD1Pct, target, tableMinPct)}>{formatPct(regD1Pct)}</td>
                            <td>{formatVol(d1RegData.tot)}</td>
                            <td className="sep" style={getContinuousColorStyle(regWtd.pct, target, tableMinPct)}>{formatPct(regWtd.pct)}</td>
                            <td>{formatVol(regWtd.tot)}</td>
                            
                            {/* Best 6W Diff */}
                            <td>
                              {diffBest !== null ? (
                                <span className={`diff-badge ${diffBest >= 0 ? 'up' : 'down'}`}>
                                  {formatDiff(diffBest)}
                                </span>
                              ) : '–'}
                            </td>

                            {/* Sameday Diff */}
                            <td>
                              {diffSame !== null ? (
                                <span className={`diff-badge ${diffSame >= 0 ? 'up' : 'down'}`}>
                                  {formatDiff(diffSame)}
                                </span>
                              ) : '–'}
                            </td>
                          </tr>

                          {/* Render Top 10 Hub Sub-rows if expanded */}
                          {isExpanded && top10Hubs.map(hub => {
                            const hubD1 = calcStats(`HUB_${reg}_${hub}`, [d1Date]);
                            const hubWtd = calcStats(`HUB_${reg}_${hub}`, weekCur);
                            return (
                              <tr key={hub} className="sub-row">
                                <td className="lbl">{hub}</td>
                                {weekPrev.map((d, idx) => {
                                  const s = calcStats(`HUB_${reg}_${hub}`, [d]);
                                  return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                                })}
                                {weekCur.slice(0, -1).map(d => {
                                  const s = calcStats(`HUB_${reg}_${hub}`, [d]);
                                  return <td key={d} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                                })}
                                <td className="sep" style={getContinuousColorStyle(hubD1.pct, target, tableMinPct)}>{formatPct(hubD1.pct)}</td>
                                <td>{formatVol(hubD1.tot)}</td>
                                <td className="sep" style={getContinuousColorStyle(hubWtd.pct, target, tableMinPct)}>{formatPct(hubWtd.pct)}</td>
                                <td>{formatVol(hubWtd.tot)}</td>
                                <td>–</td>
                                <td>–</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="table-legend">
          <div className="legend-items">
            <span style={{ fontWeight: 600, color: '#334155' }}>Rule màu (Thang liên tục trắng → đỏ):</span>
            <div className="legend-item">
              <div className="legend-box" style={{ background: '#FFFFFF' }}></div>
              <span>≥ {target.toFixed(0)}% (Đạt target)</span>
            </div>
            <div className="legend-item">
              <div className="legend-box" style={{ background: '#E8362C' }}></div>
              <span>Thấp nhất thực tế ({tableMinPct.toFixed(1)}%)</span>
            </div>
          </div>
          <div>* Hubs mặc định ẩn, click ▶ để mở top 10 hub trễ tuyệt đối nhiều nhất.</div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <Layers size={22} style={{ color: '#F15A22' }} />
          4 chỉ số nationwide
        </h2>
        <div className="section-desc">
          Báo cáo điều hành — Theo dõi 1st Pickup, OPR, 1st Deli, ODR theo phân cấp 3 tầng với thang màu liên tục trắng→đỏ.
        </div>
      </div>

      {renderMetricTable('Mục 1.1: Tỷ lệ lấy hàng đúng giờ (1st Pickup)', '1st', false)}
      {renderMetricTable('Mục 1.2: Tỷ lệ lấy hàng tổng thể (OPR)', 'OPR', false)}
      {renderMetricTable('Mục 2.1: Tỷ lệ giao hàng đúng giờ (1st Deli)', '1st', true)}
      {renderMetricTable('Mục 2.2: Tỷ lệ giao hàng tổng thể (ODR)', 'ODR', true)}
    </div>
  );
}
