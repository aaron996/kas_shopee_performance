import React, { useState, useMemo } from 'react';
import { Target, AlertTriangle } from 'lucide-react';
import { TARGET_KPIS } from '../data/defaultDataset';
import { formatPct, formatVol, formatDateLabel, groupDatesByWeek, getFixed3TierColorStyle } from '../utils/dataProcessor';

export default function Report4Focus1Vung({ pickRows, deliRows, clientFilter, searchTerm }) {
  const [selectedRegion, setSelectedRegion] = useState('HNO');

  const regionOptions = ['HNO', 'HCM', 'DBB', 'TTB', 'TNB', 'DNB', 'TNT'];

  const filteredPick = useMemo(() => {
    let list = clientFilter === 'ALL' ? pickRows : pickRows.filter(r => r.client_name === clientFilter);
    return list.filter(r => r.region === selectedRegion);
  }, [pickRows, clientFilter, selectedRegion]);

  const filteredDeli = useMemo(() => {
    let list = clientFilter === 'ALL' ? deliRows : deliRows.filter(r => r.client_name === clientFilter);
    return list.filter(r => r.region === selectedRegion);
  }, [deliRows, clientFilter, selectedRegion]);

  const pickDates = useMemo(() => [...new Set(filteredPick.map(r => r.report_date))].sort(), [filteredPick]);
  const deliDates = useMemo(() => [...new Set(filteredDeli.map(r => r.report_date))].sort(), [filteredDeli]);

  const { weekPrev: pWPrev, weekCurrent: pWCur, d1Date: pD1 } = useMemo(() => groupDatesByWeek(pickDates), [pickDates]);
  const { weekPrev: dWPrev, weekCurrent: dWCur, d1Date: dD1 } = useMemo(() => groupDatesByWeek(deliDates), [deliDates]);

  const renderFocusTable = (title, metricKey, isDeli = false) => {
    const rows = isDeli ? filteredDeli : filteredPick;
    const weekPrev = isDeli ? dWPrev : pWPrev;
    const weekCur = isDeli ? dWCur : pWCur;
    const d1Date = isDeli ? dD1 : pD1;
    const target = TARGET_KPIS[title] || 90.0;

    const totalCol = isDeli ? 'mau_del' : 'mau_pu';
    const ontimeCol = metricKey === '1st' ? (isDeli ? 'ontime_del_1st' : 'ontime_pu_1st') : (isDeli ? 'ontime_del_odr' : 'ontime_pu_opr');

    // Hub level statistics by date
    const hubDateMap = {}; // key: hub_date
    const hubTotalVolD1 = {};

    rows.forEach(r => {
      const d = r.report_date;
      const h = r.hub;
      const key = `${h}_${d}`;
      if (!hubDateMap[key]) hubDateMap[key] = { tot: 0, ont: 0 };
      hubDateMap[key].tot += (r[totalCol] || 0);
      hubDateMap[key].ont += (r[ontimeCol] || 0);

      if (d === d1Date) {
        hubTotalVolD1[h] = (hubTotalVolD1[h] || 0) + (r[totalCol] || 0);
      }
    });

    // Sort hubs by D-1 volume descending
    const allHubs = Object.keys(hubTotalVolD1).sort((a, b) => hubTotalVolD1[b] - hubTotalVolD1[a]);

    // Aggregate stats function
    const getHubStats = (h, dates) => {
      let tot = 0, ont = 0;
      dates.forEach(d => {
        const item = hubDateMap[`${h}_${d}`];
        if (item) {
          tot += item.tot;
          ont += item.ont;
        }
      });
      const pct = tot > 0 ? (ont / tot) * 100 : null;
      return { tot, ont, pct };
    };

    // Calculate Region Summary Row stats
    const getRegionStats = (dates) => {
      let tot = 0, ont = 0;
      allHubs.forEach(h => {
        dates.forEach(d => {
          const item = hubDateMap[`${h}_${d}`];
          if (item) {
            tot += item.tot;
            ont += item.ont;
          }
        });
      });
      const pct = tot > 0 ? (ont / tot) * 100 : null;
      return { tot, ont, pct };
    };

    // Prepare Secondary Table Data: Hubs failing KPI on D-1 sorted by absolute late volume descending
    const secondaryFailedHubs = allHubs.map(h => {
      const d1S = getHubStats(h, [d1Date]);
      const late = d1S.tot - d1S.ont;
      return { hub: h, pct: d1S.pct, late, tot: d1S.tot };
    })
    .filter(x => x.pct !== null && x.pct < target)
    .sort((a, b) => b.late - a.late)
    .slice(0, 10);

    return (
      <div key={title} style={{ marginBottom: '2.5rem' }}>
        <div className="metric-block" style={{ marginBottom: '1rem' }}>
          <div className="metric-header" style={{ background: 'var(--action-primary-hover)', color: 'white' }}>
            <div className="metric-title" style={{ color: 'white' }}>
              <span>{title} — Vùng {selectedRegion}</span>
              <span className="kpi-badge" style={{ background: '#F15A22', color: 'white' }}>Target ≥ {target}%</span>
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
              Sticky 10-row container • Rule 3 màu cố định
            </div>
          </div>

          {/* Table Container with scrollable max height */}
          <div className="mtx-wrap" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table className="mtx-table report4-grid">
              <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                <tr>
                  <th rowspan="2" className="lbl" style={{ background: '#00365e', color: 'white' }}>
                    Hub ({selectedRegion})
                  </th>

                  {/* Week W-1 with extra WTD column */}
                  {weekPrev.length > 0 && (
                    <th colspan={weekPrev.length + 1} style={{ background: 'var(--action-primary-hover)' }}>
                      TUẦN W-1 (+ WTD W-1)
                    </th>
                  )}

                  {/* Week WTD */}
                  <th colspan={weekCur.slice(0, -1).length} style={{ background: '#00365e' }}>
                    TUẦN WTD <span style={{ background: '#F15A22', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.7rem' }}>HIỆN TẠI</span>
                  </th>

                  {/* D-1 Column */}
                  <th colspan="2" style={{ background: '#002540' }}>
                    {formatDateLabel(d1Date)}
                  </th>

                  {/* WTD Column */}
                  <th colspan="2" style={{ background: '#001a2e' }}>
                    WTD
                  </th>
                </tr>

                <tr>
                  {weekPrev.map((d, idx) => (
                    <th key={d} style={{ background: 'var(--action-primary-hover)' }}>{formatDateLabel(d)}</th>
                  ))}
                  {/* W-1 WTD Header */}
                  <th style={{ background: '#00365e', borderLeft: '2px solid #F15A22' }}>W-1 WTD</th>

                  {weekCur.slice(0, -1).map(d => (
                    <th key={d} style={{ background: '#00365e' }}>{formatDateLabel(d)}</th>
                  ))}

                  <th style={{ background: '#002540' }}>% D-1</th>
                  <th style={{ background: '#002540' }}>Vol D-1</th>

                  <th style={{ background: '#001a2e' }}>% WTD</th>
                  <th style={{ background: '#001a2e' }}>Vol WTD</th>
                </tr>
              </thead>

              <tbody>
                {/* Region Summary Row */}
                <tr className="all-row" style={{ position: 'sticky', top: '75px', zIndex: 15 }}>
                  <td className="lbl">TỔNG VÙNG {selectedRegion}</td>
                  {weekPrev.map(d => {
                    const s = getRegionStats([d]);
                    return <td key={d} style={getFixed3TierColorStyle(s.pct, target)}>{formatPct(s.pct)}</td>;
                  })}
                  {/* W-1 WTD */}
                  {(() => {
                    const w1S = getRegionStats(weekPrev);
                    return <td className="sep" style={getFixed3TierColorStyle(w1S.pct, target)}>{formatPct(w1S.pct)}</td>;
                  })()}

                  {weekCur.slice(0, -1).map(d => {
                    const s = getRegionStats([d]);
                    return <td key={d} style={getFixed3TierColorStyle(s.pct, target)}>{formatPct(s.pct)}</td>;
                  })}

                  {(() => {
                    const d1S = getRegionStats([d1Date]);
                    const wtdS = getRegionStats(weekCur);
                    return (
                      <>
                        <td className="sep" style={getFixed3TierColorStyle(d1S.pct, target)}>{formatPct(d1S.pct)}</td>
                        <td style={{ fontWeight: 'bold' }}>{formatVol(d1S.tot)}</td>
                        <td className="sep" style={getFixed3TierColorStyle(wtdS.pct, target)}>{formatPct(wtdS.pct)}</td>
                        <td style={{ fontWeight: 'bold' }}>{formatVol(wtdS.tot)}</td>
                      </>
                    );
                  })()}
                </tr>

                {/* Hub Rows sorted by D-1 volume descending */}
                {allHubs.map(hub => {
                  const w1S = getHubStats(hub, weekPrev);
                  const d1S = getHubStats(hub, [d1Date]);
                  const wtdS = getHubStats(hub, weekCur);

                  return (
                    <tr key={hub}>
                      <td className="lbl">{hub}</td>
                      {weekPrev.map(d => {
                        const s = getHubStats(hub, [d]);
                        return <td key={d} style={getFixed3TierColorStyle(s.pct, target)}>{formatPct(s.pct)}</td>;
                      })}
                      <td className="sep" style={getFixed3TierColorStyle(w1S.pct, target)}>{formatPct(w1S.pct)}</td>

                      {weekCur.slice(0, -1).map(d => {
                        const s = getHubStats(hub, [d]);
                        return <td key={d} style={getFixed3TierColorStyle(s.pct, target)}>{formatPct(s.pct)}</td>;
                      })}

                      <td className="sep" style={getFixed3TierColorStyle(d1S.pct, target)}>{formatPct(d1S.pct)}</td>
                      <td>{formatVol(d1S.tot)}</td>

                      <td className="sep" style={getFixed3TierColorStyle(wtdS.pct, target)}>{formatPct(wtdS.pct)}</td>
                      <td>{formatVol(wtdS.tot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-legend">
            <div className="legend-items">
              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Rule 3 màu cố định (Anh Long GĐV):</span>
              <div className="legend-item">
                <div className="legend-box" style={{ background: '#EAF3DE' }}></div>
                <span>≥ {target}% (Đạt KPI)</span>
              </div>
              <div className="legend-item">
                <div className="legend-box" style={{ background: '#EDEBE6' }}></div>
                <span>{(target - 2).toFixed(0)}% – {target}% (Sát KPI)</span>
              </div>
              <div className="legend-item">
                <div className="legend-box" style={{ background: '#F7D9D4' }}></div>
                <span>&lt; {(target - 2).toFixed(0)}% (Trễ KPI)</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECONDARY TABLE: 10 BC TỆ THEO LƯỢNG ĐƠN TRỄ */}
        <div className="sub-table-container">
          <div className="sub-table-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={17} style={{ color: '#E8362C' }} />
            10 BC tệ chỉ số {title} theo lượng đơn trễ (Ngày {formatDateLabel(d1Date)})
          </div>

          {secondaryFailedHubs.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: '#0F6E56', fontStyle: 'italic' }}>
              ✓ Không có Bưu cục nào fail KPI ({target}%) tại ngày {formatDateLabel(d1Date)}. Xuất sắc!
            </div>
          ) : (
            <table className="mtx-table report4-grid" style={{ width: '100%', maxWidth: '650px' }}>
              <thead>
                <tr>
                  <th style={{ background: 'var(--action-primary-hover)', textAlign: 'left' }}>Bưu cục / Hub</th>
                  <th style={{ background: 'var(--action-primary-hover)' }}>% {title} D-1</th>
                  <th style={{ background: '#E8362C', color: 'white' }}>Đơn trễ D-1</th>
                  <th style={{ background: 'var(--action-primary-hover)' }}>Tổng đơn D-1</th>
                </tr>
              </thead>
              <tbody>
                {secondaryFailedHubs.map(item => (
                  <tr key={item.hub}>
                    <td className="lbl" style={{ fontWeight: 600 }}>{item.hub}</td>
                    <td style={getFixed3TierColorStyle(item.pct, target)}>{formatPct(item.pct)}</td>
                    <td style={{ fontWeight: 'bold', color: '#E8362C' }}>{formatVol(item.late)}</td>
                    <td>{formatVol(item.tot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <Target size={22} style={{ color: '#F15A22' }} />
          Báo Cáo 4: Bản "Focus 1 Vùng" ({selectedRegion})
        </h2>
        <div className="section-desc">
          Bản rút gọn chỉ tập trung 1 Vùng cụ thể — Viền 1px đen full grid, rule 3 màu cố định, và bảng phụ "10 BC tệ theo lượng đơn trễ".
        </div>

        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Chọn Vùng Focus:</span>
          {regionOptions.map(reg => (
            <button
              key={reg}
              className={`btn-secondary ${selectedRegion === reg ? 'primary' : ''}`}
              style={{
                background: selectedRegion === reg ? '#F15A22' : '#f1f5f9',
                color: selectedRegion === reg ? 'white' : '#1e293b',
                fontWeight: selectedRegion === reg ? 'bold' : 'normal'
              }}
              onClick={() => setSelectedRegion(reg)}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      {renderFocusTable('1st Pickup', '1st', false)}
      {renderFocusTable('OPR', 'OPR', false)}
      {renderFocusTable('1st Deli', '1st', true)}
      {renderFocusTable('ODR', 'ODR', true)}
    </div>
  );
}
