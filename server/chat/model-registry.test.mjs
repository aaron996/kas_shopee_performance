import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { loadRuntimeCatalog, legacyRegistry, validateDefinition, syncModelRegistry, probeModel } from './model-registry.js';
import { resolveEffectiveChatConfig } from './model-config.js';
import { usageRow } from './agent.js';
import { createAiOpsHandler } from '../../api/ai-ops.js';
import { createModelSyncHandler } from '../../api/cron/ai-model-sync.js';

const definition = { id: 'gpt-new', label: 'New', reasoningEfforts: ['low', 'medium'], defaultReasoningEffort: 'low', pricing: { inputNanoUsdPerToken: 300, cachedInputNanoUsdPerToken: 30, outputNanoUsdPerToken: 600 } };
const row = { id: definition.id, definition, revision: 2, enabled: true };
function client(rows = [row], error = null) {
  const calls = [];
  const chain = data => ({ eq: () => chain(data), or: () => chain(data), order: () => chain(data), then: resolve => resolve({ data, error }) });
  return { calls, from: table => ({ select: () => chain(table === 'ai_model_registry' ? rows : [{ scope_type: 'all', model: 'gpt-new', reasoning_effort: 'medium' }]) }), rpc: async (name, params) => { calls.push({ name, params }); return { data: { success: true }, error: null }; } };
}
class Response extends EventEmitter {
  setHeader() {}
  end(body) { this.body = JSON.parse(body); }
}
test('new enabled database model resolves and usage costs use its prices', async () => {
  const resolved = await resolveEffectiveChatConfig(client(), { model: 'gpt-4.1', allowedModels: legacyRegistry().map(r => r.definition) }, { id: 'user' });
  assert.equal(resolved.model, 'gpt-new');
  assert.equal(resolved.reasoningEffort, 'medium');
  const usage = usageRow({ usage: { input_tokens: 1000, output_tokens: 100 } }, 1, resolved.model, 'medium', [], 1, 'completed', resolved.modelPricing);
  assert.equal(usage.estimatedMicrousd, 360);
  assert.equal(usage.costConfigured, true);
});
test('registry errors fail closed except missing migration; disabled models excluded', async () => {
  await assert.rejects(loadRuntimeCatalog(client([], { code: '42501' }), {}), /Không thể đọc/);
  assert.equal((await loadRuntimeCatalog(client([], { code: '42P01' }), {})).registryMigrated, false);
  assert.equal((await loadRuntimeCatalog(client([{ ...row, enabled: false }]), {})).allowedModels.length, 0);
  assert.throws(() => validateDefinition({ ...definition, defaultReasoningEffort: 'high' }), /mặc định/);
});
test('partial provider inventory failure never writes registry', async () => {
  const db = client();
  const openai = { models: { list: async function* () { yield { id: 'gpt-new' }; throw new Error('provider unavailable'); } } };
  await assert.rejects(syncModelRegistry(db, {}, 'dev', openai));
  assert.equal(db.calls.length, 0);
});
test('probe tests all declared efforts and redacts provider errors', async () => {
  const db = client(); const efforts = [];
  await probeModel(db, {}, row.id, 2, 'dev', { responses: { create: async payload => {
    efforts.push(payload.reasoning.effort);
    return { status: 'completed', output: [{ type: 'function_call', name: 'registry_probe' }], usage: {} };
  } } });
  assert.deepEqual(efforts, ['low', 'medium']);
  assert.equal(db.calls[0].params.p_success, true);
  await assert.rejects(probeModel(db, {}, row.id, 2, 'dev', { responses: { create: async () => { throw new Error('SECRET'); } } }), error => error.code === 'MODEL_PROBE_FAILED' && !error.message.includes('SECRET'));
  assert.equal(db.calls[1].params.p_success, false);
});
test('non-dev cannot discover, sync, edit, probe or toggle registry', async () => {
  const handler = createAiOpsHandler({ readConfig: () => ({}), authenticate: async () => ({ user: {}, serviceClient: client() }), authorizeDev: async () => false });
  for (const action of ['sync-models', 'save-model', 'probe-model', 'toggle-model', null]) {
    const res = new Response();
    await handler({ method: action ? 'POST' : 'GET', url: '/api/ai-ops?view=model-registry', headers: {}, body: { action } }, res);
    assert.equal(res.statusCode, 403);
  }
});
test('daily sync rejects missing/wrong secret before provider or DB access', async () => {
  const handler = createModelSyncHandler({ env: { CRON_SECRET: 'secret' } });
  const res = new Response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, res);
  assert.equal(res.statusCode, 401);
});
