import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Layers, ArrowUp } from 'lucide-react';
import { MIEN_REGIONS, MIEN_ORDER, TARGET_KPIS } from '../data/defaultDataset';
import { formatPct, formatVol, formatDiff, formatDateLabel, groupDatesByWeek, getContinuousColorStyle } from '../utils/dataProcessor';

export default function Report1MienVungHub({ pickRows, deliRows, clientFilter, expandAllHubs }) {
  const [expandedRegions, setExpandedRegions] = useState({});
  const [showHomeBtn, setShowHomeBtn] = useState(false);

  const refP1st = useRef(null);
  const refPOpr = useRef(null);
  const refD1st = useRef(null);
  const refDOdr = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setShowHomeBtn(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToRef = (ref) => {
    if (ref && ref.current) {
      const y = ref.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


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

  useEffect(() => {
    if (expandAllHubs) {
      expandAll();
    } else {
      collapseAll();
    }
  }, [expandAllHubs]);

  // Filter rows by client
  const filteredPick = useMemo(() => {
    return clientFilter === 'ALL' ? pickRows : pickRows.filter(r => r.client_name === clientFilter);
  }, [pickRows, clientFilter]);

  const filteredDeli = useMemo(() => {
    return clientFilter === 'ALL' ? deliRows : deliRows.filter(r => r.client_name === clientFilter);
  }, [deliRows, clientFilter]);

  // Extract date list
  const pickDates = useMemo(() => [...new Set(filteredPick.map(r => r.report_date))].sort(), [filteredPick]);
  const deliDates = useMemo(() => [...new Set(filteredDeli.map(r => r.report_date))].sort(), [filteredDeli]);

  const { weekPrev: pWPrev, weekCurrent: pWCur, d1Date: pD1 } = useMemo(() => groupDatesByWeek(pickDates), [pickDates]);
  const { weekPrev: dWPrev, weekCurrent: dWCur, d1Date: dD1 } = useMemo(() => groupDatesByWeek(deliDates), [deliDates]);

  // Helper row value extractor for flexible column names (handling mau_deli vs mau_del)
  const getRowVal = (r, primaryCol, fallbackCol) => {
    if (r[primaryCol] !== undefined && r[primaryCol] !== null) return Number(r[primaryCol]) || 0;
    if (fallbackCol && r[fallbackCol] !== undefined && r[fallbackCol] !== null) return Number(r[fallbackCol]) || 0;
    return 0;
  };

  // KPI Cards Data Calculation
  const kpiCards = useMemo(() => {
    if (!pD1) return [];

    const d1Date = pD1;
    const d8Obj = new Date(d1Date);
    d8Obj.setDate(d8Obj.getDate() - 7);
    const d8DateStr = d8Obj.toISOString().split('T')[0];
    const d8Date = pickDates.includes(d8DateStr) ? d8DateStr : pickDates[0];

    const getAgg = (rows, dateStr, isDeli, metricKey) => {
      let tot = 0, ont = 0;
      rows.filter(r => r.report_date === dateStr).forEach(r => {
        const t = isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
        const o = isDeli 
          ? (metricKey === '1st' ? getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st') : getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr'))
          : (metricKey === '1st' ? getRowVal(r, 'ontime_pu_1st') : getRowVal(r, 'ontime_pu_opr'));
        tot += t;
        ont += o;
      });
      return { tot, ont, pct: tot > 0 ? (ont / tot) * 100 : 0 };
    };

    const p1stD1 = getAgg(filteredPick, d1Date, false, '1st');
    const poprD1 = getAgg(filteredPick, d1Date, false, 'OPR');
    const d1stD1 = getAgg(filteredDeli, d1Date, true, '1st');
    const dodrD1 = getAgg(filteredDeli, d1Date, true, 'ODR');

    const p1stD8 = getAgg(filteredPick, d8Date, false, '1st');
    const poprD8 = getAgg(filteredPick, d8Date, false, 'OPR');
    const d1stD8 = getAgg(filteredDeli, d8Date, true, '1st');
    const dodrD8 = getAgg(filteredDeli, d8Date, true, 'ODR');

    return [
      { id: 'p1st', title: '1ST PICKUP', target: TARGET_KPIS['Tỷ lệ lấy hàng đúng giờ (1st Pickup)'] || 97, d1: p1stD1, d8: p1stD8, ref: refP1st },
      { id: 'popr', title: 'OPR', target: TARGET_KPIS['Tỷ lệ lấy hàng tổng thể (OPR)'] || 90, d1: poprD1, d8: poprD8, ref: refPOpr },
      { id: 'd1st', title: '1ST DELI', target: TARGET_KPIS['Tỷ lệ giao hàng đúng giờ (1st Deli)'] || 95, d1: d1stD1, d8: d1stD8, ref: refD1st },
      { id: 'dodr', title: 'ODR', target: TARGET_KPIS['Tỷ lệ giao hàng tổng thể (ODR)'] || 90, d1: dodrD1, d8: dodrD8, ref: refDOdr }
    ];
  }, [pD1, filteredPick, filteredDeli, pickDates]);

  // Render individual matrix table component
  const renderMetricTable = (title, metricKey, isDeli = false, sectionRef = null) => {
    const rows = isDeli ? filteredDeli : filteredPick;
    const dateList = isDeli ? deliDates : pickDates;
    const weekPrev = isDeli ? dWPrev : pWPrev;
    const weekCur = isDeli ? dWCur : pWCur;
    const d1Date = isDeli ? dD1 : pD1;
    const target = TARGET_KPIS[title.replace(/^Mục \d\.\d: (.*?) \(.*\)$/, '$1')] || (isDeli ? (metricKey === '1st' ? 95.0 : 90.0) : (metricKey === '1st' ? 97.0 : 90.0));

    // Aggregate totals by date & entity
    const dateEntityMap = {}; // key: ${entityType}_${entityId}_${dateStr}
    let tableMinPct = target;

    rows.forEach(r => {
      const d = r.report_date;
      const reg = r.region;
      const hub = r.hub;
      const mien = Object.keys(MIEN_REGIONS).find(m => MIEN_REGIONS[m].includes(reg)) || 'Miền Khác';

      const tot = isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
      const ont = isDeli 
        ? (metricKey === '1st' ? getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st') : getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr'))
        : (metricKey === '1st' ? getRowVal(r, 'ontime_pu_1st') : getRowVal(r, 'ontime_pu_opr'));

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

        dateEntityMap[rKey].bestVol += getRowVal(r, bVolKey);
        dateEntityMap[rKey].bestOnt += getRowVal(r, bOntKey);
        dateEntityMap[rKey].sameVol += getRowVal(r, 'sameday_lm_vol');
        dateEntityMap[rKey].sameOnt += getRowVal(r, sOntKey);
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
      <div className="metric-block" key={title} ref={sectionRef}>
        <div className="metric-header">
          <div className="metric-title">
            <span>{title}</span>
            <span className="kpi-badge">Target ≥ {target.toFixed(0)}%</span>
          </div>
        </div>

        <div className="mtx-wrap">
          <table className="mtx-table">
            <thead>
              {/* Row 1: Week Titles */}
              <tr>
                <th rowSpan="2" className="lbl lbl-1">Miền</th>
                <th rowSpan="2" className="lbl lbl-2">Vùng / Hub</th>
                {weekPrev.length > 0 && (
                  <th colSpan={weekPrev.length} style={{ borderRight: '1.5px solid rgba(255,255,255,0.4)' }}>
                    TUẦN W-1 (TRỌN VẸN)
                  </th>
                )}
                {/* Week Cur: daily dates up to D-1 (D-1 spans 2 cols) */}
                {weekCur.length > 0 && (
                  <th colSpan={weekCur.length + 1}>TUẦN HIỆN TẠI</th>
                )}
                {/* Header merge for WTD (spanning both rows) */}
                <th colSpan="2" rowSpan="2" style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)', verticalAlign: 'middle' }}>
                  WTD (CỘNG DỒN)
                </th>
                {/* Best 6W & Sameday */}
                <th rowSpan="2" style={{ width: '80px', fontSize: '0.75rem', borderLeft: '1.5px solid rgba(255,255,255,0.4)', verticalAlign: 'middle' }}>
                  Tốt nhất<br />6 tuần
                </th>
                <th rowSpan="2" style={{ width: '80px', fontSize: '0.75rem', verticalAlign: 'middle' }}>
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
                {/* D-1 header (merged over 2 cols, replacing % Ontime and Vol D-1) */}
                <th colSpan="2" style={{ background: '#004b82', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  {formatDateLabel(d1Date)}
                </th>
              </tr>
            </thead>

            <tbody>
              {/* 1. TOÀN QUỐC ROW */}
              <tr className="all-row">
                <td colSpan="2" className="lbl lbl-1" style={{ position: 'sticky', left: 0, zIndex: 10 }}>TOÀN QUỐC</td>
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
                
                // Sort regions in this Miền by D-1 volume descending
                const sortedRegions = [...MIEN_REGIONS[mien]].sort((a, b) => {
                  const volA = dateEntityMap[`REG_${a}_${d1Date}`]?.tot || 0;
                  const volB = dateEntityMap[`REG_${b}_${d1Date}`]?.tot || 0;
                  return volB - volA;
                });
                
                // Calculate total rowSpan for the Miền column
                // 1 (Miền total row) + number of regions + number of expanded top 10 hubs in this Miền
                let totalRowSpan = 1 + sortedRegions.length;
                sortedRegions.forEach(reg => {
                  if (expandedRegions[reg]) {
                    const hubMap = {};
                    rows.filter(r => r.region === reg).forEach(r => {
                      if (!hubMap[r.hub]) hubMap[r.hub] = 0;
                      if (r.report_date === d1Date) {
                        const tot = isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
                        const ont = isDeli 
                          ? (metricKey === '1st' ? getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st') : getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr'))
                          : (metricKey === '1st' ? getRowVal(r, 'ontime_pu_1st') : getRowVal(r, 'ontime_pu_opr'));
                        hubMap[r.hub] += (tot - ont);
                      }
                    });
                    const top10Hubs = Object.keys(hubMap).sort((a, b) => hubMap[b] - hubMap[a]).slice(0, 10);
                    totalRowSpan += top10Hubs.length;
                  }
                });

                return (
                  <React.Fragment key={mien}>
                    {/* Miền Header Row */}
                    <tr className="grp-row" style={{ borderTop: '2.5px solid var(--ghn-blue)' }}>
                      <td rowSpan={totalRowSpan} className="lbl lbl-1" style={{ color: '#0063AA', fontWeight: 'bold', verticalAlign: 'top', paddingTop: '0.6rem' }}>{mien}</td>
                      <td className="lbl lbl-2" style={{ color: '#0063AA', fontStyle: 'italic', fontWeight: 'bold' }}>Tổng {mien}</td>
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
                    {sortedRegions.map(reg => {
                      const isExpanded = !!expandedRegions[reg];
                      const d1RegData = dateEntityMap[`REG_${reg}_${d1Date}`] || { tot: 0, ont: 0, bestVol: 0, bestOnt: 0, sameVol: 0, sameOnt: 0 };
                      const regD1Pct = d1RegData.tot > 0 ? (d1RegData.ont / d1RegData.tot) * 100 : null;

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
                          const tot = isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
                          const ont = isDeli 
                            ? (metricKey === '1st' ? getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st') : getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr'))
                            : (metricKey === '1st' ? getRowVal(r, 'ontime_pu_1st') : getRowVal(r, 'ontime_pu_opr'));
                          hubMap[r.hub] += (tot - ont);
                        }
                      });

                      const top10Hubs = Object.keys(hubMap)
                        .sort((a, b) => hubMap[b] - hubMap[a])
                        .slice(0, 10);

                      return (
                        <React.Fragment key={reg}>
                          <tr>
                            <td className="lbl lbl-2">
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
                                <td className="lbl lbl-2" style={{ paddingLeft: '2rem' }}>{hub}</td>
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

      {/* KPI Cards Section */}
      <div className="kpi-cards-wrapper">
        <div className="kpi-cards-header">
          TỔNG QUAN D-1 <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 400 }}>so sánh với cùng thứ tuần trước (D-8)</span>
        </div>
        <div className="kpi-cards-container">
          {kpiCards.map(card => {
            const diff = card.d1.pct - card.d8.pct;
            const diffStr = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
            const lateVol = card.d1.tot - card.d1.ont;
            const isGood = card.d1.pct >= card.target;
            
            return (
              <div key={card.id} className="kpi-card" onClick={() => scrollToRef(card.ref)}>
                <div className="kpi-card-title">
                  <span>{card.title}</span>
                  <span className="kpi-card-target">≥{card.target}%</span>
                </div>
                <div className="kpi-card-main">
                  <span className={`kpi-card-pct ${isGood ? 'good' : ''}`}>
                    {card.d1.pct.toFixed(1)}%
                  </span>
                  <span className={`kpi-card-diff ${diff >= 0 ? 'up' : 'down'}`}>
                    {diffStr}
                  </span>
                </div>
                
                {/* Visual line */}
                <div className="kpi-card-chart">
                  <div className="kpi-card-chart-line" style={{ background: isGood ? '#0F6E56' : '#A13B2A' }}></div>
                </div>

                <div className="kpi-card-stats">
                  <span>{formatVol(card.d1.tot)} đơn</span>
                  <span className="late">{formatVol(lateVol)} trễ</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {renderMetricTable('Mục 1.1: Tỷ lệ lấy hàng đúng giờ (1st Pickup)', '1st', false, refP1st)}
      {renderMetricTable('Mục 1.2: Tỷ lệ lấy hàng tổng thể (OPR)', 'OPR', false, refPOpr)}
      {renderMetricTable('Mục 1.3: Tỷ lệ giao hàng đúng giờ (1st Deli)', '1st', true, refD1st)}
      {renderMetricTable('Mục 1.4: Tỷ lệ giao hàng tổng thể (ODR)', 'ODR', true, refDOdr)}
      
      {showHomeBtn && (
        <button className="home-fab" onClick={scrollToTop} aria-label="Cuộn lên đầu trang">
          <ArrowUp size={24} />
        </button>
      )}
    </div>
  );
}
