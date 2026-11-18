import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLaneDeliveryTable, normalizeLaneDeliveryRows, LANE_DELIVERY_METRICS } from './laneDelivery.js';

const rows = normalizeLaneDeliveryRows([
  { report_date: '2026-11-16', lane: 'Intra city', client_name: 'SPB', mau_deli: 100, ontime_deli_1st: 90, ontime_deli_odr: 80 },
  { report_date: '2026-11-16', lane: 'Intra City', client_name: 'SPB', mau_deli: 100, ontime_deli_1st: 100, ontime_deli_odr: 90 },
  { report_date: '2026-11-17', lane: 'Cross region', client_name: 'SPB', mau_deli: 50, ontime_deli_1st: 25, ontime_deli_odr: 20 },
  { report_date: '2026-11-17', lane: 'Intra city', client_name: 'SPE', mau_deli: 10, ontime_deli_1st: 10, ontime_deli_odr: 10 },
  { report_date: null, lane: 'x', client_name: 'SPB' }
]);

test('drops invalid rows and merges lane spelling variants', () => {
  assert.equal(rows.length, 4);
  const t = buildLaneDeliveryTable(rows, { client: 'SPB', metric: LANE_DELIVERY_METRICS[0] });
  assert.deepEqual(t.lanes.map(l => l.key), ['intracity', 'crossregion']);
  assert.equal(t.lanes[0].byDate['2026-11-16'].pct, 95);
  assert.equal(t.lanes[0].period.total, 200);
});

test('missing denominator is null, not 0, and clients stay separate', () => {
  const t = buildLaneDeliveryTable(rows, { client: 'SPB', metric: LANE_DELIVERY_METRICS[1] });
  assert.equal(t.lanes[0].byDate['2026-11-17'].pct, null);
  assert.equal(t.all.byDate['2026-11-17'].pct, 40);
  assert.equal(buildLaneDeliveryTable(rows, { client: 'SPE', metric: LANE_DELIVERY_METRICS[0] }).all.period.pct, 100);
});

test('empty input yields empty table', () => {
  const t = buildLaneDeliveryTable([], { client: 'SPB', metric: LANE_DELIVERY_METRICS[0] });
  assert.deepEqual([t.dates, t.lanes], [[], []]);
  assert.equal(t.all.period.pct, null);
});
