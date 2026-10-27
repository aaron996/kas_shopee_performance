import test from 'node:test';
import assert from 'node:assert/strict';
import { createOverviewMtdLoader } from './overviewMtdLoader.js';
import { createResourceCache } from './resourceCache.js';

const ranges = [['pick', '2026-10-26'], ['deli', '2026-10-26'], ['fd', '2026-10-19']];
const payload = (value, args) => ({ data: { dataset: args.dataset, date_from: args.date_from, date_to: args.date_to,
  cols: ['region', 'mau_pu'], rows: [['HCM', value]] } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('restores all caches and completes Deli/FD while Pickup is still pending', async () => {
  const events = [], saved = [], gate = deferred(), started = deferred();
  const loader = createOverviewMtdLoader({ load: async key => [{ key, cached: true }], save: async (...args) => saved.push(args) });
  const running = loader.run({ scope: 'a:user', ranges, onResult: (dataset, result) => events.push([dataset, result]),
    client: { rpc: async (name, args) => { assert.equal(name, 'get_kas_mtd_compact'); const { dataset } = args;
      events.push(['rpc', dataset]); if (dataset === 'pick') { started.resolve(); await gate.promise; } return payload(100, args); } } });
  await started.promise;
  await tick();
  assert.deepEqual(events.filter(([, result]) => result.rows?.[0].cached).map(([dataset]) => dataset), ['pick', 'deli', 'fd']);
  assert.deepEqual(events.filter(([type]) => type === 'rpc'), [['rpc', 'pick'], ['rpc', 'deli'], ['rpc', 'fd']]);
  assert.deepEqual(events.filter(([, result]) => result.rows?.[0].mau_pu === 100).map(([dataset]) => dataset), ['deli', 'fd']);
  gate.resolve(); await running;
  assert.deepEqual(events.filter(([type]) => type === 'rpc'), [['rpc', 'pick'], ['rpc', 'deli'], ['rpc', 'fd']]);
  assert.equal(saved.length, 3);
  assert.equal(events.filter(([, result]) => result.rows?.[0].mau_pu === 100).length, 3);
});

test('reload reuses RAM; different owners, expired RAM and explicit retry read fresh data', async () => {
  let clock = 0, calls = 0;
  const loader = createOverviewMtdLoader({ load: async () => null, save: async () => {}, memory: createResourceCache({ now: () => clock }) });
  const options = { scope: 'a:user', ranges: ranges.slice(0, 1), onResult: () => {}, client: { rpc: async (_name, args) => { calls++; return payload(calls, args); } } };
  await loader.run(options); await loader.run(options); assert.equal(calls, 1);
  await loader.run({ ...options, scope: 'b:user' }); assert.equal(calls, 2);
  await loader.run({ ...options, forceRefresh: true }); assert.equal(calls, 3);
  clock = 60_001; await loader.run(options); assert.equal(calls, 4);
});

test('network failure retains restored rows and exposes retry; without cache it reports error', async () => {
  const events = [];
  const loader = createOverviewMtdLoader({ load: async key => JSON.parse(key)[1] === 'pick' ? [] : null });
  await loader.run({ scope: 'a:user', ranges, onResult: (dataset, result) => events.push([dataset, result]), client: { rpc: async () => { throw Error('offline'); } } });
  assert.deepEqual(events.filter(([dataset]) => dataset === 'pick'), [['pick', { rows: [] }], ['pick', { refreshError: true }]]);
  assert.deepEqual(new Map(events).get('deli'), { error: true });
  assert.deepEqual(new Map(events).get('fd'), { error: true });
});

test('logout/reset during a request prevents late state and disk writes', async () => {
  const gate = deferred(), started = deferred(); let writes = 0, clears = 0; const results = [];
  const loader = createOverviewMtdLoader({ load: async () => null, save: async () => { writes++; }, clear: async () => { clears++; } });
  const running = loader.run({ scope: 'a:user', ranges, onResult: result => results.push(result), client: { rpc: async (_name, args) => { started.resolve(); await gate.promise; return payload(1, args); } } });
  await started.promise; await loader.clear(); gate.resolve(); await running;
  assert.equal(writes, 0); assert.equal(clears, 1); assert.deepEqual(results, []);
});

test('no identity never requests operational rows', async () => {
  await createOverviewMtdLoader().run({ scope: '', ranges, client: { rpc: () => assert.fail('must not fetch') } });
});

test('slow disk reads/writes cannot block fresh results or overwrite them later', async () => {
  const disk = deferred(); const events = [];
  const loader = createOverviewMtdLoader({ load: () => disk.promise, save: () => new Promise(() => {}) });
  await loader.run({ scope: 'a:user', ranges, onResult: (dataset, result) => events.push([dataset, result]),
    client: { rpc: async (_name, args) => payload(12, args) } });
  assert.equal(events.length, 3);
  assert.ok(events.every(([, result]) => result.rows[0].mau_pu === 12));
  disk.resolve([{ stale: true }]); await tick();
  assert.equal(events.length, 3);
});

test('failed disk persistence does not turn a successful refresh into an error', async () => {
  const events = [];
  const loader = createOverviewMtdLoader({ load: async () => null, save: async () => { throw Error('disk full'); } });
  await loader.run({ scope: 'a:user', ranges, onResult: (dataset, result) => events.push([dataset, result]),
    client: { rpc: async (_name, args) => payload(12, args) } });
  await tick();
  assert.equal(events.length, 3);
  assert.ok(events.every(([, result]) => result.error === false));
});

test('consumer cancellation suppresses late responses; malformed payloads report dataset errors', async () => {
  const gate = deferred(), events = []; let cancelled = false;
  const loader = createOverviewMtdLoader({ load: async () => null, save: async () => assert.fail('cancelled write') });
  const run = loader.run({ scope: 'a:user', ranges, cancelled: () => cancelled,
    onResult: (...args) => events.push(args), client: { rpc: async (_name, args) => { await gate.promise; return payload(12, args); } } });
  cancelled = true; gate.resolve(); await run;
  assert.deepEqual(events, []);
  const invalid = createOverviewMtdLoader({ load: async () => null });
  await invalid.run({ scope: 'a:user', ranges: [ranges[0]], onResult: (...args) => events.push(args), client: { rpc: async () => ({ data: {} }) } });
  assert.deepEqual(events, [['pick', { error: true }]]);
});
