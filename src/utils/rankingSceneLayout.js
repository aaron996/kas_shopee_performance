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
export const START_GATE_FRACTION = 0.015; // intake gate, just before the first truck slot (0.05)
export const SLA_FRACTION = 0.93; // SLA gate just past the last truck slot (0.88)
export const LANE_ORDER = [0, 2, 1, 3];
export const MIN_ROAD_LENGTH = 36;
export const MAX_ROAD_LENGTH = 1400; // ~1,200 Hubs without same-lane overlap (D-1 has ~1,170 Hubs)
// Lanes alternate, so same-lane neighbours are 4 slots apart (>= ~5 units at this density).
export const LENGTH_PER_TRUCK = 1.6;

export const MAX_REGION_LANES = 6;
export const OTHER_REGION_LABEL = 'Khác';
export const MIN_TRUCK_GAP = 3.4; // a truck is ~3 long
export const MAX_REGION_ROAD_LENGTH = 2400;
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
export function computeSceneLayout(sceneTrucks, { roadLength, laneCount = 4, laneWidth = 1.8, laneMode = 'stagger', leaderGap = 0, view = 'best', offsetX = 0 } = {}) {
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
    // Reserve a visible lead without extending the road or changing the rank order.
    const frontX = (END_FRACTION - 0.5) * length;
    const rearX = (START_FRACTION - 0.5) * length;
    const gap = Math.min(Math.max(0, leaderGap), (frontX - rearX) / 2);
    const bestX = gap > 0 && n > 1
      ? idx === 0 ? frontX : n === 2 ? frontX - gap : frontX - gap - (idx - 1) / (n - 2) * (frontX - gap - rearX)
      : (fraction - 0.5) * length;
    // Reflect inside the same occupied road stretch: Worst #1 trails the pack
    // with the same isolated gap as Best #1 leads it. Trucks still face +X.
    const x = (view === 'worst' ? frontX + rearX - bestX : bestX) + offsetX;
    return {
      id: truck.id,
      x,
      z: (lane - (lanes - 1) / 2) * laneWidth,
      lane,
      progress
    };
  });
}

// ---------------------------------------------------------------------------
// Motion: Replay D-8 -> D-1 and scene transitions. Pure, so it can be tested.
// ---------------------------------------------------------------------------

export const REPLAY_DURATION_MS = 3000;
export const TRANSITION_DURATION_MS = 3200; // 1.6s at the default 2x playback rate
export const REPLAY_ARROWS_MS = 2000; // arrows over moving trucks during the last N ms of a replay

export function easeInOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Position/opacity of a motion item at eased progress `e` (0..1). */
export function interpolateFrame(frame, e) {
  return {
    x: frame.from.x + (frame.to.x - frame.from.x) * e,
    z: frame.from.z + (frame.to.z - frame.from.z) * e,
    alpha: frame.alphaFrom + (frame.alphaTo - frame.alphaFrom) * e
  };
}

/**
 * Replay D-8 -> D-1.
 *
 * End positions are exactly the static layout. A Hub with a common D-8/D-1
 * baseline (`hasCommonBaseline === true`) starts where its D-8 cohort rank would
 * have put it: its slot shifted back by `deltaRank` (= cohortRankD8 - cohortRankD1;
 * > 0 moved up, < 0 moved down), clamped to the visible slots, with duplicate
 * start slots nudged to the nearest free one. Hubs without a baseline ("Mới") start
 * at the intake gate, fully transparent, and fade in while driving to their slot.
 *
 * Replay uses `cohortRank` (rank inside the common D-8/D-1 cohort, as the table's
 * "Δ Hạng" column does), not the overall `rank`.
 *
 * @param sceneTrucks rank-sorted trucks with hasCommonBaseline / deltaRank
 * @param opts same options as computeSceneLayout
 * @returns Array<{id, from: {x, z}, to: {x, z}, isNew: boolean, dir: -1 | 0 | 1, alphaFrom: number, alphaTo: number}>
 */
export function computeReplayFrames(sceneTrucks, opts = {}) {
  const list = Array.isArray(sceneTrucks) ? sceneTrucks : [];
  const n = list.length;
  if (n === 0) return [];
  const layout = computeSceneLayout(list, opts);
  const regionMode = opts.laneMode === 'region';
  const length = opts.roadLength ?? (regionMode ? getRegionRoadLength(list) : getRoadLength(n));
  const intakeX = (START_GATE_FRACTION - 0.5) * length + (opts.offsetX || 0);

  const hasBaseline = (t) => t.hasCommonBaseline === true && Number.isFinite(t.deltaRank);
  const wanted = [];
  list.forEach((t, i) => {
    if (hasBaseline(t)) wanted.push({ i, slot: Math.min(n - 1, Math.max(0, i + t.deltaRank * (opts.view === 'worst' ? -1 : 1))) });
  });

  // unique start slots: closest free slot to the wanted one, ties resolved towards the back
  wanted.sort((a, b) => a.slot - b.slot || a.i - b.i);
  const taken = new Array(n).fill(false);
  const startSlot = new Map();
  for (const w of wanted) {
    let chosen = -1;
    for (let d = 0; d < n && chosen < 0; d++) {
      if (w.slot + d < n && !taken[w.slot + d]) chosen = w.slot + d;
      else if (w.slot - d >= 0 && !taken[w.slot - d]) chosen = w.slot - d;
    }
    taken[chosen] = true;
    startSlot.set(w.i, chosen);
  }

  return list.map((t, i) => {
    const to = { x: layout[i].x, z: layout[i].z };
    if (!hasBaseline(t)) {
      return { id: t.id, from: { x: intakeX, z: to.z }, to, isNew: true, dir: 0, alphaFrom: 0, alphaTo: 1 };
    }
    const slot = layout[startSlot.get(i)];
    const from = { x: slot.x, z: regionMode ? to.z : slot.z };
    return { id: t.id, from, to, isNew: false, dir: Math.sign(t.deltaRank), alphaFrom: 1, alphaTo: 1 };
  });
}

/**
 * Transition between two scene states (KPI / filter / lane-mode change).
 * Trucks present in both slide from their old to their new position; new ones
 * drive in from behind the pack; removed ones retreat behind it (returned as
 * `ghost` items so the scene can keep drawing them until the transition ends).
 *
 * @param prevTrucks Array<{id, x, z, meetsTarget}> last rendered trucks
 * @param nextTrucks Array<{id, x, z, meetsTarget}> new trucks
 * @returns {{changed: boolean, items: Array<{id, x, z, meetsTarget, ghost: boolean, from, to, alphaFrom, alphaTo, dir}>}}
 */
export function computeTransitionFrames(prevTrucks, nextTrucks, { maxCount = Infinity } = {}) {
  const prev = new Map((prevTrucks || []).map((t) => [t.id, t]));
  const next = Array.isArray(nextTrucks) ? nextTrucks : [];
  const nextIds = new Set(next.map((t) => t.id));
  const rearX = Math.min(...next.map(t => t.x), ...[...prev.values()].filter(t => !t.ghost).map(t => t.to?.x ?? t.x), 0) - 6;
  const incomingByLane = new Map();
  const outgoingByLane = new Map();
  let changed = false;

  const items = next.map((t) => {
    const before = prev.get(t.id);
    const to = { x: t.x, z: t.z };
    if (!before) {
      changed = true;
      const queued = incomingByLane.get(to.z) || 0;
      incomingByLane.set(to.z, queued + 1);
      return { ...t, ghost: false, phase: 'enter', from: { x: rearX - queued * MIN_TRUCK_GAP, z: to.z }, to, alphaFrom: 0, alphaTo: 1, dir: 1 };
    }
    const alphaFrom = before.alpha ?? 1;
    if (before.x !== t.x || before.z !== t.z || alphaFrom !== 1) changed = true;
    return { ...t, ghost: false, phase: alphaFrom < 1 ? 'enter' : 'move', from: { x: before.x, z: before.z }, to, alphaFrom, alphaTo: 1, dir: Math.sign(to.x - before.x) };
  });

  for (const before of [...prev.values()].sort((a, b) => b.x - a.x)) {
    if (items.length >= maxCount) break;
    if (nextIds.has(before.id)) continue;
    changed = true;
    if (before.alpha === 0) continue;
    const from = { x: before.x, z: before.z };
    // An interrupted exit retains its original destination instead of drifting
    // another six units backwards on each rapid KPI change.
    const queued = outgoingByLane.get(before.z) || 0;
    outgoingByLane.set(before.z, queued + 1);
    const to = { x: before.ghost && before.to ? before.to.x : rearX - queued * MIN_TRUCK_GAP, z: before.z };
    items.push({ ...before, ghost: true, phase: 'exit', from, to, alphaFrom: before.alpha ?? 1, alphaTo: 0, dir: -1 });
  }
  return { changed, items };
}

/** Snapshot the actual fleet, including departing trucks, for an interrupted change. */
export function snapshotSceneFleet(items, positions) {
  return items.map(truck => {
    const pose = positions.get(truck.id);
    return pose ? { ...truck, x: pose.roadX, z: pose.roadZ, alpha: pose.alpha } : truck;
  });
}
