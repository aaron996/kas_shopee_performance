import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSuggestionsHandler } from '../../api/chat-suggestions.js';

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.body = '';
    this.statusCode = 200;
  }
  setHeader(name, value) { this.headers[name] = value; }
  end(chunk = '') { this.body += chunk; }
}

test('api/chat-suggestions returns dynamic suggestions when within quota', async () => {
  const handler = createSuggestionsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({ user: { id: 'u1' }, serviceClient: {} }),
    consumeQuota: async () => ({ allowed: true, count: 1, remaining: 9, date: '2026-09-18' }),
    buildSuggestions: () => ({ placeholder: 'Ví dụ: ODR?', suggestions: ['Q1', 'Q2', 'Q3'] })
  });

  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: { screenContext: { activeTab: 'report1', client: 'SPB' } }
  };
  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.quotaExceeded, false);
  assert.equal(data.remainingRefreshes, 9);
  assert.equal(data.placeholder, 'Ví dụ: ODR?');
  assert.deepEqual(data.suggestions, ['Q1', 'Q2', 'Q3']);
});

test('api/chat-suggestions returns silent fallback when quota is exhausted without 429 error', async () => {
  const handler = createSuggestionsHandler({
    readConfig: () => ({}),
    authenticate: async () => ({ user: { id: 'u1' }, serviceClient: {} }),
    consumeQuota: async () => ({ allowed: false, count: 10, remaining: 0, date: '2026-09-18' }),
    getFallback: () => ({ placeholder: 'Fallback placeholder', suggestions: ['F1', 'F2', 'F3'] })
  });

  const req = {
    method: 'GET',
    url: '/api/chat-suggestions?activeTab=report5',
    headers: { authorization: 'Bearer token' }
  };
  const res = new FakeResponse();
  await handler(req, res);

  // Status is 200 (silent fallback, no intrusive error modal or banner)
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.quotaExceeded, true);
  assert.equal(data.remainingRefreshes, 0);
  assert.equal(data.placeholder, 'Fallback placeholder');
  assert.deepEqual(data.suggestions, ['F1', 'F2', 'F3']);
});

test('api/chat-suggestions rejects unsupported HTTP methods with 405', async () => {
  const handler = createSuggestionsHandler();
  const req = { method: 'DELETE', headers: {} };
  const res = new FakeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 405);
  const data = JSON.parse(res.body);
  assert.equal(data.error.code, 'CHAT_METHOD_NOT_ALLOWED');
});
