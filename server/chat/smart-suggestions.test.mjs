import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSignalSuggestions, collectSuggestionSignals, generateSmartSuggestions,
  resetSuggestionSignalCacheForTesting, validateGeneratedSuggestions
} from './smart-suggestions.js';

const AS_OF = '2026-09-28';
function fakeKpiClient({ latest, baseline, regions }) {
  const calls = [];
  return { calls, async rpc(name, params) {
    calls.push({ name, params });
    if (name === 'get_ai_chat_coverage') return { data: { dataAsOf: AS_OF }, error: null };
    if (name === 'get_ai_chat_metric') {
      if (params.p_grain === 'region') return { data: { rows: regions[params.p_metric] ?? [] }, error: null };
      const value = params.p_date_from === AS_OF ? latest[params.p_metric] : baseline[params.p_metric];
      return { data: { rows: [{ entity: 'Toàn quốc', value, volume: 1000 }] }, error: null };
    }
    return { data: null, error: null };
  } };
}
const KPI_FIXTURE = {
  latest: { odr: 84.2, d1st: 93.1, opr: 91.5, p1st: 97.4 },
  baseline: { odr: 88.5, d1st: 93, opr: 91, p1st: 97 },
  regions: { odr: [
    { entity: 'Không rõ', value: 10, volume: 500 },
    { entity: 'Tiny', value: 20, volume: 3 },
    { entity: 'HCM', value: 79.4, volume: 800 }
  ], d1st: [{ entity: 'HN', value: 90.2, volume: 400 }] }
};
const context = { activeTab: 'report1', client: 'SPB', regions: null, hubTypes: null };

test('collect signals ranks concern and skips unknown or tiny breakdowns', async () => {
  const signals = await collectSuggestionSignals(fakeKpiClient(KPI_FIXTURE), context);
  assert.equal(signals.kpis[0].metric, 'odr');
  assert.equal(signals.kpis[0].worst.entity, 'HCM');
  assert.ok(Math.abs(signals.kpis[0].delta + 4.3) < 1e-9);
});

test('signal cache isolates JWT clients and preserves intentional empty filters', async () => {
  resetSuggestionSignalCacheForTesting();
  const first = fakeKpiClient(KPI_FIXTURE);
  await collectSuggestionSignals(first, { ...context, regions: [] });
  const count = first.calls.length;
  await collectSuggestionSignals(first, { ...context, regions: [] });
  assert.equal(first.calls.length, count);
  assert.deepEqual(first.calls.find(call => call.name === 'get_ai_chat_metric').params.p_regions, ['__NO_MATCH__']);
  const second = fakeKpiClient({ ...KPI_FIXTURE, latest: { ...KPI_FIXTURE.latest, odr: 99 } });
  const signals = await collectSuggestionSignals(second, { ...context, regions: [] });
  assert.ok(second.calls.length > 0);
  assert.equal(signals.kpis.find(kpi => kpi.metric === 'odr').value, 99);
});

test('missing KPI values are not interpreted as zero percent', async () => {
  const signals = await collectSuggestionSignals(fakeKpiClient({ ...KPI_FIXTURE, latest: { odr: null, d1st: '', opr: undefined, p1st: null } }), context);
  assert.equal(signals, null);
});

test('data questions favor urgent evidence and different analysis intents', async () => {
  const signals = await collectSuggestionSignals(fakeKpiClient(KPI_FIXTURE), context);
  const result = buildSignalSuggestions(signals, context);
  assert.equal(result.basis, 'data');
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].metric, 'odr');
  assert.equal(new Set(result.items.map(item => item.intent)).size, 3);
  assert.ok(result.items.every(item => item.question.includes('SPB') && item.question.includes(AS_OF)));
  assert.deepEqual(result, buildSignalSuggestions(signals, context), 'the same evidence produces the same data fallback');
});

test('healthy signals produce neutral or positive questions without inventing trouble', async () => {
  const good = { odr: 99, d1st: 99, opr: 99, p1st: 99 };
  const signals = await collectSuggestionSignals(fakeKpiClient({ latest: good, baseline: good, regions: {} }), context);
  const result = buildSignalSuggestions(signals);
  assert.ok(result.items.every(item => !/giảm|dưới target|chậm lên/.test(item.label)));
});

test('AI chooses new analytical plans; submitted questions compile from validated fields', () => {
  const plans = [
    { intent: 'improvement', metric: 'd1st', secondMetric: null, period: 'last7', grain: 'hub', label: '7 ngày qua, hub nào cải thiện D1ST rõ nhất?' },
    { intent: 'volume_priority', metric: 'odr', secondMetric: null, period: 'month', grain: 'hub', label: 'Tháng dữ liệu hiện tại, hub nào vừa nhiều đơn vừa có ODR thấp?' },
    { intent: 'metric_gap', metric: 'p1st', secondMetric: 'opr', period: 'last30', grain: 'region', label: 'P1ST và OPR lệch nhau ở vùng nào trong 30 ngày qua?' }
  ];
  const result = validateGeneratedSuggestions({ plans }, { ...context, client: 'SPE' });
  assert.equal(result.basis, 'ai');
  assert.deepEqual(result.items.map(item => item.intent).sort(), ['improvement', 'metric_gap', 'volume_priority']);
  assert.equal(new Set(result.items.map(item => item.period)).size, 3);
  assert.ok(result.items.every(item => item.origin === 'ai' && item.question.includes('SPE')));
  assert.ok(result.items.some(item => item.question.includes('P1ST SPE') && item.question.includes('OPR SPE')));
  const tampered = validateGeneratedSuggestions({ plans: [{ ...plans[0], label: 'ODR SPE ở Hà Nội giảm 19,2%?' }] }, context);
  assert.equal(tampered.items.find(item => item.origin === 'ai').label, plans[0].label, 'bad prose falls back but retains a valid analytical plan');
  assert.equal(validateGeneratedSuggestions({ plans: [{ ...plans[0], metric: 'rider_cod' }] }, context), null);
  assert.equal(validateGeneratedSuggestions({ plans: [{ ...plans[2], secondMetric: 'odr' }] }, context), null);
});
test('generation uses structured AI plans and falls back when model fails or times out', async () => {
  const userClient = fakeKpiClient(KPI_FIXTURE);
  const config = { model: 'fixture-model', allowedModels: [] };
  let request;
  const openai = { responses: { async create(body) {
    request = body;
    const { capabilities } = JSON.parse(body.input[0].content);
    return { output_text: JSON.stringify({ plans: [
      { intent: 'improvement', metric: capabilities.metrics[0], secondMetric: null, period: 'last7', grain: 'region', label: '7 ngày qua, vùng nào cải thiện ODR rõ nhất?' },
      { intent: 'volume_priority', metric: capabilities.metrics[0], secondMetric: null, period: 'month', grain: 'hub', label: 'Tháng dữ liệu hiện tại, hub nào vừa nhiều đơn vừa có ODR thấp?' },
      { intent: 'target', metric: capabilities.metrics[1], secondMetric: null, period: 'last30', grain: 'nationwide', label: 'D1ST trong 30 ngày qua còn cách target bao nhiêu?' }
    ] }) };
  } } };
  const ai = await generateSmartSuggestions({ userClient, openai, config, screenContext: context });
  assert.equal(ai.basis, 'ai');
  assert.equal(ai.dataAsOf, AS_OF);
  assert.equal(request.text.format.type, 'json_schema');
  assert.ok(JSON.parse(request.input[0].content).facts.length > 0);
  const failing = { responses: { async create() { throw new Error('unavailable'); } } };
  const fallback = await generateSmartSuggestions({ userClient, openai: failing, config, screenContext: context });
  assert.equal(fallback.basis, 'data');
  const slow = { responses: { async create() { return new Promise(() => {}); } } };
  const timeout = await generateSmartSuggestions({ userClient, openai: slow, config, screenContext: context, modelTimeoutMs: 5 });
  assert.equal(timeout.basis, 'data');
  assert.deepEqual(timeout.items, fallback.items);
});

test('no usable data returns null for scoped fallback', async () => {
  assert.equal(await generateSmartSuggestions({ screenContext: context }), null);
  assert.equal(await generateSmartSuggestions({ userClient: { async rpc() { return { error: { message: 'down' } }; } }, screenContext: context }), null);
});

test('AI can propose neutral plans without signals and repetitive plans are repaired for period diversity', async () => {
  const latest = { intent: 'ranking', metric: 'odr', secondMetric: null, period: 'latest', grain: 'region', label: 'Vùng nào có ODR thấp nhất trong ngày mới nhất?' };
  let input;
  const openai = { responses: { async create(body) {
    input = JSON.parse(body.input[0].content);
    return { output_text: JSON.stringify({ plans: [latest, { ...latest, metric: 'd1st' }, { ...latest, intent: 'target', grain: 'nationwide' }] }) };
  } } };
  const result = await generateSmartSuggestions({ openai, config: { model: 'fixture-model' }, screenContext: context });
  assert.deepEqual(input.facts, []);
  assert.equal(result.basis, 'ai');
  assert.equal(result.dataAsOf, null);
  assert.equal(result.items.filter(item => item.period === 'latest').length, 1);
  assert.equal(new Set(result.items.map(item => item.intent)).size, 3);
  assert.equal(new Set(result.items.map(item => item.period)).size, 3);
  assert.ok(result.items.every(item => !/2026-|giảm|tụt|đạt target/.test(item.question)));
});

test('Ca 1 and leadtime offer diverse lane and stage questions with exact dates', async () => {
  const client = { async rpc(name, params) {
    if (name === 'get_ai_chat_coverage') return { data: { dataAsOf: AS_OF }, error: null };
    if (name === 'get_ai_chat_ca1') return { data: { rows: [
      { lane: 'Nội tỉnh', region: 'HCM', value: params.p_date_from === AS_OF ? 42.5 : 55, total_orders: 900 }
    ] }, error: null };
    if (name === 'get_ai_chat_leadtime') return { data: { rows: [
      { lane: 'Liên vùng', from_province: 'HCM', to_province: 'Hà Nội', volume: 500,
        e2e_hours: params.p_date_to === AS_OF ? 62.4 : 55, prepickup_hours: 4, firstmile_hours: 6, middlemile_hours: 40, lastmile_hours: 12 }
    ] }, error: null };
    return { data: null, error: null };
  } };
  for (const tab of ['report5', 'report3']) {
    const result = buildSignalSuggestions(await collectSuggestionSignals(client, { ...context, activeTab: tab }));
    assert.equal(result.items.length, 3);
    assert.equal(new Set(result.items.map(item => item.intent)).size, 3);
    assert.ok(result.items.every(item => item.question.includes(AS_OF)));
    assert.ok(result.items.some(item => /lane|tuyến|chặng/.test(item.question)));
  }
});
