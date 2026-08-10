import React, { useState, useMemo } from 'react';
import { ArrowRightLeft, Download, Grid } from 'lucide-react';
import { formatPct, formatVol, formatDiff, formatDateLabel, groupDatesByWeek, getContinuousColorStyle } from '../utils/dataProcessor';
import { MIEN_REGIONS, MIEN_ORDER } from '../data/defaultDataset';

export default function Report5LaneCa1({ ca1Rows = [], selectedRegions = [] }) {
  const [density, setDensity] = useState('comfortable');

  const dates = useMemo(() => [...new Set(ca1Rows.map(r => r.ngay))].sort(), [ca1Rows]);
  const { weekPrev, weekCurrent, d1Date } = useMemo(() => groupDatesByWeek(dates), [dates]);

  const handleExportCSV = () => {
    const headers = ['Lane', 'Vung Giao', 'Ngay', 'Tong Don', 'Don Hub Giao Ca 1', '% Ca 1'];
    const csvRows = [headers.join(',')];

    ca1Rows.forEach(r => {
      const tot = Number(r.tong_don) || 0;
      const ca1 = Number(r.don_hub_giao_ca1) || 0;
      const pct = tot > 0 ? ((ca1 / tot) * 100).toFixed(2) : '0';
      csvRows.push([`"${r.lane}"`, `"${r.vung_giao}"`, `"${r.ngay}"`, tot, ca1, `${pct}%`].join(','));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GHN_Shopee_Ca1_Lane_Matrix_${d1Date || 'D1'}.csv`;
    link.click();
  };

  // Split weekCurrent into days up to D-2 and D-1 separately (matching 4 chỉ số layout)
  const weekCurBeforeD1 = useMemo(() => weekCurrent.slice(0, -1), [weekCurrent]);

  const lanes = ['Intra City', 'Intra Region', 'Cross Region', 'Cross Metro', 'Cross Metro*'];

  const getProvinceMap = (reg) => {
    const map = {
      'HCM': 'Hồ Chí Minh',
      'HCM - GXT': 'Hồ Chí Minh',
      'HNO': 'Hà Nội',
      'TTB': 'Đà Nẵng',
      'DBB': 'Hải Phòng',
      'DNB': 'Đồng Nai',
      'TNB': 'Cần Thơ'
    };
    return map[reg] || reg;
  };

  // Flexible column value extractor (handles different column naming between default & live sheet)
  const getVal = (r, primary, fallback) => {
    if (r[primary] !== undefined && r[primary] !== null) return Number(r[primary]) || 0;
    if (fallback && r[fallback] !== undefined && r[fallback] !== null) return Number(r[fallback]) || 0;
    return 0;
  };

  const renderLaneTable = (laneName) => {
    let laneData = ca1Rows.filter(r => r.lane === laneName);
    
    // Map regions to provinces for Cross Metro*
    if (laneName === 'Cross Metro*') {
      laneData = laneData.map(r => ({
        ...r,
        vung_giao: getProvinceMap(r.vung_giao)
      }));
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
                <th rowSpan="2" className="lbl lbl-1">Miền</th>
                <th rowSpan="2" className="lbl lbl-2">{col1Label}</th>
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
                <td colSpan="2" className="lbl lbl-1" style={{ position: 'sticky', left: 0, zIndex: 10 }}>TOÀN LANE {laneName.toUpperCase()}</td>
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
              {/* REGION / PROVINCE ROWS */}
              {(() => {
                const getMienForReg = (reg) => {
                  for (const mien of MIEN_ORDER) {
                    if (MIEN_REGIONS[mien].includes(reg)) return mien;
                  }
                  return 'Khác';
                };

                const mienGroups = {};
                sortedRegions.forEach(reg => {
                  const mien = getMienForReg(reg);
                  if (!mienGroups[mien]) mienGroups[mien] = [];
                  mienGroups[mien].push(reg);
                });

                const sortedMiens = MIEN_ORDER.filter(m => mienGroups[m]).concat(mienGroups['Khác'] ? ['Khác'] : []);

                return sortedMiens.map(mien => {
                  const regs = mienGroups[mien];
                  return (
                    <React.Fragment key={mien}>
                      {regs.map((reg, idx) => {
                        const regD1 = getStats(r => r.vung_giao === reg, [d1Date]);
                        const regWtd = getStats(r => r.vung_giao === reg, weekCurrent);

                        const regSample = laneData.find(r => r.vung_giao === reg && r.ngay === d1Date);
                        const bestVol = regSample ? (getVal(regSample, 'best_l6w_vol_ca1', 'best_l6w_vol')) : 0;
                        const bestCa1 = regSample ? (getVal(regSample, 'best_l6w_ca1')) : 0;
                        const sameVol = regSample ? (getVal(regSample, 'sameday_lm_vol', 'samedaylastmonth_vol')) : 0;
                        const sameCa1 = regSample ? (getVal(regSample, 'sameday_lm_ca1', 'samedaylastmonth_ca1')) : 0;

                        const bestPct = bestVol > 0 ? (bestCa1 / bestVol) * 100 : null;
                        const samePct = sameVol > 0 ? (sameCa1 / sameVol) * 100 : null;

                        const diffBest = regD1.pct !== null && bestPct !== null ? regD1.pct - bestPct : null;
                        const diffSame = regD1.pct !== null && samePct !== null ? regD1.pct - samePct : null;
                        
                        const rowStyle = idx === 0 ? { borderTop: '2.5px solid var(--ghn-blue)' } : {};

                        return (
                          <tr key={reg} style={rowStyle}>
                            {idx === 0 && (
                              <td rowSpan={regs.length} className="lbl lbl-1" style={{ color: '#0063AA', fontWeight: 'bold', verticalAlign: 'top', paddingTop: '0.6rem', background: '#f8fafc' }}>
                                {mien}
                              </td>
                            )}
                            <td className="lbl lbl-2"><strong>{reg}</strong></td>
                            {weekPrev.map((d, dIdx) => {
                              const s = getStats(r => r.vung_giao === reg, [d]);
                              return <td key={d} className={dIdx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, laneMaxPct, laneMinPct)}>{formatPct(s.pct)}</td>;
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
                    </React.Fragment>
                  );
                });
              })()}

              {/* SẢN LƯỢNG (TỔNG ĐƠN) ROW — Volume Row at Bottom */}
              <tr className="all-row" style={{ borderTop: '2.5px solid #cbd5e1' }}>
                <td colSpan="2" className="lbl lbl-1" style={{ fontStyle: 'italic', position: 'sticky', left: 0, zIndex: 10 }}>Sản lượng (tổng đơn)</td>
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
            <span className="legend-title" style={{ fontWeight: 600 }}>Thang màu liên tục:</span>
            <div className="legend-item">
              <div className="legend-box legend-box-good"></div>
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
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="section-title">
            <ArrowRightLeft size={22} style={{ color: '#F15A22' }} />
            % ca 1 theo lane
          </h2>
          <div className="section-desc">
            Tỷ lệ đơn hàng về đến hub giao trước 09:00 sáng ngày SLA giao (Ca 1 cutoff), phân theo 5 loại Lane.
          </div>
        </div>

        {/* View Controls: Density & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '8px', padding: '2px' }}>
            <button 
              className={`btn-secondary ${density === 'comfortable' ? 'primary' : ''}`}
              onClick={() => setDensity('comfortable')}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none' }}
              title="Khoảng cách dòng thoáng"
            >
              <Grid size={13} /> Thoáng
            </button>
            <button 
              className={`btn-secondary ${density === 'compact' ? 'primary' : ''}`}
              onClick={() => setDensity('compact')}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none' }}
              title="Nén dày dòng dữ liệu"
            >
              <Grid size={13} /> Dày
            </button>
          </div>

          <button 
            className="btn-secondary"
            onClick={handleExportCSV}
            title="Tải dữ liệu dạng CSV (Mở bằng Excel)"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: '#0F6E56', color: 'white', border: 'none' }}
          >
            <Download size={15} />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      <div className={`density-${density}`}>
        {lanes.map(lane => renderLaneTable(lane))}
      </div>
    </div>
  );
}
