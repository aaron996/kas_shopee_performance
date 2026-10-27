import test from 'node:test';
import assert from 'node:assert/strict';
import { createOverviewMtdLoader } from './overviewMtdLoader.js';
import { createResourceCache } from './resourceCache.js';

const ranges = [['pick', '2026-10-26'], ['deli', '2026-10-26'], ['fd', '2026-10-19']];
const payload = value => ({ data: { weeks: ['2026-10-01'], cols: ['report_date', 'region', 'mau_pu'], rows: [['2026-10-01', 'HCM', value]] } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('restores all three persisted datasets before a slow Pickup RPC completes; revalidates sequentially', async () => {
  const events = [], saved = [], gate = deferred(), started = deferred();
  const loader = createOverviewMtdLoader({ load: async key => [{ key, cached: true }], save: async (...args) => saved.push(args) });
  const running = loader.run({ scope: 'a:user', ranges, onResult: (dataset, result) => events.push([dataset, result]),
    client: { rpc: async (_name, { dataset }) => { events.push(['rpc', dataset]); if (dataset === 'pick') { started.resolve(); await gate.promise; } return payload(100); } } });
  await started.promise;
  assert.deepEqual(events.slice(0, 3).map(([dataset]) => dataset), ['pick', 'deli', 'fd']);
  assert.deepEqual(events.filter(([type]) => type === 'rpc'), [['rpc', 'pick']]);
  gate.resolve(); await running;
  assert.deepEqual(events.filter(([type]) => type === 'rpc'), [['rpc', 'pick'], ['rpc', 'deli'], ['rpc', 'fd']]);
  assert.equal(saved.length, 3);
  assert.equal(events.filter(([, result]) => result.rows?.[0].mau_pu === 100).length, 3);
});

test('reload reuses RAM; different owners, expired RAM and explicit retry read fresh data', async () => {
  let clock = 0, calls = 0;
  const loader = createOverviewMtdLoader({ load: async () => null, save: async () => {}, memory: createResourceCache({ now: () => clock }) });
  const options = { scope: 'a:user', ranges: ranges.slice(0, 1), onResult: () => {}, client: { rpc: async () => { calls++; return payload(calls); } } };
  await loader.run(options); await loader.run(options); assert.equal(calls, 1);
  await loader.run({ ...options, scope: 'b:user' }); assert.equal(calls, 2);
  await loader.run({ ...options, forceRefresh: true }); assert.equal(calls, 3);
  clock = 60_001; await loader.run(options); assert.equal(calls, 4);
});

test('network failure retains restored rows and exposes retry; without cache it reports error', async () => {
  const events = [];
  const loader = createOverviewMtdLoader({ load: async key => JSON.parse(key)[1] === 'pick' ? [] : null });
  await loader.run({ scope: 'a:user', ranges, onResult: (dataset, result) => events.push([dataset, result]), client: { rpc: async () => { throw Error('offline'); } } });
  assert.deepEqual(events, [['pick', { rows: [] }], ['pick', { refreshError: true }], ['deli', { error: true }], ['fd', { error: true }]]);
});

test('logout/reset during a request prevents late state and disk writes', async () => {
  const gate = deferred(), started = deferred(); let writes = 0, clears = 0; const results = [];
  const loader = createOverviewMtdLoader({ load: async () => null, save: async () => { writes++; }, clear: async () => { clears++; } });
  const running = loader.run({ scope: 'a:user', ranges, onResult: result => results.push(result), client: { rpc: async () => { started.resolve(); await gate.promise; return payload(1); } } });
  await started.promise; await loader.clear(); gate.resolve(); await running;
  assert.equal(writes, 0); assert.equal(clears, 1); assert.deepEqual(results, []);
});

test('no identity never requests operational rows', async () => {
  await createOverviewMtdLoader().run({ scope: '', ranges, client: { rpc: () => assert.fail('must not fetch') } });
});
