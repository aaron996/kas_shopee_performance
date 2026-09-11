import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createChatHandler } from '../../api/chat.js';
import { ChatError } from './errors.js';
import { ALLOWED_MODELS } from './config.js';

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

test('GET exposes model and reasoning controls only to Dev Admin', async () => {
  const createHandler = email => createChatHandler({
    readConfig: () => config,
    authenticate: async () => ({ user: { id: 'u1', email }, userClient: {}, serviceClient: {} }),
    getUserQuotaInfo: async () => ({ remainingTurns: 10 })
  });

  const adminResponse = new FakeResponse();
  await createHandler('vinhlt@ghn.vn')(request({}, 'GET'), adminResponse);
  const adminPayload = JSON.parse(adminResponse.body);
  assert.equal(adminPayload.defaultModel, 'gpt-5.6-luna');
  assert.equal(adminPayload.defaultReasoningEffort, 'low');
  assert.ok(adminPayload.allowedModels.some(model => model.id === 'gpt-5.6-terra'));

  const userResponse = new FakeResponse();
  await createHandler('user@ghn.vn')(request({}, 'GET'), userResponse);
  const userPayload = JSON.parse(userResponse.body);
  assert.equal(userPayload.allowedModels, undefined);
  assert.equal(userPayload.defaultModel, undefined);
  assert.equal(userPayload.defaultReasoningEffort, undefined);
});

test('Dev Admin can run Terra with an allowed reasoning effort end to end', async () => {
  const seenConfigs = [];
  const handler = createChatHandler({
    readConfig: () => config,
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
  await handler(request({ model: 'gpt-5.6-terra', reasoningEffort: 'max' }), res);

  assert.equal(seenConfigs.length, 2);
  for (const effectiveConfig of seenConfigs) {
    assert.equal(effectiveConfig.model, 'gpt-5.6-terra');
    assert.equal(effectiveConfig.reasoningEffort, 'max');
  }
  assert.match(res.body, /"model":"gpt-5.6-terra"/);
  assert.match(res.body, /"reasoningEffort":"max"/);
});

test('every advertised model/reasoning combination reaches the agent unchanged', async () => {
  const combinations = ALLOWED_MODELS.flatMap(model => {
    if (model.reasoningEfforts.length === 0) return [{ model: model.id, reasoningEffort: null }];
    return model.reasoningEfforts.map(reasoningEffort => ({ model: model.id, reasoningEffort }));
  });

  for (const combination of combinations) {
    let agentConfig;
    const handler = createChatHandler({
      readConfig: () => config,
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
    const body = { model: combination.model };
    if (combination.reasoningEffort) body.reasoningEffort = combination.reasoningEffort;
    await handler(request(body), new FakeResponse());

    assert.equal(agentConfig.model, combination.model);
    assert.equal(agentConfig.reasoningEffort, combination.reasoningEffort);
  }
});

test('ordinary users cannot override model or reasoning even with a forged body', async () => {
  let effectiveConfig;
  const handler = createChatHandler({
    readConfig: () => config,
    authenticate: async () => ({
      user: { id: 'user', email: 'user@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    reserve: async (_client, selectedConfig) => { effectiveConfig = selectedConfig; },
    runAgent: async () => completedAgentResult,
    finalize: async () => {}
  });
  const res = new FakeResponse();
  await handler(request({ model: 'gpt-5.6-terra', reasoningEffort: 'max' }), res);

  assert.equal(effectiveConfig.model, 'gpt-5.6-luna');
  assert.equal(effectiveConfig.reasoningEffort, 'low');
  assert.match(res.body, /"model":"gpt-5.6-luna"/);
  assert.match(res.body, /"reasoningEffort":"low"/);
});

test('Dev Admin receives a safe 400 for an incompatible model/reasoning pair', async () => {
  let reserveCalled = false;
  const handler = createChatHandler({
    readConfig: () => config,
    authenticate: async () => ({
      user: { id: 'admin', email: 'vinhlt@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    reserve: async () => { reserveCalled = true; }
  });
  const res = new FakeResponse();
  await handler(request({ model: 'gpt-4.1', reasoningEffort: 'high' }), res);

  assert.equal(reserveCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error.code, 'CHAT_REASONING_NOT_SUPPORTED');
});

test('quota rejection records the Dev Admin effective model and reasoning selection', async () => {
  let rejectionConfig;
  const handler = createChatHandler({
    readConfig: () => config,
    authenticate: async () => ({
      user: { id: 'admin', email: 'vinhlt@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    reserve: async () => { throw new ChatError('CHAT_QUOTA_EXCEEDED', 'Hết lượt.', 429); },
    recordQuotaRejection: async (_client, selectedConfig) => { rejectionConfig = selectedConfig; }
  });
  const res = new FakeResponse();
  await handler(request({ model: 'gpt-5.6-terra', reasoningEffort: 'high' }), res);

  assert.equal(rejectionConfig.model, 'gpt-5.6-terra');
  assert.equal(rejectionConfig.reasoningEffort, 'high');
});

test('quota failure returns JSON and never calls the agent', async () => {
  let agentCalled = false;
  const handler = createChatHandler({
    readConfig: () => config,
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
