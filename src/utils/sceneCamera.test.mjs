import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tvCameraGoal } from './sceneCamera.js';
import { sampleRoadFrame } from './sceneRoadCurve.js';
import { computeSceneLayout, getRoadLength } from './rankingSceneLayout.js';

test('TV cam keeps the leading truck visible on desktop and mobile', () => {
  for (const count of [10, 20, 30, 200, 1200]) {
    const roadLength = getRoadLength(count);
    const rows = Array.from({ length: count }, (_, id) => ({ id }));
    const first = computeSceneLayout(rows, { laneWidth: 2.6 })[0];
    const frame = sampleRoadFrame(first.x, first.z, roadLength);
    for (const aspect of [306 / 400, 560 / 440, 1184 / 440, 1440 / 520]) {
      const goal = tvCameraGoal(roadLength, 11, aspect);
      const camera = new THREE.PerspectiveCamera(goal.fov, aspect, 0.5, 10000);
      camera.position.set(...goal.position);
      camera.lookAt(...goal.target);
      camera.updateMatrixWorld();
      const projected = new THREE.Vector3(frame.x, frame.y + 1, frame.z).project(camera);
      assert.ok(Math.abs(projected.x) < 0.82, `count ${count}, aspect ${aspect}: x=${projected.x}`);
      assert.ok(projected.y > -0.65 && projected.y < 0.8);
      assert.ok(projected.z > -1 && projected.z < 1);
    }
  }
});

test('TV cam stays local as the fleet grows and remains above its road anchor', () => {
  const reference = tvCameraGoal(48, 11, 2.7);
  for (const length of [36, 48, 1400, 2400]) {
    const goal = tvCameraGoal(length, 11, 2.7);
    assert.ok([...goal.target, ...goal.position, goal.distance].every(Number.isFinite));
    assert.ok(goal.position[1] > goal.target[1]);
    assert.ok(goal.distance < 30);
    if (length >= 48) assert.equal(goal.distance, reference.distance);
  }
});
