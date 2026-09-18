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

test('open-ended agent tool call automatically receives and injects dashboard screenContext', async () => {
  const calls = [];
  const userClient = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'get_ai_chat_coverage') {
        return { data: { dataAsOf: '2026-09-15', client: 'SPE', dataset: 'pick' }, error: null };
      }
      return {
        data: {
          dataAsOf: '2026-09-15',
          rows: [{ entity: 'HCM', value: 92.4 }]
        },
        error: null
      };
    }
  };

  // Open-ended tool call with missing client, regions, hub_types, grain, limit, sort
  const openEndedCall = {
    name: 'get_latest_metric_summary',
    arguments: JSON.stringify({ metric: 'p1st' })
  };

  const context = {
    userClient,
    question: 'Tình hình P1ST thế nào?',
    screenContext: {
      client: 'SPE',
      regions: ['HCM'],
      hubTypes: ['LM']
    }
  };

  const result = await executeChatTool(openEndedCall, context);

  // Verifies coverage called with injected client
  assert.equal(calls[0].name, 'get_ai_chat_coverage');
  assert.equal(calls[0].params.p_client, 'SPE');

  // Verifies metric called with injected client, regions, and hub_types from dashboard
  assert.equal(calls[1].name, 'get_ai_chat_metric');
  assert.equal(calls[1].params.p_metric, 'p1st');
  assert.equal(calls[1].params.p_client, 'SPE');
  assert.deepEqual(calls[1].params.p_regions, ['HCM']);
  assert.deepEqual(calls[1].params.p_hub_types, ['LM']);
  assert.equal(calls[1].params.p_date_from, '2026-09-15');
  assert.equal(calls[1].params.p_date_to, '2026-09-15');
  assert.equal(result.data.rows[0].value, 92.4);
});

test('open-ended tool call preserves intentional empty filter from screenContext with __NO_MATCH__', async () => {
  const calls = [];
  const userClient = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'get_ai_chat_coverage') {
        return { data: { dataAsOf: '2026-09-15', client: 'SPB', dataset: 'pick' }, error: null };
      }
      return { data: { dataAsOf: '2026-09-15', rows: [] }, error: null };
    }
  };

  const openEndedCall = {
    name: 'get_latest_metric_summary',
    arguments: JSON.stringify({ metric: 'p1st' })
  };

  const context = {
    userClient,
    question: 'P1ST hôm nay',
    screenContext: {
      client: 'SPB',
      regions: [],
      hubTypes: []
    }
  };

  await executeChatTool(openEndedCall, context);

  assert.equal(calls[1].name, 'get_ai_chat_metric');
  assert.deepEqual(calls[1].params.p_regions, ['__NO_MATCH__']);
  assert.deepEqual(calls[1].params.p_hub_types, ['__NO_MATCH__']);
});

test('executeChatTool: explicit question parameters win over dashboard screenContext', async () => {
  const calls = [];
  const userClient = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'get_ai_chat_coverage') {
        return { data: { dataAsOf: '2026-09-15', client: 'SPB', dataset: 'pick' }, error: null };
      }
      return { data: { dataAsOf: '2026-09-15', rows: [] }, error: null };
    }
  };

  const call = {
    name: 'get_latest_metric_summary',
    arguments: JSON.stringify({ metric: 'p1st' })
  };

  const context = {
    userClient,
    question: 'Xem P1ST của Shopee Bulky tại Hà Nội',
    screenContext: {
      client: 'SPE',
      regions: ['HCM'],
      hubTypes: ['LM']
    }
  };

  await executeChatTool(call, context);

  // SPB and HN from question win over SPE and HCM from screenContext
  assert.equal(calls[0].params.p_client, 'SPB');
  assert.equal(calls[1].params.p_client, 'SPB');
  assert.deepEqual(calls[1].params.p_regions, ['HN']);
});
