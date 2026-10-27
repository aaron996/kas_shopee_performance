import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverviewMtdCacheKey, isOverviewMtdCacheFresh, OVERVIEW_MTD_CACHE_VERSION, OVERVIEW_MTD_CACHE_MAX_AGE_MS } from './overviewMtdCache.js';

test('MTD cache key separates dataset and date range', () => {
  assert.deepEqual(JSON.parse(buildOverviewMtdCacheKey('pick', '2026-10-01', '2026-10-26', 'Vinh@Example.com')), ['vinh@example.com', 'pick', '2026-10-01', '2026-10-26']);
  assert.notEqual(buildOverviewMtdCacheKey('pick', '2026-10-01', '2026-10-26'), buildOverviewMtdCacheKey('deli', '2026-10-01', '2026-10-26'));
});

test('MTD cache accepts only current-version, non-future, non-expired rows', () => {
  const now = 1_000_000;
  const valid = { version: OVERVIEW_MTD_CACHE_VERSION, savedAt: now - 1000, rows: [] };
  assert.equal(isOverviewMtdCacheFresh(valid, now), true);
  assert.equal(isOverviewMtdCacheFresh({ ...valid, savedAt: now + 1 }, now), false);
  assert.equal(isOverviewMtdCacheFresh({ ...valid, savedAt: now - OVERVIEW_MTD_CACHE_MAX_AGE_MS - 1 }, now), false);
  assert.equal(isOverviewMtdCacheFresh({ ...valid, version: 999 }, now), false);
  assert.equal(isOverviewMtdCacheFresh({ ...valid, rows: null }, now), false);
});
