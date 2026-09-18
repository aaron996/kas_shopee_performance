import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectiveScope, detectExplicitClient, detectExplicitRegions } from './scope.js';

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
