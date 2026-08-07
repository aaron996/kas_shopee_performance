import React, { useMemo } from 'react';
import { Award } from 'lucide-react';
import { createDefaultSellersDataset, TARGET_KPIS } from '../data/defaultDataset';
import { formatPct, formatVol, formatDateLabel, groupDatesByWeek, getContinuousColorStyle } from '../utils/dataProcessor';

export default function Report2TopSeller({ clientFilter, searchTerm }) {
  const sellerRows = useMemo(() => createDefaultSellersDataset(), []);

  // Filter sellers if search term or region filter
  const filteredData = useMemo(() => {
    let list = sellerRows;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(r => r.clientcontactname.toLowerCase().includes(term) || r.pickwh.toLowerCase().includes(term) || r.region.toLowerCase().includes(term));
    }
    return list;
  }, [sellerRows, searchTerm]);

  const dates = useMemo(() => [...new Set(filteredData.map(r => r.report_date))].sort(), [filteredData]);
  const { weekPrev, weekCurrent, d1Date } = useMemo(() => groupDatesByWeek(dates), [dates]);

  const renderSellerTable = (title, metricKey) => {
    const target = metricKey === '1st' ? TARGET_KPIS['1st Pickup'] : TARGET_KPIS['OPR'];
    const ontimeCol = metricKey === '1st' ? 'vol_lay_dung_hen_1st' : 'vol_lay_thanh_cong_dung_hen';

    // Calculate total late volume per seller to rank top N
    const sellerLateMap = {};
    filteredData.forEach(r => {
      const seller = r.clientcontactname;
      const late = (r.vol_lay || 0) - (r[ontimeCol] || 0);
      if (!sellerLateMap[seller]) sellerLateMap[seller] = 0;
      sellerLateMap[seller] += late;
    });

    const rankedSellers = Object.keys(sellerLateMap)
      .sort((a, b) => sellerLateMap[b] - sellerLateMap[a])
      .slice(0, 10);

    return (
      <div className="metric-block" key={title}>
        <div className="metric-header">
          <div className="metric-title">
            <Award size={18} style={{ color: '#F15A22' }} />
            <span>{title}</span>
            <span className="kpi-badge">Target ≥ {target.toFixed(0)}%</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
            Xếp hạng theo tổng đơn trễ tuyệt đối trong kỳ
          </div>
        </div>

        <div className="mtx-wrap">
          <table className="mtx-table">
            <thead>
              <tr>
                <th rowspan="2" className="lbl" style={{ left: 0, minWidth: '190px' }}>VIP Seller</th>
                <th rowspan="2" className="lbl" style={{ left: '190px', minWidth: '130px', boxShadow: '3px 0 5px rgba(0,0,0,0.08)' }}>PickWH</th>
                
                {weekPrev.length > 0 && <th colspan={weekPrev.length}>TUẦN W-1</th>}
                <th colspan={weekCurrent.length}>TUẦN WTD</th>
                
                {/* Total Vol column (Rowspan 2, before WTD) */}
                <th rowspan="2" style={{ background: '#004b82', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  Vol Total
                </th>

                {/* WTD % group (1 column under WTD) */}
                <th colspan="1" style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  WTD
                </th>
              </tr>

              <tr>
                {weekPrev.map((d, idx) => (
                  <th key={d} className={idx === 0 ? 'sep' : ''}>{formatDateLabel(d)}</th>
                ))}
                {weekCurrent.map(d => (
                  <th key={d}>{formatDateLabel(d)}</th>
                ))}
                <th style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  {metricKey === '1st' ? '% 1st Pickup' : '% OPR'}
                </th>
              </tr>
            </thead>

            <tbody>
              {/* Overall Total Row */}
              {(() => {
                let totalAllVol = 0, totalAllOntime = 0;
                const dailyAllMap = {};

                filteredData.forEach(r => {
                  const d = r.report_date;
                  const v = r.vol_lay || 0;
                  const o = r[ontimeCol] || 0;
                  totalAllVol += v;
                  totalAllOntime += o;

                  if (!dailyAllMap[d]) dailyAllMap[d] = { v: 0, o: 0 };
                  dailyAllMap[d].v += v;
                  dailyAllMap[d].o += o;
                });

                const allWtdPct = totalAllVol > 0 ? (totalAllOntime / totalAllVol) * 100 : null;

                return (
                  <tr className="all-row">
                    <td className="lbl" colspan="2" style={{ left: 0 }}>TOÀN BỘ VIP SELLER</td>
                    {weekPrev.map((d, idx) => {
                      const item = dailyAllMap[d] || { v: 0, o: 0 };
                      const pct = item.v > 0 ? (item.o / item.v) * 100 : null;
                      return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(pct, target, target - 10)}>{formatPct(pct)}</td>;
                    })}
                    {weekCurrent.map(d => {
                      const item = dailyAllMap[d] || { v: 0, o: 0 };
                      const pct = item.v > 0 ? (item.o / item.v) * 100 : null;
                      return <td key={d} style={getContinuousColorStyle(pct, target, target - 10)}>{formatPct(pct)}</td>;
                    })}
                    <td style={{ fontWeight: 'bold' }}>{formatVol(totalAllVol)}</td>
                    <td className="sep" style={getContinuousColorStyle(allWtdPct, target, target - 10)}>{formatPct(allWtdPct)}</td>
                  </tr>
                );
              })()}

              {/* Seller Rows */}
              {rankedSellers.map((sellerName, sIdx) => {
                const sellerData = filteredData.filter(r => r.clientcontactname === sellerName);

                // Group by PickWH for this seller
                const pickWhMap = {};
                sellerData.forEach(r => {
                  if (!pickWhMap[r.pickwh]) pickWhMap[r.pickwh] = [];
                  pickWhMap[r.pickwh].push(r);
                });

                const sortedPickWhs = Object.keys(pickWhMap).sort((a, b) => {
                  const volA = pickWhMap[a].reduce((acc, x) => acc + x.vol_lay, 0);
                  const volB = pickWhMap[b].reduce((acc, x) => acc + x.vol_lay, 0);
                  return volB - volA;
                });

                const rowspanCount = sortedPickWhs.length;

                return sortedPickWhs.map((wh, whIdx) => {
                  const whRows = pickWhMap[wh];
                  const dateMap = {};
                  let totalWhVol = 0, totalWhOntime = 0;

                  whRows.forEach(r => {
                    dateMap[r.report_date] = r;
                    totalWhVol += (r.vol_lay || 0);
                    totalWhOntime += (r[ontimeCol] || 0);
                  });

                  const wtdPct = totalWhVol > 0 ? (totalWhOntime / totalWhVol) * 100 : null;

                  return (
                    <tr key={`${sellerName}_${wh}`}>
                      {/* Seller Column with Rowspan (Only on first PickWH row) */}
                      {whIdx === 0 && (
                        <td 
                          className="lbl" 
                          rowspan={rowspanCount} 
                          style={{ 
                            left: 0, 
                            verticalAlign: 'top', 
                            fontWeight: 700, 
                            background: sIdx % 2 === 0 ? '#ffffff' : '#f8fafc' 
                          }}
                        >
                          <div>{sellerName}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>
                            Rank #{sIdx + 1} Late
                          </div>
                        </td>
                      )}

                      {/* PickWH Column */}
                      <td 
                        className="lbl" 
                        style={{ 
                          left: '190px', 
                          boxShadow: '3px 0 5px rgba(0,0,0,0.08)',
                          background: sIdx % 2 === 0 ? '#ffffff' : '#f8fafc'
                        }}
                      >
                        {wh}
                      </td>

                      {/* Daily Dates */}
                      {weekPrev.map((d, idx) => {
                        const r = dateMap[d];
                        const pct = r && r.vol_lay > 0 ? (r[ontimeCol] / r.vol_lay) * 100 : null;
                        return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(pct, target, target - 10)}>{formatPct(pct)}</td>;
                      })}

                      {weekCurrent.map(d => {
                        const r = dateMap[d];
                        const pct = r && r.vol_lay > 0 ? (r[ontimeCol] / r.vol_lay) * 100 : null;
                        return <td key={d} style={getContinuousColorStyle(pct, target, target - 10)}>{formatPct(pct)}</td>;
                      })}

                      {/* Total Volume */}
                      <td style={{ fontWeight: 'bold' }}>{formatVol(totalWhVol)}</td>

                      {/* WTD % */}
                      <td className="sep" style={getContinuousColorStyle(wtdPct, target, target - 10)}>{formatPct(wtdPct)}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <Award size={22} style={{ color: '#F15A22' }} />
          Báo Cáo 2: Top N Seller VIP (Seller + PickWH)
        </h2>
        <div className="section-desc">
          Xếp hạng các VIP Seller đóng góp nhiều đơn late nhất. Hiển thị 2 cột nhãn sticky (Seller + PickWH), không dùng toggle collapse.
        </div>
      </div>

      {renderSellerTable('1. Top 10 VIP Seller trễ 1st Pickup nhiều nhất', '1st')}
      {renderSellerTable('2. Top 10 VIP Seller trễ OPR nhiều nhất', 'OPR')}
    </div>
  );
}
