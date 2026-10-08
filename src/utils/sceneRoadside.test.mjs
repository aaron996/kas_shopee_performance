import test from 'node:test';
import assert from 'node:assert/strict';
import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { advanceRoadsideFleet, computeRoadsideLayout, createRoadsideFleet, sampleSceneryFrame } from './sceneRoadside.js';
import { sampleRoadFrame } from './sceneRoadCurve.js';
import { tvCameraGoal } from './sceneCamera.js';

test('visible scenery travels past the old cutoff and loop seam without teleporting', () => {
  const layout = computeRoadsideLayout(36, 11);
  const fleet = createRoadsideFleet(layout);
  const start = fleet.clusters.get(5).anchor;
  assert.deepEqual(advanceRoadsideFleet(fleet, 1000, layout.span, () => true), []);
  assert.equal(fleet.clusters.get(5).anchor, start - 1000);
  const paused = structuredClone(fleet);
  assert.deepEqual(advanceRoadsideFleet(fleet, 1000, layout.span, () => false), []);
  assert.deepEqual(fleet, paused);
});

test('recycling skips a visible arrival and keeps the same finite fleet', () => {
  const layout = computeRoadsideLayout(36, 11), fleet = createRoadsideFleet(layout);
  const count = fleet.clusters.size;
  const visible = x => x > 100 && x < 400;
  const events = advanceRoadsideFleet(fleet, 400, layout.span, visible);
  assert.ok(events.length > 0);
  assert.equal(fleet.clusters.size, count);
  for (const { from, to } of events) {
    assert.equal(visible(from), false);
    assert.equal(visible(to), false);
    assert.ok(to >= -layout.span / 2);
    assert.ok(Math.abs((to - from) / layout.span - Math.round((to - from) / layout.span)) < 1e-10);
  }
});

test('extra scenery follows an endpoint tangent without curling back into view', () => {
  for (const length of [36, 80]) for (const side of [-1, 1]) {
    const extent = length / 2 + Math.max(18, Math.min(40, length * 0.4));
    const boundary = side * extent;
    assert.deepEqual(sampleSceneryFrame(boundary, 4, length), sampleRoadFrame(boundary, 4, length));
    const a = sampleSceneryFrame(boundary, 4, length);
    const b = sampleSceneryFrame(boundary + side * 100, 4, length);
    const c = sampleSceneryFrame(boundary + side * 200, 4, length);
    for (const key of ['x', 'y', 'z']) assert.ok(Math.abs((c[key] - b[key]) - (b[key] - a[key])) < 1e-9);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) - 100) < 1e-9);
    assert.equal(c.heading, a.heading);
  }
});

test('recycling maintains continuous curb coverage without skipping an extra cycle', () => {
  const layout = computeRoadsideLayout(36, 11), fleet = createRoadsideFleet(layout);
  for (let distance = 0; distance <= 2000; distance += 2) {
    advanceRoadsideFleet(fleet, distance, layout.span, anchor => Math.abs(anchor) < 100);
    const curbs = [...fleet.clusters].filter(([id]) => id % 3 === 0).map(([, cluster]) => cluster.anchor).sort((a, b) => a - b);
    assert.equal(curbs.length, layout.span / 3);
    assert.ok(curbs[0] >= -layout.span / 2 && curbs[0] < -layout.span / 2 + 3);
    for (let i = 1; i < curbs.length; i++) assert.equal(curbs[i] - curbs[i - 1], 3);
  }
});

test('whole clusters recycle outside real camera frustums through long travel and camera changes', () => {
  for (const length of [36, 80]) for (const aspect of [390 / 750, 1280 / 600]) {
    const layout = computeRoadsideLayout(length, 11), fleet = createRoadsideFleet(layout);
    const camera = new PerspectiveCamera(58, aspect, 0.5, 700);
    const matrix = new Matrix4(), frustum = new Frustum(), sphere = new Sphere();
    const goal = tvCameraGoal(length, 11, aspect);
    const visible = (anchor, radius) => {
      const f = sampleSceneryFrame(anchor, 0, length);
      sphere.center.set(f.x, f.y, f.z); sphere.radius = radius;
      return frustum.intersectsSphere(sphere);
    };
    let total = 0;
    for (let step = 1; step <= 2500; step++) {
      // TV, overview, follow and orbit at a changing bearing/zoom.
      const mode = Math.floor(step / 125) % 4;
      const target = mode === 2 ? sampleRoadFrame(length * -0.35, 0, length) : { x: goal.target[0], y: goal.target[1], z: goal.target[2] };
      if (mode === 0) camera.position.fromArray(goal.position);
      else camera.position.set(target.x + Math.sin(step / 150) * 65, target.y + (mode === 1 ? 60 : 20), target.z + Math.cos(step / 150) * 65);
      camera.lookAt(new Vector3(target.x, target.y, target.z)); camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const events = advanceRoadsideFleet(fleet, step * 2, layout.span, visible);
      total += events.length;
      for (const event of events) {
        const radius = fleet.clusters.get(event.id).radius;
        assert.equal(visible(event.from, radius), false, 'the complete departure cluster is outside the camera');
        assert.equal(visible(event.to, radius), false, 'the complete arrival cluster is outside the camera');
      }
    }
    assert.ok(total > 500);
    assert.ok([...fleet.clusters.values()].every(cluster => Number.isFinite(cluster.anchor) && Math.abs(cluster.anchor) < 2000));
  }
});
