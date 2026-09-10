import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPct, formatVol, groupDatesByWeek, getContinuousColorStyle, getHigherIsWorseColorStyle, getTrailingDateRange, formatShortDate, getComparisonDateInfo } from './dataProcessor.js';
import { METRIC_GLOSSARY } from '../data/metricGlossary.js';

test('metricGlossary defines fd with target = null and percentage format', () => {
  const fdDef = METRIC_GLOSSARY.fd;
  assert.ok(fdDef, 'fd definition should exist in METRIC_GLOSSARY');
  assert.equal(fdDef.key, 'fd');
  assert.equal(fdDef.target, null);
  assert.equal(fdDef.unit, 'percent');
  assert.equal(typeof fdDef.formula, 'string');
});

test('FD completion rate calculation: normal values', () => {
  const mau_fd = 67758;
  const fd_hoan_thanh = 3777;
  const pct = mau_fd > 0 ? (fd_hoan_thanh / mau_fd) * 100 : null;
  assert.ok(pct !== null);
  assert.equal(pct.toFixed(1), '5.6');
  assert.equal(formatPct(pct), '5.6%');
  assert.equal(formatVol(fd_hoan_thanh), '3.777');
});

test('FD completion rate calculation: zero and null handling', () => {
  // mau_fd is 0: pct should be null and formatPct should show '–'
  const calcPct = (hoan_thanh, mau) => (mau > 0 ? (hoan_thanh / mau) * 100 : null);

  assert.equal(calcPct(0, 0), null);
  assert.equal(formatPct(calcPct(0, 0)), '–');

  // mau_fd > 0 but hoan_thanh = 0: pct is 0.0%
  const zeroPct = calcPct(0, 500);
  assert.equal(zeroPct, 0);
  assert.equal(formatPct(zeroPct), '0.0%');

  // null inputs
  assert.equal(calcPct(null, null), null);
  assert.equal(formatPct(null), '–');
});

test('getContinuousColorStyle returns empty style when target is null', () => {
  const style = getContinuousColorStyle(5.6, null, 1.0);
  assert.deepEqual(style, {});
});

test('FD keeps values at or below 3% neutral and highlights higher values as worse', () => {
  assert.deepEqual(getHigherIsWorseColorStyle(2.9, 3, 8), {});
  assert.deepEqual(getHigherIsWorseColorStyle(3, 3, 8), {});
  const worse = getHigherIsWorseColorStyle(3.1, 3, 8);
  assert.match(worse.backgroundColor, /^rgba\(225, 45, 35,/);
  const worst = getHigherIsWorseColorStyle(8, 3, 8);
  assert.equal(worst.color, '#FFFFFF');
});

test('FD dataset aggregation across lanes and regions', () => {
  const sampleFdRows = [
    { report_date: '2026-09-02', region: 'BMT', externallane: 'Intra city', client_name: 'SPE', mau_fd: 236, fd_hoan_thanh: 18 },
    { report_date: '2026-09-02', region: 'BMT', externallane: 'Intra region', client_name: 'SPE', mau_fd: 120, fd_hoan_thanh: 12 },
    { report_date: '2026-09-02', region: 'HCM', externallane: 'Intra city', client_name: 'SPB', mau_fd: 5000, fd_hoan_thanh: 400 },
    { report_date: '2026-09-01', region: 'BMT', externallane: 'Intra city', client_name: 'SPE', mau_fd: 200, fd_hoan_thanh: 20 },
  ];

  // Aggregation for nationwide D-1 (2026-09-02) ALL clients
  const d1AllRows = sampleFdRows.filter(r => r.report_date === '2026-09-02');
  const totalMau = d1AllRows.reduce((acc, r) => acc + r.mau_fd, 0);
  const totalCompleted = d1AllRows.reduce((acc, r) => acc + r.fd_hoan_thanh, 0);
  const nationPct = (totalCompleted / totalMau) * 100;

  assert.equal(totalMau, 5356);
  assert.equal(totalCompleted, 430);
  assert.equal(nationPct.toFixed(1), '8.0');

  // Client filter: SPE only
  const speRows = sampleFdRows.filter(r => r.client_name === 'SPE' && r.report_date === '2026-09-02');
  const speMau = speRows.reduce((acc, r) => acc + r.mau_fd, 0);
  const speCompleted = speRows.reduce((acc, r) => acc + r.fd_hoan_thanh, 0);
  assert.equal(speMau, 356);
  assert.equal(speCompleted, 30);
  assert.equal(((speCompleted / speMau) * 100).toFixed(1), '8.4');

  // Sub-entity grouping for BMT on D-1
  const bmtRows = d1AllRows.filter(r => r.region === 'BMT');
  const bmtLanes = {};
  bmtRows.forEach(r => {
    const lane = r.externallane;
    bmtLanes[lane] = (bmtLanes[lane] || 0) + (r.mau_fd - r.fd_hoan_thanh);
  });
  assert.equal(bmtLanes['Intra city'], 218);
  assert.equal(bmtLanes['Intra region'], 108);
});

test('FD dates group into weekCurrent and weekPrev via groupDatesByWeek', () => {
  const fdDates = ['2026-08-19', '2026-08-20', '2026-08-25', '2026-08-31', '2026-09-01', '2026-09-02'];
  const { weekPrev, weekCurrent, d1Date } = groupDatesByWeek(fdDates);

  assert.equal(d1Date, '2026-09-02');
  assert.ok(weekCurrent.includes('2026-09-01'));
  assert.ok(weekCurrent.includes('2026-09-02'));
  assert.ok(weekPrev.includes('2026-08-25'));
});

test('FD reporting window is the trailing D-22 through D-8 range', () => {
  const fdDates = Array.from({ length: 25 }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `2026-08-${day}`;
  });
  const range = getTrailingDateRange(fdDates, 15);
  assert.equal(range.length, 15);
  assert.equal(range[0], '2026-08-11');
  assert.equal(range.at(-1), '2026-08-25');
});

test('FD empty state: detects absence of data and formats placeholder instead of 0 values', () => {
  const emptyFdRows = [];
  const { weekPrev, weekCurrent, d1Date } = groupDatesByWeek(emptyFdRows);
  assert.equal(d1Date, '');
  assert.deepEqual(weekPrev, []);
  assert.deepEqual(weekCurrent, []);

  // Aggregation on empty data produces tot = 0, pct = null
  const d1Agg = { tot: 0, ont: 0, pct: null };
  const isFdEmpty = !d1Agg || d1Agg.pct === null || d1Agg.tot === 0;
  assert.equal(isFdEmpty, true);

  // In empty state, formatPct returns '–' instead of '0%' or '0 đơn'
  assert.equal(formatPct(d1Agg.pct), '–');
  assert.notEqual(formatPct(d1Agg.pct), '0.0%');
  assert.notEqual(formatPct(d1Agg.pct), '0%');
});

test('FD with mau_fd = 0: returns null pct, formatPct returns –, and sparkline pairs stay synchronized', () => {
  const rowsWithZeroDay = [
    { report_date: '2026-09-01', mau_fd: 100, fd_hoan_thanh: 10 },
    { report_date: '2026-09-02', mau_fd: 0, fd_hoan_thanh: 0 }, // 0 denominator day
    { report_date: '2026-09-03', mau_fd: 200, fd_hoan_thanh: 30 }
  ];

  const calcDayPct = (r) => (r.mau_fd > 0 ? (r.fd_hoan_thanh / r.mau_fd) * 100 : null);
  assert.equal(calcDayPct(rowsWithZeroDay[0]), 10);
  assert.equal(calcDayPct(rowsWithZeroDay[1]), null);
  assert.equal(calcDayPct(rowsWithZeroDay[2]), 15);
  assert.equal(formatPct(calcDayPct(rowsWithZeroDay[1])), '–');

  // Sparkline history extraction: filtering out nulls must keep {val, date} pairs aligned
  const histDates = ['2026-09-01', '2026-09-02', '2026-09-03'];
  const validPoints = [];
  histDates.forEach(dStr => {
    const row = rowsWithZeroDay.find(r => r.report_date === dStr);
    const pct = row ? calcDayPct(row) : null;
    if (pct !== null && pct !== undefined && !isNaN(pct)) {
      validPoints.push({ val: pct, date: dStr });
    }
  });

  const vals = validPoints.map(p => p.val);
  const dates = validPoints.map(p => p.date);

  // Day 2026-09-02 with mau_fd = 0 is omitted from both arrays simultaneously
  assert.equal(vals.length, 2);
  assert.equal(dates.length, 2);
  assert.deepEqual(vals, [10, 15]);
  assert.deepEqual(dates, ['2026-09-01', '2026-09-03']);
  // First item date strictly corresponds to first item value
  assert.equal(dates[0], '2026-09-01');
  assert.equal(vals[0], 10);
  assert.equal(dates[1], '2026-09-03');
  assert.equal(vals[1], 15);
});

test('composite coverage and header date logic: handles FD older, newer, identical, or empty relative to OPS', async () => {
  const { formatCompositeCoverage } = await import('./dashboardState.js');

  // 1. FD older than OPS (e.g. real Supabase snapshot: OPS up to 2026-09-09, FD up to 2026-09-02)
  const opsRowsOlder = [{ report_date: '2026-08-27' }, { report_date: '2026-09-09' }];
  const fdRowsOlder = [{ report_date: '2026-08-19' }, { report_date: '2026-09-02' }];
  const covOlder = formatCompositeCoverage({ opsRows: opsRowsOlder, fdRows: fdRowsOlder });
  assert.ok(covOlder.includes('OPS: 2026-08-27 → 2026-09-09'));
  assert.ok(covOlder.includes('FD: 2026-08-19 → 2026-09-02'));

  // Distinct date check for header chip
  const opsD1 = '09/09/2026';
  const fdD1Older = '02/09/2026';
  const hasDistinctOlder = Boolean(fdD1Older && opsD1 && fdD1Older !== opsD1);
  assert.equal(hasDistinctOlder, true);

  // 2. FD newer than OPS (e.g. FD up to 2026-09-10, OPS up to 2026-09-09)
  const fdRowsNewer = [{ report_date: '2026-09-01' }, { report_date: '2026-09-10' }];
  const covNewer = formatCompositeCoverage({ opsRows: opsRowsOlder, fdRows: fdRowsNewer });
  assert.ok(covNewer.includes('OPS: 2026-08-27 → 2026-09-09'));
  assert.ok(covNewer.includes('FD: 2026-09-01 → 2026-09-10'));

  const fdD1Newer = '10/09/2026';
  const hasDistinctNewer = Boolean(fdD1Newer && opsD1 && fdD1Newer !== opsD1);
  assert.equal(hasDistinctNewer, true);

  // 3. FD identical dates to OPS
  const fdRowsSame = [{ report_date: '2026-08-27' }, { report_date: '2026-09-09' }];
  const covSame = formatCompositeCoverage({ opsRows: opsRowsOlder, fdRows: fdRowsSame });
  assert.equal(covSame, '2026-08-27 → 2026-09-09 (2 ngày có dữ liệu)');
  const hasDistinctSame = Boolean(opsD1 && opsD1 && opsD1 !== opsD1);
  assert.equal(hasDistinctSame, false);

  // 4. FD empty / no data
  const covEmptyFd = formatCompositeCoverage({ opsRows: opsRowsOlder, fdRows: [] });
  assert.equal(covEmptyFd, '2026-08-27 → 2026-09-09 (2 ngày có dữ liệu)');
});

test('KPI comparison dates use their actual calendar offsets', () => {
  assert.equal(formatShortDate('2026-09-09'), '09/09');

  const ops = getComparisonDateInfo('2026-09-09', ['2026-09-02', '2026-09-09'], 7);
  assert.deepEqual(ops, { d1: '09/09', dComp: '02/09', comparisonDateStr: '2026-09-02' });

  const fd = getComparisonDateInfo('2026-09-02', ['2026-08-26', '2026-09-02'], 7);
  assert.deepEqual(fd, { d1: '02/09', dComp: '26/08', comparisonDateStr: '2026-08-26' });

  assert.equal(getComparisonDateInfo('2026-09-09', ['2026-09-01', '2026-09-09'], 7), null);
});
