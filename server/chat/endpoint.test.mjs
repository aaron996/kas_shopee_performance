import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createChatHandler } from '../../api/chat.js';
import { ChatError } from './errors.js';
import { ALLOWED_MODELS } from './config.js';
import { requestPayloadHash } from './protocol.js';
import { serializeEvidence } from './context.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const config = {
  model: 'gpt-5.6-luna',
  reasoningEffort: 'low',
  allowedModels: ALLOWED_MODELS,
  turnTimeoutMs: 5000
};

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.body = '';
    this.headersSent = false;
    this.writableEnded = false;
    this.destroyed = false;
  }
  setHeader(name, value) { this.headers[name] = value; }
  flushHeaders() { this.headersSent = true; }
  write(chunk) { this.headersSent = true; this.body += chunk; return true; }
  end(chunk = '') { this.body += chunk; this.headersSent = true; this.writableEnded = true; }
}

function request(body = {}, method = 'POST') {
  const req = new EventEmitter();
  req.method = method;
  req.headers = { authorization: 'Bearer test', 'content-length': '120' };
  req.body = { requestId, question: 'ODR SPB tháng 8?', history: [], ...body };
  return req;
}

const completedAgentResult = {
  usage: [],
  toolNames: ['get_metric_summary'],
  sources: [],
  actualMicrousd: 10
};

test('endpoint reserves quota before agent work and finalizes before message_end', async () => {
  const order = [];
  const handler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low', source: 'env' }),
    authenticate: async () => { order.push('auth'); return { user: { id: 'u1' }, userClient: {}, serviceClient: {} }; },
    reserve: async () => { order.push('reserve'); },
    runAgent: async ({ onStatus, onText, onSource }) => {
      order.push('agent');
      onStatus({ phase: 'answering' });
      onSource({ evidenceId: 'db_1' });
      onText('95%');
      return { usage: [], toolNames: ['get_metric_summary'], sources: [], actualMicrousd: 10 };
    },
    finalize: async (_client, _id, details) => { order.push(`finalize:${details.status}`); }
  });
  const res = new FakeResponse();
  await handler(request(), res);

  assert.deepEqual(order, ['auth', 'reserve', 'agent', 'finalize:completed']);
  assert.match(res.headers['Content-Type'], /text\/event-stream/);
  assert.match(res.body, /event: text_delta/);
  assert.ok(res.body.indexOf('event: message_end') > res.body.indexOf('event: text_delta'));
});

test('endpoint streams a structured interaction before completing the message', async () => {
  const interaction = {
    type: 'query_parameters', interactionId: 'choice_1', prompt: 'Chọn phạm vi và thời gian.',
    query: { metric: 'opr', client: null, dateMode: null, dateFrom: null, dateTo: null },
    fields: []
  };
  const handler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low', source: 'env' }),
    authenticate: async () => ({ user: { id: 'u1' }, userClient: {}, serviceClient: {} }),
    reserve: async () => ({ remainingTurns: 9 }),
    runAgent: async ({ onInteraction }) => {
      onInteraction(interaction);
      return { ...completedAgentResult, toolNames: ['request_metric_query'], interaction };
    },
    finalize: async () => {}
  });
  const res = new FakeResponse();
  await handler(request({ question: 'Xem OPR' }), res);

  assert.match(res.body, /event: interaction/);
  assert.match(res.body, /"type":"query_parameters"/);
  assert.ok(res.body.indexOf('event: message_end') > res.body.indexOf('event: interaction'));
});

test('GET /api/chat returns only quota info and does not expose model controls', async () => {
  const createHandler = email => createChatHandler({
    readConfig: () => config,
    authenticate: async () => ({ user: { id: 'u1', email }, userClient: {}, serviceClient: {} }),
    getUserQuotaInfo: async () => ({ remainingTurns: 10 })
  });

  const adminResponse = new FakeResponse();
  await createHandler('vinhlt@ghn.vn')(request({}, 'GET'), adminResponse);
  const adminPayload = JSON.parse(adminResponse.body);
  assert.equal(adminPayload.quota.remainingTurns, 10);
  assert.equal(adminPayload.allowedModels, undefined);
  assert.equal(adminPayload.defaultModel, undefined);
  assert.equal(adminPayload.defaultReasoningEffort, undefined);

  const userResponse = new FakeResponse();
  await createHandler('user@ghn.vn')(request({}, 'GET'), userResponse);
  const userPayload = JSON.parse(userResponse.body);
  assert.equal(userPayload.quota.remainingTurns, 10);
  assert.equal(userPayload.allowedModels, undefined);
  assert.equal(userPayload.defaultModel, undefined);
  assert.equal(userPayload.defaultReasoningEffort, undefined);
});

test('backend resolves effective model from backend configuration and delivers via SSE message_start', async () => {
  const seenConfigs = [];
  const handler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => ({ model: 'gpt-5.6-terra', reasoningEffort: 'max', source: 'user' }),
    authenticate: async () => ({
      user: { id: 'admin', email: 'vinhlt@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    reserve: async (_client, effectiveConfig) => { seenConfigs.push(effectiveConfig); },
    runAgent: async ({ config: effectiveConfig }) => {
      seenConfigs.push(effectiveConfig);
      return completedAgentResult;
    },
    finalize: async () => {}
  });
  const res = new FakeResponse();
  await handler(request(), res);

  assert.equal(seenConfigs.length, 2);
  for (const effectiveConfig of seenConfigs) {
    assert.equal(effectiveConfig.model, 'gpt-5.6-terra');
    assert.equal(effectiveConfig.reasoningEffort, 'max');
  }
  assert.match(res.body, /"model":"gpt-5.6-terra"/);
  assert.match(res.body, /"reasoningEffort":"max"/);
});

test('both ordinary users and Dev Admin cannot override model or reasoning via client request body', async () => {
  let seenConfigUser;
  let seenConfigAdmin;

  // 1. Regular user sends forged model & reasoningEffort
  const userHandler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low', source: 'env' }),
    authenticate: async () => ({
      user: { id: 'user-1', email: 'user@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    reserve: async (_client, selectedConfig) => { seenConfigUser = selectedConfig; },
    runAgent: async () => completedAgentResult,
    finalize: async () => {}
  });
  const userRes = new FakeResponse();
  await userHandler(request({ model: 'gpt-5.6-terra', reasoningEffort: 'max' }), userRes);

  assert.equal(seenConfigUser.model, 'gpt-5.6-luna');
  assert.equal(seenConfigUser.reasoningEffort, 'low');
  assert.match(userRes.body, /"model":"gpt-5.6-luna"/);
  assert.match(userRes.body, /"reasoningEffort":"low"/);

  // 2. Dev Admin sends forged model & reasoningEffort in chat body -> also discarded
  const adminHandler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low', source: 'all' }),
    authenticate: async () => ({
      user: { id: 'admin-1', email: 'vinhlt@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    reserve: async (_client, selectedConfig) => { seenConfigAdmin = selectedConfig; },
    runAgent: async () => completedAgentResult,
    finalize: async () => {}
  });
  const adminRes = new FakeResponse();
  await adminHandler(request({ model: 'gpt-4.1', reasoningEffort: 'high' }), adminRes);

  assert.equal(seenConfigAdmin.model, 'gpt-5.6-luna');
  assert.equal(seenConfigAdmin.reasoningEffort, 'low');
  assert.match(adminRes.body, /"model":"gpt-5.6-luna"/);

  // 3. Request payload hash is invariant to forged model/reasoning in body
  const cleanReq = { requestId, question: 'ODR SPB tháng 8?', history: [] };
  const forgedReq = { requestId, question: 'ODR SPB tháng 8?', history: [], model: 'gpt-4.1', reasoningEffort: 'high' };
  assert.equal(requestPayloadHash(cleanReq), requestPayloadHash(forgedReq));
});

test('every advertised model/reasoning combination reaches the agent unchanged when resolved by backend', async () => {
  const combinations = ALLOWED_MODELS.flatMap(model => {
    if (model.reasoningEfforts.length === 0) return [{ model: model.id, reasoningEffort: null }];
    return model.reasoningEfforts.map(reasoningEffort => ({ model: model.id, reasoningEffort }));
  });

  for (const combination of combinations) {
    let agentConfig;
    const handler = createChatHandler({
      readConfig: () => config,
      resolveEffectiveConfig: async () => ({ model: combination.model, reasoningEffort: combination.reasoningEffort, source: 'all' }),
      authenticate: async () => ({
        user: { id: 'admin', email: 'vinhlt@ghn.vn' },
        userClient: {},
        serviceClient: {}
      }),
      reserve: async () => {},
      runAgent: async ({ config: selectedConfig }) => {
        agentConfig = selectedConfig;
        return completedAgentResult;
      },
      finalize: async () => {}
    });
    await handler(request(), new FakeResponse());

    assert.equal(agentConfig.model, combination.model);
    assert.equal(agentConfig.reasoningEffort, combination.reasoningEffort);
  }
});

test('endpoint fails closed (503) when backend configuration resolution fails', async () => {
  const handler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => {
      throw new ChatError('CHAT_CONFIG_UNAVAILABLE', 'Không thể kết nối cơ sở dữ liệu.', 503);
    },
    authenticate: async () => ({
      user: { id: 'admin', email: 'vinhlt@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    reserve: async () => { assert.fail('reserve should not be called on 503 failure'); }
  });
  const res = new FakeResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.body).error.code, 'CHAT_CONFIG_UNAVAILABLE');
});

test('quota rejection records the effective resolved model and reasoning selection', async () => {
  let rejectionConfig;
  const handler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => ({ model: 'gpt-5.6-terra', reasoningEffort: 'high', source: 'user' }),
    authenticate: async () => ({
      user: { id: 'admin', email: 'vinhlt@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    reserve: async () => { throw new ChatError('CHAT_QUOTA_EXCEEDED', 'Hết lượt.', 429); },
    recordQuotaRejection: async (_client, selectedConfig) => { rejectionConfig = selectedConfig; }
  });
  const res = new FakeResponse();
  await handler(request(), res);

  assert.equal(rejectionConfig.model, 'gpt-5.6-terra');
  assert.equal(rejectionConfig.reasoningEffort, 'high');
});

test('quota failure returns JSON and never calls the agent', async () => {
  let agentCalled = false;
  const handler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low', source: 'env' }),
    authenticate: async () => ({ user: { id: 'u1' }, userClient: {}, serviceClient: {} }),
    reserve: async () => { throw new ChatError('CHAT_QUOTA_EXCEEDED', 'Hết lượt.', 429); },
    runAgent: async () => { agentCalled = true; }
  });
  const res = new FakeResponse();
  await handler(request(), res);

  assert.equal(agentCalled, false);
  assert.equal(res.statusCode, 429);
  assert.match(res.headers['Content-Type'], /application\/json/);
  assert.equal(JSON.parse(res.body).error.code, 'CHAT_QUOTA_EXCEEDED');
});

test('endpoint streams fast path result with message_start, status, source, text_delta, message_end', async () => {
  const handler = createChatHandler({
    readConfig: () => config,
    resolveEffectiveConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low', source: 'env' }),
    authenticate: async () => ({ user: { id: 'u1' }, userClient: {}, serviceClient: {} }),
    reserve: async () => ({ remainingTurns: 9 }),
    runAgent: async ({ onStatus, onText, onSource }) => {
      onStatus({ phase: 'querying_database', round: 1, count: 1 });
      onSource({ evidenceId: 'db_fp_1', tool: 'get_metric_summary', dataAsOf: '2026-09-08' });
      onStatus({ phase: 'answering' });
      onText('Kết quả tra cứu KPI ODR: 95.5%');
      return {
        usage: [],
        toolNames: ['get_metric_summary'],
        sources: [{ evidenceId: 'db_fp_1', tool: 'get_metric_summary', dataAsOf: '2026-09-08' }],
        actualMicrousd: 0
      };
    },
    finalize: async () => {}
  });

  const res = new FakeResponse();
  const fastPathReq = request({
    question: 'Xem ODR, SPB, dữ liệu mới nhất.',
    query: { metric: 'odr', client: 'SPB', dateMode: 'latest', dateFrom: null, dateTo: null }
  });

  await handler(fastPathReq, res);

  assert.match(res.headers['Content-Type'], /text\/event-stream/);
  assert.match(res.body, /event: message_start/);
  assert.match(res.body, /event: status/);
  assert.match(res.body, /event: source/);
  assert.match(res.body, /event: text_delta/);
  assert.match(res.body, /event: message_end/);
  assert.match(res.body, /"estimatedMicrousd":0/);
  assert.ok(res.body.indexOf('event: message_start') < res.body.indexOf('event: source'));
  assert.ok(res.body.indexOf('event: source') < res.body.indexOf('event: text_delta'));
  assert.ok(res.body.indexOf('event: text_delta') < res.body.indexOf('event: message_end'));
});

test('serializeEvidence throws CHAT_EVIDENCE_TOO_LARGE with actionable instructions', () => {
  const largeObject = { data: 'x'.repeat(25 * 1024) };
  assert.throws(
    () => serializeEvidence(largeObject, 0),
    error => {
      assert.equal(error.code, 'CHAT_EVIDENCE_TOO_LARGE');
      assert.match(error.message, /thu hẹp/i);
      assert.match(error.message, /thời gian/i);
      assert.match(error.message, /client/i);
      assert.match(error.message, /vùng|hub/i);
      return true;
    }
  );
});
