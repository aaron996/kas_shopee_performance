import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTransitionFrames, computeSceneLayout } from './rankingSceneLayout.js';
import {
  advanceDriveClock, createDriveClock, sampleDrivePose, driveHeading, CRUISE_SPEED,
  wrapRoadTravel, leaderSurge, worstRideStrength, truckRidePhase, sampleWorstRide,
  sampleWorstSkid, skidRoadZ
} from './sceneDriving.js';

const moving = (id, fromX, toX, fromZ = 0, toZ = 0) => ({
  id, from: { x: fromX, z: fromZ }, to: { x: toX, z: toZ }, alphaFrom: 1, alphaTo: 1
});
const replay = { durationMs: 3000 };

test('only W1 skids and emits smoke; reduced motion returns its ordinary pose', () => {
  const rest = { lateral: 0, yaw: 0, smoke: 0, spinExtra: 0 };
  for (let t = 0; t <= 10; t += 0.05) {
    for (const order of [null, 0, 2, 3, 50]) assert.deepEqual(sampleWorstSkid(t, order), rest);
    assert.deepEqual(sampleWorstSkid(t, 1, 2, true), rest);
  }
});

test('W1 weaves on both sides with bounded heading and spinning tyres', () => {
  let min = Infinity, max = -Infinity, previousSpin = 0;
  for (let t = 0; t <= 60; t += 0.025) {
    const skid = sampleWorstSkid(t, 1, truckRidePhase('last'));
    min = Math.min(min, skid.lateral); max = Math.max(max, skid.lateral);
    assert.ok(Math.abs(skid.lateral) <= 1.06);
    assert.ok(Math.abs(skid.yaw) <= 0.41);
    assert.ok(skid.smoke >= 0.45 && skid.smoke <= 1);
    assert.ok(skid.spinExtra >= previousSpin);
    previousSpin = skid.spinExtra;
    // A rotated 3.1 x 1.4 truck stays on asphalt for every lane count.
    const corner = 1.55 * Math.abs(Math.sin(skid.yaw + 0.022)) + 0.7 * Math.abs(Math.cos(skid.yaw + 0.022));
    for (const count of [1, 2, 4, 8]) {
      const width = count * 2.6 + 0.6;
      for (const anchor of [0, -(count - 1) * 1.3, (count - 1) * 1.3]) {
        const z = skidRoadZ(anchor, skid.lateral, width);
        assert.ok(Math.abs(z) + corner <= width / 2, `lane ${count}: ${z} + ${corner}`);
      }
    }
  }
  assert.ok(min < -0.9 && max > 0.9);
});

test('skid, wheelspin and historical smoke ages freeze on pause with no anchor displacement', () => {
  const clock = createDriveClock();
  const truck = { id: 'last', worstOrder: 1, x: -24, z: -3.9 };
  advanceDriveClock(clock, [truck], null, 0.05, true, 2);
  const skid = sampleWorstSkid(clock.time, 1);
  const age = clock.time * 1.2 % 1;
  advanceDriveClock(clock, [truck], null, 5, false, 4);
  assert.deepEqual(sampleWorstSkid(clock.time, 1), skid);
  assert.equal(clock.time * 1.2 % 1, age);
  assert.deepEqual(sampleDrivePose(truck, 1), { x: -24, z: -3.9, alpha: 1 });
});

test('Worst strain decreases strictly from W1 through W50, with stable Hub phases', () => {
  assert.equal(worstRideStrength(1), 1);
  for (let i = 2; i <= 50; i++) {
    assert.ok(worstRideStrength(i) > 0);
    assert.ok(worstRideStrength(i) < worstRideStrength(i - 1));
  }
  for (const value of [null, undefined, 0, -1, 1.5]) assert.equal(worstRideStrength(value), 0);
  const hubs = ['HNO|Hub 001', 'HNO|Hub 002', 'HCM|Hub 001'];
  const phases = hubs.map(truckRidePhase);
  assert.equal(new Set(phases).size, hubs.length);
  assert.deepEqual([...hubs].reverse().map(truckRidePhase).reverse(), phases);
  assert.ok(phases.every(phase => phase >= 0 && phase < Math.PI * 2));
});

test('Worst ride stays bounded and W1 has greater strain than W2 at every sampled phase', () => {
  let energy = 0;
  for (const phase of [0, truckRidePhase('hub')]) for (let t = 0; t < 30; t += 0.025) {
    const first = sampleWorstRide(t, worstRideStrength(1), phase);
    const second = sampleWorstRide(t, worstRideStrength(2), phase);
    assert.ok(first.bounce >= 0 && first.bounce <= 0.146);
    assert.ok(Math.abs(first.pitch) <= 0.083);
    assert.ok(Math.abs(first.roll) <= 0.085);
    assert.ok(Math.abs(first.yaw) <= 0.022);
    for (const axis of Object.keys(first)) {
      assert.ok(Number.isFinite(first[axis]));
      assert.ok(Math.abs(first[axis]) >= Math.abs(second[axis]));
      energy += first[axis] ** 2;
    }
  }
  assert.ok(energy > 1);
});

test('Best and reduced motion have no Worst strain', () => {
  const rest = { bounce: 0, pitch: 0, roll: 0, yaw: 0 };
  for (let t = 0; t < 20; t += 0.1) {
    assert.deepEqual(sampleWorstRide(t, 0), rest);
    assert.deepEqual(sampleWorstRide(t, 1, 2.4, true), rest);
  }
});

test('Worst suspension freezes with the shared clock without changing rank anchors', () => {
  const clock = createDriveClock();
  const truck = { id: 'worst', worstOrder: 1, x: -24, z: 2.6 };
  advanceDriveClock(clock, [truck], null, 0.05, true, 2);
  const before = sampleWorstRide(clock.time, 1);
  for (let i = 0; i < 10; i++) advanceDriveClock(clock, [truck], null, 0.05, false, 4);
  assert.deepEqual(sampleWorstRide(clock.time, 1), before);
  advanceDriveClock(clock, [truck], null, 0.05, true, 2);
  assert.notDeepEqual(sampleWorstRide(clock.time, 1), before);
  assert.deepEqual(sampleDrivePose(truck, 1), { x: -24, z: 2.6, alpha: 1 });
});

test('only a forward-moving destination winner surges and settles at its exact rank', () => {
  const winner = { ...moving('winner', -40, 20), item: { rank: 1 }, phase: 'enter', alphaFrom: 0 };
  const ordinary = { ...winner, item: { rank: 2 } };
  assert.ok(leaderSurge(winner, 0.5) > 0);
  assert.ok(sampleDrivePose(winner, 0.5).x > sampleDrivePose(ordinary, 0.5).x);
  for (const item of [ordinary, { ...winner, ghost: true }, { ...winner, to: { x: -40, z: 0 } }]) {
    assert.equal(leaderSurge(item, 0.5), 0);
  }
  assert.equal(leaderSurge(winner, 0), 0);
  assert.equal(leaderSurge(winner, 1), 0);
  assert.deepEqual(sampleDrivePose(winner, 0), { x: -40, z: 0, alpha: 0 });
  assert.deepEqual(sampleDrivePose(winner, 1), { x: 20, z: 0, alpha: 1 });
  let previous = -40;
  for (let i = 0; i <= 100; i++) {
    const x = sampleDrivePose(winner, i / 100).x;
    assert.ok(x >= previous && x <= 20);
    previous = x;
  }
});

test('Top 50 transitions keep the fleet within budget, including departing ghosts', () => {
  const fleet = offset => Array.from({ length: 50 }, (_, i) => ({ id: `hub-${i + offset}`, x: 50 - i, z: i % 4 }));
  const transition = computeTransitionFrames(fleet(0), fleet(50), { maxCount: 50 });
  assert.equal(transition.items.length, 50);
  assert.ok(transition.items.every(item => !item.ghost && Number(item.id.slice(4)) >= 50));
  const smaller = computeTransitionFrames(fleet(0), fleet(50).slice(0, 10), { maxCount: 50 });
  assert.equal(smaller.items.length, 50);
  assert.equal(smaller.items.filter(item => !item.ghost).length, 10);
});

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

test('road texture travel stays stable after many loops', () => {
  for (const length of [36, 200, 1400]) {
    const half = length / 2 + 12;
    const span = half * 2;
    for (const x of [-half + 0.01, 0, half - 0.01]) {
      const first = wrapRoadTravel(x, 0, -half, span);
      const repeated = wrapRoadTravel(x, span * 1000000, -half, span);
      assert.ok(Math.abs(first - repeated) < 1e-8);
    }
  }
});

test('new trucks become visible behind the pack; exits retreat before fading', () => {
  const { items } = computeTransitionFrames([{ id: 'gone', x: 12, z: 0 }], [{ id: 'new', x: 12, z: 0 }, { id: 'last', x: -12, z: 2 }]);
  const entering = items.find(i => i.id === 'new'), leaving = items.find(i => i.id === 'gone');
  assert.equal(sampleDrivePose(entering, 0).alpha, 0);
  assert.equal(sampleDrivePose(entering, 0.22).alpha, 1);
  assert.ok(sampleDrivePose(entering, 0.22).x < -12);
  assert.equal(sampleDrivePose(leaving, 0.68).alpha, 1);
  assert.ok(sampleDrivePose(leaving, 0.68).x < -12);
  assert.equal(sampleDrivePose(leaving, 1).alpha, 0);
  for (const item of items) {
    assert.equal(sampleDrivePose(item, 1).x, item.to.x);
    assert.equal(sampleDrivePose(item, 1).z, item.to.z);
  }
});

test('departing trucks drive forward against the moving road and freeze on pause', () => {
  const item = { ...moving('exit', 15, -24), ghost: true, phase: 'exit', alphaTo: 0 };
  const clock = createDriveClock(), motion = { durationMs: 3200 };
  let previousX = item.from.x;
  while (clock.motionElapsed < motion.durationMs) {
    const distance = clock.distance;
    advanceDriveClock(clock, [item], motion, 0.05, true, 4);
    const x = sampleDrivePose(item, Math.min(1, clock.motionElapsed / motion.durationMs)).x;
    assert.ok(clock.distance - distance + x - previousX > 0);
    previousX = x;
    const frozen = { ...clock, step: 0 };
    advanceDriveClock(clock, [item], motion, 0.05, false, 4);
    assert.deepEqual(clock, frozen);
  }
});

test('incoming convoy keeps same-lane trucks spaced through the entire entrance', () => {
  const next = computeSceneLayout(Array.from({ length: 20 }, (_, id) => ({ id })), { leaderGap: 6, laneWidth: 2.6 });
  const { items } = computeTransitionFrames([], next);
  for (let t = 0; t <= 1; t += 0.02) {
    const lastByLane = new Map();
    for (const item of items) {
      const pose = sampleDrivePose(item, t);
      const last = lastByLane.get(pose.z);
      if (last !== undefined) assert.ok(last - pose.x >= 3.4 - 1e-8);
      lastByLane.set(pose.z, pose.x);
    }
  }
});
