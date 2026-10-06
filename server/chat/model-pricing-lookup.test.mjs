import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupModelPricing, parseModelPricing } from './model-pricing-lookup.js';
import { createAiOpsHandler } from '../../api/ai-ops.js';

const page = 'Model ID: `gpt-6-luna`\n\n### Text tokens\n\n| Metric | Price | Unit |\n| Input | $0.1 | 1M tokens |\n| Cached input | $0.01 | 1M tokens |\n| Cache writes | $0.125 | 1M tokens |\n| Output | $0.5 | 1M tokens |\n\n- Fast mode adds a premium.\n\n## Endpoints\n';
test('official model text pricing converts units and keeps conditions', async () => {
  let requested;
  const result = await lookupModelPricing('gpt-6-luna', async (url, options) => {
    requested = url; assert.equal(options.redirect, 'error');
    return { ok: true, text: async () => page };
  });
  assert.equal(requested, 'https://developers.openai.com/api/docs/models/gpt-6-luna.md');
  assert.deepEqual(result.pricing, { inputNanoUsdPerToken: 100, cachedInputNanoUsdPerToken: 10, outputNanoUsdPerToken: 500 });
  assert.deepEqual(result.notes, ['Fast mode adds a premium.']);
  assert.ok(result.fetchedAt);
});
test('missing, ambiguous, wrong-model and wrong-unit prices never fill defaults', () => {
  for (const invalid of [page.replace('Cached input', 'Other'), page.replace('gpt-6-luna', 'gpt-other'), page.replace('$0.1', '$-1'), page.replace('1M tokens', '1K tokens'), page.replace('## Endpoints', '| Input | $0.2 | 1M tokens |\n## Endpoints')]) {
    assert.throws(() => parseModelPricing(invalid, 'gpt-6-luna'), error => error.code === 'MODEL_PRICE_UNAVAILABLE');
  }
});
test('lookup restricts URL and redacts upstream failures', async () => {
  let calls = 0;
  await assert.rejects(lookupModelPricing('../pricing', () => { calls++; }), error => error.status === 400);
  assert.equal(calls, 0);
  await assert.rejects(lookupModelPricing('gpt-6-luna', () => { throw new Error('SECRET'); }), error => !error.message.includes('SECRET'));
  await assert.rejects(lookupModelPricing('gpt-6-luna', async () => ({ ok: false })), error => error.code === 'MODEL_PRICE_UNAVAILABLE');
});
test('pricing lookup uses Dev authorization and performs no database write', async () => {
  for (const allowed of [false, true]) {
    let calls = 0;
    const handler = createAiOpsHandler({ readConfig: () => ({}), authenticate: async () => ({ user: { email: 'dev@example.com' }, serviceClient: {} }), authorizeDev: async () => allowed, pricingFetch: async () => { calls++; return { ok: true, text: async () => page }; } });
    const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await handler({ method: 'POST', url: '/api/ai-ops', headers: {}, body: { action: 'lookup-model-pricing', id: 'gpt-6-luna' } }, res);
    assert.equal(res.statusCode, allowed ? 200 : 403);
    assert.equal(calls, allowed ? 1 : 0);
  }
});
