import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// KAS-317: luồng cũ phải gộp province/lane về grain hub; luồng mới ghi bảng chi tiết, tổng khớp history.
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
for (const f of ['20261012100000_kas_pick_history.sql', '20261012120000_kas_history_deli_fd_read_retention.sql',
  '20261013120000_kas_weekly_rollup.sql', '20261019090000_kas_reverse_history.sql',
  '20261102035351_reverse_pud_denominator.sql', '20261102043310_reverse_history_upsert.sql',
  '20261127100000_kas_province_lane_detail.sql']) {
  await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
}

let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const logs = [], calls = [], tabs = {}, props = { SUPABASE_SERVICE_ROLE_KEY: 'test-key' };
const sheetOf = (name, id) => ({ getSheetId: () => id, getDataRange: () => ({ getValues: () => tabs[name] }) });
const ss = { getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh', getSheets: () => [sheetOf('deli', 8), sheetOf('pick', 7), sheetOf('fd', 9)],
  getSheetByName: n => (tabs[n] ? sheetOf(n, 0) : null) };
const ctx = vm.createContext({
  console, Date, Set, Number, JSON, Math, Object, String,
  Utilities: { formatDate: () => '2026-10-12' },
  Logger: { log: v => logs.push(v) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  SUPABASE_URL: 'https://example.invalid'
});
for (const f of ['ops-incremental-sync', 'ops-history-sync', 'reverse-history-sync', 'ops-province-lane-sync']) {
  vm.runInContext(readFileSync(`scripts/apps-script/${f}.gs`, 'utf8'), ctx);
}
ctx.opsDeltaRpc_ = (name, payload) => {
  calls.push({ rpc: name, ...payload });
  const n = payload.rows.length;
  return { rows: n, inserted: n, updated: 0, unchanged: 0, written: n, deleted: 0 };
};
ctx.syncOpsDeltaTab_ = () => {};
const replay = async c => {
  const args = c.date_from ? [c.date_from, c.date_to, JSON.stringify(c.rows)] : [JSON.stringify(c.rows)];
  const sql = c.date_from ? `select public.${c.rpc}($1::date,$2::date,$3::jsonb) r` : `select public.${c.rpc}($1::jsonb) r`;
  return (await db.query(sql, args)).rows[0].r;
};
const sum = async (table, col) => Number((await db.query(`select coalesce(sum(${col}),0) n from public.${table}`)).rows[0].n);

// --- opsDeltaCollapseRows_ ---
const cols = [{ name: 'report_date', type: 'date' }, { name: 'hub', type: 'text' }, { name: 'mau', type: 'numeric' },
  { name: 'best_l6w_vol', type: 'numeric' }, { name: 'sameday_lm_vol', type: 'numeric' }];
const collapse = (headers, rows) => ctx.opsDeltaCollapseRows_(headers, rows, cols);
const raw = [['2026-10-11', 'A', 5, 100, 50], ['2026-10-11', 'A', 7, 100, 50], ['2026-10-11', 'B', null, 80, null], ['2026-10-11', 'B', null, 80, null]];
let out = collapse(['report_date', 'hub', 'mau', 'province'], raw);
check(out.length === 2 && out[0][2] === 12, 'cộng cột đếm');
check(out[0][3] === 100 && out[0][4] === 50, 'benchmark lấy một giá trị, không cộng');
check(out[1][2] === null, 'tất cả null thì giữ null');
check(collapse(['report_date', 'hub', 'mau'], raw) === raw, 'chưa có province: không đổi gì');
assert.throws(() => collapse(['province'], [['2026-10-11', 'A', 1, 100, 50], ['2026-10-11', 'A', 1, 101, 50]]), /Benchmark best_l6w_vol không đồng nhất/); checks++;
check(raw[0][2] === 5, 'không sửa mảng nguồn');

// --- Deli với province + lane ---
const header = ['report_date', 'region', 'wh_id', 'hub', 'hub_type', 'client_name', 'mau_deli', 'ontime_deli_1st', 'ontime_deli_odr',
  'best_l6w_vol_1st', 'province', 'lane'];
const dl = (day, hub, province, lane, mau) => [day + 'T00:00:00', 'HCM', '100', hub, 'BC', 'SPE', mau, mau - 1, mau - 2, 999, province, lane];
const fullDeli = [dl('2026-09-28', 'A', 'HCM', 'Nội tỉnh', 10), dl('2026-09-28', 'A', 'BDG', 'Cận miền', 6), dl('2026-09-28', 'A', 'BDG', '', 4),
  dl('2026-10-11', 'A', 'HCM', 'Nội tỉnh', 20), dl('2026-10-11', 'B', 'HNO', null, 8)];
tabs.deli = [header, ...fullDeli];
ctx.syncOpsTabWithHistory_(ss, 'deli', 8);
const hist = calls.filter(c => c.rpc === 'upsert_kas_deli_history'), det = calls.filter(c => c.rpc === 'upsert_kas_deli_detail');
check(hist.length === 1 && hist[0].rows.length === 3, 'history nhận 3 dòng hub-ngày (đã gộp province/lane)');
check(hist[0].rows.find(r => r.hub === 'A' && r.report_date === '2026-09-28').mau_deli === 20, 'history: 10+6+4');
check(det.length === 1 && det[0].rows.length === 5 && det[0].date_from === '2026-09-28' && det[0].date_to === '2026-10-11', 'detail nhận 5 dòng, đúng cửa sổ D-14..D-1');
check(det[0].rows.filter(r => r.lane === null).length === 2, 'lane rỗng hoặc null thành null');
check(!('best_l6w_vol_1st' in det[0].rows[0]), 'detail không có benchmark');
for (const c of calls) await replay(c); // không lỗi trùng khoá nghĩa là gộp đúng
for (const col of ['mau_deli', 'ontime_deli_1st', 'ontime_deli_odr']) {
  check(await sum('kas_deli_history', col) === await sum('kas_deli_detail', col), `deli: tổng ${col} detail = history`);
}

// --- Cửa sổ sai: không ghi chi tiết ---
calls.length = 0;
tabs.deli = [header, ...fullDeli.slice(0, 3)]; // thiếu ngày cuối D-1 (2026-10-11)
assert.throws(() => ctx.syncOpsTabWithHistory_(ss, 'deli', 8), /chưa đúng cửa sổ/); checks++;
check(!calls.some(c => c.rpc.endsWith('_detail')), 'sai cửa sổ: không gọi RPC detail');

// --- Chuyển tiếp: header chưa có province/lane ---
calls.length = 0; logs.length = 0;
const oldHeader = header.filter(h => h !== 'province' && h !== 'lane');
tabs.deli = [oldHeader, ...fullDeli.filter(r => r[11] !== null).slice(3).concat([dl('2026-09-28', 'A', 'HCM', 'x', 1)]).map(r => r.slice(0, 10))];
ctx.syncOpsTabWithHistory_(ss, 'deli', 8);
check(calls.length === 1 && calls[0].rpc === 'upsert_kas_deli_history', 'chuyển tiếp: chỉ history, không detail');
check(logs.some(l => /skipped/.test(l)), 'có log bỏ qua');
// Header có province nhưng thiếu lane cũng bỏ qua (Deli cần cả hai).
calls.length = 0;
tabs.deli = [header.filter(h => h !== 'lane'), ...fullDeli.map(r => r.slice(0, 11))];
ctx.syncOpsTabWithHistory_(ss, 'deli', 8);
check(calls.every(c => c.rpc !== 'upsert_kas_deli_detail'), 'thiếu lane: bỏ qua detail');

// --- Pick (chỉ province) ---
calls.length = 0;
const pickHeader = ['report_date', 'region', 'hub', 'hub_type', 'client_name', 'mau_pu', 'ontime_pu_1st', 'ontime_pu_opr', 'province'];
const pk = (day, hub, p, m) => [day + 'T00:00:00', 'HCM', hub, 'BC', 'SPE', m, m - 1, m - 2, p];
tabs.pick = [pickHeader, pk('2026-09-28', 'A', 'HCM', 5), pk('2026-09-28', 'A', 'BDG', 5), pk('2026-10-11', 'A', 'HCM', 9)];
ctx.syncOpsTabWithHistory_(ss, 'pick', 7);
check(calls.find(c => c.rpc === 'upsert_kas_pick_history').rows.length === 2 && calls.find(c => c.rpc === 'upsert_kas_pick_detail').rows.length === 3, 'pick: history 2 dòng, detail 3 dòng');

// --- FD: cửa sổ D-22..D-8 ---
calls.length = 0;
const fdHeader = ['report_date', 'region', 'wh_id', 'deliverywh', 'hub_type', 'client_name', 'mau_fd', 'fd_hoan_thanh', 'province', 'lane'];
const f = (day, p, l, m) => [day + 'T00:00:00', 'HCM', '100', 'K1', 'BC', 'SPE', m, 1, p, l];
tabs.fd = [fdHeader, f('2026-09-20', 'HCM', 'a', 5), f('2026-10-04', 'HCM', 'a', 5), f('2026-10-04', 'BDG', 'b', 3)];
ctx.syncOpsTabWithHistory_(ss, 'fd', 9);
const fdDet = calls.find(c => c.rpc === 'upsert_kas_fd_detail');
check(fdDet.date_from === '2026-09-20' && fdDet.date_to === '2026-10-04' && fdDet.rows.length === 3, 'fd: cửa sổ D-22..D-8');
check(calls.find(c => c.rpc === 'upsert_kas_fd_history').rows.length === 2, 'fd: history gộp còn 2 dòng');

// --- Reverse ---
calls.length = 0;
Object.assign(ctx.Utilities, { formatDate: () => '2026-10-12' });
const rvHeader = ['report_date', 'region', 'hub', 'hub_type', 'client_name', 'mau_pu', 'ontime_pu_1st', 'ontime_pu_opr', 'pud', 'mau_pud', 'province'];
const rv = (day, hub, p, pud, mau) => [day + 'T00:00:00', 'HCM', hub, 'BC', 'SPE Reverse', 4, 3, 2, pud, mau, p];
tabs.reverse = [rvHeader, rv('2026-09-28', 'A', 'HCM', 1, 2), rv('2026-09-28', 'A', 'BDG', 2, 3), rv('2026-10-11', 'A', 'HCM', 1, 1)];
ctx.syncReverseHistory();
const rvHist = calls.find(c => c.rpc === 'upsert_kas_reverse_history'), rvDet = calls.find(c => c.rpc === 'upsert_kas_reverse_detail');
check(rvHist.rows.length === 2 && rvHist.rows[0].mau_pud === 5 && rvHist.rows[0].pud === 3, 'reverse: history gộp cộng pud/mau_pud');
check(rvDet.rows.length === 3, 'reverse: detail giữ province');
for (const c of calls) await replay(c);
check(await sum('kas_reverse_history', 'pud') === await sum('kas_reverse_detail', 'pud'), 'reverse: tổng pud detail = history');
check(await sum('kas_reverse_history', 'mau_pu') === await sum('kas_reverse_detail', 'mau_pu'), 'reverse: tổng mau_pu detail = history');

console.log(`ops-province-lane-sync: ${checks} checks passed`);
await db.close();
