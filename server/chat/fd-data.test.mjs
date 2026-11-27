import test from 'node:test';
import assert from 'node:assert/strict';
import { executeChatTool, CHAT_TOOLS } from './tools.js';
import { computeDrivers } from './drivers.js';

const COLS = ['report_date', 'region', 'wh_id', 'deliverywh', 'hub_type', 'client_name', 'mau_fd', 'fd_hoan_thanh'];
// date, region, wh, deliverywh, type, client, mau, fd
const ROWS = [
  ['2026-11-01', 'HCM', '1', 'Kho A', 'LM', 'SPB', 60000, 2000],
  ['2026-11-02', 'HCM', '1', 'Kho A', 'LM', 'SPB', 77458, 3149],
  ['2026-11-01', 'HNO', '2', 'Kho B', 'LM', 'SPE', 280000, 14000],
  ['2026-11-02', 'HNO', '2', 'Kho B', 'LM', 'SPE', 280342, 14418],
  ['2026-11-02', 'HNO', '3', 'Kho Z', 'LM', 'SPE', 0, 0],
];
function client({ rows = ROWS } = {}) {
  const calls = [];
  return { calls, rpc: async (name, params) => {
    calls.push({ name, params });
    if (name === 'get_kas_daily_range_compact') {
      return { data: { cols: COLS, rows: rows.filter(r => r[0] >= params.date_from && r[0] <= params.date_to) }, error: null };
    }
    if (name === 'get_kas_weekly_compact') return { data: { cols: COLS, rows: rows.length ? [['2026-10-26', ...rows[0].slice(1)]] : [] }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  } };
}
const summary = (extra = {}) => ({ name: 'get_metric_summary', arguments: {
  metric: 'fd', client: 'SPB', date_from: '2026-11-01', date_to: '2026-11-02', grain: 'nationwide',
  regions: [], hub_types: [], limit: 10, offset: 0, sort: 'worst', ...extra } });

test('fd is exposed in metric enums and get_data_coverage dataset enum', () => {
  for (const name of ['get_metric_summary', 'get_latest_metric_summary', 'get_metric_trend', 'get_metric_change_drivers']) {
    assert.ok(CHAT_TOOLS.find(t => t.name === name).parameters.properties.metric.enum.includes('fd'), name);
  }
  assert.ok(CHAT_TOOLS.find(t => t.name === 'get_data_coverage').parameters.properties.dataset.enum.includes('fd'));
});

test('get_metric_summary(fd) = SUM(fd_hoan_thanh)/SUM(mau_fd) with lower-is-better KPI', async () => {
  const { data } = await executeChatTool(summary(), { userClient: client() });
  const row = data.rows[0];
  assert.equal(row.volume, 137458);
  assert.equal(row.ontime, 5149);
  assert.equal(row.value, 3.75);
  assert.equal(row.meetsKpi, false);
  assert.equal(data.direction, 'lower_is_better');
  assert.equal(data.kpiTarget, 3);
  assert.equal(data.as_of_date, '2026-11-02');
  const spe = (await executeChatTool(summary({ client: 'SPE' }), { userClient: client() })).data.rows[0];
  assert.equal(spe.volume, 560342); assert.equal(spe.ontime, 28418); assert.equal(spe.value, 5.07);
});

test('month period beyond FD data reports the actual covered period', async () => {
  const { data } = await executeChatTool(summary({ date_to: '2026-11-30' }), { userClient: client() });
  assert.equal(data.scope.actualDateFrom, '2026-11-01');
  assert.equal(data.scope.actualDateTo, '2026-11-02');
  assert.match(data.periodNote, /2026-11-01 – 2026-11-02/);
});

test('hub grain maps to deliverywh, worst = highest FD, mau_fd = 0 gives null not 0%', async () => {
  const { data } = await executeChatTool(summary({ client: 'SPE', grain: 'hub' }), { userClient: client() });
  assert.deepEqual(data.rows.map(r => r.entity), ['Kho B', 'Kho Z']);
  assert.equal(data.rows[1].value, null);
  assert.equal(data.rows[1].meetsKpi, null);
});

test('period without FD data says so instead of 0%', async () => {
  const { data } = await executeChatTool(summary({ date_from: '2026-11-05', date_to: '2026-11-09' }), { userClient: client() });
  assert.equal(data.noData, true);
  assert.equal(data.rows.length, 0);
  assert.match(data.message, /Không phải 0%/);
});

test('get_latest_metric_summary(fd) uses the FD max date, not pick/deli date', async () => {
  const c = client();
  const { data } = await executeChatTool({ name: 'get_latest_metric_summary', arguments: {
    metric: 'fd', client: 'SPB', grain: 'nationwide', regions: [], hub_types: [], limit: 5, offset: 0, sort: 'worst' } }, { userClient: c });
  assert.equal(data.as_of_date, '2026-11-02');
  assert.equal(data.scope.dateFrom, '2026-11-02');
  assert.ok(c.calls.every(call => call.name !== 'get_ai_chat_coverage'));
});

test('get_data_coverage(fd) returns FD date range', async () => {
  const { data } = await executeChatTool({ name: 'get_data_coverage', arguments: { dataset: 'fd', client: 'SPB' } }, { userClient: client() });
  assert.equal(data.dataset, 'fd');
  assert.equal(data.dateFrom, '2026-11-01');
  assert.equal(data.dataAsOf, '2026-11-02');
  assert.equal(data.as_of_date, '2026-11-02');
});

test('get_data_coverage(fd) with empty table is explicit', async () => {
  const { data } = await executeChatTool({ name: 'get_data_coverage', arguments: { dataset: 'fd', client: 'SPB' } }, { userClient: client({ rows: [] }) });
  assert.equal(data.dataAsOf, null);
  assert.match(data.message, /Chưa có dữ liệu FD/);
});

test('drivers treat a FD increase as worsened', () => {
  const r = computeDrivers({
    previous: { volume: 100, ontime: 2 }, current: { volume: 100, ontime: 5 },
    previousRows: [{ entity: 'A', volume: 100, ontime: 2 }], currentRows: [{ entity: 'A', volume: 100, ontime: 5 }], lowerIsBetter: true });
  assert.equal(r.overall, 'worsened');
  assert.equal(r.drivers[0].effect, 'worsened');
  const plain = computeDrivers({
    previous: { volume: 100, ontime: 2 }, current: { volume: 100, ontime: 5 },
    previousRows: [{ entity: 'A', volume: 100, ontime: 2 }], currentRows: [{ entity: 'A', volume: 100, ontime: 5 }] });
  assert.equal('overall' in plain, false);
  assert.equal('effect' in plain.drivers[0], false);
});

test('p1st still goes through the original RPC untouched', async () => {
  const calls = [];
  await executeChatTool({ name: 'get_metric_summary', arguments: { ...summary().arguments, metric: 'p1st' } },
    { userClient: { rpc: async (name, params) => { calls.push({ name, params }); return { data: { rows: [] } }; } } });
  assert.equal(calls[0].name, 'get_ai_chat_metric');
  assert.equal(calls[0].params.p_metric, 'p1st');
});
