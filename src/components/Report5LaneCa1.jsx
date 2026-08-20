import React, { useState, useMemo, useCallback } from 'react';
import * as htmlToImage from 'html-to-image';
import { ArrowRightLeft, Download, X, Copy, Check, CalendarRange, Filter } from 'lucide-react';
import { formatPct, formatVol, formatDiff, formatDateLabel, groupDatesByWeek, getContinuousColorStyle } from '../utils/dataProcessor';
import { MIEN_REGIONS, MIEN_ORDER } from '../data/defaultDataset';

export default function Report5LaneCa1({ ca1Rows = [], density, isFullscreen, setIsFullscreen }) {
  const tableRefs = React.useRef({});
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [copiedLane, setCopiedLane] = useState(null);

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen && setIsFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, setIsFullscreen]);

  const handleCopyImage = async (laneName) => {
    const node = tableRefs.current[laneName];
    if (!node) return;
    try {
      const dataUrl = await htmlToImage.toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      setCopiedLane(laneName);
      window.setTimeout(() => setCopiedLane(null), 2500);
    } catch (err) {
      console.error('Error copying image:', err);
      alert('Có lỗi xảy ra khi copy ảnh! Vui lòng thử lại.');
    }
  };

  const dates = useMemo(() => [...new Set(ca1Rows.map(r => r.ngay))].sort(), [ca1Rows]);
  const { weekPrev, weekCurrent, d1Date } = useMemo(() => groupDatesByWeek(dates), [dates]);
  const [exportFilters, setExportFilters] = useState({
    lane: 'ALL',
    region: 'ALL',
    dateFrom: '',
    dateTo: ''
  });

  const exportLanes = useMemo(
    () => [...new Set(ca1Rows.map(row => row.lane).filter(Boolean))].sort(),
    [ca1Rows]
  );

  const exportRegions = useMemo(
    () => [...new Set(ca1Rows.map(row => row.vung_giao).filter(Boolean))].sort(),
    [ca1Rows]
  );

  const exportRows = useMemo(() => ca1Rows.filter(row => {
    const matchesLane = exportFilters.lane === 'ALL' || row.lane === exportFilters.lane;
    const matchesRegion = exportFilters.region === 'ALL' || row.vung_giao === exportFilters.region;
    const matchesStart = !exportFilters.dateFrom || row.ngay >= exportFilters.dateFrom;
    const matchesEnd = !exportFilters.dateTo || row.ngay <= exportFilters.dateTo;
    return matchesLane && matchesRegion && matchesStart && matchesEnd;
  }), [ca1Rows, exportFilters]);

  const updateExportFilter = (key, value) => {
    setExportFilters(current => ({ ...current, [key]: value }));
  };

  const useCurrentWeek = () => {
    if (weekCurrent.length === 0) return;
    setExportFilters(current => ({
      ...current,
      dateFrom: weekCurrent[0],
      dateTo: weekCurrent[weekCurrent.length - 1]
    }));
  };

  const resetExportFilters = () => {
    setExportFilters({ lane: 'ALL', region: 'ALL', dateFrom: '', dateTo: '' });
  };

  const handleExportCSV = useCallback(() => {
    if (exportRows.length === 0) return;
    const headers = ['Lane', 'Vung Giao', 'Ngay', 'Tong Don', 'Don Hub Giao Ca 1', '% Ca 1'];
    const csvRows = [headers.join(',')];

    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    exportRows.forEach(r => {
      const tot = Number(r.tong_don) || 0;
      const ca1 = Number(r.don_hub_giao_ca1) || 0;
      const pct = tot > 0 ? ((ca1 / tot) * 100).toFixed(2) : '0';
      csvRows.push([escapeCsv(r.lane), escapeCsv(r.vung_giao), escapeCsv(r.ngay), tot, ca1, `${pct}%`].join(','));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const rangeLabel = exportFilters.dateFrom || exportFilters.dateTo
      ? `${exportFilters.dateFrom || 'start'}_${exportFilters.dateTo || 'end'}`
      : (d1Date || 'all-data');
    link.download = `GHN_Shopee_Ca1_Lane_Matrix_${rangeLabel}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setIsExportMenuOpen(false);
  }, [d1Date, exportFilters.dateFrom, exportFilters.dateTo, exportRows]);

  React.useEffect(() => {
    window.addEventListener('export-csv', handleExportCSV);
    return () => window.removeEventListener('export-csv', handleExportCSV);
  }, [handleExportCSV]);

  // Split weekCurrent into days up to D-2 and D-1 separately (matching 4 chỉ số layout)
  const weekCurBeforeD1 = useMemo(() => weekCurrent.slice(0, -1), [weekCurrent]);

  const lanes = ['Intra City', 'Intra Region', 'Cross Region', 'Cross Metro', 'Cross Metro*'];

  const getProvinceMap = (reg) => {
    const map = {
      'HCM': 'Hồ Chí Minh',
      'HCM - GXT': 'Hồ Chí Minh',
      'HCM - KA': 'Hồ Chí Minh',
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

  // The real sheet writes lane names in sentence case with inconsistent
  // spacing ("Intra city", "Cross region", "Cross metro *"), not the mock
  // dataset's "Intra City" / "Cross Metro*" — an exact === match against
  // `lanes` above silently matched nothing and every cell showed 0/–.
  // Normalize both sides (lowercase, strip whitespace) before comparing.
  const normalizeLane = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

  const renderLaneTable = (laneName) => {
    let laneData = ca1Rows.filter(r => normalizeLane(r.lane) === normalizeLane(laneName));
    
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
      <div 
        className="metric-block" 
        key={laneName} 
        ref={el => tableRefs.current[laneName] = el}
        style={{ marginBottom: '2rem', background: 'var(--surface)', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid var(--border)', overflow: 'hidden' }}
      >
        <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="metric-title" style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem' }}>
              <ArrowRightLeft size={18} style={{ color: '#F15A22' }} />
              <span>Lane: {laneName}</span>
              <span className="kpi-badge">Cutoff 09:00 AM</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              % Đơn về hub giao trước Ca 1 (09:00 sáng ngày SLA)
            </div>
          </div>
          <button 
            onClick={() => handleCopyImage(laneName)}
            className="btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              padding: '0.3rem 0.6rem', 
              fontSize: '0.75rem', 
              color: copiedLane === laneName ? '#0F6E56' : 'var(--text-main)', 
              border: copiedLane === laneName ? '1px solid #0F6E56' : '1px solid var(--border-strong)', 
              background: copiedLane === laneName ? 'var(--status-success-bg)' : 'var(--surface-hover)', 
              borderRadius: '6px',
              transition: 'all 0.2s ease'
            }}
            title="Copy bảng này thành ảnh"
          >
            {copiedLane === laneName ? (
              <>
                <Check size={13} className="pop-success" style={{ color: '#0F6E56' }} /> 
                <span style={{ fontWeight: 600 }}>Đã Copy!</span>
              </>
            ) : (
              <>
                <Copy size={13} /> Copy Ảnh
              </>
            )}
          </button>
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
                <th colSpan="2" rowSpan="2" style={{ background: 'var(--action-primary-deep)', borderLeft: '1.5px solid rgba(255,255,255,0.4)', verticalAlign: 'middle' }}>
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
                <th colSpan="2" style={{ background: 'var(--action-primary-hover)', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
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
                              <td rowSpan={regs.length} className="lbl lbl-1" style={{ fontWeight: 'bold', verticalAlign: 'top', paddingTop: '0.6rem' }}>
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
    <div className={isFullscreen ? 'fullscreen-mode-active' : ''}>
      {/* Floating Exit Fullscreen Button */}
      {isFullscreen && (
        <button 
          onClick={() => setIsFullscreen && setIsFullscreen(false)}
          style={{
            position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
            background: '#e11d48', color: 'white', border: 'none',
            borderRadius: '50%', width: '40px', height: '40px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 15px rgba(225, 29, 72, 0.4)'
          }}
          title="Thoát toàn màn hình (Phím Esc)"
        >
          <X size={20} />
        </button>
      )}

      <div className={`density-${density}`}>
        <div className="export-toolbar">
          <div>
            <h2>Xuất dữ liệu Ca 1</h2>
            <p>Chọn bộ lọc và khoảng thời gian trước khi tải CSV.</p>
          </div>
          <button
            type="button"
            className="export-menu-trigger"
            onClick={() => setIsExportMenuOpen(open => !open)}
            aria-expanded={isExportMenuOpen}
            aria-controls="ca1-export-menu"
          >
            <Download size={17} />
            Export CSV
          </button>
        </div>

        {isExportMenuOpen && (
          <section id="ca1-export-menu" className="export-menu" aria-label="Bộ lọc xuất dữ liệu">
            <div className="export-menu-heading">
              <div>
                <span className="export-menu-icon"><Filter size={16} /></span>
                <strong>Bộ lọc dữ liệu export</strong>
              </div>
              <button type="button" className="export-menu-close" onClick={() => setIsExportMenuOpen(false)} aria-label="Đóng bộ lọc export">
                <X size={18} />
              </button>
            </div>

            <div className="export-filter-grid">
              <label>
                <span>Lane</span>
                <select value={exportFilters.lane} onChange={event => updateExportFilter('lane', event.target.value)}>
                  <option value="ALL">Tất cả lane</option>
                  {exportLanes.map(lane => <option key={lane} value={lane}>{lane}</option>)}
                </select>
              </label>
              <label>
                <span>Vùng giao</span>
                <select value={exportFilters.region} onChange={event => updateExportFilter('region', event.target.value)}>
                  <option value="ALL">Tất cả vùng</option>
                  {exportRegions.map(region => <option key={region} value={region}>{region}</option>)}
                </select>
              </label>
              <label>
                <span>Từ ngày</span>
                <input type="date" value={exportFilters.dateFrom} max={exportFilters.dateTo || undefined} onChange={event => updateExportFilter('dateFrom', event.target.value)} />
              </label>
              <label>
                <span>Đến ngày</span>
                <input type="date" value={exportFilters.dateTo} min={exportFilters.dateFrom || undefined} onChange={event => updateExportFilter('dateTo', event.target.value)} />
              </label>
            </div>

            <div className="export-menu-footer">
              <div className="export-preview-count" aria-live="polite">Sẵn sàng export <strong>{exportRows.length.toLocaleString('vi-VN')}</strong> dòng dữ liệu</div>
              <div className="export-menu-actions">
                <button type="button" className="export-text-button" onClick={useCurrentWeek} disabled={weekCurrent.length === 0}>
                  <CalendarRange size={16} /> Tuần hiện tại
                </button>
                <button type="button" className="export-text-button" onClick={resetExportFilters}>Xóa bộ lọc</button>
                <button type="button" className="export-confirm-button" onClick={handleExportCSV} disabled={exportRows.length === 0}>
                  <Download size={16} /> Tải CSV
                </button>
              </div>
            </div>
          </section>
        )}

        {lanes.map(lane => renderLaneTable(lane))}
      </div>
    </div>
  );
}
