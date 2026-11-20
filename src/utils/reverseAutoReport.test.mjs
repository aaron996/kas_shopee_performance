import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReverseSheet, buildPudTables, buildBacklogTable, hubNamesByWhId, pudRateOf, provinceOfHub, reportDates } from './reverseAutoReport.js';

const hist = (report_date, region, hub, hub_type, mau_pu, pud, wh_id = null) => ({ report_date, region, hub, hub_type, client_name: 'SPE Reverse', mau_pu, pud, wh_id });
const day = n => `2026-11-${String(n).padStart(2, '0')}`;

test('% PUD is pud / mau_pu, not capped at 100%, and null when there is no sample', () => {
  assert.equal(pudRateOf(100, 85), 85);
  assert.equal(pudRateOf(20, 24), 120, 'không chặn 100%');
  assert.equal(pudRateOf(0, 5), null);
});

test('province comes from the code in the hub name (BDU joins HCM, VPH joins Phú Thọ, unknown codes stay visible)', () => {
  assert.equal(provinceOfHub('(HNO) KD Cầu Giấy'), 'Hà Nội');
  assert.equal(provinceOfHub('(BDU) KT Thuận Giao'), 'Hồ Chí Minh');
  assert.equal(provinceOfHub('(VPH) KD Vĩnh Phúc'), 'Phú Thọ');
  assert.equal(provinceOfHub('(XYZ) KD Lạ'), 'XYZ');
  assert.equal(provinceOfHub('Kho không mã'), 'Chưa rõ tỉnh');
});

test('reportDates keeps the latest 7 distinct days', () => {
  const rows = Array.from({ length: 10 }, (_, i) => hist(day(i + 1), 'HNO', 'A', 'BC', 1, 1));
  assert.deepEqual(reportDates(rows), [4, 5, 6, 7, 8, 9, 10].map(day));
});

const section = (tables, key) => tables.sections.find(item => item.key === key);

test('three sections: by hub type, BC KD by province, by region; each Tổng counts its own source rows once', () => {
  const rows = [
    hist(day(1), 'HNO', '(HNO) KD Dương Nội', 'BC KD', 10, 6),
    hist(day(1), 'HCM', '(BDU) KT Thuận Giao', 'BC KD', 5, 5),
    hist(day(1), 'HNO', 'Bưu cục X', 'BC', 30, 15),
    hist(day(1), 'HNO', 'Kho lấy hàng Ahamove Hà Nội', 'Ahamove', 20, 18),
    hist(day(1), 'HCM', '(HCM) A', 'BC', 40, 30),
    hist(day(2), 'HNO', '(HNO) KD Dương Nội', 'BC KD', 0, 0)
  ];
  const t = buildPudTables(rows);
  assert.deepEqual(t.dates, [day(1), day(2)]);
  assert.deepEqual(t.sections.map(s => s.key), ['partner', 'province', 'region']);

  const partner = section(t, 'partner');
  assert.deepEqual(partner.rows.map(r => r.label), ['AHM', 'BC', 'BC KD'], 'AHM, BC, BC KD theo thứ tự cố định');
  assert.equal(partner.rows[2].cells[0].rate, (11 / 15) * 100);
  assert.equal(partner.rows[2].cells[1].rate, null, 'ngày không có mẫu → null');
  assert.equal(partner.rows[2].vol7, 15, 'vol7 = tổng đơn mới cả cửa sổ');
  assert.equal(partner.total.vol7, 105);
  assert.equal(partner.total.cells[0].vol, 105);
  assert.equal(partner.total.cells[0].pud, 74);

  const province = section(t, 'province');
  assert.deepEqual(province.rows.map(r => r.label), ['Hà Nội', 'Hồ Chí Minh'], 'tỉnh theo vol giảm dần');
  assert.equal(province.total.label, 'Tổng BC KD');
  assert.equal(province.total.cells[0].vol, 15, 'chỉ BC KD');

  const region = section(t, 'region');
  assert.deepEqual(region.rows.map(r => r.label), ['HNO', 'HCM']);
  assert.equal(region.rows[0].cells[0].vol, 60, 'vùng gồm cả BC KD và AHM');
  assert.equal(region.total.cells[0].vol, 105);
});

test('regions follow the dashboard normalisation; KHL, GXT and unknown regions fold into "Khác" so the total still adds up', () => {
  const rows = [
    hist(day(1), 'HNO', '(HNO) LH Long Biên', 'KA', 5, 5, '23013000'),
    hist(day(1), 'HNO', 'B', 'BC', 10, 5),
    hist(day(1), 'N/A', 'C', 'BC', 2, 1),
    hist(day(1), 'TNG', 'D', 'BC', 0, 0)
  ];
  const t = buildPudTables(rows);
  const region = section(t, 'region');
  assert.deepEqual(region.rows.map(r => r.label), ['HNO', 'Khác']);
  assert.equal(region.rows[1].cells[0].vol, 7);
  assert.equal(region.total.cells[0].vol, 17);
  assert.deepEqual(section(t, 'partner').rows.map(r => r.label), ['BC', 'KHL']);
});

test('backlog table: L7D buckets, L14D absolute, KD and KHL by wh_id, names from history, top-N with total over all hubs', () => {
  const b = (wh_id, hub_type, assign_bucket, age_bucket, backlog_orders) =>
    ({ snapshot_date: '2026-11-20', region: 'HNO', hub_type, assign_bucket, age_bucket, backlog_orders, wh_id });
  const backlog = [
    b('22781000', 'KD', '0', '1-3', 4), b('22781000', 'KD', '1-2', '4-7', 6), b('22781000', 'KD', '3+', '4-7', 10), b('22781000', 'KD', '3+', '8-14', 7),
    b('23156000', 'KD', '3+', '1-3', 5),
    b('23013000', 'KA', '0', '1-3', 99), b('11111111', 'BC', '0', '1-3', 50),
    { ...b('22781000', 'KD', '0', '1-3', 1000), snapshot_date: '2026-11-19' }
  ];
  const history = [hist(day(18), 'HNO', '(HNO) KD Dương Nội', 'BC KD', 1, 1, '22781000'), hist(day(19), 'HNO', '(HNO) KD Dương Nội', 'BC KD', 1, 1, '22781000')];
  const table = buildBacklogTable(backlog, history, { top: 1 });
  assert.equal(table.snapshotDate, '2026-11-20');
  assert.equal(table.hubCount, 2, 'KHL và BC không tính');
  assert.deepEqual(table.rows.map(r => r.name), ['HNO KD Dương Nội']);
  assert.deepEqual(
    (({ g0, g12, g3, l7, l14 }) => ({ g0, g12, g3, l7, l14 }))(table.rows[0]),
    { g0: 4, g12: 6, g3: 10, l7: 20, l14: 27 }
  );
  assert.deepEqual(table.total, { g0: 4, g12: 6, g3: 15, l7: 25, l14: 32 }, 'Tổng là của mọi kho BCKD, kể cả kho ngoài top');
  assert.equal(buildBacklogTable(backlog, [], { top: 5 }).rows[1].name, 'Kho 23156000', 'chưa có tên thì hiện mã kho');
  assert.equal(buildBacklogTable([], history), null, 'chưa có snapshot → null, không phải bảng 0');
});

test('hubNamesByWhId takes the latest name per wh_id', () => {
  const names = hubNamesByWhId([hist(day(2), 'HNO', 'Tên mới', 'BC', 1, 1, '1'), hist(day(1), 'HNO', 'Tên cũ', 'BC', 1, 1, '1')]);
  assert.equal(names.get('1'), 'Tên mới');
});

test('buildReverseSheet keeps each half independent: no history → no tables, no snapshot → no backlog', () => {
  assert.deepEqual(buildReverseSheet([], []), { tables: null, backlog: null });
  const only = buildReverseSheet([hist(day(1), 'HNO', 'B', 'BC', 10, 5)], []);
  assert.ok(only.tables);
  assert.equal(only.backlog, null);
});
