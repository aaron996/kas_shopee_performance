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

test('latest metric tool resolves the newest DB date without asking the user', async () => {
  const calls = [];
  const userClient = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'get_ai_chat_coverage') {
        return { data: { dataAsOf: '2026-09-08', client: 'SPB', dataset: 'deli' }, error: null };
      }
      return {
        data: {
          scope: { client: 'SPB', dateFrom: '2026-09-08', dateTo: '2026-09-08', grain: 'region' },
          dataAsOf: '2026-09-08', rows: [{ entity: 'Miền Trung', value: 88.5 }]
        },
        error: null
      };
    }
  };

  const result = await executeChatTool({
    name: 'get_latest_metric_summary',
    arguments: JSON.stringify({
      metric: 'odr', client: 'SPB', grain: 'region', regions: [], hub_types: [], limit: 5, sort: 'worst'
    })
  }, { userClient });

  assert.deepEqual(calls.map(call => call.name), ['get_ai_chat_coverage', 'get_ai_chat_metric']);
  assert.equal(calls[0].params.p_dataset, 'deli');
  assert.equal(calls[1].params.p_date_from, '2026-09-08');
  assert.equal(calls[1].params.p_date_to, '2026-09-08');
  assert.equal(calls[1].params.p_grain, 'region');
  assert.equal(calls[1].params.p_sort, 'worst');
  assert.equal(result.data.rows[0].entity, 'Miền Trung');
});
