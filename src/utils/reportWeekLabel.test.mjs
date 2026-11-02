import test from 'node:test';
import assert from 'node:assert/strict';
import { getReportWeekLabel, groupDatesByWeek } from './dataProcessor.js';

test('Monday: Sunday data belongs to W-1 and the preceding week to W-2', () => {
  const now = new Date('2026-11-02T03:00:00Z');
  const dates = ['2026-10-19', '2026-10-25', '2026-10-26', '2026-11-01'];
  const grouped = groupDatesByWeek(dates);
  assert.deepEqual(grouped.weekCurrent, ['2026-10-26', '2026-11-01']);
  assert.equal(getReportWeekLabel(grouped.weekCurrent.at(-1), now), 'TUẦN W-1 (Tuần 44)');
  assert.equal(getReportWeekLabel(grouped.weekPrev.at(-1), now), 'TUẦN W-2 (Tuần 43)');
});

test('Tuesday: Monday data belongs to the current week', () => {
  const now = new Date('2026-11-03T03:00:00Z');
  assert.equal(getReportWeekLabel('2026-11-02', now), 'TUẦN HIỆN TẠI (Tuần 45)');
  assert.equal(getReportWeekLabel('2026-11-01', now), 'TUẦN W-1 (Tuần 44)');
});

test('week transition follows Vietnam midnight even while UTC is Sunday', () => {
  assert.equal(getReportWeekLabel('2026-11-01', new Date('2026-11-01T16:59:59Z')), 'TUẦN HIỆN TẠI (Tuần 44)');
  assert.equal(getReportWeekLabel('2026-11-01', new Date('2026-11-01T17:00:00Z')), 'TUẦN W-1 (Tuần 44)');
});

test('delayed FD data and historic data use their actual week offsets', () => {
  const now = new Date('2026-11-02T03:00:00Z');
  assert.equal(getReportWeekLabel('2026-10-25', now), 'TUẦN W-2 (Tuần 43)');
  assert.equal(getReportWeekLabel('2026-10-18', now), 'TUẦN W-3 (Tuần 42)');
});

test('ISO week/year boundaries compare Monday dates instead of week numbers', () => {
  const now = new Date('2027-01-04T03:00:00Z');
  assert.equal(getReportWeekLabel('2027-01-03', now), 'TUẦN W-1 (Tuần 53)');
  assert.equal(getReportWeekLabel('2026-12-27', now), 'TUẦN W-2 (Tuần 52)');
  assert.equal(getReportWeekLabel('', now), '');
});
