import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOverviewMtd, buildOverviewCards, overviewMtdRanges, resolveOverviewMtdCard } from './overviewMtd.js';
import { getOverviewMetrics } from '../data/overviewMetrics.js';
import { MIEN_REGIONS, TARGET_KPIS } from '../data/defaultDataset.js';

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

const reverse = extra => row('2026-11-02', 100, 70, { client_name: 'SPE Reverse', pud: 1, ...extra });

test('client capabilities drive card count, source, targets and PUD population', () => {
  const cards = buildOverviewCards({ pick: [reverse()], deli: [], fd: [] }, 'SPE Reverse');
  assert.deepEqual(cards.map(card => card.id), ['p1st', 'popr', 'pud']);
  assert.ok(cards.every(card => card.target === null && card.sources.join() === 'reverse'));
  assert.deepEqual(cards.map(card => card.d1.pct), [70, 69, 1]);
  assert.deepEqual(overviewMtdRanges(cards), [['reverse', '2026-11-02']]);
  for (const client of ['SPE', 'SPB']) {
    const standard = getOverviewMetrics(client);
    assert.deepEqual(standard.map(card => card.id), ['p1st', 'popr', 'd1st', 'dodr', 'fd']);
    assert.equal(standard[0].target, TARGET_KPIS['1st Pickup']);
    assert.equal(standard[1].target, TARGET_KPIS.OPR);
  }
  assert.deepEqual(getOverviewMetrics('not-configured'), []);
  assert.deepEqual(getOverviewMetrics('ALL', ['SPE', 'SPB']).map(card => card.id), ['p1st', 'popr', 'd1st', 'dodr', 'fd']);
});

test('MTD and daily use the same all-region rule for unmapped Reverse hubs', () => {
  const rows = [reverse(), reverse({ region: '', mau_pu: 200, ontime_pu_1st: 50 })];
  const allRegions = Object.values(MIEN_REGIONS).flat();
  assert.equal(aggregateOverviewMtd(rows, 'p1st', '2026-11-02', { selectedRegions: allRegions }).tot, 300);
  assert.equal(aggregateOverviewMtd(rows, 'p1st', '2026-11-02', { selectedRegions: ['HCM'] }).tot, 100);
  assert.equal(aggregateOverviewMtd(rows, 'p1st', '2026-11-02', { selectedRegions: [] }).tot, 0);
});

test('PUD stays unknown if any matched row lacks pud or mau_pu; shares the pickup sample (mau_pu)', () => {
  const cards = buildOverviewCards({ pick: [reverse({ pud: null })] }, 'SPE Reverse');
  assert.equal(cards.find(card => card.id === 'pud').d1.pct, null);
  assert.equal(cards.find(card => card.id === 'pud').reportDate, '2026-11-02');
  assert.deepEqual(overviewMtdRanges(cards), [['reverse', '2026-11-02']]);
  const result = aggregateOverviewMtd([reverse(), reverse({ pud: null })], 'pud', '2026-11-02');
  assert.equal(result.pct, null);
  assert.equal(result.incomplete, true);
  assert.equal(result.tot, 100);
});

test('source/date changes are pending immediately; errors and empty completion are distinct', () => {
  const [card] = buildOverviewCards({ pick: [reverse()] }, 'SPE Reverse');
  assert.equal(resolveOverviewMtdCard(card, { pick: { rows: [row('2026-11-02', 999, 999)] } }).mtdStatus, 'loading');
  assert.equal(resolveOverviewMtdCard(card, { reverse: { error: true } }).mtdStatus, 'error');
  const empty = resolveOverviewMtdCard(card, { reverse: { rows: [] } });
  assert.equal(empty.mtdStatus, 'ready');
  assert.equal(empty.mtd.pct, null);
  const cached = resolveOverviewMtdCard(card, { reverse: { rows: [reverse()], refreshError: true } });
  assert.equal(cached.mtdStatus, 'ready');
  assert.equal(cached.mtd.pct, 70);
  assert.equal(cached.mtdRefreshError, true);
  assert.equal(resolveOverviewMtdCard(card, { reverse: { rows: [reverse()] } }, { selectedHubTypes: [] }).mtd.tot, 0);
});

test('combined populations require all configured sources and do not inherit an incompatible target', () => {
  const [card] = buildOverviewCards({ pick: [reverse(), row('2026-11-02', 900, 891)] }, 'ALL');
  assert.equal(card.target, null);
  assert.equal(resolveOverviewMtdCard(card, { pick: { rows: [row('2026-11-02', 900, 891)] } }).mtdStatus, 'loading');
  const result = resolveOverviewMtdCard(card, { pick: { rows: [row('2026-11-02', 900, 891)] }, reverse: { rows: [reverse()] } });
  assert.equal(result.mtd.tot, 1000);
  assert.equal(result.mtd.ont, 961);
});
