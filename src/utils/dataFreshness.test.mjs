import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSnapshot, readFreshnessMarks, hasNewerData, FRESHNESS_TABLES } from './dataFreshness.js';

const row = (id, synced_at) => ({ id, synced_at, hub: 'HNO' });

function fakeClient(byTable) {
  return {
    from(table) {
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        abortSignal: () => {
          const result = byTable[table];
          if (result instanceof Error) return Promise.resolve({ data: null, error: result });
          return Promise.resolve({ data: result ? [result] : [], error: null });
        }
      };
      return query;
    }
  };
}

test('fingerprint takes the highest id per dataset, ignoring row order', () => {
  const marks = fingerprintSnapshot({
    pickData: [row(7, 'a'), row(42, 'b'), row(12, 'c')],
    deliData: [row('9', 'd')],
    ca1Data: [],
    fdData: null
  });
  assert.deepEqual(marks, { pickData: '42|b', deliData: '9|d' });
});

test('fingerprint of an empty or missing payload is empty, never a false mark', () => {
  assert.deepEqual(fingerprintSnapshot(null), {});
  assert.deepEqual(fingerprintSnapshot({}), {});
  assert.deepEqual(fingerprintSnapshot({ pickData: [{ hub: 'HNO' }] }), {});
});

test('a row without synced_at still produces a stable key', () => {
  const marks = fingerprintSnapshot({ pickData: [{ id: 5 }] });
  assert.deepEqual(marks, { pickData: '5|' });
  assert.equal(hasNewerData(marks, { pickData: '5|' }), false);
});

test('readFreshnessMarks reads one row per table', async () => {
  const client = fakeClient({
    [FRESHNESS_TABLES.pickData]: row(100, 'x'),
    [FRESHNESS_TABLES.deliData]: row(200, 'y')
  });
  const marks = await readFreshnessMarks(client, ['pickData', 'deliData']);
  assert.deepEqual(marks, { pickData: '100|x', deliData: '200|y' });
});

test('a failing or empty table is left out instead of reported as changed', async () => {
  const client = fakeClient({
    [FRESHNESS_TABLES.pickData]: row(100, 'x'),
    [FRESHNESS_TABLES.deliData]: new Error('network down'),
    [FRESHNESS_TABLES.fdData]: null
  });
  const marks = await readFreshnessMarks(client, ['pickData', 'deliData', 'fdData']);
  assert.deepEqual(marks, { pickData: '100|x' });
  assert.equal(hasNewerData({ pickData: '100|x', deliData: '200|y', fdData: '3|z' }, marks), false);
});

test('hasNewerData fires only on a dataset present on both sides with a new key', () => {
  const seen = { pickData: '100|x', deliData: '200|y' };
  assert.equal(hasNewerData(seen, { pickData: '100|x', deliData: '200|y' }), false);
  assert.equal(hasNewerData(seen, { pickData: '101|x2', deliData: '200|y' }), true);
  // Same id, new sync run: the table was replaced, so the numbers moved.
  assert.equal(hasNewerData(seen, { pickData: '100|x9', deliData: '200|y' }), true);
  // A dataset the user never loaded is not news about what they are looking at.
  assert.equal(hasNewerData(seen, { ...seen, ca1Data: '5|new' }), false);
  assert.equal(hasNewerData(null, { pickData: '1|a' }), false);
  assert.equal(hasNewerData(seen, null), false);
  assert.equal(hasNewerData({}, { pickData: '1|a' }), false);
});
