import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDynamicSuggestions, buildFollowupSuggestions, getFallbackSuggestions, selectSuggestionItems } from './chatSuggestions.js';
import { resolveEffectiveScope } from '../../server/chat/scope.js';
import { toPublicSource } from '../../server/chat/context.js';

for (const tab of ['report1', 'report5', 'report3', 'report-insight']) {
  test(`fallback for ${tab} has different intents and complete questions`, () => {
    const result = getFallbackSuggestions(tab, { client: 'SPE', regions: ['HCM'], hubTypes: ['LM'] });
    assert.equal(result.items.length, 3);
    assert.equal(new Set(result.items.map(item => item.intent)).size, 3);
    assert.deepEqual(result.suggestions, result.items.map(item => item.question));
    for (const item of result.items) {
      assert.match(item.question, /ngày dữ liệu mới nhất|\d{4}-\d{2}-\d{2}/);
      if (tab !== 'report5') assert.match(item.question, /SPE/);
      assert.doesNotMatch(item.label, /SPE/);
    }
    assert.ok(new Set(result.items.map(item => item.period)).size >= 2);
    assert.ok(result.items.filter(item => item.period === 'latest').length <= 1);
  });
}

test('fallback retains intentional empty filters without claiming an anomaly', () => {
  const result = buildDynamicSuggestions({ client: 'ALL', regions: [], hubTypes: [] });
  assert.deepEqual(result.context.regions, []);
  assert.deepEqual(result.context.hubTypes, []);
  assert.match(result.scopeLabel, /Không chọn vùng/);
  for (const item of result.items) {
    const scope = resolveEffectiveScope({ question: item.question, screenContext: result.context });
    assert.deepEqual(scope.regions, []);
    assert.deepEqual(scope.hubTypes, []);
    assert.doesNotMatch(item.label, /giảm mạnh|dưới target|đang chậm/);
  }
});

test('candidate selection prioritizes concern while avoiding three copies of one intent', () => {
  const result = selectSuggestionItems([
    { id: 'urgent', score: 120, intent: 'ranking', question: 'urgent' },
    { id: 'second-rank', score: 110, intent: 'ranking', question: 'second' },
    { id: 'trend', score: 85, intent: 'comparison', question: 'trend' },
    { id: 'target', score: 70, intent: 'target', question: 'target' }
  ]);
  assert.deepEqual(result.map(item => item.id), ['urgent', 'trend', 'target']);
});

const completed = {
  role: 'assistant', requestQuestion: 'ODR SPE hôm nay?', screenContext: { client: 'SPE', regions: ['HCM'], hubTypes: ['LM'] },
  sources: [{ tool: 'get_metric_summary', dataAsOf: '2026-10-04', scope: {
    metric: 'odr', client: 'SPE', grain: 'nationwide', regions: ['HCM'], hubTypes: ['LM'], dateFrom: '2026-10-02', dateTo: '2026-10-04'
  } }]
};

test('followups carry the answered metric, exact period and evidence scope', () => {
  const result = buildFollowupSuggestions(completed);
  assert.equal(result.items.length, 3);
  assert.equal(result.context.client, 'SPE');
  assert.deepEqual(result.context.regions, ['HCM']);
  assert.deepEqual(result.context.hubTypes, ['LM']);
  for (const item of result.items) {
    assert.match(item.question, /ODR SPE.*2026-10-02.*2026-10-04/);
    assert.equal(resolveEffectiveScope({ question: item.question, screenContext: result.context }).client, 'SPE');
  }
});

test('followups omit the already requested intent and do not guess without evidence', () => {
  const result = buildFollowupSuggestions({ ...completed, requestQuestion: 'Xếp hạng hub theo ODR SPE ngày mới nhất.' });
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every(item => item.intent !== 'ranking'));
  assert.equal(buildFollowupSuggestions({ ...completed, interaction: { prompt: 'Chọn KPI' } }), null);
  assert.equal(buildFollowupSuggestions({ content: 'ODR giảm mạnh', sources: [] }), null);
  assert.equal(buildFollowupSuggestions({ ...completed, sources: [{ tool: 'get_data_coverage' }] }), null);
});

test('all-region evidence is not interpreted as a deselected filter', () => {
  const result = buildFollowupSuggestions({ ...completed, sources: [{ scope: { ...completed.sources[0].scope, regions: [], hubTypes: [] } }] });
  assert.equal(result.context.regions, null);
  assert.equal(result.context.hubTypes, null);
  const empty = buildFollowupSuggestions({ ...completed, screenContext: { regions: [], hubTypes: [] }, sources: [{ scope: { ...completed.sources[0].scope, regions: [], hubTypes: [] } }] });
  assert.deepEqual(empty.context.regions, []);
  assert.deepEqual(empty.context.hubTypes, []);
});

test('Ca 1 and leadtime followups keep dates and lane/route from tool evidence', () => {
  for (const tool of ['get_ca1_summary', 'get_leadtime_summary']) {
    const source = toPublicSource(tool, { data: {}, params: {
      p_client: 'SPE', p_regions: ['HCM'], p_date_from: '2026-10-01', p_date_to: '2026-10-04', p_lane: 'Liên vùng',
      ...(tool === 'get_leadtime_summary' ? { p_from_province: 'HCM', p_to_province: 'Hà Nội' } : {})
    } });
    const result = buildFollowupSuggestions({ sources: [source] });
    assert.equal(result.items.length, 2);
    for (const item of result.items) {
      assert.match(item.question, /2026-10-01.*2026-10-04/);
      assert.match(item.question, /lane Liên vùng/);
      if (tool === 'get_leadtime_summary') {
        assert.match(item.question, /leadtime SPE/);
        assert.match(item.question, /HCM.*Hà Nội/);
      } else assert.doesNotMatch(item.question, /SPE/);
    }
  }
});
