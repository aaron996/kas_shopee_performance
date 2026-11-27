import { normalizeChatClient } from './chatClients.js';
import { buildSuggestionPlanPool } from './suggestionPlans.js';

const TABS = ['report1', 'report5', 'report3', 'report-insight'];
const METRICS = ['odr', 'd1st', 'opr', 'p1st'];
// User-facing names; p1st/d1st are internal codes.
const METRIC_DISPLAY = Object.freeze({ p1st: '1st Pickup ontime', d1st: '1st Delivery ontime', opr: 'OPR', odr: 'ODR' });

// Rank relevance, then diversify intent and metric; never rotate neighboring text.
export function selectSuggestionItems(candidates, limit = 3) {
  const remaining = [...candidates];
  const selected = [];
  while (remaining.length && selected.length < limit) {
    const periodKey = item => item.dateFrom && item.dateTo ? `${item.dateFrom}:${item.dateTo}` : item.period;
    const adjusted = item => item.score
      - (selected.some(other => other.intent === item.intent) ? 10000 : 0)
      - (item.period && selected.some(other => periodKey(other) === periodKey(item)) ? 2000 : 0)
      - (item.grain && selected.some(other => other.grain === item.grain) ? 12 : 0)
      - (selected.some(other => other.metric && other.metric === item.metric) ? 8 : 0);
    remaining.sort((a, b) => adjusted(b) - adjusted(a) || a.id.localeCompare(b.id));
    const item = remaining.shift();
    if (item.period === 'latest' && selected.some(other => other.period === 'latest')) continue;
    if (!selected.some(other => other.id === item.id || other.question === item.question)) selected.push(item);
  }
  return selected;
}

export function suggestionResult(items, extra = {}) {
  // Older clients still submit the string array directly. Keep those strings
  // complete; the new UI renders short labels from items instead.
  return { ...extra, items, suggestions: items.map(item => item.question) };
}

export function formatSuggestionScope(context = {}) {
  const client = context.activeTab === 'report5' ? null : context.client === 'ALL' ? 'Toàn bộ khách hàng' : context.client || 'SPB';
  if (context.activeTab === 'report3') return `${client} · Tất cả tuyến`;
  const regions = !Array.isArray(context.regions) ? 'Toàn quốc'
    : context.regions.length ? context.regions.join(', ') : 'Không chọn vùng';
  const hubs = context.activeTab !== 'report5' && Array.isArray(context.hubTypes)
    ? context.hubTypes.length ? context.hubTypes.join(', ') : 'Không chọn loại hub' : null;
  return [client, regions, hubs].filter(Boolean).join(' · ');
}

export function buildDynamicSuggestions({ activeTab = 'report1', client = 'SPB', regions = null, hubTypes = null, seed = 0 } = {}) {
  const context = { activeTab: TABS.includes(activeTab) ? activeTab : 'report1', client: normalizeChatClient(client) || 'SPB', regions, hubTypes };
  const pool = buildSuggestionPlanPool(context, null, seed);
  const placeholder = activeTab === 'report3' ? 'Ví dụ: Leadtime 30 ngày qua tập trung ở chặng nào?'
    : activeTab === 'report5' ? 'Ví dụ: Lane nào cải thiện Ca 1 trong 7 ngày qua?'
      : `Ví dụ: 1st Pickup ontime và OPR ${context.client} chênh nhau ở đâu?`;
  return suggestionResult(selectSuggestionItems(pool), { placeholder, context, scopeLabel: formatSuggestionScope(context), basis: 'template', dataAsOf: null });
}
export const FALLBACK_SUGGESTIONS = Object.freeze(Object.fromEntries(TABS.map(tab => [tab, buildDynamicSuggestions({ activeTab: tab })])));

export function getFallbackSuggestions(activeTab = 'report1', context = {}) {
  return buildDynamicSuggestions({ ...context, activeTab });
}

// Only completed, sourced answers support these follow-ups. Scope is captured
// from evidence rather than inferred from prose or the current dashboard filters.
export function buildFollowupSuggestions(message) {
  if (!message || message.interaction || !message.sources?.length) return null;
  const drivers = [...message.sources].reverse().find(item => item.tool === 'get_metric_change_drivers' && METRICS.includes(item.scope?.metric));
  if (drivers) return buildDriverFollowups(drivers, message);
  const source = [...message.sources].reverse().find(item => METRICS.includes(item.scope?.metric)
    || ['get_ca1_summary', 'get_leadtime_summary'].includes(item.tool));
  if (!source) return null;
  const scope = source.scope;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scope.dateFrom || '') || !/^\d{4}-\d{2}-\d{2}$/.test(scope.dateTo || '')) return null;
  const captured = message.screenContext || {};
  const context = {
    activeTab: source.tool === 'get_ca1_summary' ? 'report5' : source.tool === 'get_leadtime_summary' ? 'report3' : 'report1',
    client: scope.client || captured.client || 'SPB',
    regions: scope.regions?.length ? scope.regions : captured.regions?.length === 0 ? [] : null,
    hubTypes: (scope.hubTypes || scope.hub_types)?.length ? (scope.hubTypes || scope.hub_types) : captured.hubTypes?.length === 0 ? [] : null
  };
  if (!METRICS.includes(scope.metric)) {
    const ca1 = source.tool === 'get_ca1_summary';
    const subject = ca1 ? 'tỷ lệ Ca 1' : `leadtime ${context.client}`;
    const period = `từ ${scope.dateFrom} đến ${scope.dateTo}`;
    const route = [scope.lane && `lane ${scope.lane}`, scope.fromProvince && `từ tỉnh ${scope.fromProvince}`, scope.toProvince && `đến tỉnh ${scope.toProvince}`].filter(Boolean).join(', ');
    const suffix = `${route ? `, ${route}` : ''}, ${period}, theo bộ lọc hiện tại.`;
    const items = [
      { id: 'follow-distribution', intent: 'distribution', score: 90,
        label: ca1 ? 'Ca 1 chênh lệch giữa các vùng ra sao trong cùng kỳ?' : 'Chặng nào chiếm nhiều leadtime trong cùng kỳ?',
        question: ca1 ? `So sánh ${subject} giữa các vùng đang chọn${suffix}` : `Phân tích các chặng ${subject}${suffix}` },
      { id: 'follow-comparison', intent: 'comparison', score: 85,
        label: ca1 ? 'So sánh Ca 1 với kỳ liền trước?' : 'So sánh leadtime với kỳ liền trước?',
        question: `So sánh ${subject} với kỳ liền trước có cùng số ngày${suffix}` }
    ];
    const previous = message.requestQuestion || '';
    const askedIntent = /so sánh.*kỳ liền trước/i.test(previous) ? 'comparison'
      : /phân tích các chặng|giữa các vùng/i.test(previous) ? 'distribution' : null;
    return suggestionResult(items.filter(item => item.intent !== askedIntent), {
      context, placeholder: `Ví dụ: So sánh ${subject} với kỳ trước?`,
      scopeLabel: [formatSuggestionScope(context), route].filter(Boolean).join(' · '), dataAsOf: source.dataAsOf, basis: 'followup'
    });
  }
  const metric = scope.metric.toUpperCase();
  const shown = METRIC_DISPLAY[scope.metric];
  const period = `từ ${scope.dateFrom} đến ${scope.dateTo}`;
  const subject = `${metric} ${context.client}`;
  const unit = scope.grain === 'region' || context.regions?.length === 1 ? 'hub' : 'vùng';
  const candidates = [
    { id: `${metric}-follow-rank`, intent: 'ranking', metric: scope.metric, score: 90, label: `Xem ${shown} theo ${unit} trong cùng kỳ?`, question: `Xếp hạng ${unit} theo ${subject} ${period}, theo bộ lọc hiện tại.` },
    { id: `${metric}-follow-trend`, intent: 'comparison', metric: scope.metric, score: 85, label: `So sánh ${shown} với kỳ liền trước?`, question: `So sánh ${subject} ${period} với kỳ liền trước có cùng số ngày, theo bộ lọc hiện tại.` },
    { id: `${metric}-follow-target`, intent: 'target', metric: scope.metric, score: 80, label: `${shown} trong cùng kỳ còn cách target bao nhiêu?`, question: `So sánh ${subject} ${period} với target, theo bộ lọc hiện tại.` }
  ];
  const previous = message.requestQuestion || '';
  const askedIntent = /so sánh.*(?:kỳ|ngày trước)/i.test(previous) ? 'comparison'
    : /target/i.test(previous) ? 'target' : /xếp hạng/i.test(previous) ? 'ranking' : null;
  return suggestionResult(selectSuggestionItems(candidates.filter(item => item.intent !== askedIntent && (context.client !== 'SPE Reverse' || item.intent !== 'target'))), {
    placeholder: `Ví dụ: ${shown} theo ${unit} trong cùng kỳ?`, context,
    scopeLabel: formatSuggestionScope(context), dataAsOf: source.dataAsOf, basis: 'followup'
  });
}

// After a "why did it change" answer, offer the natural next drill-down, not
// the generic ranking/target prompts.
function buildDriverFollowups(source, message) {
  const { metric, client = 'SPB', grain, topDriver, changePp } = source.scope;
  const label = METRIC_DISPLAY[metric];
  const dir = changePp < 0 ? 'giảm' : 'tăng';
  const regions = source.scope.regions?.length ? source.scope.regions : null;
  const target = topDriver || regions?.[0] || '';
  const items = [];
  if (grain === 'region' && topDriver) {
    items.push({ id: 'drivers-hub', intent: 'drilldown', score: 95, label: `Hub nào kéo ${label} ${topDriver} ${dir}?`,
      question: `Vì sao ${label} ${client} của ${topDriver} ${dir} so với kỳ trước? Phân tích theo hub.` });
  }
  if (target) {
    items.push({ id: 'drivers-trend', intent: 'trend', score: 90, label: `Diễn biến ${label} ${target} 7 ngày gần nhất`,
      question: `Vẽ xu hướng ${label} ${client} của ${target} theo ngày trong 7 ngày dữ liệu mới nhất.` });
    items.push({ id: 'drivers-target', intent: 'target', score: 80, label: `${label} ${target} còn cách target bao nhiêu?`,
      question: `So sánh ${label} ${client} của ${target} từ ${source.scope.dateFrom} đến ${source.scope.dateTo} với target.` });
  }
  const asked = message.requestQuestion || '';
  const filtered = items.filter(item => !(item.intent === 'trend' && /xu hướng|theo ngày/i.test(asked))
    && !(item.intent === 'target' && /target/i.test(asked)) && !(client === 'SPE Reverse' && item.intent === 'target'));
  if (!filtered.length) return null;
  return suggestionResult(selectSuggestionItems(filtered), {
    context: { activeTab: 'report1', client, regions, hubTypes: null }, placeholder: `Ví dụ: ${label} ${target} theo hub?`,
    scopeLabel: [client, target].filter(Boolean).join(' · '), dataAsOf: source.dataAsOf, basis: 'followup'
  });
}
