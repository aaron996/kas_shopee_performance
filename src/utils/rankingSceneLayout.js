// Pure layout for the ranking road scene. No React / three imports so
// `node --test` can run it.
//
// Mirrors the 2D scene (RoadScene2D): trucks arrive sorted by rank, slot `idx`
// gets progress = 1 - idx/(n-1) (0.5 when n === 1), mapped into the
// [START_FRACTION, END_FRACTION] stretch of the road, and lanes alternate
// 0,2,1,3 so neighbours never share a lane.

export const START_FRACTION = 0.05;
export const END_FRACTION = 0.88;
export const LANE_ORDER = [0, 2, 1, 3];
export const MIN_ROAD_LENGTH = 36;
export const MAX_ROAD_LENGTH = 320;
// Lanes alternate, so same-lane neighbours are 4 slots apart (>= ~5 units at this density).
export const LENGTH_PER_TRUCK = 1.6;

/** Road length (world units) that keeps trucks readable for `count` trucks. */
export function getRoadLength(count) {
  const n = Math.max(0, Number(count) || 0);
  return Math.min(MAX_ROAD_LENGTH, Math.max(MIN_ROAD_LENGTH, n * LENGTH_PER_TRUCK));
}

function laneForIndex(idx, laneCount) {
  if (laneCount === LANE_ORDER.length) return LANE_ORDER[idx % laneCount];
  return idx % laneCount;
}

/**
 * @param {Array<{id: string}>} sceneTrucks trucks sorted by rank (best first)
 * @param {{roadLength?: number, laneCount?: number, laneWidth?: number}} [opts]
 * @returns {Array<{id: string, x: number, z: number, lane: number, progress: number}>}
 *   x runs along the road (rank 1 at the largest x), z across lanes. The road is
 *   centred on the origin and spans x in [-roadLength/2, roadLength/2].
 */
export function computeSceneLayout(sceneTrucks, { roadLength, laneCount = 4, laneWidth = 1.8 } = {}) {
  const list = Array.isArray(sceneTrucks) ? sceneTrucks : [];
  const n = list.length;
  const length = roadLength ?? getRoadLength(n);
  const lanes = Math.max(1, Math.floor(laneCount));

  return list.map((truck, idx) => {
    const progress = n > 1 ? 1 - idx / (n - 1) : 0.5;
    const fraction = START_FRACTION + progress * (END_FRACTION - START_FRACTION);
    const lane = laneForIndex(idx, lanes);
    return {
      id: truck.id,
      x: (fraction - 0.5) * length,
      z: (lane - (lanes - 1) / 2) * laneWidth,
      lane,
      progress
    };
  });
}
