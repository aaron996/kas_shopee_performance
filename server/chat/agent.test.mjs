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

test('structured query valid goes to fast path and DOES NOT call OpenAI agent', async () => {
  let openaiCalled = false;
  const openai = {
    responses: {
      create: async () => {
        openaiCalled = true;
        throw new Error('OpenAI should NOT be called for valid fast path query');
      }
    }
  };

  const deltas = [];
  const sources = [];
  const fastPathRequest = {
    requestId: '550e8400-e29b-41d4-a716-446655440001',
    question: 'Xem ODR, SPB, 01/09/2026–07/09/2026.',
    history: [],
    query: {
      metric: 'odr',
      client: 'SPB',
      dateMode: 'custom',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-07'
    }
  };

  const callRpc = async (_client, rpcName) => {
    assert.equal(rpcName, 'get_ai_chat_metric');
    return {
      evidenceId: 'db_fast_test',
      data: {
        metric: 'odr',
        dataAsOf: '2026-09-07',
        scope: { client: 'SPB', dateFrom: '2026-09-01', dateTo: '2026-09-07', grain: 'nationwide' },
        rows: [{ entity: 'Toàn quốc', value: 95.5, volume: 1000, ontime: 955 }]
      }
    };
  };

  const result = await runChatAgent({
    config,
    request: fastPathRequest,
    userClient: {},
    onText: delta => deltas.push(delta),
    onSource: src => sources.push(src)
  }, { openai, callRpc });

  assert.equal(openaiCalled, false);
  assert.equal(result.actualMicrousd, 0);
  assert.deepEqual(result.toolNames, ['get_metric_summary']);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].evidenceId, 'db_fast_test');
  assert.match(deltas.join(''), /95\.5%/);
});

test('query not eligible for fast path proceeds to OpenAI agent flow', async () => {
  let openaiCalled = false;
  const openai = {
    responses: {
      create: async () => {
        openaiCalled = true;
        return {
          status: 'completed', usage,
          output: [{
            type: 'message', role: 'assistant', status: 'completed',
            content: [{ type: 'output_text', text: 'Đây là câu trả lời từ AI.' }]
          }]
        };
      }
    }
  };

  const deltas = [];
  const agentRequest = {
    requestId: '550e8400-e29b-41d4-a716-446655440002',
    question: 'Giải thích leadtime chặng Middle mile',
    history: [],
    query: null
  };

  await runChatAgent({
    config,
    request: agentRequest,
    userClient: {},
    onText: delta => deltas.push(delta)
  }, { openai });

  assert.equal(openaiCalled, true);
  assert.deepEqual(deltas, ['Đây là câu trả lời từ AI.']);
});

test('falls back to OpenAI agent when fast path returns null due to unsafe RPC result', async () => {
  let openaiCalled = false;
  const openai = {
    responses: {
      create: async () => {
        openaiCalled = true;
        return {
          status: 'completed', usage,
          output: [{
            type: 'message', role: 'assistant', status: 'completed',
            content: [{ type: 'output_text', text: 'Fallback AI answer' }]
          }]
        };
      }
    }
  };

  const fastPathRequest = {
    requestId: '550e8400-e29b-41d4-a716-446655440003',
    question: 'Xem ODR, SPB, 01/09/2026–07/09/2026.',
    history: [],
    query: {
      metric: 'odr',
      client: 'SPB',
      dateMode: 'custom',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-07'
    }
  };

  const deltas = [];
  await runChatAgent({
    config,
    request: fastPathRequest,
    userClient: {},
    onText: delta => deltas.push(delta)
  }, {
    openai,
    executeFastPath: async () => null // Simulates fallback due to unsafe shape
  });

  assert.equal(openaiCalled, true);
  assert.deepEqual(deltas, ['Fallback AI answer']);
});

test('open-ended agent tool call flow receives dashboard screenContext via executeChatTool', async () => {
  const rpcCalls = [];
  const mockUserClient = {
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      if (name === 'get_ai_chat_coverage') {
        return { data: { dataAsOf: '2026-09-17', client: 'SPE', dataset: 'pick' }, error: null };
      }
      return {
        data: {
          dataAsOf: '2026-09-17',
          rows: [{ entity: 'HCM - KA', value: 94.2 }]
        },
        error: null
      };
    }
  };

  const plannerResponse = {
    status: 'completed',
    usage,
    output: [
      {
        type: 'function_call',
        call_id: 'call_open_1',
        name: 'get_latest_metric_summary',
        // Model emits open-ended call lacking client, regions, hub_types
        arguments: JSON.stringify({ metric: 'p1st' })
      }
    ]
  };

  const finalResponse = { status: 'completed', usage, output: [] };
  const stream = {
    async *[Symbol.asyncIterator]() {
      yield { type: 'response.output_text.delta', delta: 'P1ST tại HCM - KA là 94.2%.' };
      yield { type: 'response.completed', response: finalResponse };
    }
  };

  let modelCallCount = 0;
  const mockOpenAI = {
    responses: {
      async create(body) {
        modelCallCount += 1;
        if (body.stream) return stream;
        return modelCallCount === 1 ? plannerResponse : { status: 'completed', usage, output: [] };
      }
    }
  };

  const deltas = [];
  const sources = [];
  const requestWithDashboardContext = {
    requestId: '550e8400-e29b-41d4-a716-446655440004',
    question: 'Tình hình P1ST hiện tại thế nào?',
    history: [],
    query: null,
    screenContext: {
      client: 'SPE',
      regions: ['HCM - KA'],
      hubTypes: ['LM']
    }
  };

  await runChatAgent({
    config,
    request: requestWithDashboardContext,
    userClient: mockUserClient,
    onText: delta => deltas.push(delta),
    onSource: src => sources.push(src)
  }, {
    openai: mockOpenAI
  });

  // Verify that executeChatTool resolved screenContext and injected into the DB RPCs
  assert.equal(rpcCalls[0].name, 'get_ai_chat_coverage');
  assert.equal(rpcCalls[0].params.p_client, 'SPE');

  assert.equal(rpcCalls[1].name, 'get_ai_chat_metric');
  assert.equal(rpcCalls[1].params.p_metric, 'p1st');
  assert.equal(rpcCalls[1].params.p_client, 'SPE');
  assert.deepEqual(rpcCalls[1].params.p_regions, ['HCM - KA']);
  assert.deepEqual(rpcCalls[1].params.p_hub_types, ['LM']);
  assert.equal(rpcCalls[1].params.p_date_from, '2026-09-17');
  assert.equal(rpcCalls[1].params.p_date_to, '2026-09-17');

  assert.deepEqual(deltas, ['P1ST tại HCM - KA là 94.2%.']);
  assert.equal(sources.length, 1);
  assert.deepEqual(sources[0].scope.regions, ['HCM - KA']);
  assert.deepEqual(sources[0].scope.hubTypes, ['LM']);
});
