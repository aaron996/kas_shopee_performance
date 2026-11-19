import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLaneMatrix, laneDeliveryPeriods, mondayOf, normalizeLaneDeliveryRows, sameDayLastMonth, scopeLaneRowsByHubType
} from './laneDelivery.js';

const rows = normalizeLaneDeliveryRows([
  { report_date: '2026-11-16', lane: 'Intra city', client_name: 'SPB', hub_type: 'BC', mau_deli: 100, ontime_deli_1st: 90, ontime_deli_odr: 80 },
  { report_date: '2026-11-16', lane: 'Intra City', client_name: 'SPB', hub_type: 'KA', mau_deli: 100, ontime_deli_1st: 100, ontime_deli_odr: 90 },
  { report_date: '2026-11-17', lane: 'Cross region', client_name: 'SPB', hub_type: 'BC', mau_deli: 50, ontime_deli_1st: 25, ontime_deli_odr: 20 },
  { report_date: '2026-11-17', lane: 'Intra city', client_name: 'SPE', hub_type: 'BC', mau_deli: 10, ontime_deli_1st: 10, ontime_deli_odr: 10 },
  { report_date: '2026-11-23', lane: 'Intra city', client_name: 'SPB', hub_type: 'BC', mau_deli: 40, ontime_deli_1st: 40, ontime_deli_odr: 30 },
  { report_date: null, lane: 'x', client_name: 'SPB' }
]);

test('drops invalid rows', () => {
  assert.equal(rows.length, 5);
});

test('mondayOf matches date_trunc(week)', () => {
  assert.equal(mondayOf('2026-11-16'), '2026-11-16'); // thứ Hai
  assert.equal(mondayOf('2026-11-18'), '2026-11-16');
  assert.equal(mondayOf('2026-11-22'), '2026-11-16'); // Chủ nhật vẫn thuộc tuần trước
  assert.equal(mondayOf('2026-11-23'), '2026-11-23');
});

test('day matrix merges lane spelling variants, nests hub types and keeps clients separate', () => {
  const periods = laneDeliveryPeriods(rows, { client: 'SPB', mode: 'day' });
  assert.deepEqual(periods, ['2026-11-16', '2026-11-17', '2026-11-23']);
  const m = buildLaneMatrix({ rows, metricKey: 'd1st', client: 'SPB', mode: 'day', periods });
  const lanes = m.miens[0].regions;
  assert.deepEqual(lanes.map(l => l.region), ['Intra city', 'Cross region']); // thứ tự gần -> xa, nhãn đầu tiên gặp
  assert.equal(m.miens[0].mien, null);
  assert.equal(lanes[0].stats[0].pct, 95); // (90 + 100) / 200
  assert.equal(lanes[0].stats[0].tot, 200);
  assert.deepEqual(lanes[0].hubs.map(h => h.name), ['BC', 'KA']); // BC có thêm 40 đơn ngày 23 nên nhiều đơn hơn KA
  assert.equal(m.all[0].tot, 200);
  assert.equal(m.metric.target, 95);
  assert.match(m.weeks[0].title, /\d/); // nhãn ngày, ví dụ 16/11
});

test('missing denominator is null, not 0', () => {
  const periods = ['2026-11-16', '2026-11-17'];
  const m = buildLaneMatrix({ rows, metricKey: 'dodr', client: 'SPB', mode: 'day', periods });
  const intra = m.miens[0].regions.find(l => l.region === 'Intra city');
  assert.equal(intra.stats[1].pct, null);
  assert.equal(intra.stats[1].tot, 0);
  assert.equal(m.all[1].pct, 40); // 20 / 50
});

test('week matrix groups days into Monday-Sunday weeks and flags partial weeks', () => {
  const periods = laneDeliveryPeriods(rows, { client: 'SPB', mode: 'week' });
  assert.deepEqual(periods, ['2026-11-16', '2026-11-23']);
  const m = buildLaneMatrix({ rows, metricKey: 'd1st', client: 'SPB', mode: 'week', periods });
  assert.equal(m.all[0].tot, 250); // 100 + 100 + 50
  assert.equal(m.all[0].ont, 215);
  assert.equal(m.weeks[0].days, 2);
  assert.equal(m.weeks[0].note, '2 ngày');
  assert.equal(m.weeks[1].note, '1 ngày');
  assert.equal(m.all[1].tot, 40);
});

test('ALL clients sums both, other client excluded', () => {
  const periods = ['2026-11-17'];
  assert.equal(buildLaneMatrix({ rows, metricKey: 'd1st', client: 'ALL', mode: 'day', periods }).all[0].tot, 60);
  assert.equal(buildLaneMatrix({ rows, metricKey: 'd1st', client: 'SPE', mode: 'day', periods }).all[0].tot, 10);
});

test('empty input and unknown metric', () => {
  const m = buildLaneMatrix({ rows: [], metricKey: 'd1st', client: 'SPB', mode: 'day', periods: [] });
  assert.equal(m.empty, true);
  assert.deepEqual(m.miens, []);
  assert.throws(() => buildLaneMatrix({ rows, metricKey: 'p1st', client: 'SPB', mode: 'day', periods: [] }));
});

test('hub type filter only applies when the user narrowed the selection', () => {
  const data = [{ hub_type: 'BC' }, { hub_type: 'BC KD' }, { hub_type: 'KA' }];
  // Mặc định "tất cả": danh sách có thể rỗng/thiếu loại, không được làm mất dòng.
  assert.equal(scopeLaneRowsByHubType(data, [], false).length, 3);
  assert.equal(scopeLaneRowsByHubType(data, ['BC'], false).length, 3);
  // Người dùng thu hẹp: lọc đúng theo lựa chọn; bỏ hết thì rỗng.
  assert.deepEqual(scopeLaneRowsByHubType(data, ['BC', 'KA'], true).map(r => r.hub_type), ['BC', 'KA']);
  assert.equal(scopeLaneRowsByHubType(data, [], true).length, 0);
});

test('sameDayLastMonth clamps to the last day of a shorter month', () => {
  assert.equal(sameDayLastMonth('2026-11-18'), '2026-10-18');
  assert.equal(sameDayLastMonth('2026-03-31'), '2026-02-28');
  assert.equal(sameDayLastMonth('2026-01-15'), '2025-12-15');
});

test('benchmark layout: week groups, WTD, best of 6 same weekdays, same day last month', () => {
  // Mỗi ngày từ 18/10 đến 18/11/2026 (T4); % 1st = 50 + (số ngày kể từ 18/10) -> tăng dần, mẫu 100/ngày.
  const data = [];
  for (let i = 0; i <= 31; i++) {
    const date = new Date(Date.UTC(2026, 9, 18 + i)).toISOString().slice(0, 10);
    data.push({ report_date: date, lane: 'Intra city', client_name: 'SPB', hub_type: 'BC', mau_deli: 100, ontime_deli_1st: 50 + i, ontime_deli_odr: 40 });
  }
  const all = normalizeLaneDeliveryRows(data);
  const dates = laneDeliveryPeriods(all, { client: 'SPB', mode: 'day' });
  const periods = dates.filter(d => d >= '2026-11-09');
  const m = buildLaneMatrix({ rows: all, metricKey: 'd1st', client: 'SPB', mode: 'day', periods, benchmark: true });
  assert.deepEqual(m.groups.map(g => [g.key, g.span]), [['2026-11-09', 7], ['2026-11-16', 3]]);
  assert.match(m.groups[0].title, /Tuần 46/);
  const lane = m.miens[0].regions[0];
  assert.equal(lane.bench.wtd.tot, 300); // 16, 17, 18/11
  assert.equal(lane.bench.wtd.ont, 50 + 29 + 50 + 30 + 50 + 31);
  // 18/11 = 81%; cùng thứ 11/11 (74), 4/11 (67), 28/10 (60), 21/10 (53) -> tốt nhất 74.
  assert.equal(lane.bench.diffBest, 81 - 74);
  assert.equal(lane.bench.diffSame, 81 - 50 - 0); // 18/10 = 50%
  assert.equal(lane.hubs[0].bench.diffBest, 7);
  assert.equal(m.allBench.diffBest, 7);
  // Không bật benchmark thì không có nhóm/so sánh.
  assert.equal(buildLaneMatrix({ rows: all, metricKey: 'd1st', client: 'SPB', mode: 'day', periods }).groups, undefined);
});
