import test from 'node:test';
import assert from 'node:assert/strict';
import { isReportDataLoading, pendingReportDatasets } from './reportLoading.js';

test('initial sources are pending; independent modules never wait for report sync', () => {
  const pending = pendingReportDatasets(true);
  for (const source of ['pick', 'deli', 'fd', 'ca1', 'leadtime']) {
    assert.equal(isReportDataLoading([source], pending, {}), true, source);
  }
  assert.equal(isReportDataLoading(undefined, pending, {}), false);
});

test('core readiness must not release empty Ca 1 or Leadtime', () => {
  const pending = { ...pendingReportDatasets(true), pick: false, deli: false, fd: false };
  const rows = { pick: [{}], deli: [{}], fd: [{}] };
  assert.equal(isReportDataLoading(['pick', 'deli', 'fd'], pending, rows), false);
  assert.equal(isReportDataLoading(['ca1'], pending, rows), true);
  assert.equal(isReportDataLoading(['leadtime'], pending, rows), true);
});

test('cached and partial source rows remain visible during background refresh', () => {
  const pending = pendingReportDatasets(true);
  const rows = { pick: [{}], deli: [{}], ca1: [{}] };
  assert.equal(isReportDataLoading(['pick', 'deli', 'fd'], pending, rows), false);
  assert.equal(isReportDataLoading(['fd'], pending, rows), true, 'only missing FD needs its own skeleton');
  assert.equal(isReportDataLoading(['ca1'], pending, rows), false);
  assert.equal(isReportDataLoading(['leadtime'], pending, rows), true);
});

test('completed empty/error requests release skeleton; retry without rows restores it', () => {
  assert.equal(isReportDataLoading(['ca1'], pendingReportDatasets(false), {}), false);
  assert.equal(isReportDataLoading(['ca1'], pendingReportDatasets(true), {}), true);
  // A filter with no matches must not change readiness of the original source.
  const source = [{ region: 'HCM' }];
  assert.equal(source.filter(row => row.region === 'HNO').length, 0);
  assert.equal(isReportDataLoading(['pick'], { pick: true }, { pick: source }), false);
});

test('Reverse readiness is independent of loaded Pick/Deli and keeps rows during refresh', () => {
  const rows = { pick: [{}], deli: [{}], reverse: null };
  assert.equal(isReportDataLoading(['reverse'], { reverse: true }, rows), true);
  assert.equal(isReportDataLoading(['reverse'], { reverse: false }, rows), false);
  assert.equal(isReportDataLoading(['reverse'], { reverse: true }, { ...rows, reverse: [{}] }), false);
});
