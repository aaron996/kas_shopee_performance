import test from 'node:test';
import assert from 'node:assert/strict';
import { readDashboardView, saveDashboardView, dataCoverage, appendCsvContext, csvCell, VIEW_KEY } from './dashboardState.js';

const storage = (value) => ({ getItem: () => value, setItem(key, next) { assert.equal(key, VIEW_KEY); value = next; } });
test('refresh restores real client, report, explicit empty filters and density', () => {
  const s = storage(null);
  saveDashboardView(s, { client: 'SPE', tab: 'report5', regions: [], hubTypes: ['BC'], density: 'compact' });
  assert.deepEqual(readDashboardView(s), { client: 'SPE', tab: 'report5', regions: [], hubTypes: ['BC'], density: 'compact', hasPickedClient: true });
});
test('embed scope overrides remembered client without resetting other choices', () => {
  const view = readDashboardView(storage(JSON.stringify({ client: 'SPE', tab: 'report3', regions: ['HNO'] })), '?scope=spb');
  assert.equal(view.client, 'SPB');
  assert.equal(view.tab, 'report3');
  assert.deepEqual(view.regions, ['HNO']);
});
test('invalid storage and forbidden report fall back safely', () => {
  assert.equal(readDashboardView(storage('{broken')).hasPickedClient, false);
  assert.equal(readDashboardView(storage('{"tab":"dev-admin"}')).tab, 'report1');
  assert.equal(readDashboardView({ getItem() { throw Error('blocked'); } }).hubTypes, null);
});
test('all hub types remains a sentinel; intentionally empty is preserved', () => {
  assert.equal(readDashboardView(storage('{}')).hubTypes, null);
  assert.deepEqual(readDashboardView(storage('{"hubTypes":[]}')).hubTypes, []);
});
test('coverage is actual distinct days, not a promised reporting window', () => {
  assert.equal(dataCoverage([]), 'Chưa có dữ liệu');
  assert.equal(dataCoverage([{ ngay: '2026-09-03' }, { ngay: '2026-09-01' }, { ngay: '2026-09-03' }], 'ngay'), '2026-09-01 → 2026-09-03 (2 ngày có dữ liệu)');
});
test('CSV escapes quotes, newlines and spreadsheet formula prefixes', () => {
  assert.equal(csvCell('Hub "A",\nB'), '"Hub ""A"",\nB"');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(appendCsvContext(['Metric', 'Pickup'], { Client: 'SPE', Nguồn: 'Supabase' }), 'Metric,"Client","Nguồn"\r\nPickup,"SPE","Supabase"');
});
