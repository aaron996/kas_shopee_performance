import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_INSTRUCTIONS, runChatAgent, usageRow } from './agent.js';

const config = {
  model: 'gpt-5.6-luna', reasoningEffort: 'low', maxOutputTokens: 1024,
  openaiApiKey: 'test', modelTimeoutMs: 1000
};

const request = {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  question: 'ODR SPB tháng 8?', history: []
};

const usage = {
  input_tokens: 100,
  input_tokens_details: { cached_tokens: 20 },
  output_tokens: 50,
  output_tokens_details: { reasoning_tokens: 10 }
};

test('usageRow applies Luna token prices in microdollars', () => {
  const row = usageRow({ usage }, 1, 'gpt-5.6-luna', 'low', [], 20);
  assert.equal(row.estimatedMicrousd, 77); // 80*0.2 + 20*0.02 + 50*1.2
});

test('agent replays reasoning/tool output then streams a grounded final answer', async () => {
  const requests = [];
  const planner = {
    status: 'completed', usage,
    output: [
      { type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque', summary: [] },
      { type: 'function_call', call_id: 'call_1', name: 'get_metric_summary', arguments: '{"metric":"odr"}' }
    ]
  };
  const finalResponse = { status: 'completed', usage, output: [] };
  const stream = {
    async *[Symbol.asyncIterator]() {
      yield { type: 'response.output_text.delta', delta: 'ODR là 95%.' };
      yield { type: 'response.completed', response: finalResponse };
    }
  };
  const openai = {
    responses: {
      async create(body) {
        requests.push(body);
        if (body.stream) return stream;
        return requests.length === 1 ? planner : { status: 'completed', usage, output: [] };
      }
    }
  };
  const deltas = [];
  const sources = [];
  const result = await runChatAgent({
    config, request, userClient: {},
    onText: delta => deltas.push(delta),
    onSource: source => sources.push(source)
  }, {
    openai,
    executeTool: async () => ({
      evidenceId: 'db_abc',
      data: { dataAsOf: '2026-08-31', syncedAt: '2026-09-01T01:00:00Z', rows: [{ value: 95 }] }
    })
  });

  assert.equal(requests.length, 3); // tool plan, no-tool plan, streamed final
  assert.equal(requests[0].store, false);
  assert.deepEqual(requests[0].include, ['reasoning.encrypted_content']);
  assert.ok(requests[1].input.some(item => item.type === 'reasoning' && item.encrypted_content === 'opaque'));
  assert.ok(requests[1].input.some(item => item.type === 'function_call_output' && item.call_id === 'call_1'));
  assert.equal(requests[2].tools, undefined);
  assert.deepEqual(deltas, ['ODR là 95%.']);
  assert.equal(sources[0].evidenceId, 'db_abc');
  assert.equal(result.usage.length, 3);
  assert.deepEqual(result.toolNames, ['get_metric_summary']);
});

test('agent requires explicit KPI, client and time while retaining safe scope inference', () => {
  assert.match(BASE_INSTRUCTIONS, /request_metric_query/);
  assert.match(BASE_INSTRUCTIONS, /Không được tự mặc định latest/);
  assert.match(BASE_INSTRUCTIONS, /"vùng\/miền" = grain region/);
  assert.match(BASE_INSTRUCTIONS, /"tệ nhất\/thấp nhất" = sort worst/);
});

test('agent emits a structured interaction and does not query the database when parameters are missing', async () => {
  const planner = {
    status: 'completed', usage,
    output: [{
      type: 'function_call', call_id: 'interaction_1', name: 'request_metric_query',
      arguments: '{"metric":"opr","client":null,"date_mode":null,"date_from":null,"date_to":null}'
    }]
  };
  let toolCalls = 0;
  const interactions = [];
  const result = await runChatAgent({
    config, request: { ...request, question: 'Xem OPR' }, userClient: {},
    onInteraction: interaction => interactions.push(interaction)
  }, {
    openai: { responses: { create: async () => planner } },
    executeTool: async () => { toolCalls += 1; }
  });

  assert.equal(toolCalls, 0);
  assert.equal(interactions.length, 1);
  assert.deepEqual(interactions[0].fields.map(field => field.id), ['client', 'dateMode']);
  assert.equal(interactions[0].query.metric, 'opr');
  assert.deepEqual(result.toolNames, ['request_metric_query']);
});

test('agent returns a no-tool clarification directly without a second model call', async () => {
  let calls = 0;
  const openai = {
    responses: {
      async create() {
        calls += 1;
        return {
          status: 'completed', usage,
          output: [{
            type: 'message', role: 'assistant', status: 'completed',
            content: [{ type: 'output_text', text: 'Bạn muốn xem KPI ODR hay OPR?' }]
          }]
        };
      }
    }
  };
  const deltas = [];
  const result = await runChatAgent({
    config, request: { ...request, question: 'Vùng nào đang tệ nhất?' }, userClient: {},
    onText: delta => deltas.push(delta)
  }, { openai });

  assert.equal(calls, 1);
  assert.deepEqual(deltas, ['Bạn muốn xem KPI ODR hay OPR?']);
  assert.equal(result.usage.length, 1);
});

test('agent omits reasoning-only parameters for GPT-4.1', async () => {
  const requests = [];
  const openai = {
    responses: {
      async create(body) {
        requests.push(body);
        return {
          status: 'completed', usage,
          output: [{
            type: 'message', role: 'assistant', status: 'completed',
            content: [{ type: 'output_text', text: 'Bạn muốn xem KPI ODR hay OPR?' }]
          }]
        };
      }
    }
  };

  await runChatAgent({
    config: { ...config, model: 'gpt-4.1', reasoningEffort: null },
    request: { ...request, question: 'Vùng nào đang tệ nhất?' },
    userClient: {}
  }, { openai });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].reasoning, undefined);
  assert.equal(requests[0].include, undefined);
});

test('agent retries one empty completed answer before returning text', async () => {
  let calls = 0;
  const emptyResponse = { status: 'completed', usage, output: [] };
  const answeredResponse = { status: 'completed', usage, output: [] };
  const openai = {
    responses: {
      async create(body) {
        calls += 1;
        if (!body.stream) return emptyResponse;
        const response = calls === 2 ? emptyResponse : answeredResponse;
        return {
          async *[Symbol.asyncIterator]() {
            if (calls === 3) yield { type: 'response.output_text.delta', delta: 'Mình cần bạn cho biết KPI.' };
            yield { type: 'response.completed', response };
          }
        };
      }
    }
  };
  const deltas = [];
  const result = await runChatAgent({
    config, request: { ...request, question: 'Vùng nào đang tệ nhất?' }, userClient: {},
    onText: delta => deltas.push(delta)
  }, { openai });

  assert.equal(calls, 3);
  assert.deepEqual(deltas, ['Mình cần bạn cho biết KPI.']);
  assert.equal(result.usage.length, 3);
});
