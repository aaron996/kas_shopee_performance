import { CHAT_METRIC_LABELS, chartNumber, isChatChart } from '../../src/utils/chatChart.js';

// Only database tools with an audited metric shape may create a chart. The model
// supplies neither chart values nor JSX; the authenticated RPC result owns both.
export function chartFromEvidence(toolName, result, scope) {
  if (!['get_metric_summary', 'get_latest_metric_summary', 'get_metric_trend'].includes(toolName)) return null;
  if (typeof result?.evidenceId !== 'string' || !result.evidenceId.startsWith('db_')) return null;
  const metric = result.data?.metric || result.params?.p_metric;
  if (!Object.hasOwn(CHAT_METRIC_LABELS, metric) || !['region', 'hub', 'day'].includes(scope?.grain)) return null;
  const rows = result.data?.rows;
  if (!Array.isArray(rows) || rows.length > 50 || rows.length < 2) return null;
  const points = rows.map(row => {
    if (!row || typeof row !== 'object') return null;
    const value = chartNumber(row.value);
    const volume = chartNumber(row.volume);
    // NULL is a gap. Malformed numbers never turn into zero or silently disappear.
    if ((row.value !== null && row.value !== undefined && value === null) || (value !== null && value > 100)) return null;
    return { label: scope.grain === 'day' ? row.date : row.entity, value: volume === 0 ? null : value, volume };
  });
  if (points.some(point => !point) || new Set(points.map(point => point.label)).size !== points.length) return null;
  if (scope.grain === 'day') points.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const chart = {
    version: 1,
    type: scope.grain === 'day' ? 'line' : 'bar',
    title: `${CHAT_METRIC_LABELS[metric]} ${scope.grain === 'day' ? 'theo ngày' : scope.grain === 'hub' ? 'theo hub' : 'theo vùng'}`,
    metric, unit: '%', scope, points,
  };
  return isChatChart(chart) ? chart : null;
}
