// Shared, bounded presentation contract. Never interpret chart code from model text.
export const CHAT_CHART_LIMIT = 50;
export const CHAT_METRIC_LABELS = Object.freeze({ p1st: '1st Pickup', opr: 'OPR', d1st: '1st Delivery', odr: 'ODR' });
export const isChartQuestion = question => /biểu\s*đồ|đồ\s*thị|chart|trend|xu\s*hướng|theo\s*(từng\s*)?ngày|diễn\s*biến/i.test(question || '');
export function preserveChartQuestion(confirmedQuestion, originalQuestion) {
  return isChartQuestion(originalQuestion) ? `${confirmedQuestion}\nYêu cầu ban đầu: ${originalQuestion.slice(0, 2800)}` : confirmedQuestion;
}
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0, 10) === value;

export function chartNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function isChatChart(chart) {
  if (!chart || chart.version !== 1 || !['bar', 'line'].includes(chart.type)) return false;
  if (!Object.hasOwn(CHAT_METRIC_LABELS, chart.metric) || chart.unit !== '%' || typeof chart.title !== 'string' || chart.title.length > 180) return false;
  if (!chart.scope || typeof chart.scope.client !== 'string' || chart.scope.client.length > 40 || !validDate(chart.scope.dateFrom) || !validDate(chart.scope.dateTo) || chart.scope.dateFrom > chart.scope.dateTo) return false;
  for (const field of ['regions', 'hubTypes']) {
    if (chart.scope[field] != null && (!Array.isArray(chart.scope[field]) || chart.scope[field].length > 40 || chart.scope[field].some(item => typeof item !== 'string' || item.length > 120))) return false;
  }
  if (!Array.isArray(chart.points) || chart.points.length < 2 || chart.points.length > CHAT_CHART_LIMIT) return false;
  if (new Set(chart.points.map(point => point?.label)).size !== chart.points.length) return false;
  if (chart.type === 'line' && chart.points.some((point, index) => index > 0 && String(point?.label) <= String(chart.points[index - 1]?.label))) return false;
  return chart.points.every(point => point && typeof point.label === 'string' && point.label.length > 0 && point.label.length <= 120
    && (point.value === null || (typeof point.value === 'number' && Number.isFinite(point.value) && point.value >= 0 && point.value <= 100))
    && (point.volume === null || (typeof point.volume === 'number' && Number.isFinite(point.volume) && point.volume >= 0))
    && (chart.type !== 'line' || (validDate(point.label) && point.label >= chart.scope.dateFrom && point.label <= chart.scope.dateTo)))
    && chart.points.filter(point => point.value !== null).length >= 2;
}

export function formatChartValue(value) {
  return value === null ? 'Không có dữ liệu' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
}
