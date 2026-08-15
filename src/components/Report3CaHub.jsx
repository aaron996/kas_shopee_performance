import React, { useState, useMemo } from 'react';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { createDefaultDeliDataset } from '../data/defaultDataset';
import { formatPct, formatVol, formatDateLabel, groupDatesByWeek, getPercentile3ColorStyle } from '../utils/dataProcessor';

export default function Report3CaHub({ clientFilter, searchTerm }) {
  const deliRows = useMemo(() => createDefaultDeliDataset(), []);
  const [collapsedCas, setCollapsedCas] = useState({});

  const toggleCa = (caKey) => {
    setCollapsedCas(prev => ({ ...prev, [caKey]: !prev[caKey] }));
  };

  const dates = useMemo(() => [...new Set(deliRows.map(r => r.report_date))].sort(), [deliRows]);
  const { weekPrev, weekCurrent, d1Date } = useMemo(() => groupDatesByWeek(dates), [dates]);

  // Generate synthetic Shift 1 / Shift 2 %GTC data from deli rows
  const caData = useMemo(() => {
    const list = [];
    deliRows.forEach(r => {
      // Create Ca 1 & Ca 2 records
      const totalMang = r.mau_del;
      const mangCa1 = Math.round(totalMang * 0.65);
      const mangCa2 = totalMang - mangCa1;

      const tcCa1 = Math.round(mangCa1 * (0.78 + Math.random() * 0.18));
      const tcCa2 = Math.round(mangCa2 * (0.65 + Math.random() * 0.22));

      list.push({
        report_date: r.report_date,
        ca: 'Ca 1 (08:00 - 12:00)',
        ca_short: 'Ca 1',
        hub: r.hub,
        region: r.region,
        sl_mang_di_giao: mangCa1,
        sl_giao_thanh_cong: tcCa1
      });

      list.push({
        report_date: r.report_date,
        ca: 'Ca 2 (13:00 - 18:00)',
        ca_short: 'Ca 2',
        hub: r.hub,
        region: r.region,
        sl_mang_di_giao: mangCa2,
        sl_giao_thanh_cong: tcCa2
      });
    });
    return list;
  }, [deliRows]);

  // Calculate percentiles p25 and p75 for 3-color rule
  const { p25, p75 } = useMemo(() => {
    const pcts = caData.map(r => r.sl_mang_di_giao > 0 ? (r.sl_giao_thanh_cong / r.sl_mang_di_giao) * 100 : null)
      .filter(v => v !== null)
      .sort((a, b) => a - b);

    if (pcts.length === 0) return { p25: 60, p75: 84 };
    const p25Idx = Math.floor(pcts.length * 0.25);
    const p75Idx = Math.floor(pcts.length * 0.75);

    return { p25: pcts[p25Idx] || 60, p75: pcts[p75Idx] || 84 };
  }, [caData]);

  // Aggregate stats helper
  const getAggStats = (filterFn, dateStr) => {
    let mang = 0, tc = 0;
    caData.filter(r => r.report_date === dateStr && filterFn(r)).forEach(r => {
      mang += r.sl_mang_di_giao;
      tc += r.sl_giao_thanh_cong;
    });
    const pct = mang > 0 ? (tc / mang) * 100 : null;
    return { mang, tc, pct };
  };

  const getWtdStats = (filterFn) => {
    let mang = 0, tc = 0;
    caData.filter(r => weekCurrent.includes(r.report_date) && filterFn(r)).forEach(r => {
      mang += r.sl_mang_di_giao;
      tc += r.sl_giao_thanh_cong;
    });
    const pct = mang > 0 ? (tc / mang) * 100 : null;
    return { mang, tc, pct };
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <Clock size={22} style={{ color: '#F15A22' }} />
          Báo Cáo 3: Ma Trận Ca Làm Việc → Hub (%GTC)
        </h2>
        <div className="section-desc">
          Báo cáo Tỷ lệ giao thành công (%GTC = SL Giao TC / SL Mang đi giao) phân theo Ca 1 và Ca 2, mặc định mở sẵn level Hub.
        </div>
      </div>

      <div className="metric-block">
        <div className="metric-header">
          <div className="metric-title">
            <span>Ma trận %GTC Phân Theo Ca Làm Việc & Hub</span>
            <span className="kpi-badge">Percentile 3 Màu Rời Rạc</span>
          </div>
        </div>

        <div className="mtx-wrap">
          <table className="mtx-table">
            <thead>
              <tr>
                <th rowspan="2" className="lbl">Ca Làm Việc / Hub</th>
                {weekPrev.length > 0 && <th colspan={weekPrev.length}>TUẦN W-1</th>}
                <th colspan={weekCurrent.length}>TUẦN WTD</th>
                <th colspan="2" style={{ background: 'var(--action-primary-deep)', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  WTD %GTC
                </th>
              </tr>

              <tr>
                {weekPrev.map((d, idx) => (
                  <th key={d} className={idx === 0 ? 'sep' : ''}>{formatDateLabel(d)}</th>
                ))}
                {weekCurrent.map(d => (
                  <th key={d}>{formatDateLabel(d)}</th>
                ))}
                <th style={{ background: 'var(--action-primary-deep)', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>%GTC WTD</th>
                <th style={{ background: 'var(--action-primary-deep)' }}>Vol WTD</th>
              </tr>
            </thead>

            <tbody>
              {/* TOÀN BỘ ROW */}
              <tr className="all-row">
                <td className="lbl">TOÀN BỘ (CA 1 + CA 2)</td>
                {weekPrev.map((d, idx) => {
                  const s = getAggStats(() => true, d);
                  return <td key={d} className={idx === 0 ? 'sep' : ''} style={getPercentile3ColorStyle(s.pct, p25, p75)}>{formatPct(s.pct)}</td>;
                })}
                {weekCurrent.map(d => {
                  const s = getAggStats(() => true, d);
                  return <td key={d} style={getPercentile3ColorStyle(s.pct, p25, p75)}>{formatPct(s.pct)}</td>;
                })}
                {(() => {
                  const wtd = getWtdStats(() => true);
                  return (
                    <>
                      <td className="sep" style={getPercentile3ColorStyle(wtd.pct, p25, p75)}>{formatPct(wtd.pct)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(wtd.mang)}</td>
                    </>
                  );
                })()}
              </tr>

              {/* CA 1 & CA 2 GROUPS */}
              {['Ca 1', 'Ca 2'].map((caShort, caIdx) => {
                const isCollapsed = !!collapsedCas[caShort];
                const caFullName = caShort === 'Ca 1' ? 'Ca 1 (08:00 - 12:00)' : 'Ca 2 (13:00 - 18:00)';
                
                // Get Top 10 Hubs for this shift based on absolute fail count (mang - tc)
                const hubFailMap = {};
                caData.filter(r => r.ca_short === caShort && r.report_date === d1Date).forEach(r => {
                  const fail = r.sl_mang_di_giao - r.sl_giao_thanh_cong;
                  hubFailMap[r.hub] = (hubFailMap[r.hub] || 0) + fail;
                });

                const top10Hubs = Object.keys(hubFailMap).sort((a, b) => hubFailMap[b] - hubFailMap[a]).slice(0, 10);

                return (
                  <React.Fragment key={caShort}>
                    {/* Shift Row Header */}
                    <tr className="grp-row" style={caIdx === 1 ? { borderTop: '2px solid #F15A22' } : {}}>
                      <td className="lbl" style={{ background: 'var(--info-box-bg)', color: 'var(--info-box-text)', fontWeight: 700 }}>
                        <button className="toggle-btn" onClick={() => toggleCa(caShort)}>
                          {!isCollapsed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        {caFullName}
                      </td>
                      {weekPrev.map((d, idx) => {
                        const s = getAggStats(r => r.ca_short === caShort, d);
                        return <td key={d} className={idx === 0 ? 'sep' : ''} style={getPercentile3ColorStyle(s.pct, p25, p75)}>{formatPct(s.pct)}</td>;
                      })}
                      {weekCurrent.map(d => {
                        const s = getAggStats(r => r.ca_short === caShort, d);
                        return <td key={d} style={getPercentile3ColorStyle(s.pct, p25, p75)}>{formatPct(s.pct)}</td>;
                      })}
                      {(() => {
                        const wtd = getWtdStats(r => r.ca_short === caShort);
                        return (
                          <>
                            <td className="sep" style={getPercentile3ColorStyle(wtd.pct, p25, p75)}>{formatPct(wtd.pct)}</td>
                            <td style={{ fontWeight: 'bold' }}>{formatVol(wtd.mang)}</td>
                          </>
                        );
                      })()}
                    </tr>

                    {/* Top 10 Hub Sub-rows (Expanded by default) */}
                    {!isCollapsed && top10Hubs.map(hub => {
                      const hubWtd = getWtdStats(r => r.ca_short === caShort && r.hub === hub);
                      return (
                        <tr key={hub} className="sub-row">
                          <td className="lbl">{hub}</td>
                          {weekPrev.map((d, idx) => {
                            const s = getAggStats(r => r.ca_short === caShort && r.hub === hub, d);
                            return <td key={d} className={idx === 0 ? 'sep' : ''} style={getPercentile3ColorStyle(s.pct, p25, p75)}>{formatPct(s.pct)}</td>;
                          })}
                          {weekCurrent.map(d => {
                            const s = getAggStats(r => r.ca_short === caShort && r.hub === hub, d);
                            return <td key={d} style={getPercentile3ColorStyle(s.pct, p25, p75)}>{formatPct(s.pct)}</td>;
                          })}
                          <td className="sep" style={getPercentile3ColorStyle(hubWtd.pct, p25, p75)}>{formatPct(hubWtd.pct)}</td>
                          <td>{formatVol(hubWtd.mang)}</td>
                        </tr>
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
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Rule màu (Percentiles rải rác):</span>
            <div className="legend-item">
              <div className="legend-box" style={{ background: '#EAF3DE' }}></div>
              <span>Xanh: ≥ {p75.toFixed(1)}% (Top 25% cao nhất)</span>
            </div>
            <div className="legend-item">
              <div className="legend-box" style={{ background: '#FEF3C7' }}></div>
              <span>Vàng: {p25.toFixed(1)}% – {p75.toFixed(1)}%</span>
            </div>
            <div className="legend-item">
              <div className="legend-box" style={{ background: '#F7D9D4' }}></div>
              <span>Đỏ: &lt; {p25.toFixed(1)}% (Bottom 25%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
