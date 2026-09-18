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

test('requestPayloadHash is stable and excludes requestId, model, and reasoningEffort', () => {
  const first = requestPayloadHash({ requestId, question: 'x', history: [], model: 'gpt-5.6-terra', reasoningEffort: 'high' });
  const second = requestPayloadHash({ requestId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8', question: 'x', history: [], model: 'gpt-5.6-luna', reasoningEffort: 'low' });
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.notEqual(first, requestPayloadHash({ question: 'different question', history: [] }));
});

test('parseRequestBody accepts valid screenContext with whitelist fields', () => {
  const result = parseRequestBody({
    requestId,
    question: 'ODR hôm nay?',
    history: [],
    screenContext: {
      activeTab: 'report1',
      client: 'SPB',
      regions: ['HCM', 'HN'],
      hubTypes: ['SOC'],
      section: 'summary'
    }
  });
  assert.deepEqual(result.screenContext, {
    activeTab: 'report1',
    client: 'SPB',
    regions: ['HCM', 'HN'],
    hubTypes: ['SOC'],
    section: 'summary'
  });
});

test('parseRequestBody preserves intentionally empty filter arrays in screenContext', () => {
  const result = parseRequestBody({
    requestId,
    question: 'ODR hôm nay?',
    history: [],
    screenContext: {
      activeTab: 'report5',
      client: null,
      regions: [],
      hubTypes: []
    }
  });
  assert.deepEqual(result.screenContext.regions, []);
  assert.deepEqual(result.screenContext.hubTypes, []);
  assert.equal(result.screenContext.client, null);
});

test('parseRequestBody rejects invalid screenContext fields, types, and script injection', () => {
  // Unknown field
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [], screenContext: { rawHtml: '<div>data</div>' } }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
  // Invalid activeTab
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [], screenContext: { activeTab: 'secret-tab' } }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
  // Invalid client
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [], screenContext: { client: 'INVALID' } }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
  // HTML tags in regions
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [], screenContext: { regions: ['<script>alert(1)</script>'] } }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
  // Non-object screenContext
  assert.throws(
    () => parseRequestBody({ requestId, question: 'x', history: [], screenContext: 'string_context' }),
    error => error.code === 'CHAT_BAD_REQUEST'
  );
});

test('requestPayloadHash changes when valid screenContext changes', () => {
  const baseReq = { requestId, question: 'Xem ODR', history: [] };
  const hash1 = requestPayloadHash({ ...baseReq, screenContext: { client: 'SPB', activeTab: 'report1' } });
  const hash2 = requestPayloadHash({ ...baseReq, screenContext: { client: 'SPE', activeTab: 'report1' } });
  const hash3 = requestPayloadHash({ ...baseReq, screenContext: { client: 'SPB', regions: ['HCM'] } });
  const hashNull = requestPayloadHash({ ...baseReq, screenContext: null });

  assert.notEqual(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.notEqual(hash1, hashNull);
  // Same content produces same hash
  const hash1Repeat = requestPayloadHash({ ...baseReq, requestId: 'different-id', screenContext: { client: 'SPB', activeTab: 'report1' } });
  assert.equal(hash1, hash1Repeat);
});
