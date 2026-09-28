import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutiveSummary, formatExecutiveSummary, formatExecutiveSummaryMarkdown } from './executiveSummary.js';

const pick = (report_date, region, mau_pu, ontime_pu_1st, ontime_pu_opr = ontime_pu_1st) =>
  ({ client_name: 'SPB', report_date, region, mau_pu, ontime_pu_1st, ontime_pu_opr });
const deli = (report_date, region, mau_deli, ontime_deli_1st, ontime_deli_odr = ontime_deli_1st) =>
  ({ client_name: 'SPB', report_date, region, mau_deli, ontime_deli_1st, ontime_deli_odr });

// 2026-09-27 is a Sunday, 2026-09-26 a Saturday.
const pickRows = [
  pick('2026-09-20', 'HCM', 100, 90), pick('2026-09-20', 'HNO', 100, 95),
  pick('2026-09-27', 'HCM', 100, 80, 85), pick('2026-09-27', 'HNO', 100, 99),
  pick('2026-09-27', 'TBB', 0, 0), pick('2026-09-27', 'XBG', 50, 45),
  pick('2026-09-27', 'HNO - KA', 10, 10), { ...pick('2026-09-27', 'HCM', 999, 0), client_name: 'SPE' }
];
const deliRows = [
  deli('2026-09-19', 'HCM', 100, 90), deli('2026-09-26', 'HCM', 100, 96),
  // Sunday: no deliveries due, rows may still exist with zero volume.
  deli('2026-09-27', 'HCM', 0, 0), deli('2026-09-20', 'HCM', 0, 0)
];

test('deli D-1 falls back to the last day with volume (Saturday on a Monday report)', () => {
  const summary = buildExecutiveSummary(pickRows, deliRows, 'SPB');
  const [pickSection, deliSection] = summary.sections;
  assert.equal(pickSection.d1, '2026-09-27');
  assert.equal(pickSection.prev, '2026-09-20');
  assert.equal(deliSection.d1, '2026-09-26');
  assert.equal(deliSection.prev, '2026-09-19');
  assert.equal(deliSection.current.first, 96);
  assert.equal(deliSection.previous.first, 90);
});

test('top vùng rank by late orders, not by lowest %', () => {
  const [pickSection] = buildExecutiveSummary(pickRows, deliRows, 'SPB').sections;
  assert.equal(Math.round(pickSection.current.first * 10) / 10, 90);
  // HCM 20 late, XBG 5, HNO 1; TBB (no volume) never ranks, KA (0 late) comes last.
  assert.deepEqual(pickSection.worst.map(r => [r.region, r.late]), [['HCM', 20], ['XBG', 5], ['HNO', 1]]);
});

test('a small vùng with a worse % ranks below a big vùng with more late orders', () => {
  const [section] = buildExecutiveSummary([
    pick('2026-09-27', 'TBB', 4, 2),
    pick('2026-09-27', 'HNO', 1000, 900),
    pick('2026-09-27', 'DBB', 10, 9)
  ], [], 'SPB').sections;
  assert.deepEqual(section.worst.map(r => r.region), ['HNO', 'TBB', 'DBB']);
});

test('text shows each section with its own dates when they differ', () => {
  const text = formatExecutiveSummary(buildExecutiveSummary(pickRows, deliRows, 'SPB'));
  assert.equal(text.split('\n')[0], 'Nhận xét D-1 — SPB');
  assert.match(text, /Lấy hàng \(CN 27\/09\) so với cùng thứ tuần trước \(CN 20\/09\)/);
  assert.match(text, /Giao hàng \(T7 26\/09\) so với cùng thứ tuần trước \(T7 19\/09\)/);
  assert.match(text, /• 1st Deli: 96\.0% so 90\.0% → tăng 6\.0%/);
  assert.match(text, /Top vùng trễ 1st Pickup nhiều nhất \(D-1\):/);
  assert.match(text, /• HCM: 20 đơn trễ \| 1st 80\.0% \| OPR 85\.0%/);
});

test('same D-1 for both sections goes in the title line', () => {
  const text = formatExecutiveSummary(buildExecutiveSummary(pickRows, [deli('2026-09-27', 'HCM', 10, 9)], 'SPB'));
  assert.equal(text.split('\n')[0], 'Nhận xét D-1 (CN 27/09) so với cùng thứ tuần trước (CN 20/09) — SPB');
  assert.match(text, /• ODR: 90\.0% so – → không đủ dữ liệu để so sánh/);
});

test('markdown bolds headline values and escapes markdown characters', () => {
  const md = formatExecutiveSummaryMarkdown(buildExecutiveSummary([pick('2026-09-27', 'A_B', 10, 9)], [], 'SPB'));
  assert.match(md, /^\*Nhận xét D-1\* \(CN 27\/09\)/);
  assert.match(md, /• 1st Pickup: \*90\.0%\*/);
  assert.match(md, /• \*A\\_B\*: 1 đơn trễ \| 1st 90\.0%/);
});

test('no data at all', () => {
  assert.equal(buildExecutiveSummary([], [], 'SPB'), null);
  assert.equal(formatExecutiveSummary(null), 'Chưa có dữ liệu để tổng hợp.');
});
