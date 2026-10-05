import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSuggestionPlan, resolveSuggestionPeriod } from './suggestionPlans.js';
import { buildDynamicSuggestions, selectSuggestionItems } from './chatSuggestions.js';
import { resolveEffectiveScope, normalizeToolScope } from '../../server/chat/scope.js';
import { isFastPathEligible } from '../../server/chat/fast-path.js';

const context = { activeTab: 'report1', client: 'SPE', regions: ['HCM'], hubTypes: [] };
const signals = { kind: 'kpi', dataAsOf: '2026-10-04', kpis: [
  { metric: 'p1st', dataAsOf: '2026-10-04', dateFrom: '2026-08-01' },
  { metric: 'opr', dataAsOf: '2026-10-04', dateFrom: '2026-08-01' }
] };

test('month uses the month of the latest data, not host date; prior period is exact', () => {
  const time = resolveSuggestionPeriod('month', { dataAsOf: '2026-09-28', dateFrom: '2026-08-01' });
  assert.equal(time.dateFrom, '2026-09-01');
  assert.equal(time.dateTo, '2026-09-28');
  assert.equal(time.previousFrom, '2026-08-04');
  assert.equal(time.previousTo, '2026-08-31');
});

test('short coverage rejects periods and comparisons outside available bounds', () => {
  assert.equal(resolveSuggestionPeriod('last30', { dataAsOf: '2026-10-04', dateFrom: '2026-10-01' }), null);
  const short = { ...signals, kpis: signals.kpis.map(item => ({ ...item, dateFrom: '2026-10-01' })) };
  assert.equal(compileSuggestionPlan({ intent: 'improvement', metric: 'p1st', secondMetric: null, period: 'month', grain: 'hub' }, context, short), null);
  assert.ok(compileSuggestionPlan({ intent: 'target', metric: 'p1st', period: 'month', grain: 'nationwide' }, context, short));
});

test('cross metric comparison keeps identical dates, scope, and avoids treating rates as same denominator', () => {
  const plan = { intent: 'metric_gap', metric: 'p1st', secondMetric: 'opr', period: 'last30', grain: 'hub' };
  const item = compileSuggestionPlan(plan, context, signals);
  assert.match(item.question, /P1ST SPE.*OPR SPE.*2026-09-05.*2026-10-04/);
  assert.match(item.question, /không xem đó là cùng mẫu số/);
  assert.equal(compileSuggestionPlan({ ...plan, secondMetric: 'odr' }, context, signals), null);
  const mismatch = { ...signals, kpis: signals.kpis.map(item => item.metric === 'opr' ? { ...item, dataAsOf: '2026-10-03' } : item) };
  assert.equal(compileSuggestionPlan(plan, context, mismatch), null);
});

test('all fallback variants have diverse periods and preserve filters under real scope resolution', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const result = buildDynamicSuggestions({ ...context, seed });
    assert.equal(result.items.length, 3);
    assert.equal(new Set(result.items.map(item => item.intent)).size, 3);
    assert.ok(new Set(result.items.map(item => item.period)).size >= 2);
    assert.ok(result.items.filter(item => item.period === 'latest').length <= 1);
    for (const item of result.items) {
      const scope = resolveEffectiveScope({ question: item.question, screenContext: context });
      assert.equal(scope.client, 'SPE');
      assert.deepEqual(scope.regions, ['HCM']);
      assert.deepEqual(scope.hubTypes, []);
      const args = normalizeToolScope('get_metric_summary', {}, scope);
      assert.deepEqual(args.rpcHubTypes, ['__NO_MATCH__']);
      // No structured total-KPI query is attached to analytical requests.
      assert.equal(isFastPathEligible({ question: item.question }), false);
    }
  }
});

test('selector will never produce three latest-day questions, even from a repetitive model', () => {
  const items = selectSuggestionItems([
    { id: 'a', period: 'latest', intent: 'ranking', score: 220, question: 'a' },
    { id: 'b', period: 'latest', intent: 'target', score: 210, question: 'b' },
    { id: 'c', period: 'latest', intent: 'comparison', score: 200, question: 'c' },
    { id: 'd', period: 'last7', intent: 'improvement', score: 90, question: 'd' },
    { id: 'e', period: 'month', intent: 'volume_priority', score: 80, question: 'e' }
  ]);
  assert.equal(items.length, 3);
  assert.equal(items.filter(item => item.period === 'latest').length, 1);
});
