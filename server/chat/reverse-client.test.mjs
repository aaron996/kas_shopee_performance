import { callReverseRpc } from './reverse-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatClient, CHAT_CLIENT_IDS } from '../../src/utils/chatClients.js';
import { detectExplicitClient, resolveEffectiveScope } from './scope.js';
import { parseRequestBody } from './protocol.js';
import { executeChatTool } from './tools.js';
import { executeFastPath } from './fast-path.js';
import { createMetricQueryInteraction } from './interactions.js';
import { getFallbackSuggestions } from '../../src/utils/chatSuggestions.js';
import { compileSuggestionPlan } from '../../src/utils/suggestionPlans.js';
import { validateMetricQuery, summarizeMetricQuery } from '../../src/utils/chatQuery.js';

const reverse = 'SPE Reverse';
const query = { metric: 'opr', client: '224845', dateMode: 'latest', dateFrom: null, dateTo: null };
const requestId = '550e8400-e29b-41d4-a716-446655440000';
const cols = ['report_date', 'region', 'hub', 'hub_type', 'client_name', 'mau_pu', 'ontime_pu_1st', 'ontime_pu_opr'];
function fakeDb() {
  const calls = [];
  return { calls, async rpc(name, params) {
    calls.push({ name, params });
    return { data: { cols, rows: name === 'get_kas_weekly_compact'
      ? [['2026-10-12', 'HCM', 'Hub A', 'BC', reverse, 100, 90, 88]]
      : [['2026-10-18', 'HCM', 'Hub A', 'BC', reverse, 100, 90, 88]] }, error: null };
  } };
}

test('Reverse names and ID resolve before SPE and override screen scope', () => {
  assert.equal(CHAT_CLIENT_IDS[reverse], '224845');
  for (const alias of ['SPE Reverse', 'Shopee Reverse', 'Reverse', '224845']) {
    assert.equal(normalizeChatClient(alias), reverse);
    assert.equal(detectExplicitClient(`OPR ${alias} hôm nay?`), reverse);
    assert.equal(resolveEffectiveScope({ question: `OPR ${alias}`, screenContext: { client: 'SPE' } }).client, reverse);
  }
  assert.equal(detectExplicitClient('OPR SPE hôm nay'), 'SPE');
  assert.equal(detectExplicitClient('OPR 2248450 hôm nay'), null);
});

test('Reverse client ID survives request validation and structured fast path', async () => {
  const request = parseRequestBody({ requestId, question: 'OPR Reverse mới nhất', query,
    screenContext: { client: 'SPE Reverse' } });
  assert.equal(request.query.client, reverse);
  assert.equal(request.screenContext.client, reverse);
  assert.equal(validateMetricQuery(request.query), null);
  assert.match(summarizeMetricQuery(request.query), /SPE Reverse/);
  const userClient = fakeDb();
  const text = [];
  await executeFastPath({ request, userClient, onText: value => text.push(value) });
  assert.equal(userClient.calls.length, 3);
  assert.ok(userClient.calls.every(call => call.params.dataset === 'reverse'));
  assert.match(text.join(''), /88%/);
  assert.match(text.join(''), /chưa có target KPI/);
});

test('natural-language Reverse ID routes coverage and Pickup tools to the separate dataset', async () => {
  const userClient = fakeDb();
  for (const name of ['get_data_coverage', 'get_metric_summary']) {
    await executeChatTool({ name, arguments: {
      dataset: 'pick', metric: 'opr', client: 'SPE', date_from: '2026-10-17', date_to: '2026-10-18',
      grain: 'nationwide', regions: [], hub_types: [], limit: 10, sort: 'worst',
      lane: null, from_province: null, to_province: null
    } }, { userClient, question: 'OPR client 224845', screenContext: { client: 'SPE' } });
  }
  assert.ok(userClient.calls.every(call => call.params.dataset === 'reverse'));
});

test('Reverse is selectable in chat and suggestions preserve scope without a target', () => {
  const interaction = createMetricQueryInteraction({ name: 'request_metric_query', arguments: {
    metric: 'opr', client: null, date_mode: null, date_from: null, date_to: null
  } });
  assert.ok(interaction.fields.find(field => field.id === 'client').options.some(option => option.value === reverse));
  const context = { activeTab: 'report1', client: reverse };
  const { items } = getFallbackSuggestions('report1', context);
  assert.ok(items.length > 0);
  assert.ok(items.every(item => item.question.includes(reverse) && !/target/i.test(item.question)));
  assert.equal(compileSuggestionPlan({ intent: 'target', metric: 'opr', period: 'latest', grain: 'nationwide' }, context), null);
});

test('Reverse rejects Delivery and Leadtime without reading unrelated data', async () => {
  const userClient = fakeDb();
  await assert.rejects(executeChatTool({ name: 'get_leadtime_summary', arguments: {
    client: reverse, date_from: '2026-10-17', date_to: '2026-10-18', lane: null, from_province: null, to_province: null, limit: 10
  } }, { userClient }), error => error.code === 'CHAT_DATASET_UNSUPPORTED');
  assert.equal(userClient.calls.length, 0);
});

test('Reverse aggregates weighted ratios, applies normalized scope and sorts after grouping', async () => {
  const userClient = { async rpc() { return { data: { cols, rows: [
    ['2026-10-18', 'HCM', 'Hub A', 'BC', reverse, 10, 10, 10],
    ['2026-10-18', 'HCM', 'Hub A', 'BC', reverse, 90, 45, 45],
    ['2026-10-18', 'HNO', 'Hub B', 'BC', reverse, 100, 80, 80],
    ['2026-10-18', 'HCM', 'Hub C', 'KA', reverse, 100, 99, 99]
  ] }, error: null }; } };
  const args = { p_metric: 'opr', p_date_from: '2026-10-18', p_date_to: '2026-10-18', p_grain: 'hub', p_sort: 'worst', p_limit: 1, p_regions: ['HCM'], p_hub_types: ['BC'] };
  const result = await callReverseRpc(userClient, 'get_ai_chat_metric', args);
  assert.deepEqual(result.data.rows, [{ entity: 'Hub A', volume: 100, ontime: 55, value: 55 }]);
  const empty = await callReverseRpc(userClient, 'get_ai_chat_metric', { ...args, p_regions: ['__NO_MATCH__'] });
  assert.deepEqual(empty.data.rows, []);
  assert.equal(empty.data.dataAsOf, null);
});

test('Reverse stops on malformed data and rejects unbounded requests before reading DB', async () => {
  let calls = 0;
  const userClient = { async rpc() { calls++; return { data: { rows: [] }, error: null }; } };
  await assert.rejects(callReverseRpc(userClient, 'get_ai_chat_metric', { p_metric: 'opr' }), error => error.code === 'CHAT_TOOL_ARGUMENTS_INVALID');
  assert.equal(calls, 0);
  await assert.rejects(callReverseRpc(userClient, 'get_ai_chat_coverage', { p_dataset: 'pick' }), error => error.code === 'CHAT_DATA_UNAVAILABLE');
});
