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

test('PUD tab and default matrix use Reverse scope, separate sample, and no target heat', () => {
  const rows = [{ report_date: '2026-11-01', region: 'HCM', hub: 'A', hub_type: 'BC', client_name: 'SPE Reverse', mau_pu: 0, pud: 1, mau_pud: 1 },
    { report_date: '2026-11-01', region: 'HCM', hub: 'B', hub_type: 'BC', client_name: 'SPE Reverse', mau_pu: 0, pud: 0, mau_pud: 9 }];
  const html = render(components.report, { pickRows: rows, deliRows: [], clientFilter: 'SPE Reverse',
    selectedRegions: ['HCM'], selectedHubTypes: ['BC'], focusTarget: { metricKey: 'pud' } });
  assert.match(html, /id="ops-tab-pud" aria-selected="true"/);
  assert.match(html, /10,0%|10\.0%/);
  assert.match(html, /Mẫu PUD/);
  assert.doesNotMatch(html, /Target ≥|heat heat-/);
  const other = render(components.report, { pickRows: rows.map(row => ({ ...row, client_name: 'SPB' })), deliRows: [],
    clientFilter: 'SPB', selectedRegions: ['HCM'], selectedHubTypes: ['BC'] });
  assert.doesNotMatch(other, /ops-tab-pud/);
});

test('Reverse failures expose retry and completed empty data is not loading', () => {
  const props = { pickRows: [], deliRows: [], clientFilter: 'SPE Reverse' };
  const error = render(components.report, { ...props, sourceError: true });
  assert.match(error, /Không tải được dữ liệu SPE Reverse/);
  assert.match(error, /Thử lại/);
  assert.doesNotMatch(error, /loading-skeleton/);
  expectLoading(render(components.report, { ...props, dataLoading: true }));
});
