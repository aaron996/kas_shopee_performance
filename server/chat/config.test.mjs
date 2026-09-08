import test from 'node:test';
import assert from 'node:assert/strict';
import { readChatConfig } from './config.js';

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

test('chat config locks v1 to Luna and low reasoning by default', () => {
  const config = readChatConfig(validEnv);
  assert.equal(config.model, 'gpt-5.6-luna');
  assert.equal(config.reasoningEffort, 'low');
  assert.throws(
    () => readChatConfig({ ...validEnv, AI_CHAT_MODEL: 'gpt-6-astra' }),
    error => error.code === 'CHAT_CONFIG_INVALID'
  );
});
