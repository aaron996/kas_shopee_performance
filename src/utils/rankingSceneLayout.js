// Pure layout for the ranking road scene. No React / three imports so
// `node --test` can run it.
//
// Mirrors the 2D scene (RoadScene2D): trucks arrive sorted by rank, slot `idx`
// gets progress = 1 - idx/(n-1) (0.5 when n === 1), mapped into the
// [START_FRACTION, END_FRACTION] stretch of the road, and lanes alternate
// 0,2,1,3 so neighbours never share a lane. An optional 'region' lane mode
// groups trucks by region instead.

export const START_FRACTION = 0.05;
export const END_FRACTION = 0.88;
export const LANE_ORDER = [0, 2, 1, 3];
export const MIN_ROAD_LENGTH = 36;
export const MAX_ROAD_LENGTH = 320;
// Lanes alternate, so same-lane neighbours are 4 slots apart (>= ~5 units at this density).
export const LENGTH_PER_TRUCK = 1.6;

export const MAX_REGION_LANES = 6;
export const OTHER_REGION_LABEL = 'Khác';
export const MIN_TRUCK_GAP = 3.4; // a truck is ~3 long
export const MAX_REGION_ROAD_LENGTH = 640;
const OTHER_KEY = '__other__';

/** Road length (world units) that keeps trucks readable for `count` trucks. */
export function getRoadLength(count) {
  const n = Math.max(0, Number(count) || 0);
  return Math.min(MAX_ROAD_LENGTH, Math.max(MIN_ROAD_LENGTH, n * LENGTH_PER_TRUCK));
}

/**
 * Lanes by region: at most `maxLanes` lanes. Regions are ordered by number of
 * trucks (desc, then name). With more regions than lanes, the first
 * `maxLanes - 1` keep their own lane and everything else shares "Khác".
 * Trucks without a region also go to "Khác".
 * @returns {{lanes: Array<{key: string, label: string}>, laneOf: Map<string, number>}}
 */
export function assignRegionLanes(sceneTrucks, maxLanes = MAX_REGION_LANES) {
  const list = Array.isArray(sceneTrucks) ? sceneTrucks : [];
  const counts = new Map();
  for (const t of list) {
    const region = t.region ? String(t.region) : OTHER_KEY;
    counts.set(region, (counts.get(region) || 0) + 1);
  }
  const ordered = [...counts.entries()]
    .filter(([key]) => key !== OTHER_KEY)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
  const hasUnknown = counts.has(OTHER_KEY);

  const fitsWithoutOther = ordered.length + (hasUnknown ? 1 : 0) <= maxLanes;
  const named = fitsWithoutOther ? ordered : ordered.slice(0, maxLanes - 1);
  const needsOther = hasUnknown || named.length < ordered.length;
  const lanes = named.map((key) => ({ key, label: key }));
  if (needsOther) lanes.push({ key: OTHER_KEY, label: OTHER_REGION_LABEL });

  const indexByKey = new Map(lanes.map((lane, i) => [lane.key, i]));
  const laneOf = new Map();
  for (const t of list) {
    const key = t.region && indexByKey.has(String(t.region)) ? String(t.region) : OTHER_KEY;
    laneOf.set(t.id, indexByKey.get(key));
  }
  return { lanes, laneOf };
}

/**
 * Region lanes can put rank-adjacent trucks in the same lane, so the road has to
 * be long enough that same-lane neighbours do not overlap. Capped at
 * MAX_REGION_ROAD_LENGTH (beyond that trucks may overlap visually).
 */
export function getRegionRoadLength(sceneTrucks) {
  const list = Array.isArray(sceneTrucks) ? sceneTrucks : [];
  const n = list.length;
  const base = getRoadLength(n);
  if (n < 2) return base;
  const { laneOf } = assignRegionLanes(list);
  const lastIdx = new Map();
  let minIndexGap = Infinity;
  list.forEach((t, idx) => {
    const lane = laneOf.get(t.id);
    if (lastIdx.has(lane)) minIndexGap = Math.min(minIndexGap, idx - lastIdx.get(lane));
    lastIdx.set(lane, idx);
  });
  if (!Number.isFinite(minIndexGap)) return base;
  const perIndex = (END_FRACTION - START_FRACTION) / (n - 1);
  const needed = MIN_TRUCK_GAP / (minIndexGap * perIndex);
  return Math.min(MAX_REGION_ROAD_LENGTH, Math.max(base, needed));
}

function laneForIndex(idx, laneCount) {
  if (laneCount === LANE_ORDER.length) return LANE_ORDER[idx % laneCount];
  return idx % laneCount;
}

/**
 * @param {Array<{id: string, region?: string}>} sceneTrucks trucks sorted by rank (best first)
 * @param {{roadLength?: number, laneCount?: number, laneWidth?: number, laneMode?: 'stagger' | 'region'}} [opts]
 *   laneMode 'region' reads `region` from each truck (see assignRegionLanes) and
 *   ignores laneCount.
 * @returns {Array<{id: string, x: number, z: number, lane: number, progress: number}>}
 *   x runs along the road (rank 1 at the largest x), z across lanes. The road is
 *   centred on the origin and spans x in [-roadLength/2, roadLength/2].
 */
export function computeSceneLayout(sceneTrucks, { roadLength, laneCount = 4, laneWidth = 1.8, laneMode = 'stagger' } = {}) {
  const list = Array.isArray(sceneTrucks) ? sceneTrucks : [];
  const n = list.length;
  const regionMode = laneMode === 'region';
  const regionLanes = regionMode ? assignRegionLanes(list) : null;
  const length = roadLength ?? (regionMode ? getRegionRoadLength(list) : getRoadLength(n));
  const lanes = regionMode ? Math.max(1, regionLanes.lanes.length) : Math.max(1, Math.floor(laneCount));

  return list.map((truck, idx) => {
    const progress = n > 1 ? 1 - idx / (n - 1) : 0.5;
    const fraction = START_FRACTION + progress * (END_FRACTION - START_FRACTION);
    const lane = regionMode ? regionLanes.laneOf.get(truck.id) : laneForIndex(idx, lanes);
    return {
      id: truck.id,
      x: (fraction - 0.5) * length,
      z: (lane - (lanes - 1) / 2) * laneWidth,
      lane,
      progress
    };
  });
}
