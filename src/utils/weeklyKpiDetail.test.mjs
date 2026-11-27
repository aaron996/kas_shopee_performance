import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveDetailScope, fetchDetailRows, fetchDetailOptions, clearWeeklyCache, hasLaneFilter } from './weeklyKpi.js';

test('lane filter only applies to deli and fd; scope key is order independent', () => {
  assert.deepEqual([hasLaneFilter('deli'), hasLaneFilter('fd'), hasLaneFilter('pick'), hasLaneFilter('reverse')], [true, true, false, false]);
  const scope = { provinces: ['HCM', 'BDG', 'HCM'], lanes: ['Nội tỉnh'] };
  assert.equal(effectiveDetailScope('pick', scope).lanes.length, 0);
  assert.equal(effectiveDetailScope('pick', { provinces: [], lanes: ['x'] }).active, false, 'lane only on pick is not a filter');
  const deli = effectiveDetailScope('deli', scope);
  assert.deepEqual(deli.provinces, ['BDG', 'HCM']);
  assert.equal(deli.key, effectiveDetailScope('deli', { provinces: ['BDG', 'HCM'], lanes: ['Nội tỉnh'] }).key);
  assert.equal(effectiveDetailScope('deli', null).active, false);
});

test('fetchDetailRows calls the detail RPC with nulls for empty filters, caches, and expands rows', async () => {
  clearWeeklyCache();
  const calls = [];
  const client = { rpc: async (name, args) => {
    calls.push([name, args]);
    return { data: { weeks: ['2026-11-09'], cols: ['report_date', 'region', 'hub', 'hub_type', 'client_name', 'mau_pu', 'ontime_pu_1st', 'ontime_pu_opr', 'days'],
      rows: [['2026-11-09', 'HCM', 'H1', 'BC', 'SPE', 10, 9, 8, 1]] }, error: null };
  } };
  const a = await fetchDetailRows(client, 'pick', 'week', { provinces: ['HCM'], lanes: [] });
  assert.deepEqual(calls[0], ['get_kas_detail_compact', { dataset: 'pick', grain: 'week', date_from: null, date_to: null, provinces: ['HCM'], lanes: null }]);
  assert.equal(a.rows[0].mau_pu, 10);
  assert.equal(Object.keys(a.rows[0]).some(k => k.startsWith('best_l6w') || k.startsWith('sameday_lm')), false, 'no benchmark columns');
  await fetchDetailRows(client, 'pick', 'week', { provinces: ['HCM'], lanes: [] });
  assert.equal(calls.length, 1, 'same request is cached');
  await assert.rejects(fetchDetailRows({ rpc: async () => ({ data: null, error: new Error('boom') }) }, 'fd', 'day', {}), /boom/);
  assert.rejects(fetchDetailOptions({ rpc: async () => ({ data: { provinces: 1 }, error: null }) }, 'deli'), /INVALID_DETAIL_OPTIONS/);
});
