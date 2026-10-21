import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cinematicBeat, cinematicCameraGoal, CINEMATIC_SHOTS, CINEMATIC_SHOT_SECONDS, resolveCameraMode } from './sceneCinematic.js';
import { sampleRoadFrame } from './sceneRoadCurve.js';
import { RANKING_ROAD_LENGTH } from './rankingViewTour.js';

test('six distinct shots loop deterministically without a gap', () => {
  assert.equal(new Set(CINEMATIC_SHOTS.map(shot => shot.id)).size, 6);
  for (let index = 0; index <= 12; index++) {
    const beat = cinematicBeat(index * CINEMATIC_SHOT_SECONDS);
    assert.equal(beat.shot, CINEMATIC_SHOTS[index % 6]);
    assert.equal(beat.progress, 0);
  }
});

test('every shot contains the truck silhouette and label in portrait and landscape along the road', () => {
  for (const x of [-130, 0, 130]) for (const z of [-3.9, 3.9]) {
    const frame = sampleRoadFrame(x, z, RANKING_ROAD_LENGTH);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), frame.heading)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), frame.pitch));
    for (const aspect of [0.39, 390 / 844, 844 / 390, 1280 / 674]) {
      for (let seconds = 0; seconds < 84; seconds += 0.5) {
        const goal = cinematicCameraGoal(frame, seconds, aspect);
        assert.ok([...goal.target, ...goal.position, goal.fov].every(Number.isFinite));
        assert.ok(goal.position[1] > goal.target[1]);
        const camera = new THREE.PerspectiveCamera(goal.fov, aspect, 0.5, 2000);
        camera.position.fromArray(goal.position); camera.lookAt(...goal.target); camera.updateMatrixWorld();
        for (const dx of [-1.55, 1.55]) for (const dy of [0, 2.1]) for (const dz of [-0.85, 0.85]) {
          const p = new THREE.Vector3(dx, dy, dz).applyQuaternion(rotation)
            .add(new THREE.Vector3(frame.x, frame.y, frame.z)).project(camera);
          assert.ok(Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9 && p.z > -1 && p.z < 1,
            `${x}/${z}/${aspect}/${seconds}: ${p.x},${p.y}`);
        }
      }
    }
  }
});

test('idle override restores TV, overview and follow, while manual selection persists', () => {
  for (const chosen of ['tv', 'overview', 'follow']) {
    const args = { chosen, hasSelection: true, idle: true };
    assert.equal(resolveCameraMode(args), 'cinematic');
    assert.equal(resolveCameraMode({ ...args, idle: false }), chosen);
    assert.equal(resolveCameraMode({ ...args, dismissed: true }), chosen);
  }
  assert.equal(resolveCameraMode({ chosen: 'cinematic', idle: false }), 'cinematic');
  assert.equal(resolveCameraMode({ chosen: 'cinematic', idle: true, dismissed: true }), 'cinematic');
  assert.equal(resolveCameraMode({ chosen: 'follow', fallback: 'overview', hasSelection: false }), 'overview');
});

test('tour/replay and reduced motion suspend cinematic without breaking followed replays', () => {
  const args = { chosen: 'cinematic', idle: true };
  for (const flag of ['touring', 'busy', 'reducedMotion']) assert.equal(resolveCameraMode({ ...args, [flag]: true }), 'tv');
  assert.equal(resolveCameraMode({ chosen: 'follow', hasSelection: true, idle: true, busy: true }), 'follow');
  assert.equal(resolveCameraMode({ chosen: 'overview', idle: true, reducedMotion: true }), 'overview');
});
