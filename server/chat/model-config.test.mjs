import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectiveChatConfig, getModelConfigOverview } from './model-config.js';
import { readChatConfig } from './config.js';

const baseConfig = readChatConfig({
  AI_CHAT_ENABLED: 'true',
  OPENAI_API_KEY: 'test-openai',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service',
  AI_CHAT_MODEL: 'gpt-5.6-luna',
  AI_CHAT_REASONING_EFFORT: 'low'
});

function createMockServiceClient(configRows = [], auditRows = [], queryError = null, auditError = null) {
  return {
    from(tableName) {
      if (tableName === 'ai_chat_model_config') {
        return {
          select(_fields) {
            return {
              or(_condition) {
                if (queryError) return Promise.resolve({ data: null, error: queryError });
                return Promise.resolve({ data: configRows, error: null });
              },
              eq(_col, _val) {
                if (queryError) return Promise.resolve({ data: null, error: queryError });
                return Promise.resolve({ data: configRows, error: null });
              },
              order(_column, _direction) {
                if (queryError) return Promise.resolve({ data: null, error: queryError });
                return Promise.resolve({ data: configRows, error: null });
              },
              then(resolve, _reject) {
                if (queryError) return resolve({ data: null, error: queryError });
                return resolve({ data: configRows, error: null });
              }
            };
          }
        };
      }
      if (tableName === 'ai_chat_model_config_audit') {
        return {
          select(_fields) {
            return {
              order(_column, _direction) {
                return {
                  limit(_n) {
                    if (auditError) return Promise.resolve({ data: null, error: auditError });
                    return Promise.resolve({ data: auditRows, error: null });
                  }
                };
              }
            };
          }
        };
      }
      throw new Error(`Unexpected table: ${tableName}`);
    }
  };
}

test('resolveEffectiveChatConfig: User override takes precedence over Scope All and env', async () => {
  const client = createMockServiceClient([
    { scope_type: 'all', scope_key: 'all', model: 'gpt-5.6-luna', reasoning_effort: 'medium' },
    { scope_type: 'user', scope_key: 'u-special', user_id: 'u-special', model: 'gpt-5.6-terra', reasoning_effort: 'high' }
  ]);

  const resolved = await resolveEffectiveChatConfig(client, baseConfig, 'u-special');
  assert.equal(resolved.model, 'gpt-5.6-terra');
  assert.equal(resolved.reasoningEffort, 'high');
  assert.equal(resolved.source, 'user');
});

test('resolveEffectiveChatConfig: Scope All takes precedence when user has no override', async () => {
  const client = createMockServiceClient([
    { scope_type: 'all', scope_key: 'all', model: 'gpt-5.6-terra', reasoning_effort: 'medium' }
  ]);

  const resolved = await resolveEffectiveChatConfig(client, baseConfig, 'u-normal');
  assert.equal(resolved.model, 'gpt-5.6-terra');
  assert.equal(resolved.reasoningEffort, 'medium');
  assert.equal(resolved.source, 'all');
});

test('resolveEffectiveChatConfig: Falls back to env default when 0 rows in DB', async () => {
  const client = createMockServiceClient([]);

  const resolved = await resolveEffectiveChatConfig(client, baseConfig, 'u-normal');
  assert.equal(resolved.model, 'gpt-5.6-luna');
  assert.equal(resolved.reasoningEffort, 'low');
  assert.equal(resolved.source, 'env');
});

test('resolveEffectiveChatConfig: Fail closed (503) when DB returns an error', async () => {
  const client = createMockServiceClient([], [], new Error('DB connection refused'));

  await assert.rejects(
    async () => resolveEffectiveChatConfig(client, baseConfig, 'u-any'),
    err => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'CHAT_CONFIG_UNAVAILABLE');
      return true;
    }
  );
});

test('resolveEffectiveChatConfig: Fail closed (503) when serviceClient is invalid or missing .from', async () => {
  await assert.rejects(
    async () => resolveEffectiveChatConfig(null, baseConfig, 'u-any'),
    err => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'CHAT_CONFIG_UNAVAILABLE');
      return true;
    }
  );

  await assert.rejects(
    async () => resolveEffectiveChatConfig({}, baseConfig, 'u-any'),
    err => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'CHAT_CONFIG_UNAVAILABLE');
      return true;
    }
  );
});

test('resolveEffectiveChatConfig: Fail closed (503) when DB contains unauthorized model', async () => {
  const client = createMockServiceClient([
    { scope_type: 'all', scope_key: 'all', model: 'unauthorized-model-xyz', reasoning_effort: null }
  ]);

  await assert.rejects(
    async () => resolveEffectiveChatConfig(client, baseConfig, 'u-any'),
    err => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'CHAT_CONFIG_UNAVAILABLE');
      return true;
    }
  );
});

test('resolveEffectiveChatConfig: GPT-4.1 always resolves reasoningEffort to null', async () => {
  const client = createMockServiceClient([
    { scope_type: 'all', scope_key: 'all', model: 'gpt-4.1', reasoning_effort: null }
  ]);

  const resolved = await resolveEffectiveChatConfig(client, baseConfig, 'u-any');
  assert.equal(resolved.model, 'gpt-4.1');
  assert.equal(resolved.reasoningEffort, null);
  assert.equal(resolved.source, 'all');
});

test('getModelConfigOverview: returns structured status with userOverrides and audits', async () => {
  const configRows = [
    { scope_type: 'all', scope_key: 'all', model: 'gpt-5.6-luna', reasoning_effort: 'medium', updated_by: 'vinhlt@ghn.vn', updated_at: '2026-09-11T12:00:00Z' },
    { scope_type: 'user', scope_key: 'u-1', user_id: 'u-1', user_email: 'user1@ghn.vn', model: 'gpt-5.6-terra', reasoning_effort: 'high', updated_by: 'vinhlt@ghn.vn', updated_at: '2026-09-11T12:30:00Z' }
  ];
  const auditRows = [
    { id: 'a-1', scope_type: 'user', scope_key: 'u-1', user_id: 'u-1', user_email: 'user1@ghn.vn', action: 'update', new_model: 'gpt-5.6-terra', new_reasoning_effort: 'high', changed_by: 'vinhlt@ghn.vn', reason: 'VIP test', created_at: '2026-09-11T12:30:00Z' }
  ];
  const client = createMockServiceClient(configRows, auditRows);

  const overview = await getModelConfigOverview(client, baseConfig, 'u-1');
  assert.equal(overview.effectiveConfig.model, 'gpt-5.6-terra');
  assert.equal(overview.effectiveConfig.reasoningEffort, 'high');
  assert.equal(overview.effectiveSource, 'user');
  assert.equal(overview.globalConfig.model, 'gpt-5.6-luna');
  assert.equal(overview.targetConfig.userId, 'u-1');
  assert.equal(overview.userOverrides.length, 1);
  assert.equal(overview.userOverrides[0].userEmail, 'user1@ghn.vn');
  assert.equal(overview.recentAudits.length, 1);
  assert.equal(overview.recentAudits[0].reason, 'VIP test');
});

test('getModelConfigOverview: fails closed (503) when audits query errors', async () => {
  const client = createMockServiceClient([], [], null, new Error('Audit table locked or permission denied'));
  await assert.rejects(
    async () => getModelConfigOverview(client, baseConfig),
    err => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'CHAT_CONFIG_UNAVAILABLE');
      assert.match(err.message, /kiểm toán|audit/i);
      return true;
    }
  );
});
