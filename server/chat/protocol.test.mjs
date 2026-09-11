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
  assert.equal(result.model, 'gpt-5.6-terra');
  assert.equal(result.reasoningEffort, 'high');
});

test('parseRequestBody accepts a complete structured KPI query', () => {
  const result = parseRequestBody({
    requestId,
    question: 'Xem OPR, SPE, dữ liệu mới nhất.',
    history: [],
    query: { metric: 'opr', client: 'SPE', dateMode: 'latest', dateFrom: null, dateTo: null }
  });
  assert.deepEqual(result.query, { metric: 'opr', client: 'SPE', dateMode: 'latest', dateFrom: null, dateTo: null });
});

test('parseRequestBody rejects incomplete or invalid structured KPI queries', () => {
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [], query: { metric: 'opr', client: 'SPE' } }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [], query: { metric: 'opr', client: 'SPE', dateMode: 'custom', dateFrom: '2026-09-08', dateTo: '2026-09-01' } }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
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

test('requestPayloadHash is stable and excludes requestId', () => {
  const first = requestPayloadHash({ requestId, question: 'x', history: [], model: 'gpt-5.6-terra', reasoningEffort: 'high' });
  const second = requestPayloadHash({ requestId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8', question: 'x', history: [], model: 'gpt-5.6-terra', reasoningEffort: 'high' });
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.notEqual(first, requestPayloadHash({ question: 'x', history: [], model: 'gpt-5.6-terra', reasoningEffort: 'low' }));
});
