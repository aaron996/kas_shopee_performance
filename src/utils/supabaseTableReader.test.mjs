import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { fetchAllSnapshotRows } from './supabaseTableReader.js';
import { fetchSupabaseSheetSync } from './supabaseSheetSync.js';

const stamp = '2026-10-07T01:30:00+00:00';
const makeRows = (ids, syncedAt = stamp) => ids.map(id => ({
  id, synced_at: syncedAt, report_date: '2026-10-06', client_name: 'SPB',
  hub: 'Hub A', mau_pu: 10, ontime_pu_1st: 9
}));

function fakeClient(initialRows, { cap = Infinity, onRequest } = {}) {
  let rows = initialRows;
  const calls = [];
  const client = {
    calls,
    replace(nextRows) { rows = nextRows; },
    from(table) {
      const state = { table, columns: '*', ascending: true };
      const query = {
        select(columns) { state.columns = columns; return query; },
        order(column, { ascending }) { assert.equal(column, 'id'); state.ascending = ascending; return query; },
        limit(limit) { state.limit = limit; return query; },
        gt(column, value) { assert.equal(column, 'id'); state.after = value; return query; },
        lte(column, value) { assert.equal(column, 'id'); state.upper = value; return query; },
        abortSignal(signal) { state.signal = signal; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(async () => {
            calls.push({ ...state });
            const override = await onRequest?.(state, client);
            if (override) return override;
            const source = Array.isArray(rows) ? rows : rows[table] || [];
            const scoped = source.filter(row =>
              (state.after === undefined || BigInt(row.id) > BigInt(state.after)) &&
              (state.upper === undefined || BigInt(row.id) <= BigInt(state.upper)))
              .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1) * (state.ascending ? 1 : -1))
              .slice(0, Math.min(state.limit, cap));
            return { data: scoped.map(row => state.columns === '*' ? row : { id: row.id, synced_at: row.synced_at }), error: null };
          }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  return client;
}

test('preserves all operational rows, including duplicate business keys and gaps in identity IDs', async () => {
  const rows = makeRows([41, 52, 79, 80, 104, 3001]);
  const client = fakeClient(rows);
  assert.deepEqual(await fetchAllSnapshotRows(client, 'pick', { pageSize: 2 }), rows);
  assert.equal(client.calls.filter(call => call.columns === '*').length, 3);
  assert.ok(client.calls.every(call => call.signal instanceof AbortSignal));
});

test('reads the complete snapshot when the server returns fewer rows than the requested page size', async () => {
  const rows = makeRows([1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(await fetchAllSnapshotRows(fakeClient(rows, { cap: 2 }), 'pick', { pageSize: 4 }), rows);
});

test('an exact full page at the page budget is complete without an extra empty request', async () => {
  const rows = makeRows([1, 2, 3, 4]);
  const client = fakeClient(rows);
  assert.deepEqual(await fetchAllSnapshotRows(client, 'pick', { pageSize: 2, maxPages: 2 }), rows);
  assert.equal(client.calls.filter(call => call.columns === '*').length, 2);
});

test('a replacement during pagination discards old rows and restarts with the new snapshot', async () => {
  const fresh = makeRows([101, 102, 103, 104, 105], '2026-10-07T02:00:00+00:00');
  let replaced = false;
  const client = fakeClient(makeRows([1, 2, 3, 4]), {
    onRequest(state, db) {
      if (!replaced && state.after !== undefined) {
        replaced = true;
        db.replace(fresh);
      }
    }
  });
  assert.deepEqual(await fetchAllSnapshotRows(client, 'pick', { pageSize: 2 }), fresh);
});

test('a replacement with reused IDs is detected by its sync timestamp', async () => {
  const fresh = makeRows([1, 2, 3], '2026-10-07T02:00:00+00:00');
  let probes = 0;
  const client = fakeClient(makeRows([1, 2, 3]), {
    onRequest(state, db) {
      if (state.columns !== '*' && ++probes === 2) db.replace(fresh);
    }
  });
  assert.deepEqual(await fetchAllSnapshotRows(client, 'pick', { pageSize: 2 }), fresh);
});

test('repeated replacements fail instead of publishing a mixed snapshot or retrying forever', async () => {
  let probes = 0;
  const client = fakeClient(makeRows([1, 2]), {
    onRequest(state, db) {
      if (state.columns !== '*' && ++probes % 2 === 0) db.replace(makeRows([probes * 10, probes * 10 + 1]));
    }
  });
  await assert.rejects(fetchAllSnapshotRows(client, 'pick'), /SNAPSHOT_CHANGED:pick/);
  assert.equal(probes, 4);
});

test('a snapshot emptied during the read restarts and returns the empty current table', async () => {
  const client = fakeClient(makeRows([1, 2, 3]), {
    onRequest(state, db) { if (state.after !== undefined) db.replace([]); }
  });
  assert.deepEqual(await fetchAllSnapshotRows(client, 'pick', { pageSize: 2 }), []);
});

test('numeric string IDs beyond JavaScript safe integers keep their exact cursor values', async () => {
  const rows = makeRows(['9007199254740992', '9007199254740993', '9007199254740999']);
  assert.deepEqual(await fetchAllSnapshotRows(fakeClient(rows), 'pick', { pageSize: 1 }), rows);
});

test('page limits and unexpected empty pages reject incomplete KPI data', async () => {
  await assert.rejects(fetchAllSnapshotRows(fakeClient(makeRows([1, 2, 3])), 'pick', {
    pageSize: 1, maxPages: 2
  }), /INCOMPLETE_SNAPSHOT:pick/);
  const earlyEnd = fakeClient(makeRows([1, 2, 3]), {
    onRequest(state) { if (state.after !== undefined) return { data: [], error: null }; }
  });
  await assert.rejects(fetchAllSnapshotRows(earlyEnd, 'pick', { pageSize: 1 }), /INCOMPLETE_SNAPSHOT:pick/);
});

test('duplicate, unsorted, out-of-bound and unsafe IDs fail rather than skipping rows', async () => {
  for (const ids of [[1, 1], [2, 1], [1, 4], [Number.MAX_SAFE_INTEGER + 1]]) {
    const client = fakeClient(makeRows([1, 2, 3]), {
      onRequest(state) { if (state.columns === '*') return { data: makeRows(ids), error: null }; }
    });
    await assert.rejects(fetchAllSnapshotRows(client, 'pick'), /INVALID_(PAGE_ORDER|ROW_ID):pick/);
  }
});

test('a later page error never returns the already downloaded partial rows', async () => {
  const client = fakeClient(makeRows([1, 2, 3]), {
    onRequest(state) { if (state.after !== undefined) return { data: null, error: new Error('DB unavailable') }; }
  });
  await assert.rejects(fetchAllSnapshotRows(client, 'pick', { pageSize: 1 }), /DB unavailable/);
});

test('a timed-out request is aborted and reports the existing timeout code', async () => {
  const client = fakeClient(makeRows([1]), {
    onRequest() { return new Promise(() => {}); }
  });
  await assert.rejects(fetchAllSnapshotRows(client, 'pick', { timeoutMs: 20 }), /REQUEST_TIMEOUT:pick/);
  assert.equal(client.calls[0].signal.aborted, true);
  assert.equal(client.calls.length, 1);
});

test('an empty table only needs its boundary probe', async () => {
  const client = fakeClient([]);
  assert.deepEqual(await fetchAllSnapshotRows(client, 'pick'), []);
  assert.equal(client.calls.length, 1);
});

test('the real Supabase SDK reads complete history through cursor REST requests without OFFSET', async () => {
  const rows = Array.from({ length: 1005 }, (_, index) => ({
    ...makeRows([5000 + index * 3])[0],
    report_date: index % 2 ? '2026-10-06' : '2026-09-30',
    client_name: index % 3 ? 'SPB' : 'SPE',
    mau_pu: index + 1
  }));
  const requests = [];
  const client = createClient('https://fixture.supabase.co', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input);
        requests.push(url);
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(url.searchParams.has('offset'), false);
        const predicates = url.searchParams.getAll('id');
        const scoped = rows.filter(row => predicates.every(predicate => {
          const [operator, id] = predicate.split('.');
          return operator === 'gt' ? row.id > Number(id) : row.id <= Number(id);
        })).sort((a, b) => url.searchParams.get('order') === 'id.desc' ? b.id - a.id : a.id - b.id)
          .slice(0, Number(url.searchParams.get('limit')));
        const body = url.searchParams.get('select') === '*' ? scoped : scoped.map(({ id, synced_at }) => ({ id, synced_at }));
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
  });
  const result = await fetchAllSnapshotRows(client, 'kas_pick_data');
  assert.deepEqual(result, rows);
  assert.equal(result.reduce((sum, row) => sum + row.mau_pu, 0), 505515);
  assert.equal(new Set(result.map(row => row.client_name)).size, 2);
  assert.equal(new Set(result.map(row => row.report_date)).size, 2);
  assert.equal(requests.filter(url => url.searchParams.get('select') === '*').length, 2);
  assert.deepEqual(requests[2].searchParams.getAll('id'), ['lte.8012', 'gt.7997']);
});

test('the dashboard sync keeps its five datasets, row shape and newest timestamp', async () => {
  const datasets = Object.fromEntries(['pick', 'deli', 'ca1', 'leadtime', 'fd'].map((name, index) =>
    [`kas_${name}_data`, makeRows([index + 1], `2026-10-07T0${index + 1}:00:00+00:00`)]));
  const result = await fetchSupabaseSheetSync(fakeClient(datasets));
  assert.equal(result.success, true);
  for (const name of ['pick', 'deli', 'ca1', 'leadtime', 'fd']) {
    assert.deepEqual(result[`${name}Data`], datasets[`kas_${name}_data`]);
  }
  assert.equal(result.updatedAt, '2026-10-07T05:00:00+00:00');
});

test('optional source failures remain nullable while required source failures fail the sync', async context => {
  context.mock.method(console, 'warn', () => {});
  const datasets = { kas_pick_data: makeRows([1]), kas_deli_data: makeRows([2]) };
  const optionalFailure = fakeClient(datasets, {
    onRequest(state) {
      if (state.table === 'kas_fd_data') return { data: null, error: new Error('FD unavailable') };
    }
  });
  const result = await fetchSupabaseSheetSync(optionalFailure);
  assert.equal(result.success, true);
  assert.equal(result.fdData, null);
  assert.equal(result.ca1Data, null);
  assert.equal(result.leadtimeData, null);

  const requiredFailure = fakeClient(datasets, {
    onRequest(state) {
      if (state.table === 'kas_pick_data') return { data: null, error: new Error('Pickup unavailable') };
    }
  });
  assert.deepEqual(await fetchSupabaseSheetSync(requiredFailure), { success: false, error: 'Pickup unavailable' });
  assert.deepEqual(await fetchSupabaseSheetSync(fakeClient([])), { success: false, error: 'NO_SYNCED_DATA' });
});

test('all datasets start together but core readiness does not wait for Ca1 or Leadtime', async () => {
  let releaseOptional;
  const optionalGate = new Promise(resolve => { releaseOptional = resolve; });
  let coreReady;
  const ready = new Promise(resolve => { coreReady = resolve; });
  const started = new Set();
  const datasets = Object.fromEntries(['pick', 'deli', 'ca1', 'leadtime', 'fd'].map((name, index) =>
    [`kas_${name}_data`, makeRows([index + 1])]));
  const client = fakeClient(datasets, { async onRequest(state) {
    started.add(state.table);
    if (['kas_ca1_data', 'kas_leadtime_data'].includes(state.table)) await optionalGate;
  } });
  let finished = false;
  const sync = fetchSupabaseSheetSync(client, { onCoreReady: coreReady }).then(result => {
    finished = true;
    return result;
  });
  const core = await ready;
  assert.equal(started.size, 5);
  assert.equal(finished, false);
  assert.deepEqual(core.pickData, datasets.kas_pick_data);
  assert.deepEqual(core.deliData, datasets.kas_deli_data);
  assert.deepEqual(core.fdData, datasets.kas_fd_data);
  releaseOptional();
  assert.equal((await sync).success, true);
});

test('empty required data never signals core readiness', async () => {
  let ready = false;
  const result = await fetchSupabaseSheetSync(fakeClient({ kas_pick_data: makeRows([1]) }), {
    onCoreReady: () => { ready = true; }
  });
  assert.equal(result.success, false);
  assert.equal(ready, false);
});
