import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBacklogMatrix } from './reverseBacklog.js';

const row = (date, hub, mau_pud, extra = {}) => ({ report_date: date, region: 'HCM', hub, hub_type: 'BC',
  client_name: 'SPE Reverse', mau_pu: 999, pud: 1, mau_pud, ...extra });
const dates = ['2026-11-01', '2026-11-02'];

test('backlog sums mau_pud (absolute count), never mau_pu', () => {
  const m = buildBacklogMatrix({ rows: [row(dates[0], 'A', 5), row(dates[0], 'B', 7), row(dates[1], 'A', 4)], dates });
  assert.deepEqual(m.all, [12, 4]);
  assert.deepEqual(m.miens[0].regions[0].hubs.map(h => h.values), [[5, 4], [7, null]].sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1)));
});

test('missing mau_pud is unknown, not zero; true zero stays zero', () => {
  const m = buildBacklogMatrix({ rows: [row(dates[0], 'A', 5), row(dates[0], 'B', null), row(dates[1], 'A', 0)], dates });
  assert.deepEqual(m.all, [null, 0]);
  assert.equal(m.empty, false);
});

test('scope filters apply and unknown regions stay visible', () => {
  const rows = [row(dates[0], 'A', 5), row(dates[0], 'B', 2, { region: '' }), row(dates[0], 'C', 9, { hub_type: 'GXT' })];
  const regions = ['HCM'];
  assert.equal(buildBacklogMatrix({ rows, dates, selectedRegions: regions, selectedHubTypes: ['BC'] }).all[0], 5);
  assert.equal(buildBacklogMatrix({ rows, dates, selectedHubTypes: ['BC'] }).all[0], 7);
  assert.equal(buildBacklogMatrix({ rows, dates, selectedRegions: [] }).empty, true);
});
