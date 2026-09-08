import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_TOOLS, executeChatTool } from './tools.js';

test('tool definitions are strict and never expose arbitrary SQL', () => {
  assert.ok(CHAT_TOOLS.length >= 6);
  for (const tool of CHAT_TOOLS) {
    assert.equal(tool.strict, true);
    assert.equal(tool.parameters.additionalProperties, false);
    assert.doesNotMatch(tool.name, /sql|query_table|navigate/i);
  }
});

test('metric tool maps only validated arguments to the fixed RPC', async () => {
  const calls = [];
  const userClient = {
    async rpc(name, params) {
      calls.push({ name, params });
      return { data: { rows: [], dataAsOf: '2026-09-01' }, error: null };
    }
  };
  const result = await executeChatTool({
    name: 'get_metric_summary',
    arguments: JSON.stringify({
      metric: 'odr', client: 'SPB', date_from: '2026-08-01', date_to: '2026-08-31',
      grain: 'region', regions: [], hub_types: [], limit: 10, sort: 'worst'
    })
  }, { userClient });

  assert.equal(calls[0].name, 'get_ai_chat_metric');
  assert.equal(calls[0].params.p_metric, 'odr');
  assert.equal(calls[0].params.p_client, 'SPB');
  assert.match(result.evidenceId, /^db_[0-9a-f]{16}$/);
});

test('metric tool rejects date ranges over 90 days before touching DB', async () => {
  let called = false;
  const userClient = { rpc: async () => { called = true; return { data: null, error: null }; } };
  await assert.rejects(
    executeChatTool({
      name: 'get_metric_summary',
      arguments: JSON.stringify({
        metric: 'odr', client: 'SPB', date_from: '2026-01-01', date_to: '2026-08-31',
        grain: 'region', regions: [], hub_types: [], limit: 10, sort: 'worst'
      })
    }, { userClient }),
    error => error.code === 'CHAT_TOOL_ARGUMENTS_INVALID'
  );
  assert.equal(called, false);
});
