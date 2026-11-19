import test from 'node:test';
import assert from 'node:assert/strict';
import { showsClientFilter, supportsExport, usesCa1Source } from './scopeSupport.js';

test('client filter is hidden only on the Ca 1 subtab of Lane', () => {
  assert.equal(showsClientFilter('report5', 'deli'), true);
  assert.equal(showsClientFilter('report5', 'ca1'), false);
  assert.equal(showsClientFilter('report1', 'ca1'), true); // laneView chỉ có nghĩa ở tab Lane
  assert.equal(showsClientFilter('home', 'deli'), true);
});

test('export only where a CSV exists', () => {
  assert.equal(supportsExport('report5', 'deli'), false);
  assert.equal(supportsExport('report5', 'ca1'), true);
  assert.equal(supportsExport('report1', 'deli'), true);
  assert.equal(supportsExport('report3', 'deli'), false);
  assert.equal(usesCa1Source('report5', 'ca1'), true);
});
