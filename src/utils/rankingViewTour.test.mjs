import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { calculatePerformanceRanking, selectSceneHubs } from './performanceRanking.js';
import { computeSceneLayout, computeReplayFrames, computeTransitionFrames, snapshotSceneFleet, getRoadLength } from './rankingSceneLayout.js';
import { sampleDrivePose } from './sceneDriving.js';
import { tvCameraGoal } from './sceneCamera.js';
import { sampleRoadFrame } from './sceneRoadCurve.js';
import { createTourConvoy, tourProgress, tourShot, viewOffset, RANKING_ROAD_LENGTH } from './rankingViewTour.js';

test('Worst selects the actual tail of 1,000 ranked Hubs without mutating rank or identity', () => {
  const ranked = Array.from({ length: 1000 }, (_, i) => ({ id: `hub-${i}`, rank: i + 1 }));
  for (const limit of [10, 20, 50]) {
    const worst = selectSceneHubs(ranked, limit, 'worst');
    assert.equal(worst.length, limit);
    assert.equal(worst[0], ranked.at(-1));
    assert.equal(worst.at(-1), ranked.at(-limit));
    assert.deepEqual(selectSceneHubs(ranked, limit), ranked.slice(0, limit));
  }
  assert.equal(ranked[0].rank, 1);
  assert.equal(selectSceneHubs(ranked, 'ALL', 'worst').length, 20);
  assert.deepEqual(selectSceneHubs([], 50, 'worst'), []);
  assert.equal(selectSceneHubs(ranked.slice(0, 1), 50, 'worst')[0], ranked[0]);
});

test('tour opens, passes close to the convoy, and settles exactly at either endpoint', () => {
  for (const p of [0, 1]) {
    const shot = tourShot(p);
    assert.equal(shot.distanceScale, 1); assert.equal(shot.lift, 0);
    assert.equal(shot.fovOffset, 0); assert.equal(shot.lookAhead, 0);
  }
  assert.equal(tourShot(0.1).stage, 'depart');
  assert.equal(tourShot(0.45).stage, 'convoy');
  assert.equal(tourShot(0.9).stage, 'arrive');
  assert.ok(tourShot(0.45).distanceScale < 0.8);
  assert.ok(tourShot(0.1).lift > 0 && tourShot(0.9).lift > 0);
  for (const boundary of [0.16, 0.24, 0.46, 0.7, 0.76]) {
    const before = tourShot(boundary - 1e-5), after = tourShot(boundary + 1e-5);
    for (const key of ['distanceScale', 'lift', 'lookAhead', 'fovOffset']) assert.ok(Math.abs(before[key] - after[key]) < 0.001);
  }
});

test('Worst follows canonical ties and excludes missing/zero-sample Hubs', () => {
  const pickRows = [
    { hub: 'A', region: 'HNO', report_date: '2026-10-08', mau_pu: 100, ontime_pu_1st: 50 },
    { hub: 'B', region: 'HNO', report_date: '2026-10-08', mau_pu: 200, ontime_pu_1st: 100 },
    { hub: 'Zero', region: 'HNO', report_date: '2026-10-08', mau_pu: 0, ontime_pu_1st: 0 },
    { hub: 'Missing', region: 'HNO', report_date: '2026-10-01', mau_pu: 100, ontime_pu_1st: 1 }
  ];
  const result = calculatePerformanceRanking({ pickRows });
  assert.equal(result.unranked.length, 2);
  const worst = selectSceneHubs(result.ranked, 10, 'worst');
  assert.equal(worst[0].hub, 'A');
  assert.deepEqual(worst.map(t => t.rank), [2, 1]);
});

test('Worst #1 trails an isolated gap; following slots advance without lane overlap', () => {
  for (const n of [0, 1, 2, 10, 20, 50]) {
    const rows = Array.from({ length: n }, (_, i) => ({ id: `h-${i}` }));
    const localLength = getRoadLength(n);
    const offsetX = viewOffset('worst', localLength);
    const opts = { roadLength: localLength, leaderGap: 6, view: 'worst', offsetX, laneWidth: 2.6 };
    const slots = computeSceneLayout(rows, opts);
    const replay = computeReplayFrames(rows, opts);
    const lastLaneX = new Map();
    slots.forEach((s, i) => {
      assert.ok(Number.isFinite(s.x));
      if (i) assert.ok(s.x > slots[i - 1].x);
      if (lastLaneX.has(s.lane)) assert.ok(s.x - lastLaneX.get(s.lane) >= 3.4);
      lastLaneX.set(s.lane, s.x);
      assert.deepEqual(replay[i].to, { x: s.x, z: s.z });
      assert.ok(replay[i].from.x < offsetX - localLength * 0.45);
    });
    if (n > 1) assert.ok(Math.abs(slots[1].x - slots[0].x - 6) < 1e-8);
  }
});

test('Worst replay moves improving Hubs forward, retaining original delta semantics', () => {
  const rows = [
    { id: 'declines', hasCommonBaseline: true, deltaRank: -1 },
    { id: 'improves', hasCommonBaseline: true, deltaRank: 1 }
  ];
  const frames = computeReplayFrames(rows, { view: 'worst', offsetX: -80 });
  assert.ok(frames[0].to.x < frames[0].from.x);
  assert.ok(frames[1].to.x > frames[1].from.x);
});

test('TV camera frames the emphasized endpoint in both views on desktop and narrow screens', () => {
  for (const n of [1, 2, 10, 20, 50]) for (const view of ['best', 'worst']) {
    const localLength = getRoadLength(n), roadLength = RANKING_ROAD_LENGTH;
    const offsetX = viewOffset(view, localLength);
    const [first] = computeSceneLayout(Array.from({ length: n }, (_, i) => ({ id: i })), { roadLength: localLength, view, offsetX, leaderGap: 6, laneWidth: 2.6 });
    const frame = sampleRoadFrame(first.x, first.z, roadLength);
    for (const aspect of [390 / 620, 1280 / 620]) {
      const goal = tvCameraGoal(roadLength, 11, aspect, { view, localLength, offsetX });
      const camera = new THREE.PerspectiveCamera(goal.fov, aspect, 0.5, 10000);
      camera.position.set(...goal.position); camera.lookAt(...goal.target); camera.updateMatrixWorld();
      const p = new THREE.Vector3(frame.x, frame.y + 1, frame.z).project(camera);
      assert.ok(Math.abs(p.x) < 0.9, `${n}/${view}/${aspect}: ${p.x}`);
      assert.ok(p.y > -0.8 && p.y < 0.85);
    }
  }
});

test('10/20/50 changes preserve world poses at the first frame and retain departing trucks', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `hub-${i}` }));
  for (const view of ['best', 'worst']) {
    const layout = n => computeSceneLayout(rows.slice(0, n), {
      roadLength: getRoadLength(n), offsetX: viewOffset(view, getRoadLength(n)),
      view, leaderGap: 6, laneWidth: 2.6
    });
    for (const [from, to] of [[50, 20], [20, 10], [10, 50], [20, 50], [50, 10], [10, 20]]) {
      const previous = layout(from), next = layout(to);
      const { items, changed } = computeTransitionFrames(previous, next, { maxCount: 50, view });
      assert.ok(changed);
      assert.equal(items.length, Math.max(from, to));
      for (const truck of previous) {
        const frame = items.find(item => item.id === truck.id);
        const start = sampleDrivePose(frame, 0);
        assert.deepEqual(sampleRoadFrame(start.x, start.z, RANKING_ROAD_LENGTH),
          sampleRoadFrame(truck.x, truck.z, RANKING_ROAD_LENGTH));
        assert.equal(start.alpha, 1);
        if (!next.some(item => item.id === truck.id)) {
          assert.equal(frame.phase, 'exit');
          assert.ok(view === 'worst' ? frame.to.x > frame.from.x : frame.to.x < frame.from.x);
          assert.equal(sampleDrivePose(frame, 1).alpha, 0);
        }
      }
      for (const truck of next) {
        const frame = items.find(item => item.id === truck.id);
        const end = sampleDrivePose(frame, 1);
        assert.ok(Math.abs(end.x - truck.x) < 1e-9);
        assert.ok(Math.abs(end.z - truck.z) < 1e-9);
        assert.equal(end.alpha, 1);
      }
      // Reverse a count change mid-flight: all visible poses and opacity survive.
      const poses = new Map(items.map(item => {
        const pose = sampleDrivePose(item, 0.4);
        return [item.id, { roadX: pose.x, roadZ: pose.z, alpha: pose.alpha }];
      }));
      const reversed = computeTransitionFrames(snapshotSceneFleet(items, poses), previous, { maxCount: 50, view });
      for (const item of reversed.items) {
        const pose = poses.get(item.id);
        assert.deepEqual(sampleDrivePose(item, 0), { x: pose.roadX, z: pose.roadZ, alpha: pose.alpha });
      }
    }
  }
});

test('Worst count changes use the free end of the pack, opposite to Best', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `hub-${i}` }));
  for (const view of ['best', 'worst']) {
    const layout = n => computeSceneLayout(rows.slice(0, n), {
      roadLength: getRoadLength(n), offsetX: viewOffset(view, getRoadLength(n)),
      view, leaderGap: 6, laneWidth: 2.6
    });
    const sign = view === 'worst' ? 1 : -1; // free end: ahead for Worst, behind for Best
    const shrink = computeTransitionFrames(layout(50), layout(20), { maxCount: 50, view }).items;
    const edge = Math.max(...layout(50).map(t => t.x * sign)) ;
    for (const item of shrink.filter(i => i.ghost)) {
      assert.equal(item.phase, 'exit');
      assert.ok((item.to.x - item.from.x) * sign > 0, `${view} leavers exit through the free end`);
      assert.ok(item.to.x * sign > edge, `${view} leavers finish beyond the pack`);
    }
    assert.equal(shrink.filter(i => i.ghost).length, 30);
    const grow = computeTransitionFrames(layout(20), layout(50), { maxCount: 50, view }).items;
    const entering = grow.filter(i => i.phase === 'enter');
    assert.equal(entering.length, 30);
    for (const item of entering) {
      assert.ok(item.from.x * sign > Math.max(...layout(20).map(t => t.x * sign)), `${view} entrants start beyond the pack's free end`);
      assert.ok((item.to.x - item.from.x) * sign < 0, `${view} entrants travel into the pack`);
    }
  }
});

test('Tour convoy stays within 50 instances, is single file and has no selectable fake Hubs', () => {
  const source = Array.from({ length: 50 }, (_, i) => ({ id: `hub-${i}`, x: 60 + i, z: i % 4, item: { rank: i + 1 } }));
  const convoy = createTourConvoy(source);
  assert.ok(convoy.length <= 50);
  assert.ok(convoy.every(t => t.ghost));
  const scenery = convoy.filter(t => !t.item);
  assert.equal(scenery.length, 26);
  scenery.forEach((t, i) => {
    assert.equal(t.z, -1.3);
    if (i) assert.ok(t.x - scenery[i - 1].x >= 3.4);
  });
});

test('Tour easing is bounded and monotonic with exact endpoints', () => {
  assert.equal(tourProgress(-1), 0); assert.equal(tourProgress(2), 1);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const p = tourProgress(i / 100); assert.ok(p >= previous && p <= 1); previous = p;
  }
});
