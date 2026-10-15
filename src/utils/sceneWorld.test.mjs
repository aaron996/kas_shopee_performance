import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldJourney, advanceWorldJourney, WORLD_REGIONS, nextWorld, worldRegion, worldTheme } from './sceneWorld.js';
import { createWorldLayout } from './sceneWorldLayout.js';
import { createRoadsideFleet, advanceRoadsideFleet } from './sceneRoadside.js';
import { createLeaderTrail, emitLeaderTrail, sampleTrailParticle } from './sceneLeaderTrail.js';
import { CITY_SHOP_SIGNS } from './sceneCityStreet.js';

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

test('city scenes join the route and share manual/pause/reduced-motion transition rules', () => {
  assert.equal(nextWorld('harbor'), 'hcm');
  assert.equal(nextWorld('hcm'), 'hanoi');
  assert.equal(nextWorld('hanoi'), 'canyon');
  for (const id of ['hcm', 'hanoi']) {
    assert.equal(worldRegion(id).id, id);
    for (const options of [{ active: false }, { reducedMotion: true }]) {
      const journey = createWorldJourney('harbor');
      advanceWorldJourney(journey, id, 0.1, options);
      assert.equal(journey.from, id); assert.equal(journey.to, id); assert.equal(journey.mix, 1);
    }
  }
});

test('city landmarks stay beyond the ranking lanes, resolve every color, and reduce detail on compact devices', () => {
  const expected = { hcm: ['bitexco', 'landmark-81'], hanoi: ['turtle-tower', 'the-huc'] };
  for (const [city, kinds] of Object.entries(expected)) for (const length of [80, 284]) {
    const theme = worldTheme(city), count = layout => Object.values(layout.batches).reduce((n, parts) => n + parts.length, 0);
    const full = createWorldLayout(length, 11, city), compact = createWorldLayout(length, 11, city, true);
    assert.deepEqual([...new Set(full.landmarks.map(item => item.kind))].sort(), [...kinds].sort());
    assert.deepEqual(compact.landmarks, full.landmarks);
    assert.ok(count(compact) < count(full));
    for (const backdrop of [false, true]) for (const compactMode of [false, true]) {
      const layout = createWorldLayout(length, 11, city, compactMode, backdrop);
      assert.ok(count(layout) < 6500, 'bounded dense city instance budget');
      for (const parts of Object.values(layout.batches)) for (const part of parts) {
        const [key, index] = part.color.split(':');
        assert.ok(index === undefined ? theme[key] || theme.props[key] : theme[key]?.[Number(index)]);
        if (part.landmark) {
          assert.ok(part.z + part.scale[2] / 2 < -11 / 2 - 2, `${city}: ${part.landmark} must clear the far shoulder`);
          assert.equal(part.motion === 'parcel' || part.motion === 'wind' || part.motion === 'water' || !part.motion, true);
        }
      }
    }
  }
});

test('HN2 and HCM4 retain dense storefronts on both shoulders in compact mode and keep lanes clear', () => {
  for (const city of ['hanoi', 'hcm']) for (const compact of [false, true]) {
    const layout = createWorldLayout(284, 11, city, compact);
    const all = Object.values(layout.batches).flat(), shops = all.filter(part => part.storefront);
    const near = shops.filter(part => part.streetSide === 1), far = shops.filter(part => part.streetSide === -1);
    assert.ok(near.length >= 64); assert.equal(near.length, far.length);
    assert.ok(near.every(part => part.y + part.scale[1] / 2 <= 2.3), 'foreground shop walls remain below truck sightlines');
    for (const side of [-1, 1]) {
      const row = shops.filter(part => part.streetSide === side).sort((a, b) => a.anchor - b.anchor);
      assert.ok(row.every((shop, i) => i === 0 || shop.anchor - row[i - 1].anchor <= 6.01), 'no sparse streetfront gaps');
    }
    for (const part of all.filter(part => part.streetSide)) assert.ok(Math.abs(part.z) - part.scale[2] / 2 > 5.5, 'sidewalk furniture must not enter ranking lanes');
    assert.ok(layout.batches.shopSign.every(part => Number.isInteger(part.shopIndex) && CITY_SHOP_SIGNS[part.shopIndex]));
    assert.ok(all.some(part => part.color === 'cityPaving'));
    if (city === 'hanoi') assert.ok(far.some(part => part.floors === 1), 'low lakeside cafes retain the landmark sightline');
    else assert.ok(far.some(part => part.floors >= 3), 'HCM4 retains a multi-storey commercial street');
  }
});
