import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSignalSuggestions,
  collectSuggestionSignals,
  describeSignals,
  generateSmartSuggestions,
  resetSuggestionSignalCacheForTesting,
  validateSuggestions
} from './smart-suggestions.js';

const AS_OF = '2026-09-28';

// Fake user client answering the dashboard RPCs from a small fixture.
function fakeKpiClient({ latest, baseline, regions }) {
  const calls = [];
  return {
    calls,
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'get_ai_chat_coverage') return { data: { dataAsOf: AS_OF }, error: null };
      if (name === 'get_ai_chat_metric') {
        const m = params.p_metric;
        if (params.p_grain === 'region') {
          return { data: { rows: regions[m] ?? [] }, error: null };
        }
        const value = params.p_date_from === AS_OF ? latest[m] : baseline[m];
        return { data: { rows: [{ entity: 'Toàn quốc', value, volume: 1000 }] }, error: null };
      }
      return { data: null, error: null };
    }
  };
}

const KPI_FIXTURE = {
  latest: { odr: 84.2, d1st: 93.1, opr: 91.5, p1st: 97.4 },
  baseline: { odr: 88.5, d1st: 93.0, opr: 91.0, p1st: 97.0 },
  regions: {
    odr: [
      { entity: 'Không rõ', value: 10, volume: 500 },
      { entity: 'Tiny', value: 20, volume: 3 },
      { entity: 'HCM', value: 79.4, volume: 800 }
    ],
    d1st: [{ entity: 'HN', value: 90.2, volume: 400 }]
  }
};

test('collectSuggestionSignals ranks KPIs by concern and finds the worst real region', async () => {
  resetSuggestionSignalCacheForTesting();
  const client = fakeKpiClient(KPI_FIXTURE);
  const signals = await collectSuggestionSignals(client, { activeTab: 'report1', client: 'SPB', regions: null, hubTypes: null });

  assert.equal(signals.kind, 'kpi');
  assert.equal(signals.kpis[0].metric, 'odr', 'ODR is below target and dropped the most');
  assert.equal(signals.kpis[0].worst.entity, 'HCM', 'unknown and tiny-volume regions are skipped');
  assert.ok(Math.abs(signals.kpis[0].delta - (84.2 - 88.5)) < 1e-9);
  assert.ok(signals.kpis.every(kpi => kpi.dataAsOf === AS_OF));
});

test('collectSuggestionSignals caches per scope and respects intentionally empty regions', async () => {
  resetSuggestionSignalCacheForTesting();
  const client = fakeKpiClient(KPI_FIXTURE);
  await collectSuggestionSignals(client, { activeTab: 'report1', client: 'SPB', regions: [], hubTypes: null });
  const firstCount = client.calls.length;
  await collectSuggestionSignals(client, { activeTab: 'report1', client: 'SPB', regions: [], hubTypes: null });
  assert.equal(client.calls.length, firstCount, 'second call is served from cache');

  const metricCall = client.calls.find(call => call.name === 'get_ai_chat_metric');
  assert.deepEqual(metricCall.params.p_regions, ['__NO_MATCH__']);
});

test('buildSignalSuggestions writes grounded questions mentioning the anomaly', async () => {
  resetSuggestionSignalCacheForTesting();
  const signals = await collectSuggestionSignals(fakeKpiClient(KPI_FIXTURE), { activeTab: 'report1', client: 'SPB' });
  const result = buildSignalSuggestions(signals, 0);

  assert.equal(result.basis, 'data');
  assert.equal(result.suggestions.length, 3);
  assert.ok(result.suggestions.some(q => q.includes('ODR') && q.includes('84,2%')));
  assert.ok(result.suggestions.some(q => q.includes('HCM')));
  // Every number in a deterministic suggestion is backed by a fact.
  assert.ok(validateSuggestions(result, describeSignals(signals)));
});

test('validateSuggestions rejects model output with invented numbers', () => {
  const facts = ['ODR SPB toàn quốc ngày mới nhất (28/09) đạt 84,2%'];
  const ok = validateSuggestions({
    placeholder: 'Ví dụ: ODR SPB 7 ngày gần nhất?',
    suggestions: [
      'ODR SPB ngày mới nhất chỉ 84,2% — vùng nào thấp nhất?',
      'ODR SPB 7 ngày gần nhất theo vùng thế nào?',
      'Hub nào kéo ODR SPB xuống ngày 28/09?'
    ]
  }, facts);
  assert.equal(ok.suggestions.length, 3);

  const invented = validateSuggestions({
    placeholder: 'x',
    suggestions: [
      'ODR SPB ngày mới nhất chỉ 81,7% — vùng nào thấp nhất?',
      'ODR SPB 7 ngày gần nhất theo vùng thế nào?',
      'Hub nào kéo ODR SPB xuống ngày 28/09?'
    ]
  }, facts);
  assert.equal(invented, null, 'one invented figure drops below 3 valid questions');
});

test('generateSmartSuggestions prefers the model and falls back to signal templates', async () => {
  resetSuggestionSignalCacheForTesting();
  const userClient = fakeKpiClient(KPI_FIXTURE);
  const screenContext = { activeTab: 'report1', client: 'SPB' };
  const config = { model: 'gpt-4.1', allowedModels: [{ id: 'gpt-4.1', reasoningEfforts: [] }] };

  let request;
  const openai = {
    responses: {
      async create(body) {
        request = body;
        return {
          output_text: JSON.stringify({
            placeholder: 'Ví dụ: ODR SPB theo hub?',
            suggestions: [
              'ODR SPB ngày mới nhất chỉ 84,2%, dưới target — vùng nào kéo giảm?',
              'Vùng HCM có ODR SPB 79,4% ngày mới nhất — 7 ngày gần nhất thế nào?',
              'D1ST SPB toàn quốc ngày mới nhất thấp hơn target bao nhiêu hub?'
            ]
          })
        };
      }
    }
  };

  const ai = await generateSmartSuggestions({ userClient, openai, config, screenContext });
  assert.equal(ai.basis, 'ai');
  assert.equal(ai.dataAsOf, AS_OF);
  assert.equal(request.text.format.type, 'json_schema');
  assert.ok(JSON.parse(request.input[0].content).facts.length > 0);

  const failingModel = { responses: { async create() { throw new Error('boom'); } } };
  const fallback = await generateSmartSuggestions({ userClient, openai: failingModel, config, screenContext });
  assert.equal(fallback.basis, 'data');
  assert.equal(fallback.suggestions.length, 3);
});

test('generateSmartSuggestions returns null without a usable data client', async () => {
  resetSuggestionSignalCacheForTesting();
  assert.equal(await generateSmartSuggestions({ userClient: undefined, screenContext: { activeTab: 'report1' } }), null);
  const failing = { async rpc() { return { data: null, error: { message: 'down' } }; } };
  assert.equal(await generateSmartSuggestions({ userClient: failing, screenContext: { activeTab: 'report1' } }), null);
});

test('Ca 1 and leadtime tabs produce lane-level signals', async () => {
  resetSuggestionSignalCacheForTesting();
  const client = {
    async rpc(name, params) {
      if (name === 'get_ai_chat_coverage') return { data: { dataAsOf: AS_OF }, error: null };
      if (name === 'get_ai_chat_ca1') {
        const latest = params.p_date_from === AS_OF;
        return { data: { rows: [
          { lane: 'Nội tỉnh', region: 'HCM', value: latest ? 42.5 : 55, total_orders: 900 },
          { lane: 'Liên vùng', region: 'HN', value: latest ? 70 : 71, total_orders: 300 }
        ] }, error: null };
      }
      if (name === 'get_ai_chat_leadtime') {
        const current = params.p_date_to === AS_OF;
        return { data: { rows: [
          { lane: 'Liên vùng', from_province: 'HCM', to_province: 'Hà Nội', volume: 500,
            e2e_hours: current ? 62.4 : 55, prepickup_hours: 4, firstmile_hours: 6, middlemile_hours: 40, lastmile_hours: 12 }
        ] }, error: null };
      }
      return { data: null, error: null };
    }
  };

  const ca1 = buildSignalSuggestions(await collectSuggestionSignals(client, { activeTab: 'report5', client: 'SPB' }));
  assert.ok(ca1.suggestions.some(q => q.includes('Nội tỉnh') && q.includes('42,5%')));

  const leadtime = buildSignalSuggestions(await collectSuggestionSignals(client, { activeTab: 'report3', client: 'SPB' }));
  assert.ok(leadtime.suggestions.some(q => q.includes('62,4h') && q.includes('Middle mile')));
  assert.ok(leadtime.suggestions.some(q => q.includes('tăng 7,4h')));
});
