import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodSmsAssessmentsHandler } from '../../api/cod-sms-assessments.js';

// Supports both the plain-JSON path (sendJson, pre-SSE errors) and the SSE
// path (startSse/sendSse/res.end() with no argument): each res.write() chunk
// is buffered as raw text, and sseEvents() parses it into {event, data} pairs.
function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    writableEnded: false,
    headersSent: false,
    rawBody: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    on() {},
    write(chunk) {
      this.headersSent = true;
      this.rawBody += chunk;
      return true;
    },
    end(body) {
      if (body) this.rawBody += body;
      this.headersSent = true;
      this.writableEnded = true;
      if (this.rawBody && this.headers['Content-Type']?.includes('application/json')) {
        this.body = JSON.parse(this.rawBody);
      }
    },
    sseEvents() {
      return this.rawBody
        .split('\n\n')
        .filter(Boolean)
        .map(frame => {
          const [eventLine, dataLine] = frame.split('\n');
          return {
            event: eventLine.replace(/^event: /, ''),
            data: JSON.parse(dataLine.replace(/^data: /, ''))
          };
        });
    }
  };
}

const config = {
  maxBatchLimit: 200,
  defaultBatchLimit: 25
};

function dependencies(overrides = {}) {
  return {
    readConfig: () => config,
    authenticate: async () => ({
      user: { id: 'user-1', email: 'user@ghn.vn' },
      userClient: {},
      serviceClient: {}
    }),
    authorizeDev: async () => false,
    createRepository: () => ({ list: async () => ({ rows: [], totalCount: 0 }) }),
    resolveModelConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low' }),
    ...overrides
  };
}

test('ordinary authenticated user cannot request verbatim SMS evidence', async () => {
  const handler = createCodSmsAssessmentsHandler(dependencies());
  const req = {
    method: 'GET',
    url: '/api/cod-sms-assessments?include_evidence=true',
    headers: { authorization: 'Bearer token' }
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'COD_SMS_EVIDENCE_FORBIDDEN');
});

test('ordinary authenticated user receives assessment contract without evidence', async () => {
  const handler = createCodSmsAssessmentsHandler(dependencies({
    createRepository: () => ({
      list: async () => ({
        rows: [{
          suspicion_type: 'Gối đầu COD',
          driver_id: 'driver-1',
          order_code: 'order-1',
          status: 'scored',
          sms_score: 5,
          confidence: 'cao',
          detected_patterns: ['mau_1'],
          explanation: 'Có tín hiệu cần xác minh.',
          rubric_version: 'v1',
          model: 'gpt-5.6-luna',
          model_called: true,
          source_fingerprint: 'a'.repeat(64),
          scored_at: '2026-09-22T00:00:00.000Z',
          error_code: null,
          error_message: null,
          attempt_count: 1,
          updated_at: '2026-09-22T00:00:00.000Z'
        }],
        totalCount: 1
      })
    })
  }));
  const req = {
    method: 'GET',
    url: '/api/cod-sms-assessments',
    headers: { authorization: 'Bearer token' }
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.contractVersion, '1');
  assert.equal(res.body.assessments[0].evidence, null);
  assert.equal(res.body.assessments[0].evidenceRestricted, true);
});

test('only Dev Admin can run a scoring batch', async () => {
  let batchCalls = 0;
  const handler = createCodSmsAssessmentsHandler(dependencies({
    runBatch: async () => {
      batchCalls += 1;
      return { summary: {}, rows: [] };
    }
  }));
  const req = {
    method: 'POST',
    url: '/api/cod-sms-assessments',
    headers: { authorization: 'Bearer token' },
    body: {}
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'COD_SMS_BATCH_FORBIDDEN');
  assert.equal(batchCalls, 0);
});

test('Dev Admin can run an explicit non-forced page and receives contract v1', async () => {
  let received;
  const handler = createCodSmsAssessmentsHandler(dependencies({
    authorizeDev: async () => true,
    runBatch: async params => {
      received = params;
      return { summary: { found: 0, skippedUnchanged: 0 }, rows: [] };
    }
  }));
  const req = {
    method: 'POST',
    url: '/api/cod-sms-assessments',
    headers: { authorization: 'Bearer token' },
    body: { limit: 25, offset: 50, force: false }
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const events = res.sseEvents();
  const batchEnd = events.find(e => e.event === 'batch_end');
  assert.ok(batchEnd, 'expected a batch_end SSE event');
  assert.equal(batchEnd.data.contractVersion, '1');
  assert.equal(batchEnd.data.batch.limit, 25);
  assert.equal(batchEnd.data.batch.offset, 50);
  assert.equal(received.force, false);
});
