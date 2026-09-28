import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSnapshotToken, verifySnapshotToken, isSnapshotSecret, SNAPSHOT_TOKEN_TTL_SECONDS } from './token.js';
import { packRows, fetchSnapshotRows } from './data.js';
import { createSnapshotTokenHandler } from '../../api/snapshot-token.js';
import { createSnapshotDataHandler } from '../../api/snapshot-data.js';

const SECRET = 'test-secret';
const NOW = Date.UTC(2026, 8, 28, 1, 45);

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { this.headers[name] = value; },
    end(body) {
      this.writableEnded = true;
      this.body = body ? JSON.parse(body) : undefined;
    }
  };
}

test('snapshot token verifies until it expires', () => {
  const { token } = issueSnapshotToken(SECRET, NOW);
  assert.equal(verifySnapshotToken(SECRET, token, NOW), true);
  assert.equal(verifySnapshotToken(SECRET, token, NOW + (SNAPSHOT_TOKEN_TTL_SECONDS - 1) * 1000), true);
  assert.equal(verifySnapshotToken(SECRET, token, NOW + SNAPSHOT_TOKEN_TTL_SECONDS * 1000), false);
});

test('snapshot token rejects another secret, a moved expiry and junk', () => {
  const { token } = issueSnapshotToken(SECRET, NOW);
  const [exp, signature] = token.split('.');
  assert.equal(verifySnapshotToken('other-secret', token, NOW), false);
  assert.equal(verifySnapshotToken(SECRET, `${Number(exp) + 3600}.${signature}`, NOW), false);
  assert.equal(verifySnapshotToken(SECRET, `${token}.x`, NOW), false);
  assert.equal(verifySnapshotToken(SECRET, '', NOW), false);
  assert.equal(verifySnapshotToken(SECRET, null, NOW), false);
});

test('bearer secret check is exact', () => {
  assert.equal(isSnapshotSecret(SECRET, `Bearer ${SECRET}`), true);
  assert.equal(isSnapshotSecret(SECRET, `Bearer ${SECRET}x`), false);
  assert.equal(isSnapshotSecret(SECRET, SECRET), false);
  assert.equal(isSnapshotSecret('', 'Bearer '), false);
});

test('packRows keeps every column once and drops id/synced_at', () => {
  const packed = packRows([
    { id: 1, report_date: '2026-09-27', region: 'HCM', mau_pu: 5, synced_at: 'x' },
    { id: 2, report_date: '2026-09-27', region: 'HNO', hub: 'A' }
  ]);
  assert.deepEqual(packed.columns, ['report_date', 'region', 'mau_pu', 'hub']);
  assert.deepEqual(packed.rows, [['2026-09-27', 'HCM', 5, null], ['2026-09-27', 'HNO', null, 'A']]);
});

function fakeSupabase(rows, calls = []) {
  return {
    from(table) {
      const state = { table, filters: {}, head: false };
      const query = {
        select(_columns, options = {}) { state.head = Boolean(options.head); return query; },
        eq(column, value) { state.filters[column] = value; return query; },
        order() { return query; },
        range(from, to) { state.from = from; state.to = to; return query; },
        then(resolve) {
          calls.push({ ...state });
          const scoped = rows.filter(r => Object.entries(state.filters).every(([k, v]) => r[k] === v));
          if (state.head) return resolve({ count: scoped.length, error: null });
          return resolve({ data: scoped.slice(state.from, state.to + 1), error: null });
        }
      };
      return query;
    }
  };
}

test('fetchSnapshotRows pages through every row of the client', async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i, client_name: i % 2 ? 'SPB' : 'SPE' }));
  const calls = [];
  const result = await fetchSnapshotRows(fakeSupabase(rows, calls), { report: 'pick', clientName: 'SPB' });
  assert.equal(result.length, 1250);
  assert.ok(result.every(r => r.client_name === 'SPB'));
  assert.ok(calls.every(c => c.table === 'kas_pick_data' && c.filters.client_name === 'SPB'));
});

test('fetchSnapshotRows reads Ca1 without a client filter', async () => {
  const calls = [];
  const result = await fetchSnapshotRows(fakeSupabase([{ id: 1 }, { id: 2 }], calls), { report: 'ca1', clientName: 'SPB' });
  assert.equal(result.length, 2);
  assert.ok(calls.every(c => c.table === 'kas_ca1_data' && !('client_name' in c.filters)));
});

test('token endpoint needs the bearer secret', () => {
  const handler = createSnapshotTokenHandler({ readSecret: () => SECRET, now: () => NOW });

  const denied = createResponse();
  handler({ method: 'POST', headers: { authorization: 'Bearer nope' } }, denied);
  assert.equal(denied.statusCode, 401);

  const ok = createResponse();
  handler({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(verifySnapshotToken(SECRET, ok.body.token, NOW), true);
});

test('data endpoint rejects bad tokens and unknown reports before reading', async () => {
  let reads = 0;
  const handler = createSnapshotDataHandler({
    readConfig: () => ({ secret: SECRET, supabaseUrl: 'https://x', serviceRoleKey: 'k' }),
    createServiceClient: () => ({}),
    fetchRows: async () => { reads += 1; return []; },
    now: () => NOW
  });
  const { token } = issueSnapshotToken(SECRET, NOW);

  const badToken = createResponse();
  await handler({ method: 'GET', url: '/api/snapshot-data?report=pick&token=1.x' }, badToken);
  assert.equal(badToken.statusCode, 401);

  const badReport = createResponse();
  await handler({ method: 'GET', url: `/api/snapshot-data?report=cod&token=${token}` }, badReport);
  assert.equal(badReport.statusCode, 400);

  const badClient = createResponse();
  await handler({ method: 'GET', url: `/api/snapshot-data?report=pick&client=ALL&token=${token}` }, badClient);
  assert.equal(badClient.statusCode, 400);

  assert.equal(reads, 0);
});

test('data endpoint returns packed rows for a valid request', async () => {
  const handler = createSnapshotDataHandler({
    readConfig: () => ({ secret: SECRET, supabaseUrl: 'https://x', serviceRoleKey: 'k' }),
    createServiceClient: () => ({}),
    fetchRows: async (_client, request) => {
      assert.deepEqual(request, { report: 'deli', clientName: 'SPB' });
      return [{ id: 1, region: 'HCM', mau_deli: 3 }];
    },
    now: () => NOW
  });
  const { token } = issueSnapshotToken(SECRET, NOW);
  const res = createResponse();
  await handler({ method: 'GET', url: `/api/snapshot-data?report=deli&client=spb&token=${encodeURIComponent(token)}` }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { columns: ['region', 'mau_deli'], rows: [['HCM', 3]] });
});
