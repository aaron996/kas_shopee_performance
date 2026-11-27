import test from 'node:test';
import assert from 'node:assert/strict';
import { createOverviewMtdLoader } from './overviewMtdLoader.js';
import { createResourceCache } from './resourceCache.js';
import { aggregateOverviewMtd } from './overviewMtd.js';

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

test('Reverse reads full-month history in sequential bounded slices and isolates standard caches', async () => {
  const calls = [], events = [];
  let active = 0;
  const loader = createOverviewMtdLoader({ load: async () => null, save: async () => {} });
  const client = { rpc: async (name, args) => {
    assert.equal(active++, 0, 'daily slices must not run concurrently');
    await tick();
    calls.push([name, args]);
    active--;
    if (name === 'get_kas_mtd_compact') return payload(999, args);
    assert.equal(args.dataset, 'reverse');
    return { data: { cols: ['report_date', 'client_name', 'region', 'hub_type', 'mau_pu', 'ontime_pu_1st', 'ontime_pu_opr', 'pud'],
      rows: [[args.from_date, 'SPE Reverse', 'HCM', 'BC', 100, 60, 50, 1]] } };
  } };
  const run = dataset => loader.run({ client, scope: 'a:user', ranges: [[dataset, '2026-10-31']],
    onResult: (source, result) => events.push([source, result]) });
  await run('reverse');
  assert.deepEqual(calls.map(([name, args]) => [name, args.from_date, args.to_date]), [
    ['get_kas_daily_compact', '2026-10-01', '2026-10-10'],
    ['get_kas_daily_compact', '2026-10-11', '2026-10-20'],
    ['get_kas_daily_compact', '2026-10-21', '2026-10-30'],
    ['get_kas_daily_compact', '2026-10-31', '2026-10-31'],
  ]);
  const rows = events.at(-1)[1].rows;
  assert.equal(aggregateOverviewMtd(rows, 'p1st', '2026-10-31').tot, 400);
  assert.equal(aggregateOverviewMtd(rows, 'pud', '2026-10-31').pct, 1);
  await run('reverse');
  assert.equal(calls.length, 4, 'reuses bounded identity/source/range cache');
  await run('pick');
  assert.equal(calls.at(-1)[0], 'get_kas_mtd_compact');
  assert.equal(calls.length, 5);
});

test('failure mid-month never publishes a partial MTD as a successful result', async () => {
  const events = [];
  const loader = createOverviewMtdLoader({ load: async () => null, save: async () => assert.fail('partial data must not be cached') });
  await loader.run({ scope: 'a:user', ranges: [['reverse', '2026-10-26']],
    onResult: (...args) => events.push(args), client: { rpc: async (_name, args) => args.from_date === '2026-10-01'
      ? { data: { cols: ['mau_pu'], rows: [[100]] } } : { error: Error('offline') } } });
  assert.deepEqual(events, [['reverse', { error: true }]]);
});
