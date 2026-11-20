import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLtcVolTables, buildBacklogTable, hubNamesByWhId, ltcOf, reportDates } from './reverseAutoReport.js';

const hist = (report_date, region, hub, hub_type, mau_pu, pud, wh_id = null) => ({ report_date, region, hub, hub_type, client_name: 'SPE Reverse', mau_pu, pud, wh_id });
const day = n => `2026-11-${String(n).padStart(2, '0')}`;

test('LTC is pud / mau_pu, not capped at 100%, and null when there is no sample', () => {
  assert.equal(ltcOf(100, 85), 85);
  assert.equal(ltcOf(20, 24), 120, 'không chặn 100%');
  assert.equal(ltcOf(0, 5), null);
});

test('reportDates keeps the latest 7 distinct days', () => {
  const rows = Array.from({ length: 10 }, (_, i) => hist(day(i + 1), 'HNO', 'A', 'BC', 1, 1));
  assert.deepEqual(reportDates(rows), [4, 5, 6, 7, 8, 9, 10].map(day));
});

test('AHM and BCKD are hub-type groups inside the regions; Tổng counts every source row once', () => {
  const rows = [
    hist(day(1), 'HNO', '(HNO) KD Dương Nội', 'BC KD', 10, 6),
    hist(day(1), 'HNO', 'Bưu cục X', 'BC', 30, 15),
    hist(day(1), 'HNO', 'Kho lấy hàng Ahamove Hà Nội', 'Ahamove', 20, 18),
    hist(day(1), 'HCM', '(HCM) A', 'BC', 40, 30),
    hist(day(2), 'HNO', '(HNO) KD Dương Nội', 'BC KD', 0, 0)
  ];
  const t = buildLtcVolTables(rows);
  assert.deepEqual(t.dates, [day(1), day(2)]);
  const byKey = Object.fromEntries(t.rows.map(r => [r.key, r]));
  assert.deepEqual(t.rows.map(r => r.key), ['ahm', 'bckd', 'region:HNO', 'region:HCM'].filter(k => byKey[k]), 'AHM, BCKD rồi vùng theo thứ tự Miền');
  assert.equal(byKey.ahm.cells[0].vol, 20);
  assert.equal(byKey.bckd.cells[0].ltc, 60);
  assert.equal(byKey['region:HNO'].cells[0].vol, 60, 'vùng gồm cả BC KD và AHM');
  assert.equal(t.total.cells[0].vol, 100, 'Tổng không cộng đôi AHM/BCKD');
  assert.equal(t.total.cells[0].pud, 69);
  assert.equal(byKey.bckd.cells[1].ltc, null, 'ngày không có mẫu → null');
});

test('regions follow the dashboard normalisation (KHL region, N/A bucket last) and drop empty regions', () => {
  const rows = [
    hist(day(1), 'HNO', '(HNO) LH Long Biên', 'KA', 5, 5, '23013000'),
    hist(day(1), 'HNO', 'B', 'BC', 10, 5),
    hist(day(1), 'N/A', 'C', 'BC', 2, 1),
    hist(day(1), 'TNG', 'D', 'BC', 0, 0)
  ];
  const labels = buildLtcVolTables(rows).rows.map(r => r.label);
  assert.deepEqual(labels, ['HNO', 'HNO - KHL', 'Chưa rõ vùng']);
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
