import { useLayoutEffect, useRef, useState } from 'react';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateLabel } from '../../utils/dataProcessor';

const shortDate = date => formatDateLabel(date).split('\n')[0];

function TrendTooltip({ active, payload }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="overview-chart-tooltip"><span>{formatDateLabel(point.date).replace('\n', ' ')}</span><strong>{point.value.toFixed(1).replace('.', ',')}%</strong></div>;
}

export default function OverviewTrend({ card }) {
  const containerRef = useRef(null);
  const [tokens, setTokens] = useState(null);
  useLayoutEffect(() => {
    const styles = getComputedStyle(containerRef.current);
    const value = key => styles.getPropertyValue(`--overview-chart-${key}`).trim();
    const keys = ['axis-width', 'tick-gap', 'tick-margin', 'inset-top', 'inset-right', 'line-width', 'dot-radius', 'active-radius', 'label-size', 'dot-stroke'];
    setTokens(Object.fromEntries([...keys.map(key => [key, Number(value(key))]), ...['target-dash', 'cursor-dash'].map(key => [key, value(key)])]));
  }, []);
  const points = card.historyDates.map((date, index) => ({ date, time: Date.parse(`${date}T00:00:00Z`), value: card.history[index] })).filter(point => Number.isFinite(point.value) && Number.isFinite(point.time));
  if (points.length < 2) return <p ref={containerRef} className="home-empty">Cần ít nhất hai ngày có dữ liệu để hiển thị xu hướng.</p>;
  const values = points.map(point => point.value);
  if (card.target !== null) values.push(card.target);
  const low = Math.max(0, Math.floor(Math.min(...values) - 2));
  const high = Math.min(100, Math.ceil(Math.max(...values) + 1));
  const latest = points.at(-1);
  const lineColor = card.target !== null && latest.value < card.target ? 'var(--bad-red-text)' : 'var(--action-primary)';
  const dates = new Map(points.map(point => [point.time, point.date]));
  const ticks = [points[0].time, points[Math.floor((points.length - 1) / 2)].time, latest.time];
  return <div ref={containerRef} className="overview-trend-chart" aria-label={`Xu hướng ${card.title}, ${shortDate(points[0].date)} đến ${shortDate(latest.date)}, mới nhất ${latest.value.toFixed(1)} phần trăm${card.target !== null ? `, target ${card.target} phần trăm` : ''}`}>
    {tokens && <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: tokens['inset-top'], right: tokens['inset-right'], bottom: 0, left: 0 }} accessibilityLayer>
        <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} ticks={[...new Set(ticks)]} tickFormatter={time => shortDate(dates.get(time))} axisLine={false} tickLine={false} minTickGap={tokens['tick-gap']} tickMargin={tokens['tick-margin']} />
        <YAxis domain={[low, high]} tickCount={4} tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} width={tokens['axis-width']} />
        <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeDasharray: tokens['cursor-dash'] }} />
        {card.target !== null && <ReferenceLine y={card.target} stroke="var(--text-secondary)" strokeDasharray={tokens['target-dash']} label={{ value: `Target ${card.target}%`, position: 'insideTopRight', fill: 'var(--text-secondary)', fontSize: tokens['label-size'] }} />}
        <Line type="linear" dataKey="value" stroke={lineColor} strokeWidth={tokens['line-width']} dot={{ r: tokens['dot-radius'], fill: lineColor, strokeWidth: tokens['dot-stroke'] }} activeDot={{ r: tokens['active-radius'], stroke: 'var(--surface-default)', strokeWidth: tokens['line-width'] }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>}
  </div>;
}
