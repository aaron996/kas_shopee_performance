import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatPct, formatVol, getHeatTier, getHigherIsWorseTier } from '../../utils/dataProcessor';

// Bảng Toàn quốc > Miền > Vùng > Hub x cột thời gian (mỗi cột hai ô: % và volume), dùng chung cho
// "Theo tuần" (cột = tuần) và "Theo ngày" có khoảng ngày (cột = ngày). `matrix` do buildWeeklyMatrix dựng.
export default function KpiMatrixTable({ matrix, lastLabel = 'tuần gần nhất', showVolume = true, horizontalScroll = false }) {
  const { metric } = matrix;
  const [expanded, setExpanded] = useState({});

  const tier = pct => (metric.isFd
    ? getHigherIsWorseTier(pct, 3, matrix.maxPct)
    : getHeatTier(pct, metric.target));
  const heat = (pct, ...extra) => {
    const t = tier(pct);
    const className = [...extra, t > 0 && `heat heat-${t}`, 'grp-start'].filter(Boolean).join(' ');
    return { className };
  };
  const cells = (stats, bold = false) => stats.map((s, i) => (
    <React.Fragment key={matrix.weeks[i].start}>
      <td {...heat(s.pct)}>{formatPct(s.pct)}</td>
      {showVolume && <td style={bold ? { fontWeight: 'bold' } : undefined}>{formatVol(s.tot)}</td>}
    </React.Fragment>
  ));

  return (
    <div className={`mtx-wrap report1-master-table${horizontalScroll ? ' daily-matrix-scroll' : ''}`}
      role={horizontalScroll ? 'region' : undefined} tabIndex={horizontalScroll ? 0 : undefined}
      aria-label={horizontalScroll ? 'Bảng performance theo ngày, cuộn ngang để xem đầy đủ' : undefined}
      style={{ '--thead-h': '72px', '--allrow-h': '39px' }}>
      <table className="mtx-table weekly-kpi-table">
        <thead>
          <tr>
            <th rowSpan="2" className="lbl">{metric.isFd ? 'Vùng / Kho giao' : 'Vùng / Hub'}</th>
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
        </thead>
        <tbody>
          <tr className="all-row">
            <td className="lbl all-row-label">TOÀN QUỐC</td>
            {cells(matrix.all, true)}
          </tr>
          {matrix.miens.map(m => (
            <React.Fragment key={m.mien}>
              <tr className="grp-row">
                <td className="lbl grp-total-label">{m.mien}</td>
                {cells(m.stats)}
              </tr>
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
                          aria-label={`${open ? 'Thu gọn' : 'Mở'} ${metric.isFd ? 'kho giao' : 'hub'} của ${reg.region}`}
                          onClick={() => setExpanded(prev => ({ ...prev, [reg.region]: !prev[reg.region] }))}
                        >
                          <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                          <strong>{reg.region}</strong>
                        </button>
                      </td>
                      {cells(reg.stats)}
                    </tr>
                    {open && reg.hubs.map(hub => (
                      <tr key={hub.id} data-hub-row="true">
                        <td className="lbl weekly-kpi-hub">{hub.name}</td>
                        {cells(hub.stats)}
                      </tr>
                    ))}
                    {open && reg.hubCount > reg.hubs.length && (
                      <tr>
                        <td className="lbl weekly-kpi-hub weekly-kpi-more" colSpan={1 + matrix.weeks.length * (showVolume ? 2 : 1)}>
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
  );
}
