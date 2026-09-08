import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createChatHandler } from '../../api/chat.js';
import { ChatError } from './errors.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const config = { model: 'gpt-5.6-luna', turnTimeoutMs: 5000 };

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

function request() {
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = { authorization: 'Bearer test', 'content-length': '120' };
  req.body = { requestId, question: 'ODR SPB tháng 8?', history: [] };
  return req;
}

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
