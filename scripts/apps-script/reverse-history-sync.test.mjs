import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(readFileSync('supabase/migrations/20261019090000_kas_reverse_history.sql', 'utf8'));

let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const rejects = async (promise, pattern, label) => {
  await assert.rejects(promise, pattern, label); checks++;
};
const replace = async (from, to, rows) =>
  (await db.query('select public.replace_kas_reverse_history($1::date, $2::date, $3::jsonb) r', [from, to, JSON.stringify(rows)])).rows[0].r;
const count = async () => Number((await db.query('select count(*) n from public.kas_reverse_history')).rows[0].n);
const row = (day, hub, mau, over = {}) => ({
  report_date: day, region: 'HCM', hub, hub_type: 'BC', client_name: 'SPE Reverse',
  mau_pu: mau, ontime_pu_1st: mau - 1, ontime_pu_opr: mau - 2, pud: mau - 1, ...over
});

// --- RPC replace ---
let result = await replace('2026-10-05', '2026-10-11', [row('2026-10-05', 'A', 10), row('2026-10-05', 'B', 20), row('2026-10-11', 'A', 30)]);
check(result.rows === 3 && result.deleted === 0 && result.inserted === 3, 'lần đầu: chèn 3 dòng');
check((await db.query(`select week_start::text w from public.kas_reverse_history where report_date = '2026-10-11'`)).rows[0].w === '2026-10-05', 'week_start là thứ Hai');
check((await db.query(`select pud from public.kas_reverse_history where hub = 'B'`)).rows[0].pud == 19, 'có cột pud');
await replace('2026-10-12', '2026-10-12', [row('2026-10-12', 'A', 5)]);
result = await replace('2026-10-05', '2026-10-11', [row('2026-10-05', 'A', 11), row('2026-10-06', 'C', 7)]);
check(result.deleted === 3 && result.inserted === 2, 'replace xoá dòng cũ trong cửa sổ (hub B, ngày 11) và chèn dòng mới');
check(await count() === 3, '2 dòng mới + 1 dòng ngày 12 ngoài cửa sổ');
check((await db.query(`select count(*) n from public.kas_reverse_history where hub = 'B'`)).rows[0].n === 0, 'dòng không còn trong nguồn bị xoá');
check((await db.query(`select mau_pu from public.kas_reverse_history where hub = 'A' and report_date = '2026-10-05'`)).rows[0].mau_pu == 11, 'giá trị được thay');
check((await db.query(`select mau_pu from public.kas_reverse_history where report_date = '2026-10-12'`)).rows[0].mau_pu == 5, 'ngày ngoài cửa sổ giữ nguyên');
await replace('2026-10-13', '2026-10-13', [row('2026-10-13', 'A', 5, { region: null }), row('2026-10-13', 'A', 6, { region: 'HNO' })]);
await replace('2026-10-13', '2026-10-13', [row('2026-10-13', 'A', 8, { region: null })]);
check(await count() === 4, 'region NULL vẫn là một khoá, replace không nhân đôi');
const before = await count();
await rejects(replace('2026-10-05', '2026-10-11', []), /nonempty/, 'rows rỗng không xoá cửa sổ');
await rejects(replace('2026-10-05', '2026-10-11', [row('2026-10-12', 'A', 1)]), /outside window/, 'dòng ngoài cửa sổ');
await rejects(replace('2026-10-05', '2026-10-11', [row('2026-10-06', 'Z', 1), row('2026-10-06', 'Z', 2)]), /Duplicate key/, 'khoá trùng');
await rejects(replace('2026-10-05', '2026-10-11', [row(null, 'Z', 1)]), /report_date/, 'thiếu ngày');
await rejects(replace('2026-10-11', '2026-10-05', [row('2026-10-06', 'Z', 1)]), /Invalid window/, 'cửa sổ ngược');
await rejects(replace('2026-10-01', '2026-10-30', Array.from({ length: 20001 }, (_, i) => row('2026-10-06', 'h' + i, 1))), /too large/, 'lô quá lớn');
check(await count() === before, 'lệnh lỗi không đổi dữ liệu (kể cả không xoá cửa sổ)');

// Quyền: chỉ service_role.
await db.exec('set role anon');
await rejects(db.query(`select public.replace_kas_reverse_history('2026-10-05', '2026-10-05', '[]'::jsonb)`), /permission denied/, 'anon không gọi được RPC');
await rejects(db.query('select * from public.kas_reverse_history'), /permission denied/, 'anon không đọc được bảng');
await db.exec('set role authenticated');
await rejects(db.query(`select public.replace_kas_reverse_history('2026-10-05', '2026-10-05', '[]'::jsonb)`), /permission denied/, 'authenticated không gọi được RPC');
await db.exec('reset role');

// --- Apps Script ---
const calls = [];
const logs = [];
const props = { SUPABASE_SERVICE_ROLE_KEY: 'k' };
const header = ['report_date', 'region', 'hub', 'hub_type', 'mau_pu', 'ontime_pu_1st', 'ontime_pu_opr', 'pud', 'client_name'];
const tabs = {};
const ss = {
  getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
  getSheetByName: n => (tabs[n] ? { getName: () => n, getDataRange: () => ({ getValues: () => tabs[n] }) } : null)
};
const ctx = vm.createContext({
  console, Date, Set, Number, JSON, Math, Object, String,
  Utilities: { formatDate: () => '2026-10-19' },
  Logger: { log: v => logs.push(v) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  SUPABASE_URL: 'https://example.invalid'
});
vm.runInContext(readFileSync('scripts/apps-script/ops-incremental-sync.gs', 'utf8'), ctx);
vm.runInContext(readFileSync('scripts/apps-script/ops-history-sync.gs', 'utf8'), ctx);
vm.runInContext(readFileSync('scripts/apps-script/reverse-history-sync.gs', 'utf8'), ctx);
ctx.opsDeltaRpc_ = (name, payload) => { calls.push({ rpc: name, ...payload }); return { rows: payload.rows.length, deleted: 0, inserted: payload.rows.length }; };

const fill = (day, n) => Array.from({ length: n }, (_, i) => [day + 'T00:00:00', 'HCM', 'Hub' + i, 'BC', 10, 9, 8, 9, 'SPE Reverse']);
const setTab = (name, ...parts) => { tabs[name] = [header, ...parts.flat()]; };

// Backfill: từ chối ngoài [2026-06-21, hôm qua 2026-10-18].
setTab('reverse_backfill_tmp', fill('2026-06-20', 1));
assert.throws(() => ctx.backfillReverseHistory(), /ngoài cửa sổ 2026-06-21\.\.2026-10-18/); checks++;
setTab('reverse_backfill_tmp', fill('2026-10-19', 1));
assert.throws(() => ctx.backfillReverseHistory(), /ngoài cửa sổ/); checks++;
tabs.reverse_backfill_tmp = [header];
assert.throws(() => ctx.backfillReverseHistory(), /trống/); checks++;
delete tabs.reverse_backfill_tmp;
assert.throws(() => ctx.backfillReverseHistory(), /Không thấy tab reverse_backfill_tmp/); checks++;
check(calls.length === 0, 'từ chối thì không gọi RPC');

// Backfill hợp lệ: 21/06 là Chủ nhật (thuộc tuần 15/06, cửa sổ cắt ở 21/06), 22/06 tuần mới, 18/10 là Chủ nhật.
setTab('reverse_backfill_tmp', fill('2026-06-21', 2), fill('2026-06-22', 3), fill('2026-06-28', 1), fill('2026-10-18', 2));
logs.length = 0;
ctx.backfillReverseHistory();
check(calls.length === 3 && calls.every(c => c.rpc === 'replace_kas_reverse_history'), 'mỗi tuần một lệnh replace');
check(calls[0].date_from === '2026-06-21' && calls[0].date_to === '2026-06-21' && calls[0].rows.length === 2, 'tuần đầu bị cắt ở 21/06');
check(calls[1].date_from === '2026-06-22' && calls[1].date_to === '2026-06-28' && calls[1].rows.length === 4, 'tuần 22/06 đủ 7 ngày');
check(calls[2].date_from === '2026-10-12' && calls[2].date_to === '2026-10-18' && calls[2].rows[0].pud === 9, 'tuần cuối đến hôm qua, có pud');
const summary = JSON.parse(logs[0].replace('reverse nguồn theo tuần: ', ''));
check(summary.length === 3 && summary[1].pud === 36 && summary[1].mau_pu === 40, 'log tổng nguồn theo tuần');
check(JSON.parse(logs.at(-1)).partial === false, 'backfill hoàn tất');
// Dữ liệu script gửi đi được RPC nhận và chạy lại không nhân đôi.
await db.exec('truncate public.kas_reverse_history');
for (let i = 0; i < 2; i++) for (const c of calls) await replace(c.date_from, c.date_to, c.rows);
check(await count() === 8, 'RPC nhận toàn bộ dòng từ script, chạy lại không nhân đôi');

// Hằng ngày: D-14..D-1 = 2026-10-05..2026-10-18, phải có ngày hôm qua.
calls.length = 0; logs.length = 0;
setTab('reverse', fill('2026-10-05', 2), fill('2026-10-18', 2));
ctx.syncReverseHistory();
check(calls.length === 1 && calls[0].date_from === '2026-10-05' && calls[0].date_to === '2026-10-18' && calls[0].rows.length === 4, 'daily: một lệnh replace D-14..D-1');
setTab('reverse', fill('2026-10-04', 1), fill('2026-10-18', 1));
assert.throws(() => ctx.syncReverseHistory(), /chưa đúng cửa sổ 2026-10-05\.\.2026-10-18/); checks++;
setTab('reverse', fill('2026-10-05', 1), fill('2026-10-17', 1));
assert.throws(() => ctx.syncReverseHistory(), /chưa đúng cửa sổ/); checks++;
setTab('reverse', fill('2026-10-05', 1), fill('2026-10-19', 1));
assert.throws(() => ctx.syncReverseHistory(), /chưa đúng cửa sổ/); checks++;
check(calls.length === 1, 'cửa sổ sai thì không gọi thêm RPC');
tabs.reverse = [header, ['', '', '', '', '', '', '', '', '']];
assert.throws(() => ctx.syncReverseHistory(), /./); checks++;
delete tabs.reverse;
assert.throws(() => ctx.syncReverseHistory(), /Không thấy tab reverse/); checks++;
delete props.SUPABASE_SERVICE_ROLE_KEY;
setTab('reverse', fill('2026-10-18', 1));
assert.throws(() => ctx.syncReverseHistory(), /SUPABASE_SERVICE_ROLE_KEY/); checks++;

console.log(`reverse-history-sync: ${checks} checks passed`);
