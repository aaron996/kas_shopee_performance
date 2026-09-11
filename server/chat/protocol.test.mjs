import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestBody, requestPayloadHash } from './protocol.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';

test('parseRequestBody normalizes a valid conversation', () => {
  const result = parseRequestBody(Buffer.from(JSON.stringify({
    requestId: requestId.toUpperCase(),
    question: '  KPI ODR tuần này? ',
    model: ' gpt-5.6-terra ',
    reasoningEffort: ' high ',
    history: [
      { role: 'user', content: 'Xin chào' },
      { role: 'assistant', content: 'Bạn cần xem gì?' }
    ]
  })), '200');

  assert.equal(result.requestId, requestId);
  assert.equal(result.question, 'KPI ODR tuần này?');
  assert.equal(result.history[0].content, 'Xin chào');
  assert.equal(result.model, undefined);
  assert.equal(result.reasoningEffort, undefined);
});

test('parseRequestBody rejects unknown fields and unfinished history', () => {
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [], filterState: {} }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [{ role: 'user', content: 'trước đó' }] }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
});

test('requestPayloadHash is stable and excludes requestId, model, and reasoningEffort', () => {
  const first = requestPayloadHash({ requestId, question: 'x', history: [], model: 'gpt-5.6-terra', reasoningEffort: 'high' });
  const second = requestPayloadHash({ requestId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8', question: 'x', history: [], model: 'gpt-5.6-luna', reasoningEffort: 'low' });
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.notEqual(first, requestPayloadHash({ question: 'different question', history: [] }));
});
