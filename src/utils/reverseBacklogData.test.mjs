import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBacklogModel, fetchReverseBacklog, clearReverseBacklogCache } from './reverseBacklogData.js';
import { MIEN_REGIONS } from '../data/defaultDataset.js';

const cols = ['region', 'hub_type', 'assign_bucket', 'age_bucket', 'backlog_orders'];
const data = (rows, prevRows = [], extra = {}) => ({
  snapshotDate: '2026-11-11', prevDate: '2026-11-04',
  rows: rows.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]]))),
  prevRows: prevRows.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]]))), ...extra
});
const all = Object.values(MIEN_REGIONS).flat();

test('model groups by assignment segment, age and region; absent combinations are zero', () => {
  const model = buildBacklogModel({ data: data([
    ['HNO', 'BC', '0', '1-3', 10], ['HNO', 'KD', '0', '1-3', 5], ['HNO', 'BC', '3+', '8-14', 20], ['HCM', 'BC', '1-2', '4-7', 7]
  ]), selectedRegions: all });
  assert.equal(model.total, 42);
  assert.deepEqual(model.sections.map(s => s.total), [15, 7, 20]);
  assert.deepEqual(model.sections[0].rows.map(r => [r.region, r.buckets]), [['HNO', [15, 0, 0]], ['HCM', [0, 0, 0]]], 'vùng sắp theo tổng giảm dần, vùng không có đơn là 0');
  assert.deepEqual(model.sections[2].buckets, [0, 0, 20]);
  assert.equal(model.windowFrom, '2026-10-29');
  assert.equal(model.maxRow, 20);
});

test('region and hub type scope apply; N/A and blank regions only join when every region is selected', () => {
  const rows = [['HNO', 'BC', '0', '1-3', 10], ['N/A', 'BC', '0', '1-3', 3], ['', 'KD', '0', '4-7', 2], ['HNO', 'KD', '0', '1-3', 4]];
  const everything = buildBacklogModel({ data: data(rows), selectedRegions: all });
  assert.equal(everything.total, 19);
  assert.ok(everything.sections[0].rows.some(r => r.region === 'Chưa rõ vùng' && r.total === 5));
  assert.equal(buildBacklogModel({ data: data(rows), selectedRegions: ['HNO'] }).total, 14);
  assert.equal(buildBacklogModel({ data: data(rows), selectedRegions: all, selectedHubTypes: ['BC'] }).total, 13);
  const none = buildBacklogModel({ data: data(rows), selectedRegions: [] });
  assert.equal(none.empty, true);
});

test('week-over-week delta uses the same scope; no earlier snapshot means no delta', () => {
  const rows = [['HNO', 'BC', '0', '1-3', 10], ['HCM', 'BC', '0', '1-3', 5]];
  const prev = [['HNO', 'BC', '0', '1-3', 4], ['HCM', 'BC', '0', '1-3', 8]];
  const model = buildBacklogModel({ data: data(rows, prev), selectedRegions: all });
  assert.deepEqual([model.prevTotal, model.delta], [12, 3]);
  const scopedModel = buildBacklogModel({ data: data(rows, prev), selectedRegions: ['HNO'] });
  assert.deepEqual([scopedModel.prevTotal, scopedModel.delta], [4, 6]);
  const first = buildBacklogModel({ data: data(rows, [], { prevDate: null }), selectedRegions: all });
  assert.deepEqual([first.prevTotal, first.delta], [null, null]);
});

test('fetch validates the payload, caches, and retries after an error', async () => {
  clearReverseBacklogCache();
  let calls = 0;
  const payload = { snapshot_date: '2026-11-11', prev_snapshot_date: null, cols, rows: [['HNO', 'BC', '0', '1-3', 3]], prev_rows: [] };
  const client = { rpc: async (name, args) => { calls++; assert.equal(name, 'get_kas_reverse_backlog'); assert.equal(args.client, 'SPE Reverse'); return calls === 1 ? { data: null, error: new Error('x') } : { data: payload, error: null }; } };
  await assert.rejects(fetchReverseBacklog(client));
  const result = await fetchReverseBacklog(client);
  assert.equal(result.snapshotDate, '2026-11-11');
  assert.equal(result.rows[0].backlog_orders, 3);
  await fetchReverseBacklog(client);
  assert.equal(calls, 2, 'kết quả thành công được nhớ');
  clearReverseBacklogCache();
  await assert.rejects(fetchReverseBacklog({ rpc: async () => ({ data: { rows: [] }, error: null }) }), /INVALID_BACKLOG_PAYLOAD/);
  clearReverseBacklogCache();
  const empty = await fetchReverseBacklog({ rpc: async () => ({ data: { snapshot_date: null, cols, rows: [], prev_rows: [] }, error: null }) });
  assert.equal(empty.snapshotDate, null, 'chưa có snapshot được phân biệt với backlog bằng 0');
  clearReverseBacklogCache();
});
