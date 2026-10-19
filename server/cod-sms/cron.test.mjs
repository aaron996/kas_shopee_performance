import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCronSecret, sweepCodSmsSources, runDailyCodSmsBatch, runCodSmsDispatchChunk, createCodSmsCronHandler } from './cron.js';

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
    resolveModelConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low' }),
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
    resolveModelConfig: async () => ({ model: 'gpt-5.6-luna', reasoningEffort: 'low' }),
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
  const finished = [];
  const handler = createCodSmsCronHandler({
    cronSecret: 'correct-secret',
    createDispatchRepository: () => ({ claim: async () => 'lease', finish: async (...args) => {
      finished.push(args); return { status: 'completed', totals: { scored: 4 }, continuing: false };
    } }),
    runDailyBatch: async () => ({ pages: 1, scored: 4, noEvidence: 1, failed: 0 })
  });

  const req = { method: 'POST', headers: { authorization: 'Bearer correct-secret' }, body: { dispatchId: '00000000-0000-0000-0000-000000000001' } };
  const res = makeRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.cron, true);
  assert.equal(body.totals.scored, 4);
  assert.equal(finished[0][1], 'lease');
  assert.equal(body.status, 'completed');
});

test('duplicate scheduler delivery and old Vercel cron cannot invoke scoring', async () => {
  let ran = 0;
  const handler = createCodSmsCronHandler({ cronSecret: 's', runDailyBatch: async () => { ran++; },
    createDispatchRepository: () => ({ claim: async () => false }) });
  const invalid = makeRes(); await handler({ method: 'GET', headers: { authorization: 'Bearer s' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const duplicate = makeRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer s' }, body: { dispatchId: '00000000-0000-0000-0000-000000000001' } }, duplicate);
  assert.equal(duplicate.statusCode, 200); assert.equal(ran, 0);
});

test('dedicated scheduler secret takes precedence without rotating the legacy cron secret', async () => {
  let claims = 0;
  const handler = createCodSmsCronHandler({ env: { COD_SMS_SCHEDULER_SECRET: 'scheduler', CRON_SECRET: 'legacy' },
    createDispatchRepository: () => ({ claim: async () => { claims++; return false; } }) });
  const body = { dispatchId: '00000000-0000-0000-0000-000000000001' };
  const denied = makeRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer legacy' }, body }, denied);
  assert.equal(denied.statusCode, 401); assert.equal(claims, 0);
  const allowed = makeRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer scheduler' }, body }, allowed);
  assert.equal(allowed.statusCode, 200); assert.equal(claims, 1);
});

test('scheduler persists batch failures and partial completion without leaking secrets', async () => {
  for (const fail of [true, false]) {
    const finished = [];
    const handler = createCodSmsCronHandler({ cronSecret: 's',
      createDispatchRepository: () => ({ claim: async () => 'lease', finish: async (...args) => {
        finished.push(args); return { status: 'partial', totals: { failed: 1, scored: 3 } };
      } }),
      runDailyBatch: async () => { if (fail) throw new Error('private-secret'); return { failed: 1, scored: 3 }; } });
    const res = makeRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer s' }, body: { dispatchId: '00000000-0000-0000-0000-000000000001' } }, res);
    assert.equal(finished[0][1], 'lease');
    assert.equal(Boolean(finished[0][2]), fail); assert.ok(!res.body.includes('private-secret'));
  }
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

test('durable worker checkpoints before its deadline and resumes the same run without forcing',async()=>{
  let clock=0;
  const calls=[];
  const cases=[{suspicionType:'Gối đầu COD',driverId:'1',orderCode:'A'}];
  const options={
    now:()=>clock,dispatchId:'dispatch',leaseToken:'lease',
    readConfig:()=>({modelTimeoutMs:60000,maxBatchLimit:200}),createServiceClient:()=>({}),createRepository:()=>({}),
    resolveModelConfig:async()=>({model:'gpt-6-luna',reasoningEffort:'max'}),
    dispatchRepository:{prepare:async()=>({runId:'same-run',startedAt:'2026-10-19T00:00:00Z',config:{model:'frozen-model',modelTimeoutMs:60000}}),nextCases:async()=>cases},
    runBatch:async params=>{calls.push(params);clock+=160000;return {summary:{found:1,aborted:true},rows:[]};}
  };
  await runCodSmsDispatchChunk(options);
  clock=0; await runCodSmsDispatchChunk(options);
  assert.equal(calls.length,2);
  for(const params of calls){assert.equal(params.runId,'same-run');assert.equal(params.force,false);assert.equal(params.durable,true);assert.equal(params.config.model,'frozen-model');}
});

test('durable worker acknowledges removed source keys and defers live pending claims',async()=>{
  for(const deferred of [0,1]){
    const logged=[];let reads=0;
    await runCodSmsDispatchChunk({
      readConfig:()=>({modelTimeoutMs:60000}),createServiceClient:()=>({}),createRepository:()=>({recordRunItems:async(...args)=>logged.push(args)}),
      resolveModelConfig:async()=>({}),dispatchId:'d',leaseToken:'l',
      dispatchRepository:{prepare:async()=>({runId:'r',config:{}}),nextCases:async()=>++reads===1?[{suspicionType:'Gối đầu COD',driverId:'1',orderCode:'gone'}]:[]},
      runBatch:async()=>({summary:{found:0,deferred},rows:[]})
    });
    assert.equal(logged.length,deferred?0:1);
    if(!deferred)assert.equal(logged[0][1][0].assessment.order_code,'gone');
  }
});
