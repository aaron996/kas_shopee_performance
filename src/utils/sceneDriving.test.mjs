import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDriveClock, createDriveClock, sampleDrivePose, driveHeading, CRUISE_SPEED,
  wrapRoadTravel, roadsideAlpha, ROADSIDE_BUFFER
} from './sceneDriving.js';

const moving = (id, fromX, toX, fromZ = 0, toZ = 0) => ({
  id, from: { x: fromX, z: fromZ }, to: { x: toX, z: toZ }, alphaFrom: 1, alphaTo: 1
});
const replay = { durationMs: 3000 };

test('cruise preserves ranking positions while common road distance advances', () => {
  const clock = createDriveClock();
  const truck = { x: 20, z: 2 };
  for (let i = 0; i < 60; i++) advanceDriveClock(clock, [truck], null, 1 / 60, true);
  assert.ok(Math.abs(clock.distance - CRUISE_SPEED) < 1e-8);
  assert.deepEqual(sampleDrivePose(truck, 0.5), { x: 20, z: 2, alpha: 1 });
});

test('speed multiplier scales travel and replay time, including low frame rates', () => {
  for (const fps of [20, 60]) {
    for (const rate of [0.25, 1, 2, 4]) {
      const clock = createDriveClock();
      for (let i = 0; i < fps; i++) advanceDriveClock(clock, [], replay, 1 / fps, true, rate);
      assert.ok(Math.abs(clock.distance - CRUISE_SPEED * rate) < 1e-8);
      assert.ok(Math.abs(clock.motionElapsed - 1000 * rate) < 1e-8);
    }
  }
});

test('changing speed keeps current replay position; changes while paused stay frozen', () => {
  const clock = createDriveClock();
  const items = [moving('fall', 120, -144, 0, 3.6)];
  advanceDriveClock(clock, items, replay, 0.05, true, 2);
  const before = { ...clock, step: 0 };
  advanceDriveClock(clock, items, replay, 5, false, 4);
  assert.deepEqual(clock, before);
  advanceDriveClock(clock, items, replay, 0.05, true, 0.25);
  assert.equal(clock.motionElapsed, before.motionElapsed + 12.5);
  const xBefore = sampleDrivePose(items[0], before.motionElapsed / replay.durationMs).x;
  const xAfter = sampleDrivePose(items[0], clock.motionElapsed / replay.durationMs).x;
  assert.ok(clock.distance - before.distance + xAfter - xBefore > 0);
});

test('falling hubs never reverse wheel travel, even on a 320-unit road', () => {
  const items = [moving('fall', 120, -144, 0, 3.6), moving('rise', -144, 120, 3.6, 0)];
  for (const [fps, rate] of [[20, 0.25], [20, 1], [20, 2], [20, 4], [30, 2], [60, 4]]) {
    const clock = createDriveClock();
    let previous = items.map(item => sampleDrivePose(item, 0).x);
    while (clock.motionElapsed < replay.durationMs) {
      const beforeDistance = clock.distance;
      advanceDriveClock(clock, items, replay, 1 / fps, true, rate);
      const t = Math.min(1, clock.motionElapsed / replay.durationMs);
      items.forEach((item, i) => {
        const pose = sampleDrivePose(item, t);
        const wheelTravel = clock.distance - beforeDistance + pose.x - previous[i];
        assert.ok(wheelTravel >= CRUISE_SPEED * rate / fps - 1e-8);
        assert.ok(Math.abs(driveHeading(item, t, replay.durationMs, clock.speed)) <= 0.18);
        previous[i] = pose.x;
      });
    }
  }
});

test('pause, hidden tab and offscreen use the same frozen clock; resume does not skip replay', () => {
  const clock = createDriveClock();
  const items = [moving('a', 10, -10)];
  advanceDriveClock(clock, items, replay, 0.016, true);
  const before = { ...clock, step: 0 };
  for (let i = 0; i < 10; i++) advanceDriveClock(clock, items, replay, 10, false);
  assert.deepEqual(clock, before);
  advanceDriveClock(clock, items, replay, 20, true);
  assert.equal(clock.motionElapsed, before.motionElapsed + 50);
});

test('lane change and rank endpoints settle exactly, including new/ghost alpha', () => {
  const item = { ...moving('new', -20, 20, -2.7, 2.7), alphaFrom: 0, alphaTo: 1 };
  assert.deepEqual(sampleDrivePose(item, 0), { x: -20, z: -2.7, alpha: 0 });
  assert.deepEqual(sampleDrivePose(item, 1), { x: 20, z: 2.7, alpha: 1 });
  assert.equal(sampleDrivePose(item, 0.1).z, -2.7);
  assert.equal(sampleDrivePose(item, 0.9).z, 2.7);
  assert.equal(driveHeading(item, 0, 3000, CRUISE_SPEED), 0);
  assert.equal(driveHeading(item, 1, 3000, CRUISE_SPEED), 0);
  assert.equal(sampleDrivePose({ ...item, alphaFrom: 1, alphaTo: 0 }, 1).alpha, 0);
});

test('trees, signs and dashes share road displacement through cruise and replay', () => {
  const clock = createDriveClock();
  const items = [moving('fall', 20, -20)];
  const props = [
    { x: 14, min: -42, span: 84 }, // tree
    { x: 28, min: -42, span: 84 }, // sign
    { x: 10, min: -30, span: 60 } // dash
  ];
  for (const motion of [null, replay]) {
    for (let i = 0; i < 200; i++) {
      const before = props.map(p => wrapRoadTravel(p.x, clock.distance, p.min, p.span));
      const previousDistance = clock.distance;
      advanceDriveClock(clock, items, motion, 1 / 30, true);
      const travel = clock.distance - previousDistance;
      props.forEach((p, j) => {
        const next = wrapRoadTravel(p.x, clock.distance, p.min, p.span);
        assert.ok(next >= p.min && next < p.min + p.span);
        // Add a loop length when the prop recycled offscreen.
        const backwards = (before[j] - next + p.span) % p.span;
        assert.ok(Math.abs(backwards - travel) < 1e-9);
      });
    }
  }
});

test('roadside recycling is invisible at both ends and stable after many loops', () => {
  for (const length of [36, 200, 1400]) {
    const half = length / 2 + ROADSIDE_BUFFER;
    const span = half * 2;
    assert.equal(roadsideAlpha(-half, length), 0);
    assert.equal(roadsideAlpha(half, length), 0);
    assert.equal(roadsideAlpha(-length / 2, length), 1);
    assert.equal(roadsideAlpha(length / 2, length), 1);
    for (const x of [-half + 0.01, 0, half - 0.01]) {
      const first = wrapRoadTravel(x, 0, -half, span);
      const repeated = wrapRoadTravel(x, span * 1000000, -half, span);
      assert.ok(Math.abs(first - repeated) < 1e-8);
    }
    const nearExit = wrapRoadTravel(0, half - 0.01, -half, span);
    const afterWrap = wrapRoadTravel(0, half + 0.01, -half, span);
    assert.ok(roadsideAlpha(nearExit, length) < 0.002);
    assert.ok(roadsideAlpha(afterWrap, length) < 0.002);
  }
});
