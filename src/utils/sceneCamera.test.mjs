import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { followCameraGoal, tvCameraGoal } from './sceneCamera.js';
import { sampleRoadFrame } from './sceneRoadCurve.js';
import { computeSceneLayout, getRoadLength } from './rankingSceneLayout.js';
import { viewOffset, VIEW_TOUR_LENGTH } from './rankingViewTour.js';
import { sampleWorstSkid, skidRoadZ } from './sceneDriving.js';

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

test('TV keeps the emphasized truck and its label inside tall portrait and landscape frames in both cohorts', () => {
  for (const count of [1, 2, 10, 20, 50]) for (const view of ['best', 'worst']) {
    const localLength = getRoadLength(count), roadLength = localLength * 2 + VIEW_TOUR_LENGTH + 12;
    const offsetX = viewOffset(view, localLength);
    const [truck] = computeSceneLayout(Array.from({ length: count }, (_, id) => ({ id })), { roadLength: localLength, view, offsetX, leaderGap: 6, laneWidth: 2.6 });
    const frame = sampleRoadFrame(truck.x, truck.z, roadLength);
    for (const aspect of [306 / 750, 390 / 798, 844 / 344, 1280 / 674]) {
      const goal = tvCameraGoal(roadLength, 11, aspect, { view, localLength, offsetX });
      const camera = new THREE.PerspectiveCamera(goal.fov, aspect, 0.5, 10000);
      camera.position.fromArray(goal.position); camera.lookAt(...goal.target); camera.updateMatrixWorld();
      for (const height of [0, 1.7, 2.1]) {
        const p = new THREE.Vector3(frame.x, frame.y + height, frame.z).project(camera);
        assert.ok(Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.85, `${count}/${view}/${aspect}/${height}: ${p.x}, ${p.y}`);
      }
      // Test the full silhouette, including W1's sideways skid, not just its anchor.
      for (let time = 0; time < 3; time += 0.3) {
        const skid = sampleWorstSkid(time, view === 'worst' ? 1 : null);
        const roadZ = view === 'worst' ? skidRoadZ(truck.z, skid.lateral, 11) : truck.z;
        const visual = sampleRoadFrame(truck.x, roadZ, roadLength);
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), visual.heading + skid.yaw)
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), visual.pitch));
        for (const x of [-1.55, 1.55]) for (const y of [0, 1.7]) for (const z of [-0.85, 0.85]) {
          const p = new THREE.Vector3(x, y, z).applyQuaternion(rotation).add(new THREE.Vector3(visual.x, visual.y, visual.z)).project(camera);
          assert.ok(Math.abs(p.x) < 0.96 && Math.abs(p.y) < 0.9, `silhouette ${count}/${view}/${aspect}/${time}: ${p.x}, ${p.y}`);
        }
      }
    }
  }
});

test('follow shot keeps the selected truck visible from both road ends and follows the local road direction', () => {
  for (const roadX of [-130, 0, 130]) for (const lane of [-3.9, 3.9]) {
    const frame = sampleRoadFrame(roadX, lane, 284);
    for (const aspect of [390 / 798, 1280 / 674]) {
      const goal = followCameraGoal(frame, aspect);
      const camera = new THREE.PerspectiveCamera(goal.fov, aspect, 0.5, 1000);
      camera.position.fromArray(goal.position); camera.lookAt(...goal.target); camera.updateMatrixWorld();
      const p = new THREE.Vector3(frame.x, frame.y + 0.85, frame.z).project(camera);
      assert.ok(Math.abs(p.x) < 0.85 && Math.abs(p.y) < 0.8, `${roadX}/${lane}/${aspect}: ${p.x}, ${p.y}`);
      const heading = new THREE.Vector3(Math.cos(frame.heading) * Math.cos(frame.pitch), Math.sin(frame.pitch), -Math.sin(frame.heading) * Math.cos(frame.pitch));
      const up = new THREE.Vector3(-Math.cos(frame.heading) * Math.sin(frame.pitch), Math.cos(frame.pitch), Math.sin(frame.heading) * Math.sin(frame.pitch));
      const targetFromAnchor = new THREE.Vector3(...goal.target).sub(new THREE.Vector3(frame.x, frame.y, frame.z));
      assert.ok(Math.abs(targetFromAnchor.dot(heading) - 2.6) < 1e-8);
      assert.ok(Math.abs(targetFromAnchor.dot(up) - 0.85) < 1e-8);
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
