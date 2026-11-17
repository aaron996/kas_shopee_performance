import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDashboardRows, getHubType } from './dataProcessor.js';

test('Reverse KA rows are typed KHL; SPB/SPE keep KA; other Reverse types are untouched', () => {
  const rows = [
    { client_name: 'SPE Reverse', region: 'HNO', hub: 'A', hub_type: 'KA' },
    { client_name: 'SPE Reverse', region: 'HNO', hub: 'B', hub_type: 'BC' },
    { client_name: 'SPE Reverse', region: 'HNO', hub: 'C', hub_type: 'BC KD' },
    { client_name: 'SPB', region: 'HNO', hub: 'D', hub_type: 'KA' }
  ];
  assert.deepEqual(normalizeDashboardRows(rows).map(getHubType), ['KHL', 'BC', 'BC KD', 'KA']);
});
