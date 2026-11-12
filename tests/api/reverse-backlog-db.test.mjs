import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(readFileSync('supabase/migrations/20261111090000_kas_reverse_backlog.sql', 'utf8'));
const rejects = (promise, pattern) => assert.rejects(promise, pattern);
const upsert = async rows => (await db.query('select public.upsert_kas_reverse_backlog($1::jsonb) r', [JSON.stringify(rows)])).rows[0].r;
const count = async () => Number((await db.query('select count(*) n from public.kas_reverse_backlog')).rows[0].n);
const row = (day, region, assign, age, n, over = {}) => ({
  snapshot_date: day, client_name: 'SPE Reverse', region, hub_type: 'BC', assign_bucket: assign, age_bucket: age, backlog_orders: n, ...over
});

// Ghi: thay trọn vẹn một ngày snapshot, giữ các ngày khác.
let result = await upsert([row('2026-11-04', 'HNO', '0', '1-3', 5), row('2026-11-04', 'HNO', '3+', '8-14', 9)]);
assert.deepEqual(result, { rows: 2, deleted: 0, inserted: 2 });
result = await upsert([row('2026-11-11', 'HNO', '0', '1-3', 7), row('2026-11-11', 'HCM', '1-2', '4-7', 3), row('2026-11-11', null, '3+', '8-14', 1, { region: null })]);
assert.equal(result.inserted, 3);
result = await upsert([row('2026-11-11', 'HNO', '0', '1-3', 8)]);
assert.deepEqual(result, { rows: 1, deleted: 3, inserted: 1 });
assert.equal(await count(), 3, 'ngày 11/11 được thay trọn vẹn (tổ hợp vắng mặt biến mất), ngày 04/11 giữ nguyên');
await upsert([row('2026-11-11', 'HNO', '0', '1-3', 8)]);
assert.equal(await count(), 3, 'chạy lại không nhân đôi');

// Dữ liệu sai không ghi gì.
const before = await count();
await rejects(upsert([]), /nonempty/);
await rejects(upsert([row('2026-11-11', 'HNO', '5', '1-3', 1)]), /assign_bucket/);
await rejects(upsert([row('2026-11-11', 'HNO', '0', '2-9', 1)]), /age_bucket/);
await rejects(upsert([row('2026-11-11', 'HNO', '0', '1-3', -1)]), /backlog_orders/);
await rejects(upsert([row('2026-11-11', 'HNO', '0', '1-3', null)]), /missing/);
await rejects(upsert([row(null, 'HNO', '0', '1-3', 1)]), /missing/);
await rejects(upsert([row('2026-11-11', 'HNO', '0', '1-3', 1), row('2026-11-11', 'HNO', '0', '1-3', 2)]), /Duplicate key/);
await rejects(upsert(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-12'].map(d => row(d, 'HNO', '0', '1-3', 1))), /Too many snapshot dates/);
await rejects(upsert(Array.from({ length: 5001 }, (_, i) => row('2026-11-11', 'r' + i, '0', '1-3', 1))), /too large/);
assert.equal(await count(), before, 'lệnh lỗi không đổi dữ liệu');

// Đọc: snapshot mới nhất + snapshot cách ít nhất 7 ngày.
await db.exec('set role authenticated');
let read = (await db.query('select public.get_kas_reverse_backlog() r')).rows[0].r;
assert.equal(read.snapshot_date, '2026-11-11');
assert.equal(read.prev_snapshot_date, '2026-11-04');
assert.equal(read.rows.length, 1);
assert.deepEqual(read.rows[0], ['HNO', 'BC', '0', '1-3', 8]);
assert.equal(read.prev_rows.length, 2);
read = (await db.query(`select public.get_kas_reverse_backlog('SPE Reverse', 8) r`)).rows[0].r;
assert.equal(read.prev_snapshot_date, null, 'chưa có snapshot đủ cũ');
assert.deepEqual(read.prev_rows, []);
read = (await db.query(`select public.get_kas_reverse_backlog('Client khác') r`)).rows[0].r;
assert.equal(read.snapshot_date, null);
assert.deepEqual(read.rows, []);
await rejects(db.query('select public.get_kas_reverse_backlog($1, 0)', ['SPE Reverse']), /prev_days/);

// Quyền: anon không đọc/ghi gì; authenticated chỉ đọc qua RPC.
await db.exec('reset role; set role anon');
await rejects(db.query('select public.get_kas_reverse_backlog()'), /permission denied/);
await rejects(db.query('select * from public.kas_reverse_backlog'), /permission denied/);
await db.exec('reset role; set role authenticated');
await rejects(db.query(`select public.upsert_kas_reverse_backlog('[]'::jsonb)`), /permission denied/);
await rejects(db.query('select * from public.kas_reverse_backlog'), /permission denied/);
await db.exec('reset role');

// --- Apps Script ---
const calls = [], logs = [], tabs = {}, props = { SUPABASE_SERVICE_ROLE_KEY: 'k' };
const ss = {
  getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
  getSheetByName: n => (tabs[n] ? { getName: () => n, getDataRange: () => ({ getValues: () => tabs[n] }) } : null)
};
const deleted = [], built = [];
const builder = { timeBased: () => builder, atHour: h => { built.push(['atHour', h]); return builder; }, nearMinute: m => { built.push(['nearMinute', m]); return builder; }, everyDays: n => { built.push(['everyDays', n]); return builder; }, inTimezone: z => { built.push(['tz', z]); return builder; }, create: () => { built.push(['create']); } };
const ctx = vm.createContext({
  console, Date, Set, Number, JSON, Math, Object, String, Array,
  Utilities: { formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd' ? '2026-11-11' : `${d.getDate()}-${d.getMonth() + 1}`) },
  Logger: { log: v => logs.push(v) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  ScriptApp: { getProjectTriggers: () => [{ getHandlerFunction: () => 'syncReverseBacklog' }, { getHandlerFunction: () => 'syncAllTabs' }],
    deleteTrigger: t => deleted.push(t.getHandlerFunction()), newTrigger: fn => { built.push(['fn', fn]); return builder; } },
  SUPABASE_URL: 'https://example.invalid'
});
for (const file of ['ops-incremental-sync', 'ops-history-sync', 'reverse-backlog-sync']) {
  vm.runInContext(readFileSync(`scripts/apps-script/${file}.gs`, 'utf8'), ctx);
}
ctx.opsDeltaRpc_ = (name, payload) => { calls.push({ rpc: name, ...payload }); return { rows: payload.rows.length }; };
const header = ['snapshot_date', 'client_name', 'region', 'hub_type', 'assign_bucket', 'age_bucket', 'backlog_orders'];
// Sheets trả ô số là number và có thể đổi "1-3" thành ngày: bucket đọc ra phải đúng chuỗi, nếu không thì từ chối.
const good = [['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '0', '1-3', '126'], ['2026-11-11', 'SPE Reverse', 'N/A', 'KD', '3+', '8-14', 4]];
tabs.reverse_backlog = [header, ...good];
ctx.syncReverseBacklog();
assert.equal(calls.length, 1);
assert.equal(calls[0].rpc, 'upsert_kas_reverse_backlog');
assert.deepEqual(JSON.parse(JSON.stringify(calls[0].rows[0])), { snapshot_date: '2026-11-11', client_name: 'SPE Reverse', region: 'HNO', hub_type: 'BC', assign_bucket: '0', age_bucket: '1-3', backlog_orders: 126 });
assert.equal(calls[0].rows[1].region, 'N/A', 'N/A giữ nguyên, app tự coi là chưa rõ vùng');
assert.equal(JSON.parse(logs.at(-1)).total, 130);
// Sheets đổi "1-3", "4-7", "1-2" thành ngày: script đổi ngược, "8-14", "0", "3+" giữ là chuỗi.
tabs.reverse_backlog = [header,
  ['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '0', new Date(2026, 2, 1), 5],
  ['2026-11-11', 'SPE Reverse', 'HNO', 'BC', new Date(2026, 1, 1), new Date(2026, 6, 4), 6],
  ['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '3+', '8-14', 7]];
ctx.syncReverseBacklog();
assert.deepEqual(calls.at(-1).rows.map(r => [r.assign_bucket, r.age_bucket]).map(x => x.join('|')), ['0|1-3', '1-2|4-7', '3+|8-14']);
calls.pop();
tabs.reverse_backlog = [header, ...good];
// Dữ liệu từ DB nhận được đúng payload của script.
await upsert(calls[0].rows);
assert.equal((await db.query(`select sum(backlog_orders) s from public.kas_reverse_backlog where snapshot_date = '2026-11-11'`)).rows[0].s, '130');

// Từ chối: không gọi RPC.
const reject = (rows, pattern, h = header) => { tabs.reverse_backlog = [h, ...rows]; assert.throws(() => ctx.syncReverseBacklog(), pattern); };
reject([], /trống/);
reject([['2026-11-10', 'SPE Reverse', 'HNO', 'BC', '0', '1-3', 1]].concat([['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '0', '1-3', 1]]), /đúng một snapshot_date/);
reject([['2026-11-09', 'SPE Reverse', 'HNO', 'BC', '0', '1-3', 1]], /cũ hơn hôm qua/);
reject([['2026-11-11', 'SPB', 'HNO', 'BC', '0', '1-3', 1]], /client_name phải là SPE Reverse/);
reject([['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '4', '1-3', 1]], /assign_bucket không hợp lệ/);
reject([['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '0', '2026-03-01T00:00:00', 1]], /age_bucket không hợp lệ/);
reject([['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '0', '1-3', -2]], /không âm/);
reject([['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '0', '1-3', 'abc']], /Invalid numeric/);
reject([['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '0', '1-3', '']], /không âm/);
reject([['2026-11-11', 'SPE Reverse', 'HNO', 'BC', '0', '1-3']], /./, header.slice(0, -1));
delete tabs.reverse_backlog;
assert.throws(() => ctx.syncReverseBacklog(), /Không thấy tab reverse_backlog/);
delete props.SUPABASE_SERVICE_ROLE_KEY;
tabs.reverse_backlog = [header, ...good];
assert.throws(() => ctx.syncReverseBacklog(), /SUPABASE_SERVICE_ROLE_KEY/);
assert.equal(calls.length, 1, 'mọi trường hợp bị từ chối đều không gọi RPC');

ctx.createReverseBacklogDailyTrigger();
assert.deepEqual(deleted, ['syncReverseBacklog'], 'chỉ xoá trigger cũ của chính hàm này');
assert.deepEqual(built, [['fn', 'syncReverseBacklog'], ['atHour', 9], ['nearMinute', 15], ['everyDays', 1], ['tz', 'Asia/Ho_Chi_Minh'], ['create']]);
