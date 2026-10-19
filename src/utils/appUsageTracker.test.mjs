import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageTracker, usageDay, usagePayload, formatActiveTime } from './appUsageTracker.js';

function fixture(start = Date.parse('2026-10-16T03:00:00Z')) {
  let time = start, sequence = 0;
  const tracker = createUsageTracker({ now: () => time, uuid: () => `session-${++sequence}`, focused: true });
  return { tracker, step(ms) { time += ms; tracker.tick(); }, clock(ms) { time += ms; } };
}
test('counts focused time, tab views, and stops at the idle boundary', () => {
  const { tracker, step } = fixture();
  step(30000); tracker.tab('ranking'); step(30000);
  let rows = tracker.snapshots();
  assert.equal(rows.find(r => r.tab_id === 'home').active_ms, 30000);
  assert.equal(rows.find(r => r.tab_id === 'ranking').active_ms, 30000);
  for (let i = 0; i < 5; i++) step(30000);
  rows = tracker.snapshots();
  assert.equal(rows[0].active_ms, 120000);
  assert.equal(rows[0].views, 1);
  tracker.interact(); step(10000);
  assert.equal(tracker.snapshots()[0].active_ms, 130000);
});
test('hidden windows and background navigation add no activity or views', () => {
  const { tracker, step } = fixture();
  step(10000); tracker.focus(false); tracker.tab('ranking'); step(30000);
  assert.deepEqual(tracker.snapshots().map(r => [r.tab_id, r.active_ms, r.views]), [['home',10000,1]]);
  tracker.focus(true); step(5000);
  assert.deepEqual(tracker.snapshots().map(r => [r.tab_id, r.active_ms, r.views]), [['ranking',5000,1]]);
});
test('idle return creates a new session; suspend does not accrue sleep time', () => {
  const { tracker, clock, step } = fixture();
  tracker.snapshots(); clock(1800000); tracker.interact(); step(10000);
  const rows = tracker.snapshots();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session_id, 'session-2');
  assert.equal(rows[0].active_ms, 10000);
});
test('Vietnam midnight splits activity without changing the session', () => {
  const { tracker, step } = fixture(Date.parse('2026-10-15T16:59:50Z'));
  step(20000);
  const rows = tracker.snapshots();
  assert.deepEqual(rows.map(r => [r.day,r.active_ms]), [['2026-10-15',10000],['2026-10-16',10000]]);
  assert.equal(rows[0].session_id,rows[1].session_id);
  assert.equal(usageDay(Date.parse('2026-10-15T17:00:00Z')), '2026-10-16');
});
test('cumulative snapshots retain repeated visits and serialize safely', () => {
  const { tracker, step } = fixture();
  step(5000); tracker.snapshots(); tracker.tab('ranking'); step(5000); tracker.tab('home'); step(5000);
  const home = tracker.snapshots().find(r => r.tab_id === 'home');
  assert.equal(home.active_ms,10000); assert.equal(home.views,2);
  assert.equal(usagePayload(home).p_active_ms,10000);
  assert.equal(formatActiveTime(3661000),'1 giờ 1 phút');
});
test('successful delayed actions keep their source tab without recording content or waking idle time', () => {
  const { tracker, step } = fixture();
  step(5000); tracker.tab('ranking'); tracker.focus(false);
  tracker.action('chat_questions','home'); tracker.action('exports'); tracker.action('unknown');
  const rows = tracker.snapshots();
  assert.equal(rows.find(r => r.tab_id === 'home').chat_questions,1);
  assert.equal(rows.find(r => r.tab_id === 'ranking').exports,1);
  assert.equal(rows.reduce((total,row)=>total+row.active_ms,0),5000);
});
