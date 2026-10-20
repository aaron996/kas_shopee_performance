import React, { useId, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatChartValue, isChatChart } from '../../utils/chatChart';
import './chat-chart.css';

const shortDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}` : value;
const fullDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${shortDate(value)}/${value.slice(0, 4)}` : value;
const shortLabel = value => value.length > 16 ? `${value.slice(0, 15)}…` : value;
const count = value => value === null ? '—' : value.toLocaleString('vi-VN');

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="chat-chart-tooltip"><strong>{point.label}</strong><span>{formatChartValue(point.value)}</span><span>Mẫu: {count(point.volume)} đơn</span></div>;
}

export default function ChatChart({ chart, dataAsOf }) {
  const titleId = useId();
  const valid = isChatChart(chart);
  const points = useMemo(() => valid ? chart.points.slice(0, chart.type === 'bar' ? 12 : 50) : [], [chart, valid]);
  if (!valid) return null;
  const isLine = chart.type === 'line';
  const { scope } = chart;
  const height = isLine ? 240 : Math.max(200, points.length * 30 + 30);
  const common = { data: points, accessibilityLayer: true, margin: { top: 8, right: 16, bottom: 4, left: 0 } };
  return <figure className="chat-chart" aria-labelledby={titleId}>
    <figcaption>
      <h3 id={titleId}>{chart.title}</h3>
      <p>{scope.client} · {fullDate(scope.dateFrom)}–{fullDate(scope.dateTo)}</p>
      {scope.regions?.length > 0 && <p>Vùng: {scope.regions.join(', ')}</p>}
      {scope.hubTypes?.length > 0 && <p>Loại hub: {scope.hubTypes.join(', ')}</p>}
    </figcaption>
    <div className="chat-chart-canvas" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {isLine ? <LineChart {...common}>
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
          <XAxis dataKey="label" tickFormatter={shortDate} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} minTickGap={16} />
          <YAxis domain={[0, 100]} width={40} tickFormatter={value => `${value}%`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="linear" dataKey="value" name={chart.metric.toUpperCase()} stroke="var(--action-primary)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        </LineChart> : <BarChart {...common} layout="vertical">
          <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
          <YAxis type="category" dataKey="label" width={105} tickFormatter={shortLabel} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} interval={0} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="value" name={chart.metric.toUpperCase()} fill="var(--action-primary)" radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>}
      </ResponsiveContainer>
    </div>
    {!isLine && <p className="chat-chart-note">Hiển thị {points.length}/{chart.points.length} nhóm được trả về; kết quả truy vấn có thể chỉ gồm các nhóm được chọn/xếp hạng.</p>}
    {chart.points.some(point => point.value === null) && <p className="chat-chart-note">Khoảng trống là ngày/nhóm không có tỷ lệ, không được quy thành 0.</p>}
    {dataAsOf && <p className="chat-chart-note">Dữ liệu đến {fullDate(dataAsOf)}.</p>}
    <details className="chat-chart-data"><summary>Xem số liệu biểu đồ</summary>
      <div className="chat-chart-table-wrap"><table><caption>{chart.title} — số liệu truy vấn</caption><thead><tr><th scope="col">{isLine ? 'Ngày' : scope.grain === 'hub' ? 'Hub' : 'Vùng'}</th><th scope="col">Tỷ lệ</th><th scope="col">Mẫu (đơn)</th></tr></thead>
        <tbody>{chart.points.map(point => <tr key={point.label}><th scope="row">{point.label}</th><td>{formatChartValue(point.value)}</td><td>{count(point.volume)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </figure>;
}
