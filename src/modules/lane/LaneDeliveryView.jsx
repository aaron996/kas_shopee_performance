import React, { useMemo, useState } from 'react';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import StatusNotice from '../../components/ui/StatusNotice.jsx';
import { formatPct, formatVol, formatDateLabel, getContinuousColorStyle } from '../../utils/dataProcessor';
import { CLIENT_LABELS } from '../../utils/clientLabels.js';
import { LANE_DELIVERY_CLIENTS, LANE_DELIVERY_METRICS, buildLaneDeliveryTable, scopeLaneRowsByHubType } from '../../utils/laneDelivery.js';
import useLaneDelivery from './useLaneDelivery.js';

function MetricTable({ rows, client, metric }) {
  const table = useMemo(() => buildLaneDeliveryTable(rows, { client, metric }), [rows, client, metric]);
  const min = useMemo(() => {
    const values = [table.all, ...table.lanes].flatMap(l => [...Object.values(l.byDate), l.period]).map(c => c.pct).filter(v => v !== null && v > 0);
    return values.length ? Math.min(...values) : metric.target - 10;
  }, [table, metric]);
  const renderCell = (c, key) => <td key={key} style={getContinuousColorStyle(c.pct, metric.target, min)}>{formatPct(c.pct)}</td>;
  const renderRow = (l, strong) => (
    <tr key={l.key} className={strong ? 'all-row' : undefined}>
      <td className="lbl lbl-1"><strong>{l.label}</strong></td>
      {table.dates.map(d => renderCell(l.byDate[d], d))}
      <td className="sep" style={getContinuousColorStyle(l.period.pct, metric.target, min)}>{formatPct(l.period.pct)}</td>
      <td>{formatVol(l.period.total)}</td>
    </tr>
  );
  return (
    <div className="metric-block" style={{ marginBottom: '2rem' }}>
      <div className="metric-header" style={{ padding: '1rem 1.5rem' }}>
        <div className="metric-title">
          <span>{metric.label} theo lane · {CLIENT_LABELS[client] || client}</span>
          <span className="kpi-badge">Mục tiêu ≥ {metric.target}%</span>
        </div>
      </div>
      <div className="mtx-wrap">
        <table className="mtx-table">
          <thead>
            <tr>
              <th className="lbl lbl-1">Lane</th>
              {table.dates.map(d => <th key={d}>{formatDateLabel(d)}</th>)}
              <th className="sep">Cộng dồn {table.dates.length} ngày</th>
              <th>Đơn</th>
            </tr>
          </thead>
          <tbody>
            {renderRow(table.all, true)}
            {table.lanes.map(l => renderRow(l, false))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LaneDeliveryView({ density, selectedHubTypes, isHubTypeFiltered }) {
  const { status, rows: allRows, error, retry } = useLaneDelivery();
  // Nguồn không có region nên chỉ áp bộ lọc Loại Hub của header, và chỉ khi người dùng đã thu hẹp lựa chọn.
  const rows = useMemo(() => scopeLaneRowsByHubType(allRows, selectedHubTypes, isHubTypeFiltered), [allRows, selectedHubTypes, isHubTypeFiltered]);
  const [client, setClient] = useState(LANE_DELIVERY_CLIENTS[0]);

  if (status === 'loading') return <LoadingScreen variant="page" />;
  const clientRows = rows.filter(r => r.client_name === client);

  return (
    <div className={`density-${density}`}>
      <div role="group" aria-label="Dịch vụ" style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        {LANE_DELIVERY_CLIENTS.map(c => (
          <button key={c} type="button" className={c === client ? 'btn-primary' : 'btn-secondary'} aria-pressed={c === client}
            onClick={() => setClient(c)}>{CLIENT_LABELS[c] || c}</button>
        ))}
      </div>
      {status === 'error' && (
        <StatusNotice tone="danger">
          Không tải được Delivery theo lane{rows.length ? ' — đang hiển thị số đã tải trước đó' : ''}.{' '}
          <button type="button" className="btn-secondary" onClick={retry}>Thử lại</button>
          {error?.message ? <span style={{ marginLeft: '.5rem', opacity: .7 }}>{error.message}</span> : null}
        </StatusNotice>
      )}
      {clientRows.length > 0
        ? LANE_DELIVERY_METRICS.map(metric => <MetricTable key={metric.key} rows={rows} client={client} metric={metric} />)
        : status === 'ready' && <StatusNotice>Chưa có dữ liệu Delivery theo lane cho {CLIENT_LABELS[client] || client}.</StatusNotice>}
    </div>
  );
}
