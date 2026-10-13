import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldJourney, advanceWorldJourney, WORLD_REGIONS } from './sceneWorld.js';
import { createWorldLayout } from './sceneWorldLayout.js';
import { createRoadsideFleet, advanceRoadsideFleet } from './sceneRoadside.js';
import { createLeaderTrail, emitLeaderTrail, sampleTrailParticle } from './sceneLeaderTrail.js';

test('rapid region requests finish the current transition then use the latest choice; pause freezes progression', () => {
  const state = createWorldJourney('canyon');
  advanceWorldJourney(state, 'rainforest', 0.1);
  assert.equal(state.from, 'canyon'); assert.equal(state.to, 'rainforest');
  const paused = structuredClone(state);
  advanceWorldJourney(state, 'rainforest', 10, { active: false });
  assert.deepEqual(state, paused);
  for (let i = 0; i < 16; i++) advanceWorldJourney(state, 'harbor', 0.1);
  assert.equal(state.to, 'harbor'); assert.equal(state.from, 'rainforest');
  for (let i = 0; i < 20; i++) advanceWorldJourney(state, 'harbor', 0.1);
  assert.equal(state.from, 'harbor'); assert.equal(state.mix, 1);
});

test('a deliberate choice while paused or with reduced motion changes immediately', () => {
  for (const options of [{ active: false }, { reducedMotion: true }]) {
    const state = createWorldJourney('canyon'); advanceWorldJourney(state, 'alpine', 0.1, options);
    assert.equal(state.from, 'alpine'); assert.equal(state.to, 'alpine'); assert.equal(state.mix, 1);
  }
});

test('visit timing tracks active viewing even on slow frames and normalizes unknown regions', () => {
  const state = createWorldJourney('canyon');
  for (let i = 0; i < 5; i++) advanceWorldJourney(state, 'canyon', 0.2);
  assert.equal(state.visit, 1);
  advanceWorldJourney(state, 'unknown', 0.2);
  assert.equal(state.to, 'canyon'); assert.equal(state.mix, 1);
  assert.equal(state.visit, 1.2);
});

test('all region silhouettes have finite poses and bounded recycling, compact jungle uses fewer leaves', () => {
  for (const region of WORLD_REGIONS) for (const length of [80, 284]) {
    const layout = createWorldLayout(length, 11, region.id), fleet = createRoadsideFleet(layout), count = fleet.clusters.size;
    for (const parts of Object.values(layout.batches)) for (const part of parts) {
      assert.ok([part.x, part.y, part.z, ...part.scale].every(Number.isFinite));
      assert.ok(fleet.clusters.get(part.anchor).radius >= Math.hypot(part.x, part.y, part.z) + Math.hypot(...part.scale));
    }
    for (let distance = 0; distance < 10000; distance += 10) advanceRoadsideFleet(fleet, distance, layout.span, anchor => Math.abs(anchor) < 120);
    assert.equal(fleet.clusters.size, count);
    assert.ok(layout.batches.sign.length > 0);
  }
  assert.ok(createWorldLayout(80, 11, 'rainforest', true).batches.leaf.length < createWorldLayout(80, 11, 'rainforest').batches.leaf.length);
});

test('leader change does not move or recolor old smoke; capacity and lifetimes stay bounded', () => {
  const pool = createLeaderTrail(12);
  emitLeaderTrail(pool, { id: 'a', roadX: 20, roadZ: 2 }, 1, 4, 'canyon');
  const old = structuredClone(pool.particles[0]);
  emitLeaderTrail(pool, { id: 'b', roadX: -12, roadZ: -2 }, 1.2, 5, 'rainforest');
  assert.deepEqual(pool.particles[0], old);
  assert.equal(sampleTrailParticle(old, 1.5, 7).roadX, 15.5);
  assert.equal(sampleTrailParticle(old, 3, 10), null);
  for (let i = 0; i < 1000; i++) emitLeaderTrail(pool, { id: 'b', roadX: 0, roadZ: 0 }, 4 + i * 0.1, i, 'harbor');
  assert.equal(pool.particles.length, 12); assert.ok(pool.cursor < 12);
});
