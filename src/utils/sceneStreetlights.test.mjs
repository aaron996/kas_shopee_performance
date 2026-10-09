import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreetlightLayout, MAX_STREETLIGHTS, selectStreetlightSources } from './sceneStreetlights.js';
import { advanceRoadsideFleet, computeRoadsideLayout, createRoadsideFleet, roadsideWorldPose } from './sceneRoadside.js';
import { sampleSceneLighting } from './sceneLighting.js';

test('streetlights stay bounded and deterministic across supported road widths', () => {
  for (const span of [384, 768, 2880, 10000]) for (const width of [3.2, 11, 16.2]) {
    const lamps = createStreetlightLayout(span, width);
    assert.deepEqual(lamps, createStreetlightLayout(span, width));
    assert.ok(lamps.length > 0 && lamps.length <= MAX_STREETLIGHTS);
    for (const lamp of lamps) {
      const mast = lamp.parts.find(part => part.shape === 'pole' && part.y > 2);
      assert.ok(Math.abs(mast.z) - mast.scale[2] / 2 > width / 2);
      assert.ok(lamp.emitter.y > 5);
      assert.ok(lamp.parts.every(part => part.anchor === lamp.anchor));
    }
  }
});

test('poles, emitters and road pools share rigid transforms and the same recycling clock', () => {
  const layout = computeRoadsideLayout(80, 11), fleet = createRoadsideFleet(layout);
  const lamp = layout.streetlights[0];
  const before = fleet.clusters.get(lamp.anchor).anchor;
  advanceRoadsideFleet(fleet, 30, layout.span, () => true);
  assert.equal(fleet.clusters.get(lamp.anchor).anchor, before - 30);
  const radius = fleet.clusters.get(lamp.anchor).radius;
  assert.ok(radius >= Math.hypot(...lamp.footprint.scale));
  for (const anchor of [-200, -10, 0, 150]) {
    const pole = roadsideWorldPose(lamp.parts[1], anchor, 80), emitter = roadsideWorldPose(lamp.emitter, anchor, 80);
    const expected = Math.hypot(lamp.parts[1].x - lamp.emitter.x, lamp.parts[1].y - lamp.emitter.y, lamp.parts[1].z - lamp.emitter.z);
    assert.ok(Math.abs(Math.hypot(pole.x - emitter.x, pole.y - emitter.y, pole.z - emitter.z) - expected) < 1e-10);
  }
  const paused = structuredClone(fleet);
  advanceRoadsideFleet(fleet, 30, layout.span, () => false);
  assert.deepEqual(fleet, paused);
});

test('fixed light pool chooses nearest finite sources with stable ties and a hard cap', () => {
  const positions = [-30, -10, 10, 30, 50, 70].map(x => ({ x, y: 5, z: 0 }));
  const focus = { x: 0, y: 0, z: 0 };
  assert.deepEqual(selectStreetlightSources(positions, focus, 2), [1, 2]);
  assert.equal(selectStreetlightSources(positions, focus, 100).length, 4);
  assert.deepEqual(selectStreetlightSources(positions, focus, 0), []);
  assert.deepEqual(selectStreetlightSources([{x: NaN, y: 0, z: 0}], focus), []);
  assert.deepEqual(selectStreetlightSources([], focus), []);
});

test('streetlights switch smoothly at dusk and dawn, stay off in daylight and fully on at night', () => {
  assert.equal(sampleSceneLighting(12 / 24).streetlightPower, 0);
  assert.equal(sampleSceneLighting(0).streetlightPower, 1);
  assert.ok(sampleSceneLighting(17.5 / 24).streetlightPower > 0);
  assert.ok(sampleSceneLighting(17.5 / 24).streetlightPower < sampleSceneLighting(18.5 / 24).streetlightPower);
  for (let minute = 0; minute < 1440; minute++) {
    const power = sampleSceneLighting(minute / 1440).streetlightPower;
    assert.ok(power >= 0 && power <= 1);
    const next = sampleSceneLighting((minute + 1) / 1440).streetlightPower;
    assert.ok(Math.abs(next - power) < 0.04);
  }
});
