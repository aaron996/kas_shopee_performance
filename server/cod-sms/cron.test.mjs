import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCronSecret, sweepCodSmsSources, runDailyCodSmsBatch, createCodSmsCronHandler } from './cron.js';

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    writableEnded: false,
    setHeader(key, value) { this.headers[key] = value; },
    end(payload) { this.body = payload; this.writableEnded = true; },
    on() {}
  };
  return res;
}

test('verifyCronSecret rejects when CRON_SECRET is not configured', () => {
  assert.throws(
    () => verifyCronSecret('Bearer whatever', undefined),
    (error) => error.code === 'COD_SMS_CRON_CONFIG_MISSING'
  );
});

test('verifyCronSecret rejects a mismatched or missing bearer token', () => {
  assert.throws(
    () => verifyCronSecret('Bearer wrong-secret', 'correct-secret'),
    (error) => error.code === 'COD_SMS_CRON_UNAUTHORIZED'
  );
  assert.throws(
    () => verifyCronSecret(undefined, 'correct-secret'),
    (error) => error.code === 'COD_SMS_CRON_UNAUTHORIZED'
  );
});

test('verifyCronSecret accepts the exact Bearer token Vercel Cron sends', () => {
  assert.doesNotThrow(() => verifyCronSecret('Bearer correct-secret', 'correct-secret'));
});

test('runDailyCodSmsBatch pages through the source table until a short page ends it', async () => {
  const config = { maxBatchLimit: 2 };
  const pages = [
    { summary: { requested: 2, found: 2, claimed: 2, scored: 2, noEvidence: 0, failed: 0, skippedUnchanged: 0 } },
    { summary: { requested: 2, found: 1, claimed: 1, scored: 1, noEvidence: 0, failed: 0, skippedUnchanged: 0 } }
  ];
  const calls = [];
  const runBatch = async (params) => {
    calls.push({ limit: params.limit, offset: params.offset });
    return pages[calls.length - 1];
  };

  const totals = await runDailyCodSmsBatch({
    readConfig: () => config,
    createServiceClient: () => ({}),
    createRepository: () => ({}),
    runBatch
  });

  assert.deepEqual(calls, [{ limit: 2, offset: 0 }, { limit: 2, offset: 2 }]);
  assert.equal(totals.pages, 2);
  assert.equal(totals.found, 3);
  assert.equal(totals.scored, 3);
});

test('runDailyCodSmsBatch stops at the page safety cap instead of looping forever', async () => {
  const config = { maxBatchLimit: 1 };
  const runBatch = async () => ({
    summary: { requested: 1, found: 1, claimed: 1, scored: 1, noEvidence: 0, failed: 0, skippedUnchanged: 0 }
  });

  const totals = await runDailyCodSmsBatch({
    readConfig: () => config,
    createServiceClient: () => ({}),
    createRepository: () => ({}),
    runBatch,
    maxPages: 3
  });

  assert.equal(totals.pages, 3);
});

test('createCodSmsCronHandler rejects requests without a valid Bearer secret before running any batch', async () => {
  let ran = false;
  const handler = createCodSmsCronHandler({
    cronSecret: 'correct-secret',
    runDailyBatch: async () => { ran = true; return {}; }
  });

  const req = { method: 'GET', headers: { authorization: 'Bearer wrong' } };
  const res = makeRes();
  await handler(req, res);

  assert.equal(ran, false);
  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).error.code, 'COD_SMS_CRON_UNAUTHORIZED');
});

test('createCodSmsCronHandler runs the batch and returns totals for an authorized cron call', async () => {
  const handler = createCodSmsCronHandler({
    cronSecret: 'correct-secret',
    runDailyBatch: async () => ({ pages: 1, scored: 4, noEvidence: 1, failed: 0 })
  });

  const req = { method: 'GET', headers: { authorization: 'Bearer correct-secret' } };
  const res = makeRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.cron, true);
  assert.equal(body.totals.scored, 4);
});

test('sweepCodSmsSources passes force through to each page of runBatch', async () => {
  const config = { maxBatchLimit: 10 };
  const calls = [];
  const runBatch = async (params) => {
    calls.push({ force: params.force, offset: params.offset });
    return { summary: { requested: 1, found: 1, claimed: 1, scored: 0, noEvidence: 0, failed: 1, skippedUnchanged: 0 } };
  };

  const totals = await sweepCodSmsSources({ repository: {}, config, force: true, runBatch, maxPages: 1 });

  assert.equal(calls[0].force, true);
  assert.equal(totals.failed, 1);
});

test('sweepCodSmsSources defaults force to false when not passed (daily cron never force-rebills)', async () => {
  const config = { maxBatchLimit: 10 };
  let capturedForce;
  const runBatch = async (params) => {
    capturedForce = params.force;
    return { summary: { requested: 0, found: 0, claimed: 0, scored: 0, noEvidence: 0, failed: 0, skippedUnchanged: 0 } };
  };

  await sweepCodSmsSources({ repository: {}, config, runBatch, maxPages: 1 });

  assert.equal(capturedForce, false);
});

test('createCodSmsCronHandler only allows GET and POST', async () => {
  const handler = createCodSmsCronHandler({ cronSecret: 'x' });
  const req = { method: 'DELETE', headers: {} };
  const res = makeRes();
  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, POST');
});
