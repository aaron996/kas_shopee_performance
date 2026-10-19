import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonitorCsv, monitorRange, monitorRangeError, monitorParams, monitorScopeKey, monitorToday, shiftMonitorDay, sortMonitorUsers } from './appUsageMonitor.js';

test('presets use Vietnam midnight and handle month/year boundaries', () => {
  assert.equal(monitorToday(Date.parse('2026-10-15T17:00:00Z')),'2026-10-16');
  assert.deepEqual(monitorRange('7','2026-01-03'),{from:'2025-12-28',to:'2026-01-03'});
  assert.deepEqual(monitorRange('yesterday','2026-03-01'),{from:'2026-02-28',to:'2026-02-28'});
  assert.equal(shiftMonitorDay('2024-03-01',-1),'2024-02-29');
});
test('custom dates reject reverse, malformed, future and unbounded ranges', () => {
  const today='2026-10-16';
  assert.equal(monitorRangeError({from:'2026-10-16',to:today},today),'');
  assert.match(monitorRangeError({from:'2026-10-17',to:today},today),/bắt đầu/);
  assert.match(monitorRangeError({from:'2026-02-30',to:today},today),/Chọn đủ/);
  assert.match(monitorRangeError({from:today,to:'2026-10-17'},today),/hôm nay/);
  assert.equal(monitorRangeError({from:shiftMonitorDay(today,-89),to:today},today),'');
  assert.match(monitorRangeError({from:shiftMonitorDay(today,-90),to:today},today),/90 ngày/);
});
test('scope keys isolate date, day, email and report tab; empty day is SQL null', () => {
  const filters={...monitorRange('7','2026-10-16'),email:' AN@GHN.VN ',tab:'ranking',day:'2026-10-15'};
  assert.equal(monitorParams(filters).p_email,'an@ghn.vn');
  assert.equal(monitorParams({...filters,day:''}).p_day,null);
  assert.notEqual(monitorScopeKey(filters),monitorScopeKey({...filters,day:'2026-10-16'}));
  assert.notEqual(monitorScopeKey(filters),monitorScopeKey({...filters,tab:'home'}));
});
test('email search and numeric sorts preserve source data and deterministic ties', () => {
  const users=[{email:'b@ghn.vn',active_ms:9000,sessions:1,last_seen_at:'2026-10-16T01:00:00Z'},{email:'a@ghn.vn',active_ms:2000,sessions:2,last_seen_at:'2026-10-16T02:00:00Z'}];
  assert.equal(sortMonitorUsers(users,'','active')[0].email,'b@ghn.vn');
  assert.equal(sortMonitorUsers(users,'','recent')[0].email,'a@ghn.vn');
  assert.equal(sortMonitorUsers(users,' A@GHN ','sessions').length,1);
  assert.equal(users[0].email,'b@ghn.vn');
});
test('CSV exports scoped rows with source dates, safe formulas and exact active seconds', () => {
  const filters={from:'2026-10-10',to:'2026-10-16',day:'2026-10-15',tab:'home'};
  const csv=buildMonitorCsv([{email:'=malicious',sessions:1,active_ms:3500,views:2,first_seen_at:'2026-10-15T01:00:00Z',last_seen_at:'2026-10-15T01:00:04Z',tabs:['home'],chat_questions:0,exports:1}],filters,id=>id==='home'?'Tổng quan':id);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"2026-10-15","Tổng quan","\'=malicious","1","4"'));
  assert.equal(csv.split('\r\n').length,2);
});
