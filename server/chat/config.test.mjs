import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_MODELS, readChatConfig, resolveModelSelection } from './config.js';

const validEnv = {
  AI_CHAT_ENABLED: 'true',
  OPENAI_API_KEY: 'test-openai',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service'
};

test('chat config fails closed while feature flag is off', () => {
  assert.throws(() => readChatConfig({ ...validEnv, AI_CHAT_ENABLED: 'false' }), error => error.code === 'CHAT_DISABLED');
});

test('chat config defaults to Luna with low reasoning and rejects unknown models', () => {
  const config = readChatConfig(validEnv);
  assert.equal(config.model, 'gpt-5.6-luna');
  assert.equal(config.reasoningEffort, 'low');
  assert.throws(
    () => readChatConfig({ ...validEnv, AI_CHAT_MODEL: 'gpt-6-astra' }),
    error => error.code === 'CHAT_CONFIG_INVALID'
  );
});

test('chat config accepts allowed models and exports allowedModels list', () => {
  const config = readChatConfig({ ...validEnv, AI_CHAT_MODEL: 'gpt-5.6-terra', AI_CHAT_REASONING_EFFORT: 'high' });
  assert.equal(config.model, 'gpt-5.6-terra');
  assert.equal(config.reasoningEffort, 'high');
  assert.ok(Array.isArray(config.allowedModels));
  assert.ok(config.allowedModels.length >= 4);
  assert.ok(config.allowedModels.some(m => m.id === 'gpt-5.6-luna'));
  assert.ok(config.allowedModels.some(m => m.id === 'gpt-5.6-terra'));
  assert.ok(config.allowedModels.some(m => m.id === 'o4-mini'));
  assert.ok(!config.allowedModels.some(m => m.id === 'gpt-5-turbo'));
});

test('every allowed model exposes only validated reasoning combinations', () => {
  const expectedEfforts = new Map([
    ['gpt-5.6-luna', ['none', 'low', 'medium', 'high', 'xhigh', 'max']],
    ['gpt-5.6-terra', ['none', 'low', 'medium', 'high', 'xhigh', 'max']],
    ['o4-mini', ['low', 'medium', 'high']],
    ['gpt-4.1', []]
  ]);

  for (const model of ALLOWED_MODELS) {
    assert.deepEqual(model.reasoningEfforts, expectedEfforts.get(model.id));
    if (model.reasoningEfforts.length === 0) {
      assert.deepEqual(resolveModelSelection(model.id), { model: model.id, reasoningEffort: null });
      continue;
    }
    for (const effort of model.reasoningEfforts) {
      assert.deepEqual(resolveModelSelection(model.id, effort), { model: model.id, reasoningEffort: effort });
    }
  }
});

test('chat config rejects incompatible reasoning and non-reasoning combinations', () => {
  assert.throws(
    () => readChatConfig({ ...validEnv, AI_CHAT_MODEL: 'o4-mini', AI_CHAT_REASONING_EFFORT: 'max' }),
    error => error.code === 'CHAT_CONFIG_INVALID'
  );
  assert.throws(
    () => resolveModelSelection('gpt-4.1', 'low'),
    error => error.code === 'CHAT_REASONING_NOT_SUPPORTED'
  );
});
