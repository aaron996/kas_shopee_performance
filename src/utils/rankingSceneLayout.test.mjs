import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSceneLayout,
  getRoadLength,
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
