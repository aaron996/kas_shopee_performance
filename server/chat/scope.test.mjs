import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectiveScope, detectExplicitClient, detectExplicitRegions, normalizeToolScope } from './scope.js';

test('detectExplicitClient detects client tokens in question', () => {
  assert.equal(detectExplicitClient('Cho tôi xem ODR của SPB hôm nay'), 'SPB');
  assert.equal(detectExplicitClient('OPR Shopee Express tuần trước'), 'SPE');
  assert.equal(detectExplicitClient('Tỷ lệ toàn bộ khách hàng'), 'ALL');
  assert.equal(detectExplicitClient('Chỉ số ODR hôm nay'), null);
});

test('detectExplicitRegions detects regions and nationwide in question', () => {
  assert.deepEqual(detectExplicitRegions('ODR ở HCM hôm nay?'), { regions: ['HCM'], isNationwide: false });
  assert.deepEqual(detectExplicitRegions('Tình hình toàn quốc thế nào?'), { regions: [], isNationwide: true });
  assert.equal(detectExplicitRegions('ODR hôm nay?'), null);
});

test('resolveEffectiveScope: explicit query client wins over screenContext client', () => {
  const scope = resolveEffectiveScope({
    question: 'Xem ODR',
    query: { client: 'SPE' },
    screenContext: { client: 'SPB', regions: ['HCM'] }
  });
  assert.equal(scope.client, 'SPE');
  assert.equal(scope.clientSource, 'query');
  assert.deepEqual(scope.regions, ['HCM']);
  assert.equal(scope.regionsSource, 'screenContext');
});

test('resolveEffectiveScope: explicit question client wins over screenContext client', () => {
  const scope = resolveEffectiveScope({
    question: 'Xem ODR SPB hôm nay thế nào',
    query: null,
    screenContext: { client: 'SPE', regions: ['HN'] }
  });
  assert.equal(scope.client, 'SPB');
  assert.equal(scope.clientSource, 'question');
});

test('resolveEffectiveScope: screenContext client used when user does not specify client', () => {
  const scope = resolveEffectiveScope({
    question: 'ODR hôm nay là bao nhiêu?',
    query: null,
    screenContext: { client: 'SPE', regions: ['ĐNB'], hubTypes: ['SOC'] }
  });
  assert.equal(scope.client, 'SPE');
  assert.equal(scope.clientSource, 'screenContext');
  assert.deepEqual(scope.regions, ['ĐNB']);
  assert.equal(scope.regionsSource, 'screenContext');
  assert.deepEqual(scope.hubTypes, ['SOC']);
  assert.equal(scope.hubTypesSource, 'screenContext');
});

test('resolveEffectiveScope: preserves intentionally empty filter semantics', () => {
  const scope = resolveEffectiveScope({
    question: 'Xem KPI',
    query: null,
    screenContext: { client: 'SPB', regions: [], hubTypes: [] }
  });
  assert.deepEqual(scope.regions, []);
  assert.equal(scope.regionsSource, 'screenContext');
  assert.deepEqual(scope.hubTypes, []);
  assert.equal(scope.hubTypesSource, 'screenContext');
});

test('resolveEffectiveScope: missing or invalid screenContext falls back safely', () => {
  const scope1 = resolveEffectiveScope({ question: 'Xem KPI', query: null, screenContext: null });
  assert.equal(scope1.client, null);
  assert.equal(scope1.regions, null);
  assert.equal(scope1.hubTypes, null);

  const scope2 = resolveEffectiveScope({ question: 'Xem KPI', query: null, screenContext: {} });
  assert.equal(scope2.client, null);
  assert.equal(scope2.regions, null);
  assert.equal(scope2.hubTypes, null);
});

test('resolveEffectiveScope: explicit question region overrides screenContext regions', () => {
  const scope = resolveEffectiveScope({
    question: 'ODR ở Hà Nội hôm nay?',
    query: null,
    screenContext: { client: 'SPB', regions: ['HCM', 'ĐNB'] }
  });
  assert.equal(scope.client, 'SPB');
  assert.deepEqual(scope.regions, ['HN']);
  assert.equal(scope.regionsSource, 'question');
});

test('normalizeToolScope: injects screenContext when tool call lacks scope in open-ended query', () => {
  const effectiveScope = resolveEffectiveScope({
    question: 'Tình hình P1ST thế nào?',
    query: null,
    screenContext: { client: 'SPE', regions: ['HCM - KA'], hubTypes: ['LM'] }
  });

  // Open-ended tool call with missing client, regions, hub_types, grain, limit, sort
  const normalized = normalizeToolScope('get_latest_metric_summary', { metric: 'p1st' }, effectiveScope);

  assert.equal(normalized.metric, 'p1st');
  assert.equal(normalized.client, 'SPE');
  assert.deepEqual(normalized.regions, ['HCM - KA']);
  assert.deepEqual(normalized.rpcRegions, ['HCM - KA']);
  assert.deepEqual(normalized.hub_types, ['LM']);
  assert.deepEqual(normalized.rpcHubTypes, ['LM']);
  assert.equal(normalized.grain, 'nationwide');
  assert.equal(normalized.limit, 10);
  assert.equal(normalized.sort, 'worst');
});

test('normalizeToolScope: explicit user/query always wins over screenContext', () => {
  const effectiveScope = resolveEffectiveScope({
    question: 'Xem P1ST của Shopee Bulky tại Hà Nội',
    query: null,
    screenContext: { client: 'SPE', regions: ['HCM'], hubTypes: ['SOC'] }
  });

  const normalized = normalizeToolScope('get_metric_summary', {
    metric: 'p1st',
    date_from: '2026-09-01',
    date_to: '2026-09-07'
  }, effectiveScope);

  assert.equal(normalized.client, 'SPB'); // SPB won over SPE
  assert.deepEqual(normalized.regions, ['HN']); // HN won over HCM
  assert.deepEqual(normalized.rpcRegions, ['HN']);
});

test('normalizeToolScope: preserves intentional empty filter semantics by mapping to __NO_MATCH__', () => {
  const effectiveScope = resolveEffectiveScope({
    question: 'P1ST mới nhất',
    query: null,
    screenContext: { client: 'SPB', regions: [], hubTypes: [] }
  });

  const normalized = normalizeToolScope('get_latest_metric_summary', { metric: 'p1st' }, effectiveScope);

  assert.deepEqual(normalized.regions, []);
  assert.deepEqual(normalized.rpcRegions, ['__NO_MATCH__']);
  assert.deepEqual(normalized.hub_types, []);
  assert.deepEqual(normalized.rpcHubTypes, ['__NO_MATCH__']);
});

test('normalizeToolScope: explicit nationwide question maps rpcRegions to empty array', () => {
  const effectiveScope = resolveEffectiveScope({
    question: 'Xem KPI toàn quốc',
    query: null,
    screenContext: { client: 'SPB', regions: ['HCM'] }
  });

  const normalized = normalizeToolScope('get_latest_metric_summary', { metric: 'p1st' }, effectiveScope);

  assert.deepEqual(normalized.regions, []);
  assert.deepEqual(normalized.rpcRegions, []); // Empty array returns all regions in DB
});
