import test from 'node:test';
import assert from 'node:assert/strict';
import { rankingKpiNavigationIndex, rankingEmptyState } from './rankingUi.js';

test('KPI keyboard wraps and supports Home/End without intercepting Tab', () => {
  assert.equal(rankingKpiNavigationIndex('ArrowRight', 3, 4), 0);
  assert.equal(rankingKpiNavigationIndex('ArrowLeft', 0, 4), 3);
  assert.equal(rankingKpiNavigationIndex('Home', 2, 4), 0);
  assert.equal(rankingKpiNavigationIndex('End', 0, 4), 3);
  assert.equal(rankingKpiNavigationIndex('Tab', 0, 4), null);
  assert.equal(rankingKpiNavigationIndex('ArrowRight', 0, 0), null);
});

test('empty ranking distinguishes scope, minimum sample, unranked and missing data', () => {
  const input = { scopeEmpty: false, excludedCount: 0, unrankedCount: 0, minSample: 10 };
  assert.equal(rankingEmptyState({ ...input, scopeEmpty: true, excludedCount: 5 }).action, null);
  const excluded = rankingEmptyState({ ...input, excludedCount: 5, unrankedCount: 2 });
  assert.equal(excluded.action, 'sample');
  assert.match(excluded.message, /5 Hub.*10 đơn.*2 Hub/u);
  assert.equal(rankingEmptyState({ ...input, unrankedCount: 3 }).action, 'table');
  assert.match(rankingEmptyState(input).title, /Chưa có dữ liệu/u);
});
