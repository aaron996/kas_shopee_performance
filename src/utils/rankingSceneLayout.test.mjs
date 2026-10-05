import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSceneLayout,
  getRoadLength,
  getRegionRoadLength,
  assignRegionLanes,
  computeReplayFrames,
  computeTransitionFrames,
  easeInOutCubic,
  interpolateFrame,
  START_GATE_FRACTION,
  MAX_REGION_ROAD_LENGTH,
  MIN_ROAD_LENGTH,
  MAX_ROAD_LENGTH
} from './rankingSceneLayout.js';

const makeTrucks = (n) => Array.from({ length: n }, (_, i) => ({ id: `h${i + 1}`, rank: i + 1 }));

test('n = 0 returns an empty layout', () => {
  assert.deepEqual(computeSceneLayout([]), []);
  assert.deepEqual(computeSceneLayout(undefined), []);
});

test('n = 1 sits at progress 0.5 on the first lane', () => {
  const [t] = computeSceneLayout(makeTrucks(1), { roadLength: 100 });
  assert.equal(t.progress, 0.5);
  assert.equal(t.lane, 0);
  // fraction = 0.05 + 0.5 * 0.83 = 0.465 -> x = (0.465 - 0.5) * 100
  assert.ok(Math.abs(t.x - -3.5) < 1e-9);
});

test('n = 2 puts rank 1 at the far end and rank 2 at the start of the range', () => {
  const [first, second] = computeSceneLayout(makeTrucks(2), { roadLength: 100 });
  assert.equal(first.progress, 1);
  assert.equal(second.progress, 0);
  assert.ok(Math.abs(first.x - 38) < 1e-9); // (0.88 - 0.5) * 100
  assert.ok(Math.abs(second.x - -45) < 1e-9); // (0.05 - 0.5) * 100
});

for (const n of [10, 20, 200]) {
  test(`n = ${n}: order is strictly monotonic by rank and stays on the road`, () => {
    const roadLength = getRoadLength(n);
    const layout = computeSceneLayout(makeTrucks(n), { roadLength });
    assert.equal(layout.length, n);
    for (let i = 1; i < n; i++) {
      assert.ok(layout[i].x < layout[i - 1].x, `rank ${i + 1} must be behind rank ${i}`);
      assert.ok(layout[i].progress < layout[i - 1].progress);
    }
    for (const t of layout) {
      assert.ok(Number.isFinite(t.x) && Number.isFinite(t.z));
      assert.ok(t.x >= -roadLength / 2 && t.x <= roadLength / 2);
      assert.ok(t.progress >= 0 && t.progress <= 1);
      assert.ok(t.lane >= 0 && t.lane < 4);
    }
  });
}

test('lanes alternate 0,2,1,3 and neighbours never share a lane', () => {
  const layout = computeSceneLayout(makeTrucks(9));
  assert.deepEqual(layout.map((t) => t.lane), [0, 2, 1, 3, 0, 2, 1, 3, 0]);
  for (let i = 1; i < layout.length; i++) assert.notEqual(layout[i].lane, layout[i - 1].lane);
});

test('z is centred on the road and lanes are laneWidth apart', () => {
  const layout = computeSceneLayout(makeTrucks(4), { laneWidth: 2 });
  const byLane = new Map(layout.map((t) => [t.lane, t.z]));
  assert.deepEqual([...byLane.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]), [-3, -1, 1, 3]);
});

test('trucks in the same lane keep a truck-length gap even with 200 trucks', () => {
  const n = 200;
  const layout = computeSceneLayout(makeTrucks(n), { roadLength: getRoadLength(n) });
  const lanes = new Map();
  for (const t of layout) {
    const prev = lanes.get(t.lane);
    if (prev !== undefined) assert.ok(prev - t.x >= 3.2, `gap ${prev - t.x} too small`); // truck length ~3
    lanes.set(t.lane, t.x);
  }
});

test('a selected hub outside the Top N still gets a position when included', () => {
  // RoadScene input is rank-sorted with the selected hub appended (rank 57 among 10 + 1).
  const trucks = [...makeTrucks(10), { id: 'selected', rank: 57 }];
  const layout = computeSceneLayout(trucks, { roadLength: getRoadLength(trucks.length) });
  const sel = layout.find((t) => t.id === 'selected');
  assert.ok(sel);
  assert.ok(Number.isFinite(sel.x) && Number.isFinite(sel.z));
  assert.equal(sel.progress, 0);
  assert.ok(sel.x < layout[9].x);
});

test('getRoadLength is clamped', () => {
  assert.equal(getRoadLength(0), MIN_ROAD_LENGTH);
  assert.equal(getRoadLength(5), MIN_ROAD_LENGTH);
  assert.equal(getRoadLength(50), 80);
  assert.equal(getRoadLength(100), 160);
  assert.equal(getRoadLength(5000), MAX_ROAD_LENGTH);
});

test('non-4 lane counts fall back to round-robin', () => {
  const layout = computeSceneLayout(makeTrucks(5), { laneCount: 3 });
  assert.deepEqual(layout.map((t) => t.lane), [0, 1, 2, 0, 1]);
});

const REGIONS = ['HNO', 'HCM', 'MB', 'MN', 'MT', 'DNB', 'TNB', 'XYZ'];
const withRegions = (n, regionOf) =>
  Array.from({ length: n }, (_, i) => ({ id: `h${i + 1}`, rank: i + 1, region: regionOf(i) }));

test('region lanes: one lane per region, most trucks first', () => {
  const trucks = withRegions(9, (i) => (i % 3 === 0 ? 'HNO' : i % 3 === 1 ? 'HCM' : 'MB'));
  trucks.push({ id: 'x', rank: 10, region: 'HCM' });
  const { lanes, laneOf } = assignRegionLanes(trucks);
  assert.deepEqual(lanes.map((l) => l.label), ['HCM', 'HNO', 'MB']);
  assert.equal(laneOf.get('x'), 0);
  assert.equal(laneOf.get('h1'), 1);
});

test('region lanes: exactly 6 regions use 6 lanes, no "Khác"', () => {
  const { lanes } = assignRegionLanes(withRegions(12, (i) => REGIONS[i % 6]));
  assert.equal(lanes.length, 6);
  assert.ok(!lanes.some((l) => l.label === 'Khác'));
});

test('region lanes: more than 6 regions are capped at 6 lanes with the rest in "Khác"', () => {
  const trucks = withRegions(16, (i) => REGIONS[i % 8]);
  const { lanes, laneOf } = assignRegionLanes(trucks);
  assert.equal(lanes.length, 6);
  assert.equal(lanes[5].label, 'Khác');
  const kept = new Set(lanes.slice(0, 5).map((l) => l.key));
  for (const t of trucks) {
    const lane = laneOf.get(t.id);
    assert.ok(lane >= 0 && lane < 6);
    if (!kept.has(t.region)) assert.equal(lane, 5);
  }
});

test('region lanes: trucks without a region go to "Khác"', () => {
  const trucks = [{ id: 'a', region: 'HNO' }, { id: 'b', region: '' }, { id: 'c' }];
  const { lanes, laneOf } = assignRegionLanes(trucks);
  assert.deepEqual(lanes.map((l) => l.label), ['HNO', 'Khác']);
  assert.equal(laneOf.get('b'), 1);
  assert.equal(laneOf.get('c'), 1);
});

test('region layout: z by region lane, rank order along x is unchanged', () => {
  const trucks = withRegions(20, (i) => REGIONS[i % 4]);
  const roadLength = getRegionRoadLength(trucks);
  const layout = computeSceneLayout(trucks, { roadLength, laneMode: 'region', laneWidth: 2 });
  for (let i = 1; i < layout.length; i++) assert.ok(layout[i].x < layout[i - 1].x);
  const zByRegion = new Map();
  layout.forEach((t, i) => {
    const prev = zByRegion.get(trucks[i].region);
    if (prev !== undefined) assert.equal(prev, t.z);
    zByRegion.set(trucks[i].region, t.z);
  });
  assert.equal(new Set(zByRegion.values()).size, 4);
  const zs = [...zByRegion.values()].sort((a, b) => a - b);
  assert.deepEqual(zs, [-3, -1, 1, 3]);
});

test('region layout: same-lane trucks never overlap when the road is long enough', () => {
  for (const [n, regionOf] of [
    [10, () => 'HNO'], // worst case: every truck in one lane
    [40, (i) => REGIONS[i % 3]],
    [60, (i) => REGIONS[Math.floor(i / 20)]]
  ]) {
    const trucks = withRegions(n, regionOf);
    const roadLength = getRegionRoadLength(trucks);
    assert.ok(roadLength <= MAX_REGION_ROAD_LENGTH);
    const layout = computeSceneLayout(trucks, { roadLength, laneMode: 'region' });
    const last = new Map();
    for (const t of layout) {
      if (last.has(t.lane)) assert.ok(last.get(t.lane) - t.x >= 3.4 - 1e-9, `n=${n} gap too small`);
      last.set(t.lane, t.x);
    }
  }
});

test('getRegionRoadLength: at least the staggered length, capped, and sane for n < 2', () => {
  assert.equal(getRegionRoadLength([]), MIN_ROAD_LENGTH);
  assert.equal(getRegionRoadLength([{ id: 'a', region: 'HNO' }]), MIN_ROAD_LENGTH);
  const many = withRegions(300, () => 'HNO');
  assert.equal(getRegionRoadLength(many), MAX_REGION_ROAD_LENGTH);
  const spread = withRegions(8, (i) => REGIONS[i % 4]);
  assert.ok(getRegionRoadLength(spread) >= getRoadLength(8));
});

test('region mode without regions on any truck still lays out (single "Khác" lane)', () => {
  const trucks = makeTrucks(5);
  const layout = computeSceneLayout(trucks, { roadLength: getRegionRoadLength(trucks), laneMode: 'region' });
  assert.ok(layout.every((t) => t.lane === 0 && t.z === 0));
});

// ---- Motion: replay + transition ----
// cohort ranks: D1 order is the array order; `d8Of(i)` is the cohort rank on D-8
const baseline = (n, d8Of) =>
  Array.from({ length: n }, (_, i) => {
    const d8 = d8Of(i);
    return { id: `h${i + 1}`, rank: i + 1, hasCommonBaseline: true, cohortRankD1: i + 1, cohortRankD8: d8, deltaRank: d8 - (i + 1) };
  });

test('replay: end positions equal the static layout', () => {
  const trucks = baseline(12, (i) => 12 - i);
  const opts = { roadLength: getRoadLength(12) };
  const layout = computeSceneLayout(trucks, opts);
  const frames = computeReplayFrames(trucks, opts);
  frames.forEach((f, i) => {
    assert.equal(f.id, trucks[i].id);
    assert.deepEqual(f.to, { x: layout[i].x, z: layout[i].z });
  });
});

test('replay: moved-up hubs drive forward, moved-down hubs drive back, same rank stays', () => {
  // D-8 order was the reverse of the D-1 order; the middle truck did not move
  const trucks = baseline(7, (i) => 7 - i);
  const frames = computeReplayFrames(trucks);
  trucks.forEach((t, i) => {
    const f = frames[i];
    if (t.deltaRank > 0) { assert.ok(f.to.x > f.from.x, `${t.id} should move forward`); assert.equal(f.dir, 1); }
    else if (t.deltaRank < 0) { assert.ok(f.to.x < f.from.x, `${t.id} should move back`); assert.equal(f.dir, -1); }
    else { assert.equal(f.to.x, f.from.x); assert.equal(f.dir, 0); }
  });
});

test('replay: start slots are a permutation when every hub has a baseline', () => {
  const trucks = baseline(20, (i) => ((i * 7) % 20) + 1); // a permutation of 1..20
  const frames = computeReplayFrames(trucks);
  assert.equal(new Set(frames.map((f) => f.from.x.toFixed(6))).size, 20);
});

test('replay: hubs without baseline are flagged new, start at the intake gate and fade in', () => {
  const trucks = [
    ...baseline(3, (i) => 3 - i),
    { id: 'new1', rank: 4, hasCommonBaseline: false, cohortRankD1: null, cohortRankD8: null, deltaRank: null }
  ];
  const frames = computeReplayFrames(trucks, { roadLength: 100 });
  const f = frames[3];
  assert.equal(f.isNew, true);
  assert.equal(f.dir, 0);
  assert.equal(f.alphaFrom, 0);
  assert.equal(f.alphaTo, 1);
  assert.ok(Math.abs(f.from.x - (START_GATE_FRACTION - 0.5) * 100) < 1e-9);
  assert.equal(f.from.z, f.to.z);
  assert.ok(frames.slice(0, 3).every((x) => !x.isNew && x.alphaFrom === 1));
});

test('replay: n = 0 / 1, no NaN, huge deltas stay on the road', () => {
  assert.deepEqual(computeReplayFrames([]), []);
  const [one] = computeReplayFrames([{ id: 'a', hasCommonBaseline: true, deltaRank: 5 }]);
  assert.ok(Number.isFinite(one.from.x) && Number.isFinite(one.to.x));
  const wild = baseline(10, (i) => i + 1 + 500 * (i % 2 ? 1 : -1));
  const length = getRoadLength(10);
  for (const f of computeReplayFrames(wild, { roadLength: length })) {
    for (const v of [f.from.x, f.from.z, f.to.x, f.to.z, f.alphaFrom, f.alphaTo]) assert.ok(Number.isFinite(v));
    assert.ok(Math.abs(f.from.x) <= length / 2);
  }
});

test('replay: region lanes keep each hub in its own lane', () => {
  const trucks = baseline(8, (i) => 8 - i).map((t, i) => ({ ...t, region: i % 2 ? 'HNO' : 'HCM' }));
  const frames = computeReplayFrames(trucks, { laneMode: 'region' });
  frames.forEach((f) => assert.equal(f.from.z, f.to.z));
});

test('transition: unchanged scene reports changed = false', () => {
  const prev = [{ id: 'a', x: 1, z: 0, meetsTarget: true }, { id: 'b', x: -1, z: 2, meetsTarget: false }];
  const { changed, items } = computeTransitionFrames(prev, prev.map((t) => ({ ...t })));
  assert.equal(changed, false);
  assert.equal(items.length, 2);
});

test('transition: moved, new and removed trucks', () => {
  const prev = [{ id: 'a', x: 1, z: 0, meetsTarget: true }, { id: 'gone', x: -3, z: 2, meetsTarget: false }];
  const next = [{ id: 'a', x: 5, z: 0, meetsTarget: true }, { id: 'fresh', x: 2, z: 1.8, meetsTarget: true }];
  const { changed, items } = computeTransitionFrames(prev, next);
  assert.equal(changed, true);
  const byId = new Map(items.map((i) => [i.id, i]));
  assert.deepEqual(byId.get('a').from, { x: 1, z: 0 });
  assert.deepEqual(byId.get('a').to, { x: 5, z: 0 });
  assert.equal(byId.get('fresh').alphaFrom, 0);
  assert.deepEqual(byId.get('fresh').from, byId.get('fresh').to);
  assert.equal(byId.get('gone').ghost, true);
  assert.equal(byId.get('gone').alphaTo, 0);
  assert.equal(items.filter((i) => !i.ghost).length, 2);
});

test('easing and interpolation are bounded and monotonic', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(-3), 0);
  assert.equal(easeInOutCubic(9), 1);
  let last = -1;
  for (let i = 0; i <= 20; i++) { const v = easeInOutCubic(i / 20); assert.ok(v >= last); last = v; }
  const frame = { from: { x: 0, z: 0 }, to: { x: 10, z: -4 }, alphaFrom: 0, alphaTo: 1 };
  assert.deepEqual(interpolateFrame(frame, 0), { x: 0, z: 0, alpha: 0 });
  assert.deepEqual(interpolateFrame(frame, 0.5), { x: 5, z: -2, alpha: 0.5 });
  assert.deepEqual(interpolateFrame(frame, 1), { x: 10, z: -4, alpha: 1 });
});
