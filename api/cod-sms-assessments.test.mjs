import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBatchRequest } from './cod-sms-assessments.js';

const config = { maxBatchLimit: 500, defaultBatchLimit: 25 };

test('parseBatchRequest defaults sweep to false and force to false', () => {
  const request = parseBatchRequest({}, config);
  assert.equal(request.sweep, false);
  assert.equal(request.force, false);
  assert.deepEqual(request.cases, []);
});

test('parseBatchRequest accepts sweep: true on its own', () => {
  const request = parseBatchRequest({ sweep: true }, config);
  assert.equal(request.sweep, true);
});

test('parseBatchRequest accepts sweep combined with force for the manual-run "force retry" step', () => {
  const request = parseBatchRequest({ sweep: true, force: true }, config);
  assert.equal(request.sweep, true);
  assert.equal(request.force, true);
});

test('parseBatchRequest rejects sweep combined with explicit cases', () => {
  assert.throws(
    () => parseBatchRequest({
      sweep: true,
      cases: [{ suspicionType: 'Gối đầu COD', driverId: 'D1', orderCode: 'O1' }]
    }, config),
    (error) => error.code === 'COD_SMS_BAD_REQUEST'
  );
});

test('parseBatchRequest rejects a non-boolean sweep value', () => {
  assert.throws(
    () => parseBatchRequest({ sweep: 'true' }, config),
    (error) => error.code === 'COD_SMS_BAD_REQUEST'
  );
});

test('parseBatchRequest still accepts cases + force without sweep, for a scoped force retry', () => {
  const request = parseBatchRequest({
    cases: [{ suspicionType: 'Gối đầu COD', driverId: 'D1', orderCode: 'O1' }],
    force: true
  }, config);
  assert.equal(request.sweep, false);
  assert.equal(request.force, true);
  assert.equal(request.cases.length, 1);
});
