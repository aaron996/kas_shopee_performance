import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(readFileSync('supabase/migrations/20261012100000_kas_pick_history.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20261012120000_kas_history_deli_fd_read_retention.sql', 'utf8'));

let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const rejects = async (promise, pattern, label) => {
  await assert.rejects(promise, pattern, label); checks++;
};
const rpc = async (fn, rows) => (await db.query(`select public.${fn}($1::jsonb) r`, [JSON.stringify(rows)])).rows[0].r;
const count = async table => Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n);
const pick = (day, hub, mau, over = {}) => ({
  report_date: day, region: 'HCM', hub, hub_type: 'BC', client_name: 'SPE',
  mau_pu: mau, ontime_pu_1st: mau - 1, ontime_pu_opr: mau - 2, ...over
});
const deli = (day, hub, mau, over = {}) => ({
  report_date: day, region: 'HCM', wh_id: '100', hub, hub_type: 'BC', client_name: 'SPE',
  mau_deli: mau, ontime_deli_1st: mau - 1, ontime_deli_odr: mau - 2, ...over
});
const fd = (day, hub, mau, over = {}) => ({
  report_date: day, region: 'HCM', wh_id: '100', deliverywh: hub, hub_type: 'BC', client_name: 'SPE',
  mau_fd: mau, fd_hoan_thanh: Math.floor(mau / 10), ...over
});
const upsertPick = rows => rpc('upsert_kas_pick_history', rows);
const upsertDeli = rows => rpc('upsert_kas_deli_history', rows);
const upsertFd = rows => rpc('upsert_kas_fd_history', rows);

// --- Pick RPC ---
let result = await upsertPick([pick('2026-10-07', 'A', 10), pick('2026-10-07', 'B', 20), pick('2026-10-12', 'A', 30)]);
check(result.inserted === 3 && result.updated === 0 && result.unchanged === 0, 'first insert');
const weeks = (await db.query('select report_date::text d, week_start::text w from public.kas_pick_history order by report_date, hub')).rows;
check(weeks[0].w === '2026-10-05' && weeks[2].w === '2026-10-12', 'week_start là thứ Hai (Chủ nhật 11/10 thuộc tuần 05/10)');
const before = (await db.query('select id, synced_at from public.kas_pick_history order by id')).rows;
result = await upsertPick([pick('2026-10-07', 'A', 10), pick('2026-10-07', 'B', 20)]);
check(result.unchanged === 2 && result.inserted === 0 && result.updated === 0, 'rerun là no-op');
const after = (await db.query('select id, synced_at from public.kas_pick_history order by id')).rows;
check(JSON.stringify(before) === JSON.stringify(after), 'no-op giữ id và synced_at');
result = await upsertPick([pick('2026-10-07', 'A', 11)]);
check(result.updated === 1 && await count('kas_pick_history') === 3, 'giá trị đổi thì update, không thêm dòng');
await upsertPick([pick('2026-10-08', 'A', 5, { region: null })]);
result = await upsertPick([pick('2026-10-08', 'A', 6, { region: null })]);
check(result.updated === 1 && await count('kas_pick_history') === 4, 'region NULL vẫn trùng khoá, không nhân đôi');
await upsertPick([pick('2026-10-09', 'A', 1)]);
check((await db.query(`select count(*) n from public.kas_pick_history where report_date='2026-10-07'`)).rows[0].n === 2, 'upsert không xoá ngày khác');
await rejects(upsertPick([pick('2026-10-09', 'Z', 1), pick('2026-10-09', 'Z', 2)]), /Duplicate key in batch/, 'khoá trùng trong lô');
await rejects(upsertPick([]), /nonempty/, 'lô rỗng');
await rejects(upsertPick([pick(null, 'A', 1)]), /report_date/, 'thiếu ngày');
await rejects(upsertPick(Array.from({ length: 20001 }, (_, i) => pick('2026-10-01', 'h' + i, 1))), /too large/, 'lô quá lớn');
check(await count('kas_pick_history') === 5, 'lô lỗi không ghi dòng nào');

// --- Deli RPC ---
result = await upsertDeli([deli('2026-10-07', 'A', 10), deli('2026-10-07', 'A', 99, { wh_id: '200' }), deli('2026-10-12', 'A', 30)]);
check(result.inserted === 3, 'deli: wh_id khác nhau là hai dòng');
result = await upsertDeli([deli('2026-10-07', 'A', 10)]);
check(result.unchanged === 1, 'deli: rerun là no-op');
result = await upsertDeli([deli('2026-10-07', 'A', 12)]);
check(result.updated === 1 && await count('kas_deli_history') === 3, 'deli: đổi giá trị thì update');
await upsertDeli([deli('2026-10-08', 'A', 5, { wh_id: null })]);
result = await upsertDeli([deli('2026-10-08', 'A', 6, { wh_id: null })]);
check(result.updated === 1 && await count('kas_deli_history') === 4, 'deli: wh_id NULL không nhân đôi');
await rejects(upsertDeli([deli('2026-10-09', 'Z', 1), deli('2026-10-09', 'Z', 2)]), /Duplicate key in batch/, 'deli: khoá trùng');
await rejects(upsertDeli([]), /nonempty/, 'deli: lô rỗng');

// --- FD RPC ---
result = await upsertFd([fd('2026-10-04', 'K1', 100), fd('2026-10-04', 'K2', 200)]);
check(result.inserted === 2, 'fd: insert');
result = await upsertFd([fd('2026-10-04', 'K1', 100)]);
check(result.unchanged === 1, 'fd: rerun là no-op');
result = await upsertFd([fd('2026-10-04', 'K1', 150)]);
check(result.updated === 1 && await count('kas_fd_history') === 2, 'fd: đổi giá trị thì update');
await rejects(upsertFd([fd('2026-10-04', 'K3', 1), fd('2026-10-04', 'K3', 2)]), /Duplicate key in batch/, 'fd: khoá trùng');

// --- RPC đọc theo tuần ---
const weekly = async (dataset, weeksArg) => (await db.query('select public.get_kas_weekly_rows($1, $2) r', [dataset, weeksArg])).rows[0].r;
let w = await weekly('pick', 9);
check(JSON.stringify(w.weeks) === JSON.stringify(['2026-10-05', '2026-10-12']), 'pick: các tuần có dữ liệu, tăng dần');
const hubA = w.rows.find(r => r.report_date === '2026-10-05' && r.hub === 'A' && r.region === 'HCM');
check(hubA.mau_pu === 12 && hubA.days === 2, 'pick: cộng tuần hub A (11 ngày 07/10 + 1 ngày 09/10)');
const hubANull = w.rows.find(r => r.report_date === '2026-10-05' && r.hub === 'A' && r.region === null);
check(hubANull.mau_pu === 6 && hubANull.ontime_pu_1st === 5 && hubANull.days === 1, 'pick: region NULL là dòng riêng');
check(w.rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.report_date) && new Date(r.report_date + 'T00:00:00Z').getUTCDay() === 1), 'report_date là thứ Hai');
w = await weekly('pick', 1);
check(JSON.stringify(w.weeks) === JSON.stringify(['2026-10-12']) && w.rows.length === 1, 'weeks=1 chỉ lấy tuần mới nhất');
w = await weekly('deli', 9);
check(w.weeks.length === 2 && w.rows.some(r => r.wh_id === '200' && r.mau_deli === 99), 'deli: giữ wh_id để app nhận ra CK');
w = await weekly('fd', 9);
check(w.weeks.length === 1 && w.rows.find(r => r.deliverywh === 'K1').fd_hoan_thanh === 15, 'fd: dùng deliverywh và fd_hoan_thanh');
await rejects(weekly('ca1', 9), /Unsupported dataset/, 'dataset lạ');
await rejects(weekly('pick', 0), /weeks must be/, 'weeks quá nhỏ');
await rejects(weekly('pick', 17), /weeks must be/, 'weeks quá lớn');
await db.exec('set role authenticated');
check((await weekly('pick', 9)).weeks.length === 2, 'authenticated đọc được qua RPC');
await rejects(db.query('select * from public.kas_pick_history'), /permission denied/, 'authenticated không đọc thẳng bảng');
await db.exec('reset role');
await db.exec('set role anon');
await rejects(weekly('pick', 9), /permission denied/, 'anon không gọi được RPC đọc');
await rejects(db.query(`select public.upsert_kas_pick_history('[]')`), /permission denied/, 'anon không gọi được upsert pick');
await rejects(db.query(`select public.upsert_kas_deli_history('[]')`), /permission denied/, 'anon không gọi được upsert deli');
await rejects(db.query(`select public.upsert_kas_fd_history('[]')`), /permission denied/, 'anon không gọi được upsert fd');
await rejects(db.query('select * from public.kas_pick_history'), /permission denied/, 'anon không đọc được bảng pick');
await db.exec('reset role');
await db.exec(`truncate public.kas_pick_history`);
w = await weekly('pick', 9);
check(w.weeks.length === 0 && w.rows.length === 0, 'bảng rỗng trả mảng rỗng');

// --- Retention ---
const ictToday = (await db.query(`select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text d`)).rows[0].d;
const daysAgo = n => { const d = new Date(ictToday + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
await upsertPick([pick(daysAgo(100), 'old', 1), pick(daysAgo(91), 'old2', 1), pick(daysAgo(90), 'edge', 1), pick(daysAgo(5), 'new', 1)]);
await upsertDeli([deli(daysAgo(100), 'old', 1)]);
await upsertFd([fd(daysAgo(120), 'old', 10)]);
const pruned = (await db.query('select public.prune_kas_history(90) r')).rows[0].r;
check(pruned.cutoff === daysAgo(90) && pruned.pick === 2 && pruned.deli === 1 && pruned.fd === 1, 'prune xoá dòng cũ hơn 90 ngày');
check((await db.query(`select string_agg(hub, ',' order by hub) h from public.kas_pick_history`)).rows[0].h === 'edge,new', 'dòng đúng 90 ngày tuổi được giữ');
check(await count('kas_deli_history') > 0 && await count('kas_fd_history') === 2, 'prune giữ dòng mới của deli và fd');
await rejects(db.query('select public.prune_kas_history(30)'), /at least 70/, 'keep_days quá nhỏ bị từ chối');
await rejects(db.query('select public.prune_kas_history(null)'), /at least 70/, 'keep_days null bị từ chối');
await db.exec('set role authenticated');
await rejects(db.query('select public.prune_kas_history(90)'), /permission denied/, 'authenticated không gọi được prune');
await db.exec('reset role');

// --- Apps Script ---
const calls = [];
const logs = [];
const props = { SUPABASE_SERVICE_ROLE_KEY: 'k' };
const headers = {
  pick: ['report_date', 'week_start', 'region', 'hub', 'hub_type', 'client_name', 'mau_pu', 'ontime_pu_1st', 'ontime_pu_opr'],
  deli: ['report_date', 'week_start', 'region', 'wh_id', 'hub', 'hub_type', 'client_name', 'mau_deli', 'ontime_deli_1st', 'ontime_deli_odr'],
  fd: ['report_date', 'week_start', 'region', 'wh_id', 'deliverywh', 'hub_type', 'client_name', 'mau_fd', 'fd_hoan_thanh']
};
const tabs = {};
const sheetOf = name => ({ getSheetId: () => ({ pick: 7, deli: 8, fd: 9 }[name]), getDataRange: () => ({ getValues: () => tabs[name] }) });
const ss = {
  getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
  getSheets: () => ['pick', 'deli', 'fd'].map(sheetOf),
  getSheetByName: n => {
    const key = n.replace('_backfill_tmp', '');
    return n.endsWith('_backfill_tmp') && headers[key] ? { getDataRange: () => ({ getValues: () => tabs['b:' + key] }) } : null;
  }
};
const ctx = vm.createContext({
  console, Date, Set, Number, JSON, Math, Object, String,
  Utilities: { formatDate: () => '2026-10-12' },
  Logger: { log: v => logs.push(v) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  SUPABASE_URL: 'https://example.invalid'
});
vm.runInContext(readFileSync('scripts/apps-script/ops-incremental-sync.gs', 'utf8'), ctx);
vm.runInContext(readFileSync('scripts/apps-script/ops-history-sync.gs', 'utf8'), ctx);
// Các .gs định nghĩa hai hàm này; thay bằng bản giả sau khi nạp để không gọi mạng.
ctx.opsDeltaRpc_ = (name, payload) => { calls.push({ rpc: name, rows: payload.rows }); return { rows: payload.rows.length, inserted: payload.rows.length, updated: 0, unchanged: 0 }; };
ctx.syncOpsDeltaTab_ = (_ss, tabKey) => { logs.push('delta:' + tabKey); };

const fill = (key, day, n) => Array.from({ length: n }, (_, i) => {
  const base = [day + 'T00:00:00', '2026-01-01T00:00:00', 'HCM'];
  if (key === 'pick') return [...base, 'Hub' + i, 'BC', 'SPE', 10, 9, 8];
  if (key === 'deli') return [...base, '100', 'Hub' + i, 'BC', 'SPE', 10, 9, 8];
  return [...base, '100', 'Kho' + i, 'BC', 'SPE', 100, 5];
});
const setTab = (name, key, ...parts) => { tabs[name] = [headers[key], ...parts.flat()]; };

check(ctx.opsHistoryMonday_('2026-10-12') === '2026-10-12', 'thứ Hai là chính nó');
check(ctx.opsHistoryMonday_('2026-10-11') === '2026-10-05', 'Chủ nhật về thứ Hai trước');
check(ctx.opsHistoryMonday_('2026-10-07') === '2026-10-05', 'giữa tuần');

// Backfill từ chối ngày ngoài cửa sổ.
setTab('b:pick', 'pick', fill('pick', '2026-08-16', 1));
assert.throws(() => ctx.backfillPickHistory(), /ngoài cửa sổ 2026-08-17\.\.2026-10-11/); checks++;
setTab('b:pick', 'pick', fill('pick', '2026-10-12', 1));
assert.throws(() => ctx.backfillPickHistory(), /ngoài cửa sổ/); checks++;
tabs['b:pick'] = [headers.pick];
assert.throws(() => ctx.backfillPickHistory(), /Tab trống/); checks++;
check(calls.length === 0, 'từ chối thì không gọi RPC');

// Backfill Pick hợp lệ: 3 tuần, tuần 2 vượt 1 lô; log tổng nguồn theo tuần.
setTab('b:pick', 'pick', fill('pick', '2026-08-17', 3), fill('pick', '2026-08-24', 5001), fill('pick', '2026-10-11', 2));
logs.length = 0; calls.length = 0;
ctx.backfillPickHistory();
check(calls.length === 4 && calls.every(c => c.rpc === 'upsert_kas_pick_history' && c.rows.length <= 5000), '1 lô + 2 lô + 1 lô, đúng RPC pick');
check(calls[0].rows[0].report_date === '2026-08-17' && calls[0].rows[0].week_start === undefined, 'chỉ gửi các cột lịch sử');
const summary = JSON.parse(logs[0].replace('pick nguồn theo tuần: ', ''));
check(summary.length === 3 && summary[1].week_start === '2026-08-24' && summary[1].mau_pu === 50010, 'log tổng nguồn theo tuần');
check(summary[2].week_start === '2026-10-05', 'Chủ nhật 11/10 thuộc tuần 05/10');
check(JSON.parse(logs.at(-1)).partial === false, 'hoàn tất');
let replayed = 0;
await db.exec('truncate public.kas_pick_history');
for (const c of calls) replayed += (await rpc('upsert_kas_pick_history', c.rows)).inserted;
check(replayed === 5006, 'RPC pick nhận toàn bộ dòng từ script');

// Backfill Deli: cửa sổ đến hôm qua; wh_id đi theo.
setTab('b:deli', 'deli', fill('deli', '2026-08-17', 2), fill('deli', '2026-10-11', 2));
calls.length = 0; logs.length = 0;
ctx.backfillDeliHistory();
check(calls.length === 2 && calls[0].rpc === 'upsert_kas_deli_history' && calls[0].rows[0].wh_id === '100', 'deli: đúng RPC và có wh_id');
check(JSON.parse(logs[0].replace('deli nguồn theo tuần: ', ''))[0].mau_deli === 20, 'deli: log tổng mau_deli');
replayed = 0;
await db.exec('truncate public.kas_deli_history');
for (const c of calls) replayed += (await rpc('upsert_kas_deli_history', c.rows)).inserted;
check(replayed === 4, 'RPC deli nhận toàn bộ dòng từ script');

// Backfill FD: cửa sổ kết thúc ở D-8 (04/10); 05/10 trở đi bị từ chối.
setTab('b:fd', 'fd', fill('fd', '2026-10-05', 1));
assert.throws(() => ctx.backfillFdHistory(), /ngoài cửa sổ 2026-08-17\.\.2026-10-04/); checks++;
setTab('b:fd', 'fd', fill('fd', '2026-08-17', 2), fill('fd', '2026-10-04', 2));
calls.length = 0; logs.length = 0;
ctx.backfillFdHistory();
check(calls.length === 2 && calls[0].rpc === 'upsert_kas_fd_history' && calls[0].rows[0].deliverywh === 'Kho0', 'fd: đúng RPC và cột deliverywh');
replayed = 0;
await db.exec('truncate public.kas_fd_history');
for (const c of calls) replayed += (await rpc('upsert_kas_fd_history', c.rows)).inserted;
check(replayed === 4, 'RPC fd nhận toàn bộ dòng từ script');

// Hằng ngày: Pick/Deli D-14..D-1 (28/09..11/10), FD D-22..D-8 (20/09..04/10), CA1 chỉ delta.
calls.length = 0; logs.length = 0;
setTab('pick', 'pick', fill('pick', '2026-09-28', 2), fill('pick', '2026-10-11', 2));
ctx.syncOpsTabWithHistory_(ss, 'pick', 7);
check(logs[0] === 'delta:pick' && calls.length === 1 && calls[0].rpc === 'upsert_kas_pick_history', 'pick: delta rồi history');
calls.length = 0; logs.length = 0;
setTab('deli', 'deli', fill('deli', '2026-09-28', 2), fill('deli', '2026-10-11', 2));
ctx.syncOpsTabWithHistory_(ss, 'deli', 8);
check(logs[0] === 'delta:deli' && calls.length === 1 && calls[0].rpc === 'upsert_kas_deli_history', 'deli: delta rồi history');
calls.length = 0; logs.length = 0;
setTab('fd', 'fd', fill('fd', '2026-09-20', 2), fill('fd', '2026-10-04', 2));
ctx.syncOpsTabWithHistory_(ss, 'fd', 9);
check(logs[0] === 'delta:fd' && calls.length === 1 && calls[0].rpc === 'upsert_kas_fd_history', 'fd: delta rồi history');
calls.length = 0; logs.length = 0;
ctx.syncOpsTabWithHistory_(ss, 'ca1', 10);
check(logs[0] === 'delta:ca1' && calls.length === 0, 'ca1: chỉ delta');
setTab('pick', 'pick', fill('pick', '2026-09-27', 1));
assert.throws(() => ctx.syncOpsTabWithHistory_(ss, 'pick', 7), /chưa đúng cửa sổ 2026-09-28\.\.2026-10-11/); checks++;
setTab('pick', 'pick', fill('pick', '2026-10-12', 1));
assert.throws(() => ctx.syncOpsTabWithHistory_(ss, 'pick', 7), /chưa đúng cửa sổ/); checks++;
setTab('fd', 'fd', fill('fd', '2026-10-05', 1));
assert.throws(() => ctx.syncOpsTabWithHistory_(ss, 'fd', 9), /chưa đúng cửa sổ 2026-09-20\.\.2026-10-04/); checks++;
delete props.SUPABASE_SERVICE_ROLE_KEY;
setTab('pick', 'pick', fill('pick', '2026-10-11', 1));
assert.throws(() => ctx.syncOpsTabWithHistory_(ss, 'pick', 7), /SUPABASE_SERVICE_ROLE_KEY/); checks++;

console.log(`ops-history-sync: ${checks} checks passed`);
