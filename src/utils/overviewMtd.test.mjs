import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOverviewMtd } from './overviewMtd.js';

const row = (date, total, ontime, extra = {}) => ({ report_date: date, mau_pu: total, ontime_pu_1st: ontime, ontime_pu_opr: ontime - 1, region: 'HCM', hub_type: 'BC', client_name: 'SPE', ...extra });

test('MTD includes the start of month beyond the 14-day window and uses weighted totals', () => {
  const result = aggregateOverviewMtd([
    row('2026-09-30', 500, 500), row('2026-10-01', 100, 50),
    row('2026-10-18', 900, 891), row('2026-10-19', 200, 200),
  ], 'p1st', '2026-10-18');
  assert.deepEqual(result, { from: '2026-10-01', to: '2026-10-18', tot: 1000, ont: 941, pct: 94.1 });
});

test('MTD respects client, region and hub type including empty selections', () => {
  const rows = [row('2026-10-01', 100, 90), row('2026-10-01', 200, 100, { client_name: 'SPB' }), row('2026-10-01', 300, 100, { region: 'HNO' }), row('2026-10-01', 400, 100, { hub_type: 'GXT' })];
  const filters = { clientFilter: 'SPE', selectedRegions: ['HCM'], selectedHubTypes: ['BC'] };
  assert.equal(aggregateOverviewMtd(rows, 'p1st', '2026-10-18', filters).tot, 100);
  assert.equal(aggregateOverviewMtd(rows, 'popr', '2026-10-18', filters).ont, 89);
  assert.equal(aggregateOverviewMtd(rows, 'p1st', '2026-10-18', { selectedRegions: [] }).pct, null);
  assert.equal(aggregateOverviewMtd(rows, 'p1st', '2026-10-18', { selectedHubTypes: [] }).tot, 0);
});

test('delivery aliases, FD denominator, month boundaries and empty data', () => {
  assert.equal(aggregateOverviewMtd([{ report_date: '2026-01-01', mau_del: 10, ontime_del_1st: 8, ontime_del_odr: 7 }], 'd1st', '2026-01-01').pct, 80);
  assert.equal(aggregateOverviewMtd([{ report_date: '2026-01-01', mau_deli: 10, ontime_deli_odr: 7 }], 'dodr', '2026-01-01').pct, 70);
  assert.equal(aggregateOverviewMtd([{ report_date: '2026-09-30', mau_fd: 100, fd_hoan_thanh: 2 }], 'fd', '2026-09-30').pct, 2);
  assert.equal(aggregateOverviewMtd([], 'fd', '2026-10-18').pct, null);
  assert.equal(aggregateOverviewMtd([], 'fd', null).pct, null);
});
