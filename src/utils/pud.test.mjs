import test from 'node:test';
import assert from 'node:assert/strict';
import { pudCounts } from './pud.js';
import { buildWeeklyMatrix, WEEKLY_METRICS, datasetFor, dayLabel } from './weeklyKpi.js';
import { MIEN_REGIONS } from '../data/defaultDataset.js';
import { filterRowsByScope } from './dataProcessor.js';

const row = (hub, pud, mau_pud, extra = {}) => ({ report_date: '2026-11-01', region: 'HCM', hub,
  hub_type: 'BC', client_name: 'SPE Reverse', mau_pu: 0, pud, mau_pud, ...extra });
const matrix = (rows, extra = {}) => buildWeeklyMatrix({ rows, weeks: ['2026-11-01'], metricKey: 'pud', labelFor: dayLabel, ...extra });

test('PUD uses its own population, aggregates counts, and has no target', () => {
  const result = matrix([row('A', 1, 1), row('B', 0, 9)]);
  assert.deepEqual(result.all, [{ tot: 10, ont: 1, pct: 10 }]);
  assert.equal(result.miens[0].regions[0].stats[0].pct, 10);
  assert.equal(result.metric.target, null);
  assert.equal(datasetFor(WEEKLY_METRICS.pud, 'SPE Reverse'), 'reverse');
  assert.equal(result.empty, false, 'zero pickup volume cannot remove PUD rows');
});

test('missing or invalid samples never turn into zero or a partial percentage', () => {
  for (const counts of [{ pud: 1 }, { pud: 1, mau_pud: null }, { pud: null, mau_pud: 9 },
    { pud: 1, mau_pud: '' }, { pud: 2, mau_pud: 1 }, { pud: -1, mau_pud: 1 }]) {
    assert.deepEqual(pudCounts(counts), { tot: null, ont: null });
    const result = matrix([row('A', 1, 10), row('B', counts.pud, counts.mau_pud)]);
    assert.deepEqual(result.all[0], { tot: null, ont: null, pct: null });
    assert.equal(result.empty, false);
  }
  assert.deepEqual(matrix([row('A', 0, 0)]).all[0], { tot: 0, ont: 0, pct: null });
});

test('unknown regions stay in the national PUD population without a guessed assignment', () => {
  const rows = [row('A', 1, 1, { region: '' }), row('B', 0, 9)];
  const regions = Object.values(MIEN_REGIONS).flat();
  assert.equal(filterRowsByScope(rows, regions, ['BC']).length, 2);
  const result = matrix(rows, { selectedRegions: regions, selectedHubTypes: ['BC'] });
  assert.equal(result.all[0].pct, 10);
  assert.equal(result.miens.find(item => item.mien === 'Miền Khác').regions[0].region, 'Chưa rõ vùng');
  assert.equal(matrix(rows, { selectedRegions: ['HCM'] }).all[0].tot, 9);
  assert.equal(matrix(rows, { selectedRegions: [] }).empty, true);
  assert.equal(matrix(rows, { selectedHubTypes: ['GXT'] }).empty, true);
});
