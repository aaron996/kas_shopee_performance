import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyMatrix, fetchWeeklyRows, clearWeeklyCache, weekLabel, WEEKLY_METRICS } from './weeklyKpi.js';

const W1 = '2026-10-05';
const W2 = '2026-10-12';
const weeks = [W1, W2];
const pickRow = (week, region, hub, mau, o1, oo, over = {}) => ({
  report_date: week, region, hub, hub_type: 'BC', client_name: 'SPE',
  mau_pu: mau, ontime_pu_1st: o1, ontime_pu_opr: oo, days: 7, ...over
});

const rows = [
  pickRow(W1, 'HCM', 'Hub A', 100, 95, 90),
  pickRow(W1, 'HCM', 'Hub B', 300, 270, 240),
  pickRow(W2, 'HCM', 'Hub A', 50, 49, 40, { days: 2 }),
  pickRow(W1, 'HNO', 'Hub C', 200, 190, 180),
  pickRow(W1, 'HCM', 'Hub A', 10, 10, 10, { client_name: 'SPB' })
];

test('cộng tử và mẫu theo tuần rồi mới chia, không lấy trung bình tỷ lệ', () => {
  const m = buildWeeklyMatrix({ rows, weeks, metricKey: 'p1st' });
  const hcm = m.miens.flatMap(x => x.regions).find(r => r.region === 'HCM');
  assert.equal(hcm.stats[0].tot, 410);
  assert.equal(hcm.stats[0].ont, 375);
  assert.ok(Math.abs(hcm.stats[0].pct - (375 / 410) * 100) < 1e-9);
  assert.equal(m.all[0].tot, 610);
  assert.equal(m.all[1].tot, 50);
  assert.equal(m.all[1].pct, 98);
});

test('xếp Miền theo thứ tự cố định và Vùng theo mẫu tuần mới nhất', () => {
  const m = buildWeeklyMatrix({ rows, weeks, metricKey: 'p1st' });
  assert.deepEqual(m.miens.map(x => x.mien), ['Miền Bắc', 'Miền Nam']);
  assert.deepEqual(m.miens[1].regions.map(r => r.region), ['HCM']);
});

test('hub xếp theo số đơn trễ của tuần mới nhất và giới hạn theo hubLimit', () => {
  const m = buildWeeklyMatrix({ rows: [
    pickRow(W2, 'HCM', 'ít trễ', 100, 99, 99),
    pickRow(W2, 'HCM', 'nhiều trễ', 100, 50, 50),
    pickRow(W2, 'HCM', 'trễ vừa', 100, 80, 80)
  ], weeks, metricKey: 'p1st', hubLimit: 2 });
  const hcm = m.miens[0].regions[0];
  assert.deepEqual(hcm.hubs.map(h => h.hub), ['nhiều trễ', 'trễ vừa']);
  assert.equal(hcm.hubCount, 3);
});

test('OPR dùng cột ontime_pu_opr, 1st dùng ontime_pu_1st', () => {
  const opr = buildWeeklyMatrix({ rows, weeks, metricKey: 'popr' });
  assert.equal(opr.all[0].ont, 90 + 240 + 180 + 10);
  assert.equal(opr.metric.target, 90);
});

test('lọc theo client, vùng và loại Hub', () => {
  assert.equal(buildWeeklyMatrix({ rows, weeks, metricKey: 'p1st', clientFilter: 'SPB' }).all[0].tot, 10);
  assert.equal(buildWeeklyMatrix({ rows, weeks, metricKey: 'p1st', selectedRegions: ['HNO'] }).all[0].tot, 200);
  assert.equal(buildWeeklyMatrix({ rows, weeks, metricKey: 'p1st', selectedHubTypes: ['KA'] }).empty, true);
  assert.equal(buildWeeklyMatrix({ rows, weeks, metricKey: 'p1st', selectedHubTypes: ['BC'] }).all[0].tot, 610);
});

test('tuần cuối chưa đủ 7 ngày được ghi chú số ngày', () => {
  const m = buildWeeklyMatrix({ rows, weeks, metricKey: 'p1st' });
  assert.equal(m.weeks[0].note, '');
  assert.equal(m.weeks[1].note, '2 ngày');
  assert.equal(m.weeks[1].range, '12/10–18/10');
  assert.equal(weekLabel('2026-10-05', 7).title, 'Tuần 41');
  assert.equal(weekLabel('2026-10-05', 0).note, '');
});

test('dòng ngoài danh sách tuần bị bỏ qua và dữ liệu rỗng được đánh dấu', () => {
  const m = buildWeeklyMatrix({ rows: [pickRow('2026-09-01', 'HCM', 'Hub A', 10, 10, 10)], weeks, metricKey: 'p1st' });
  assert.equal(m.empty, true);
  assert.equal(m.miens.length, 0);
});

test('hub trùng tên khác loại Hub thì thêm (loại Hub) vào tên', () => {
  const m = buildWeeklyMatrix({ rows: [
    pickRow(W2, 'HCM', 'Kho X', 10, 9, 9),
    pickRow(W2, 'HCM', 'Kho X', 10, 9, 9, { hub_type: 'KA' })
  ], weeks, metricKey: 'p1st' });
  assert.deepEqual(m.miens[0].regions[0].hubs.map(h => h.name).sort(), ['Kho X (BC)', 'Kho X (KA)']);
});

test('FD dùng deliverywh và fd_hoan_thanh, không có target', () => {
  const fd = (week, hub, mau, done) => ({
    report_date: week, region: 'HCM', wh_id: '1', deliverywh: hub, hub_type: 'BC', client_name: 'SPE',
    mau_fd: mau, fd_hoan_thanh: done, days: 7
  });
  const m = buildWeeklyMatrix({ rows: [fd(W1, 'K1', 1000, 60), fd(W1, 'K2', 1000, 40)], weeks: [W1], metricKey: 'fd' });
  assert.equal(m.all[0].pct, 5);
  assert.equal(m.metric.target, null);
  // Cùng quy ước bảng theo ngày: xếp theo mẫu trừ cột đúng giờ (với FD là fd_hoan_thanh).
  assert.deepEqual(m.miens[0].regions[0].hubs.map(h => h.hub), ['K2', 'K1']);
  assert.equal(m.maxPct, 5);
});

test('dòng đi qua normalizeDashboardRows: KA và CK về đúng vùng riêng, GXT theo Miền', async () => {
  clearWeeklyCache();
  const payload = {
    weeks: [W2],
    rows: [
      { report_date: W2, region: 'HCM', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'BC', client_name: 'SPE', mau_pu: 10, ontime_pu_1st: 9, ontime_pu_opr: 9, days: 7 },
      { report_date: W2, region: 'HCM', hub: 'Bưu cục CK Thủ Đức', hub_type: 'BC', client_name: 'SPE', mau_pu: 20, ontime_pu_1st: 18, ontime_pu_opr: 18, days: 7 },
      { report_date: W2, region: 'HCM', hub: 'Bưu cục thường', hub_type: 'BC', client_name: 'SPE', mau_pu: 30, ontime_pu_1st: 27, ontime_pu_opr: 27, days: 7 }
    ]
  };
  const client = { rpc: async (name, args) => { client.last = { name, args }; return { data: payload, error: null }; } };
  const result = await fetchWeeklyRows(client, 'pick');
  assert.deepEqual(client.last, { name: 'get_kas_weekly_rows', args: { dataset: 'pick', weeks: 9 } });
  const m = buildWeeklyMatrix({ rows: result.rows, weeks: result.weeks, metricKey: 'p1st' });
  const names = m.miens.flatMap(x => x.regions.map(r => r.region)).sort();
  assert.deepEqual(names, ['HCM', 'HCM - CK', 'HCM - KA']);
  const types = result.rows.map(r => r.hub_type).sort();
  assert.deepEqual(types, ['BC', 'CK', 'KA']);
});

test('fetchWeeklyRows nhớ kết quả theo bảng, báo lỗi RPC và thử lại sau lỗi', async () => {
  clearWeeklyCache();
  let calls = 0;
  const ok = { weeks: [W2], rows: [] };
  const client = { rpc: async () => { calls++; return { data: ok, error: null }; } };
  await fetchWeeklyRows(client, 'deli');
  await fetchWeeklyRows(client, 'deli');
  assert.equal(calls, 1);
  await fetchWeeklyRows(client, 'fd');
  assert.equal(calls, 2);

  clearWeeklyCache();
  const failing = { rpc: async () => ({ data: null, error: new Error('permission denied') }) };
  await assert.rejects(fetchWeeklyRows(failing, 'pick'), /permission denied/);
  const recovered = { rpc: async () => ({ data: ok, error: null }) };
  assert.deepEqual((await fetchWeeklyRows(recovered, 'pick')).weeks, [W2]);

  clearWeeklyCache();
  await assert.rejects(fetchWeeklyRows({ rpc: async () => ({ data: { weeks: 'x' }, error: null }) }, 'pick'), /INVALID_WEEKLY_PAYLOAD/);
});

test('mọi chỉ số có bảng nguồn và cột hợp lệ', () => {
  assert.deepEqual(Object.keys(WEEKLY_METRICS), ['p1st', 'popr', 'd1st', 'dodr', 'fd']);
  assert.deepEqual(Object.values(WEEKLY_METRICS).map(m => m.dataset), ['pick', 'pick', 'deli', 'deli', 'fd']);
});
