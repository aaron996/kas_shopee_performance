import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneVehicleKind, vehiclePickBounds } from './sceneVehicles.js';
import { createTourConvoy } from './rankingViewTour.js';

test('BC dispatch uses only explicit hub type, retaining truck fallback', () => {
  for (const hubType of ['BC', ' bc ', 'Bưu Cục', 'bưu   cục']) {
    assert.equal(sceneVehicleKind({ item: { hubType } }), 'rider');
  }
  for (const hubType of ['GXT', 'KA', 'GHV', 'CK', 'AHAMOVE', '', null]) {
    assert.equal(sceneVehicleKind({ item: { hubType, hub: 'BC Test' } }), 'truck');
  }
  assert.equal(sceneVehicleKind(), 'truck');
  assert.equal(sceneVehicleKind({ hubType: 'BC' }), 'rider');
  assert.deepEqual(vehiclePickBounds({ item: { hubType: 'BC' } }), [1.12, 0.5, 1.8]);
});

test('Best/Worst convoy keeps the source vehicle kind and defaults scenery to trucks', () => {
  const convoy = createTourConvoy([{ id: 'bc', item: { hubType: 'BC' } }, { id: 'gxt', item: { hubType: 'GXT' } }]);
  assert.equal(sceneVehicleKind(convoy[0]), 'rider');
  assert.equal(sceneVehicleKind(convoy[1]), 'truck');
  assert.ok(convoy.every(item => item.ghost));
  assert.ok(convoy.slice(2).every(item => sceneVehicleKind(item) === 'truck'));
});
