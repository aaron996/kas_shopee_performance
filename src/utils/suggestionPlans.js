export const PLAN_PERIODS = Object.freeze(['latest', 'last7', 'last14', 'last30', 'month']);
export const PLAN_INTENTS = Object.freeze(['ranking', 'improvement', 'comparison', 'volume_priority', 'metric_gap', 'target', 'stages', 'distribution']);
const KPI = ['odr', 'd1st', 'opr', 'p1st'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const daysBefore = (end, days) => new Date(Date.parse(`${end}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

export function suggestionCapabilities(context = {}, signals = null) {
  const kind = context.activeTab === 'report5' || signals?.kind === 'ca1' ? 'ca1'
    : context.activeTab === 'report3' || signals?.kind === 'leadtime' ? 'leadtime' : 'kpi';
  return {
    kind,
    metrics: kind === 'kpi' ? signals?.kpis?.map(kpi => kpi.metric) || KPI : [kind],
    intents: kind === 'kpi' ? ['ranking', 'improvement', 'comparison', 'volume_priority', 'metric_gap', 'target']
      : kind === 'ca1' ? ['ranking', 'improvement', 'comparison', 'distribution'] : ['ranking', 'comparison', 'stages'],
    grains: kind === 'kpi' ? ['region', 'hub', 'nationwide'] : kind === 'ca1' ? ['lane', 'region', 'nationwide'] : ['route', 'nationwide'],
    periods: PLAN_PERIODS,
    client: context.client || signals?.client || 'SPB',
    regions: context.regions ?? null,
    hubTypes: context.hubTypes ?? null
  };
}

export function resolveSuggestionPeriod(period, coverage = {}) {
  if (!PLAN_PERIODS.includes(period)) return null;
  const text = { latest: 'ngày mới nhất', last7: '7 ngày qua', last14: '14 ngày qua', last30: '30 ngày qua', month: 'tháng dữ liệu hiện tại' }[period];
  const end = coverage.dataAsOf;
  if (!DATE.test(end || '')) return { period, label: text, text: period === 'month'
    ? 'từ đầu tháng của ngày dữ liệu mới nhất đến ngày đó'
    : period === 'latest' ? 'ngày dữ liệu mới nhất' : `${parseInt(period.slice(4), 10)} ngày gần nhất kết thúc ở ngày dữ liệu mới nhất` };
  const start = period === 'latest' ? end : period === 'month' ? `${end.slice(0, 7)}-01` : daysBefore(end, Number(period.slice(4)) - 1);
  if (DATE.test(coverage.dateFrom || '') && coverage.dateFrom > start) return null;
  const duration = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return { period, label: text, text: `từ ${start} đến ${end}`, dateFrom: start, dateTo: end,
    previousFrom: daysBefore(start, duration), previousTo: daysBefore(start, 1) };
}

function coverageFor(metric, signals) {
  return signals?.kind === 'kpi' ? signals.kpis.find(kpi => kpi.metric === metric) || {}
    : signals?.kind === 'leadtime' ? { dataAsOf: signals.dataAsOf, dateFrom: signals.coverageDateFrom } : signals || {};
}

// The model proposes an analysis plan. Only these supported operations compile
// into a submitted question; model prose can never change client, scope or dates.
export function compileSuggestionPlan(plan, context = {}, signals = null, score = 80) {
  if (!plan || typeof plan !== 'object') return null;
  const cap = suggestionCapabilities(context, signals);
  const { intent, metric, period, grain, secondMetric = null } = plan;
  if (!cap.intents.includes(intent) || !cap.metrics.includes(metric) || !cap.grains.includes(grain)) return null;
  const detail = grain !== 'nationwide';
  if (['ranking', 'improvement', 'volume_priority', 'metric_gap', 'distribution'].includes(intent) && !detail) return null;
  if (intent === 'stages' && grain !== 'route') return null;
  if (intent === 'target' && (cap.kind !== 'kpi' || grain !== 'nationwide')) return null;
  if (intent === 'metric_gap') {
    const pair = [metric, secondMetric].sort().join('|');
    if (!['d1st|odr', 'opr|p1st'].includes(pair) || !cap.metrics.includes(secondMetric)) return null;
  } else if (secondMetric !== null) return null;
  const coverage = coverageFor(metric, signals);
  const time = resolveSuggestionPeriod(period, coverage);
  if (!time || (['improvement', 'comparison'].includes(intent) && period === 'latest')) return null;
  if (['improvement', 'comparison'].includes(intent) && time.previousFrom && DATE.test(coverage.dateFrom || '') && coverage.dateFrom > time.previousFrom) return null;
  if (secondMetric) {
    const other = coverageFor(secondMetric, signals);
    const secondTime = resolveSuggestionPeriod(period, other);
    if (!secondTime || (secondTime.dateTo && time.dateTo !== secondTime.dateTo)) return null;
  }
  const unit = { region: 'vùng', hub: 'hub', lane: 'lane', route: 'tuyến', nationwide: 'phạm vi đang chọn' }[grain];
  const title = cap.kind === 'kpi' ? metric.toUpperCase() : metric === 'ca1' ? 'Ca 1' : 'leadtime';
  const subject = metric === 'ca1' ? 'tỷ lệ Ca 1' : `${title} ${cap.client}`;
  const top = unit[0].toUpperCase() + unit.slice(1);
  const comparison = time.previousFrom ? `với kỳ liền trước từ ${time.previousFrom} đến ${time.previousTo}` : 'với kỳ liền trước có cùng số ngày';
  let label, question;
  switch (intent) {
    case 'ranking':
      label = metric === 'leadtime' ? `${time.label}, tuyến nào có leadtime dài nhất?` : `${top} nào có ${title} thấp nhất trong ${time.label}?`;
      question = `Xếp hạng tối đa 15 ${unit} theo ${subject} ${time.text}, ${metric === 'leadtime' ? 'thời gian dài nhất' : 'tỷ lệ thấp nhất'} trước.`;
      break;
    case 'improvement':
      label = `${time.label}, ${unit} nào cải thiện ${title} rõ nhất?`;
      question = `So sánh ${subject} theo ${unit} ${time.text} ${comparison}. Truy vấn cùng nhóm tối đa 15 ${unit} có sản lượng lớn trong kỳ hiện tại, đối chiếu đúng tên ${unit} giữa hai kỳ và xếp theo số điểm phần trăm cải thiện. Không suy rộng ngoài nhóm đã truy vấn.`;
      break;
    case 'comparison':
      label = `${title} trong ${time.label} khác kỳ trước thế nào?`;
      question = `So sánh ${subject} ${time.text} ${comparison}${detail ? ` theo ${unit}` : ''}.`;
      break;
    case 'volume_priority':
      label = `${time.label}, ${unit} nào vừa nhiều đơn vừa có ${title} thấp?`;
      question = `Truy vấn ${subject} ${time.text} theo ${unit}, giới hạn tối đa 15 ${unit} có sản lượng lớn nhất. So sánh cả tỷ lệ, sản lượng và target; chỉ ra ${unit} có tỷ lệ thấp trong nhóm sản lượng lớn, không khẳng định nguyên nhân.`;
      break;
    case 'metric_gap':
      label = `${title} và ${secondMetric.toUpperCase()} lệch nhau ở ${unit} nào trong ${time.label}?`;
      question = `So sánh ${subject} và ${secondMetric.toUpperCase()} ${cap.client} ${time.text} theo ${unit}. Truy vấn cùng nhóm tối đa 15 ${unit} có sản lượng lớn, đối chiếu đúng tên ${unit}, chỉ nêu chênh lệch điểm phần trăm giữa hai tỷ lệ, không xem đó là cùng mẫu số hoặc suy luận nguyên nhân.`;
      break;
    case 'target':
      label = `${title} trong ${time.label} còn cách target bao nhiêu?`;
      question = `So sánh ${subject} ${time.text} với target.`;
      break;
    case 'stages':
      label = `${time.label}, leadtime tập trung ở chặng nào?`;
      question = `Phân tích các chặng ${subject} ${time.text}, theo tuyến, tối đa 15 tuyến có thời gian dài nhất. So sánh thời gian Pre-pickup, First mile, Middle mile và Last mile.`;
      break;
    case 'distribution':
      label = `${time.label}, Ca 1 chênh nhau giữa các ${unit} ra sao?`;
      question = `So sánh ${subject} giữa các ${unit} ${time.text}, tối đa 15 nhóm trong phạm vi đang chọn.`;
      break;
    default: return null;
  }
  question += metric === 'leadtime' ? ' Nguồn leadtime không lọc theo vùng hoặc loại hub; dùng tất cả tuyến của client này.'
    : ' Giữ nguyên các bộ lọc hiện tại.';
  const item = { id: [intent, metric, secondMetric, period, grain].filter(Boolean).join('-'), intent, metric, secondMetric, period, grain, label, question, score, dateFrom: time.dateFrom ?? null, dateTo: time.dateTo ?? null };
  return item;
}

export function buildSuggestionPlanPool(context = {}, signals = null, seed = 0) {
  const cap = suggestionCapabilities(context, signals);
  const pool = [];
  const detail = cap.kind === 'kpi' ? context.regions?.length === 1 || signals?.drillGrain === 'hub' ? 'hub' : 'region' : cap.kind === 'ca1' ? 'lane' : 'route';
  for (const [index, metric] of cap.metrics.entries()) {
    const kpi = signals?.kpis?.find(item => item.metric === metric);
    const concern = Math.min(20, Math.max(0, -(kpi?.gapToTarget || 0)) + Math.max(0, -(kpi?.delta || 0)));
    for (const [intentIndex, intent] of cap.intents.entries()) {
      for (const [periodIndex, period] of PLAN_PERIODS.entries()) {
        const grains = intent === 'target' || intent === 'comparison' ? ['nationwide']
          : intent === 'distribution' ? ['region', 'lane'] : intent === 'metric_gap' ? [detail] : [detail];
        for (const grain of grains) {
          const secondMetric = intent === 'metric_gap' ? ({ p1st: 'opr', opr: 'p1st', d1st: 'odr', odr: 'd1st' })[metric] : null;
          // Fallback rotates combinations, not three copies of the latest-day query.
          const rotation = ((index * 3 + intentIndex * 5 + periodIndex * 7 + Math.abs(seed) * 11) % 17);
          const preferred = intent === 'improvement' && period === 'last7' ? 12
            : intent === 'volume_priority' && period === 'month' ? 10
              : intent === 'metric_gap' && period === 'last30' ? 8 : 0;
          const item = compileSuggestionPlan({ intent, metric, secondMetric, period, grain }, context, signals, 70 + concern + preferred + rotation);
          if (item) pool.push(item);
        }
      }
    }
  }
  return pool;
}
