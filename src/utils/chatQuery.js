const METRIC_LABELS = Object.freeze({ p1st: 'P1ST', opr: 'OPR', d1st: 'D1ST', odr: 'ODR' });
const CLIENT_LABELS = Object.freeze({ SPB: 'SPB', SPE: 'SPE', ALL: 'Toàn bộ' });

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function initialMetricQuery(interaction) {
  return {
    metric: interaction?.query?.metric ?? null,
    client: interaction?.query?.client ?? null,
    dateMode: interaction?.query?.dateMode ?? null,
    dateFrom: interaction?.query?.dateFrom ?? null,
    dateTo: interaction?.query?.dateTo ?? null
  };
}

export function validateMetricQuery(query) {
  if (!METRIC_LABELS[query?.metric]) return 'Chọn một chỉ số.';
  if (!CLIENT_LABELS[query?.client]) return 'Chọn phạm vi.';
  if (!['latest', 'trailing_7d', 'custom'].includes(query?.dateMode)) return 'Chọn thời gian.';
  if (query.dateMode !== 'custom') return null;
  if (!query.dateFrom || !query.dateTo) return 'Chọn đủ ngày bắt đầu và kết thúc.';

  const from = Date.parse(`${query.dateFrom}T00:00:00Z`);
  const to = Date.parse(`${query.dateTo}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 'Khoảng ngày không hợp lệ.';
  const days = (to - from) / 86400000;
  if (days < 0) return 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
  if (days > 90) return 'Mỗi lần chỉ xem tối đa 90 ngày.';
  return null;
}

export function summarizeMetricQuery(query) {
  const metric = METRIC_LABELS[query.metric];
  const client = CLIENT_LABELS[query.client];
  const date = query.dateMode === 'latest'
    ? 'dữ liệu mới nhất'
    : query.dateMode === 'trailing_7d'
      ? '7 ngày dữ liệu gần nhất'
      : `${formatDate(query.dateFrom)}–${formatDate(query.dateTo)}`;
  return `${metric} · ${client} · ${date}`;
}

export function buildMetricQuestion(query) {
  const summary = summarizeMetricQuery(query);
  return {
    summary,
    question: `Xem ${summary.replaceAll(' · ', ', ')}.`
  };
}

