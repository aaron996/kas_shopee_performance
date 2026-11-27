import test from 'node:test';
import assert from 'node:assert/strict';
import { executeChatTool, CHAT_TOOLS } from './tools.js';

// PUD của SPE Reverse = sum(pud) / sum(mau_pu) (mẫu dashboard). Chỉ SPE Reverse có PUD.
const cols = ['report_date', 'region', 'hub', 'hub_type', 'client_name', 'mau_pu', 'ontime_pu_1st', 'ontime_pu_opr', 'pud'];
const reverse = 'SPE Reverse';
const data = [
  ['2026-11-23', 'HCM', 'Hub A', 'BC', reverse, 3000, 2000, 2500, 2000],
  ['2026-11-23', 'HNO', 'Hub B', 'BC', reverse, 1742, 1000, 1200, 1243],
  ['2026-11-24', 'HCM', 'Hub A', 'BC', reverse, 3796, 2000, 2500, 2346],
  ['2026-11-24', 'HCM', 'Hub A', 'BC', 'SPE', 999, 1, 1, 1]
];
function fakeDb() {
  const calls = [];
  return { calls, async rpc(name, params) {
    calls.push({ name, params });
    if (name === 'get_kas_daily_range_compact') {
      return { data: { cols, rows: data.filter(r => r[0] >= params.date_from && r[0] <= params.date_to) }, error: null };
    }
    if (name === 'get_kas_weekly_compact') return { data: { cols, rows: [['2026-11-23', 'HCM', 'Hub A', 'BC', reverse, 1, 1, 1, 1]] }, error: null };
    if (name === 'get_kas_daily_compact') return { data: { cols, rows: data }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  } };
}
const args = (extra = {}) => ({ metric: 'pud', client: reverse, date_from: '2026-11-23', date_to: '2026-11-24', grain: 'nationwide',
  regions: [], hub_types: [], provinces: [], lanes: [], limit: 10, offset: 0, sort: 'worst', ...extra });
const run = (name, extra, db = fakeDb()) => executeChatTool({ name, arguments: args(extra) }, { userClient: db });

test('tool descriptions also mention PUD (models read the text, not only the enum)', () => {
  for (const name of ['get_metric_summary', 'get_latest_metric_summary', 'get_metric_trend', 'get_metric_change_drivers']) {
    assert.match(CHAT_TOOLS.find(tool => tool.name === name).description, /PUD/i, name);
  }
});

test('pud is a metric of the chat/MCP tools', () => {
  for (const name of ['get_metric_summary', 'get_latest_metric_summary', 'get_metric_trend', 'get_metric_change_drivers']) {
    assert.ok(CHAT_TOOLS.find(tool => tool.name === name).parameters.properties.metric.enum.includes('pud'), name);
  }
});

test('get_metric_summary(pud) for SPE Reverse uses sum(pud)/sum(mau_pu) and ignores other clients', async () => {
  const result = await run('get_metric_summary');
  const [row] = result.data.rows;
  assert.equal(row.volume, 3000 + 1742 + 3796);
  assert.equal(row.ontime, 2000 + 1243 + 2346);
  assert.equal(row.value, Math.round(10000 * 5589 / 8538) / 100);
  assert.equal(result.data.formula, 'sum(pud) / sum(mau_pu) * 100');
  assert.equal(result.data.kpiTarget, null);
  assert.equal(result.data.metric, 'pud');
});

test('get_metric_trend(pud) returns one value per day', async () => {
  const result = await run('get_metric_trend');
  assert.deepEqual(result.data.rows.map(row => [row.date, row.volume, row.ontime]), [['2026-11-23', 4742, 3243], ['2026-11-24', 3796, 2346]]);
});

test('pud by region keeps the region breakdown', async () => {
  const result = await run('get_metric_summary', { grain: 'region', sort: 'volume_desc' });
  assert.deepEqual(result.data.rows.map(row => [row.entity, row.volume, row.ontime]), [['HCM', 6796, 4346], ['HNO', 1742, 1243]]);
});

test('pud is rejected for clients without Reverse data and for province/lane filters (not supported yet)', async () => {
  const db = fakeDb();
  await assert.rejects(run('get_metric_summary', { client: 'SPB' }, db), /PUD chỉ có cho client SPE Reverse/);
  await assert.rejects(run('get_metric_summary', { client: 'SPE' }, db), /PUD chỉ có cho client SPE Reverse/);
  await assert.rejects(run('get_metric_summary', { provinces: ['HCM'] }, db), /PUD chưa hỗ trợ lọc\/nhóm theo Tỉnh thành/);
  assert.equal(db.calls.length, 0, 'rejections happen before any database call');
});

test('get_metric_definition(pud) explains the dashboard formula', async () => {
  const result = await executeChatTool({ name: 'get_metric_definition', arguments: { metric: 'pud' } }, {});
  assert.match(JSON.stringify(result.data), /mau_pu/);
});
