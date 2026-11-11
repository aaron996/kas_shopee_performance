import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Real first renders, before effects run. No browser, live queries or API calls.
let outputDirectory, components, registry, ToastProvider;
before(async () => {
  // The existing responsive overview reads matchMedia during its first render.
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  outputDirectory = mkdtempSync(resolve('node_modules/.loading-tests-'));
  await build({ logLevel: 'error', build: { ssr: 'tests/ui/loading-test-components.jsx',
    outDir: outputDirectory, minify: false } });
  components = await import(pathToFileURL(resolve(outputDirectory, 'loading-test-components.js')).href);
  registry = components.moduleRegistry;
  ToastProvider = components.ToastProvider;
});
after(() => {
  delete globalThis.window;
  if (outputDirectory?.startsWith(resolve('node_modules/.loading-tests-'))) rmSync(outputDirectory, { recursive: true, force: true });
});

const render = (component, props) => renderToStaticMarkup(
  React.createElement(ToastProvider, null, React.createElement(component, props))
);
function expectLoading(html) {
  assert.match(html, /aria-label="Đang tải dữ liệu"/);
  assert.match(html, /loading-skeleton__row/);
  assert.doesNotMatch(html, /Chưa có dữ liệu|Không có dữ liệu|Chưa có câu hỏi|chưa có lịch sử|chưa tải xong/i);
}

test('every shared-source module declares its actual dependencies', () => {
  for (const [id, sources] of Object.entries({ home: ['pick', 'deli', 'fd'], report1: ['pick', 'deli', 'fd'],
    report5: ['ca1'], report3: ['leadtime'], ranking: ['pick', 'deli'], 'report-insight': ['pick', 'deli', 'leadtime'] })) {
    assert.deepEqual(registry.find(module => module.id === id).requiredDatasets, sources, id);
  }
});

test('source-dependent tabs show skeleton before lazy surfaces and development overlays', () => {
  for (const id of ['report1', 'report5', 'report3', 'ranking', 'report-insight']) {
    expectLoading(render(components.outlet, { activeModuleId: id, runtimeByModule: { [id]: { dataLoading: true } },
      warmModuleIds: [], currentUser: { email: 'qa@example.test' } }));
  }
});

test('overview first render has a skeleton rather than a false empty notice', () => {
  expectLoading(render(components.report, { pickRows: [], deliRows: [], fdRows: [], overview: true,
    dataLoading: true, clientFilter: 'SPB', selectedRegions: [], density: 'comfortable' }));
});

test('Reverse overview renders only supported metrics, pending MTD and no inherited target or risk', () => {
  const props = { overview: true, pickRows: [{ report_date: '2026-11-02', region: 'HCM', hub: 'A', hub_type: 'BC',
    client_name: 'SPE Reverse', mau_pu: 100, ontime_pu_1st: 70, ontime_pu_opr: 50, pud: 1 }],
    deliRows: [], clientFilter: 'SPE Reverse', selectedRegions: ['HCM'], selectedHubTypes: ['BC'], mtdScope: 'test:user' };
  const html = render(components.report, props);
  assert.equal((html.match(/class="overview-metric /g) || []).length, 3);
  assert.match(html, /PUD/);
  assert.match(html, /loading-skeleton/);
  assert.doesNotMatch(html, /Chưa có dữ liệu MTD|1ST DELI|ODR|Target MTD|Target ≥|is-bad/);
  assert.match(html, /chưa có target KPI/);
});

test('MTD cards distinguish resolved numbers, errors and true empty results', () => {
  const row = { report_date: '2026-11-02', client_name: 'SPE Reverse', region: 'HCM', hub_type: 'BC',
    mau_pu: 100, ontime_pu_1st: 70, ontime_pu_opr: 50, pud: 10 };
  const cards = components.buildOverviewCards({ pick: [row] }, 'SPE Reverse');
  const renderCards = datasets => render(components.overviewCards, { cards: cards.map(card => components.resolveOverviewMtdCard(card, datasets)) });
  const loaded = renderCards({ reverse: { rows: [row] } });
  assert.doesNotMatch(loaded, /Chưa có dữ liệu|loading-skeleton|Target MTD|is-bad|is-good/);
  assert.match(loaded, /100 đơn/);
  assert.match(loaded, /10 PUD/);
  const empty = renderCards({ reverse: { rows: [] } });
  assert.match(empty, /Chưa có dữ liệu MTD/);
  assert.doesNotMatch(empty, /loading-skeleton/);
  const failed = renderCards({ reverse: { error: true } });
  assert.match(failed, /Lỗi tải MTD/);
  assert.doesNotMatch(failed, /Chưa có dữ liệu MTD|loading-skeleton/);
});

test('settled empty overview and explicit empty filters remain real empty states', () => {
  const props = { pickRows: [], deliRows: [], overview: true, dataLoading: false, clientFilter: 'SPB' };
  const empty = render(components.report, props);
  assert.match(empty, /Chưa có dữ liệu vận hành/);
  assert.doesNotMatch(empty, /loading-skeleton/);
  const filtered = render(components.report, { ...props, emptyFilter: 'regions' });
  assert.match(filtered, /Chưa chọn vùng nào/);
  assert.doesNotMatch(filtered, /loading-skeleton/);
});

test('AI overview, quotas, research and config initialize loading before effects', () => {
  for (const view of ['overview', 'quotas', 'research', 'model-config']) {
    expectLoading(render(components.ai, { view, feature: 'chat', currentUser: { email: 'qa@example.test' } }));
  }
});

test('SMS batch history initializes loading before effects', () => {
  expectLoading(render(components.history, { driverNameById: {} }));
});

test('daily and weekly table first renders use the same skeleton', () => {
  expectLoading(render(components.daily, { metricKey: 'p1st', title: '1st Pickup',
    range: { from: '2026-10-26', to: '2026-11-01' } }));
  expectLoading(render(components.weekly, { metricKey: 'p1st', title: '1st Pickup' }));
});

test('PUD daily/week requests start with skeletons and Reverse declares its own source', () => {
  for (const id of ['home', 'report1', 'ranking', 'report-insight']) {
    assert.deepEqual(registry.find(module => module.id === id).requiredDatasetsByClient['SPE Reverse'], ['reverse']);
  }
  expectLoading(render(components.daily, { metricKey: 'pud', title: 'PUD', clientFilter: 'SPE Reverse',
    range: { from: '2026-10-26', to: '2026-11-01' } }));
  expectLoading(render(components.weekly, { metricKey: 'pud', title: 'PUD', clientFilter: 'SPE Reverse' }));
});

test('PUD tab is visible in day view, opens week view, and uses the Reverse scope without target heat', () => {
  const rows = [{ report_date: '2026-11-01', region: 'HCM', hub: 'A', hub_type: 'BC', client_name: 'SPE Reverse', mau_pu: 1, pud: 1 },
    { report_date: '2026-11-01', region: 'HCM', hub: 'B', hub_type: 'BC', client_name: 'SPE Reverse', mau_pu: 9, pud: 0 }];
  const props = { pickRows: rows, deliRows: [], clientFilter: 'SPE Reverse', selectedRegions: ['HCM'], selectedHubTypes: ['BC'] };
  const day = render(components.report, props);
  assert.match(day, /id="ops-tab-pud" aria-selected="false"/, 'PUD stays visible in day view');
  assert.match(day, /aria-pressed="true"[^>]*>\s*Theo ngày/);
  const week = render(components.report, { ...props, focusTarget: { metricKey: 'pud' } });
  assert.match(week, /id="ops-tab-pud" aria-selected="true"/);
  assert.match(week, /aria-pressed="true"[^>]*>\s*Theo tuần/, 'PUD forces the week view');
  const snapshot = render(components.report, { ...props, snapshotMetric: 'pud' });
  assert.match(snapshot, /10,0%|10\.0%/, 'PUD = pud / mau_pu');
  assert.match(snapshot, /Mẫu \(mau_pu\)/);
  assert.doesNotMatch(snapshot, /Target ≥|heat heat-/);
  const other = render(components.report, { ...props, pickRows: rows.map(row => ({ ...row, client_name: 'SPB' })),
    clientFilter: 'SPB' });
  assert.doesNotMatch(other, /ops-tab-pud|ops-tab-backlog/);
});

test('Backlog tab follows PUD in its own group and shows the layout sample for Reverse only', () => {
  const props = { pickRows: [{ report_date: '2026-11-01', region: 'HCM', hub: 'A', hub_type: 'BC', client_name: 'SPE Reverse', mau_pu: 1, pud: 1 }],
    deliRows: [], clientFilter: 'SPE Reverse', selectedRegions: ['HCM'], selectedHubTypes: ['BC'] };
  const html = render(components.report, props);
  assert.ok(html.indexOf('id="ops-tab-pud"') < html.indexOf('id="ops-tab-backlog"'));
  assert.match(html, /kpi-tab-group-backlog/);
  const backlog = render(components.report, { ...props, focusTarget: { metricKey: 'backlog' } });
  assert.match(backlog, /id="ops-tab-backlog" aria-selected="true"/);
  assert.match(backlog, /BẢN MINH HỌA LAYOUT/);
  assert.match(backlog, /12,228/);
  assert.doesNotMatch(backlog, /view-mode-toggle/);
});

test('PUD uses the shared default pickup table layout and motion hooks', () => {
  const props = { pickRows: [{ report_date: '2026-11-01', region: 'HCM', hub: 'A', hub_type: 'BC',
    client_name: 'SPE Reverse', mau_pu: 2, ontime_pu_1st: 0, ontime_pu_opr: 0, pud: 1 }],
    deliRows: [], clientFilter: 'SPE Reverse', selectedRegions: ['HCM'], selectedHubTypes: ['BC'] };
  for (const metricKey of ['p1st', 'popr', 'pud']) {
    // PUD chỉ có ở view tuần; bố cục bảng ngày dùng chung vẫn được kiểm qua trang snapshot.
    const html = render(components.report, metricKey === 'pud' ? { ...props, snapshotMetric: 'pud' } : { ...props, focusTarget: { metricKey } });
    for (const shared of [...(metricKey === 'pud' ? [] : [/detail-metric-toolbar/]), /Copy bảng này thành ảnh/, /all-row-sticky/,
      /mien-sticky-label/, /data-motion-id="all"/, /data-motion-id="region:HCM"/,
      /hub-disclosure/, /data-latest-day/, /WTD \(CỘNG DỒN\)/, /Tốt nhất<br\/>6 tuần/, /Cùng ngày<br\/>tháng trước/]) {
      assert.match(html, shared, `${metricKey}: ${shared}`);
    }
    assert.doesNotMatch(html, /weekly-kpi-table|weekly-kpi-expander/);
  }
});

test('shared PUD daily/WTD preserves unknown samples and includes unassigned regions', () => {
  const row = (date, hub, region, pud, mau_pu) => ({ report_date: date, hub, region, pud, mau_pu,
    client_name: 'SPE Reverse', hub_type: 'BC' });
  const props = { deliRows: [], clientFilter: 'SPE Reverse', selectedHubTypes: ['BC'],
    selectedRegions: Object.values(components.MIEN_REGIONS).flat(), snapshotMetric: 'pud' };
  const known = render(components.report, { ...props, pickRows: [row('2026-11-01','A','HCM',1,1), row('2026-11-01','B','',0,9)] });
  assert.match(known, /10\.0%/);
  assert.match(known, /Chưa rõ vùng/);
  const unknown = render(components.report, { ...props, pickRows: [row('2026-10-31','A','HCM',1,null),row('2026-11-01','A','HCM',1,2)] });
  assert.match(unknown, /50\.0%/);
  assert.doesNotMatch(unknown, /100\.0%/);
  assert.doesNotMatch(unknown, /heat heat-/);
  assert.match(unknown, /<td[^>]*>–<\/td>/);
});
