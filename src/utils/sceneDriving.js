import { easeInOutCubic, interpolateFrame } from './rankingSceneLayout.js';

export const CRUISE_SPEED = 2.4; // world units / second; independent of KPI
export const DEFAULT_DRIVE_RATE = 2;
export const MIN_DRIVE_RATE = 0.25;
export const MAX_DRIVE_RATE = 4;
export const WHEEL_RADIUS = 0.3;
export const ROADSIDE_BUFFER = 12;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Visual strain in the Worst cohort, independent of KPI magnitude. W1 is
// always the roughest ride; stable Hub phases avoid synchronized bouncing.
export function worstRideStrength(order) {
  return Number.isInteger(order) && order > 0 ? 0.18 + 0.82 / Math.sqrt(order) : 0;
}

export function truckRidePhase(id) {
  let hash = 2166136261;
  for (const char of String(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 * Math.PI * 2;
}

export function sampleWorstRide(time, strength, phase = 0, reducedMotion = false) {
  const s = reducedMotion ? 0 : clamp01(strength);
  if (!s) return { bounce: 0, pitch: 0, roll: 0, yaw: 0 };
  const beat = time * 4.8 + phase;
  const jolt = Math.max(0, Math.sin(beat * 1.7)) ** 8;
  return {
    bounce: s * (0.11 * jolt + 0.018 * (1 + Math.sin(beat * 2.7))),
    pitch: s * (0.055 * Math.sin(beat * 1.7 + 0.3) + 0.028 * jolt),
    roll: s * 0.085 * (0.75 * Math.sin(beat) + 0.25 * Math.sin(beat * 2.3)),
    yaw: s * 0.022 * Math.sin(beat * 0.9)
  };
}

// W1 loses traction: its heading intentionally differs from its lateral path.
// Rank anchors stay fixed; only the vehicle and its tyre smoke use this pose.
export function sampleWorstSkid(time, order, phase = 0, reducedMotion = false) {
  if (order !== 1 || reducedMotion) return { lateral: 0, yaw: 0, smoke: 0, spinExtra: 0 };
  const beat = time * 2.6 + phase;
  const yaw = -0.32 * Math.cos(beat) + 0.09 * Math.sin(beat * 1.9);
  return {
    lateral: 0.82 * Math.sin(beat) + 0.24 * Math.sin(beat * 1.9 + 0.5),
    yaw,
    smoke: 0.45 + 0.55 * Math.abs(yaw) / 0.41,
    spinExtra: time * 1.8
  };
}

// Bias an outer-lane skid towards the road centre and retain clearance for
// the truck's rotated corners, including a single regional lane.
export function skidRoadZ(anchorZ, lateral, roadWidth) {
  const limit = Math.max(0, roadWidth / 2 - 1.3);
  const centre = Math.max(-limit, Math.min(limit, anchorZ - Math.sign(anchorZ) * 0.65));
  const room = Math.min(1.06, Math.max(0, limit - Math.abs(centre)));
  return centre + lateral / 1.06 * room;
}

// Only the destination KPI's winner gets the surge, and only while advancing.
// The same simulation clock makes the emphasis pause and interrupt with the fleet.
export function leaderSurge(item, t) {
  if (item.ghost || (item.item?.rank ?? item.rank) !== 1 || !item.from || item.to.x <= item.from.x || t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t);
}

// Every environmental layer uses the same travelled distance. Different loop
// lengths affect only where a prop recycles, never its speed relative to tyres.
export function wrapRoadTravel(x, distance, minX, span) {
  return minX + ((x - minX - distance % span) % span + span) % span;
}

// The lateral move starts after acceleration and finishes before settling.
// Rank endpoints and alpha remain exactly the existing layout contract.
export function sampleDrivePose(item, t) {
  if (!item.from) return { x: item.x, z: item.z, alpha: 1 };
  const pose = interpolateFrame(item, easeInOutCubic(t));
  if (leaderSurge(item, t) > 0) {
    pose.x = item.from.x + (item.to.x - item.from.x) * easeInOutCubic(clamp01(t / 0.85));
  }
  pose.z = item.from.z + (item.to.z - item.from.z) * easeInOutCubic(clamp01((t - 0.15) / 0.7));
  // Become visible at the rear, then drive forward. Departures remain readable
  // until they have fallen behind, rather than fading in their old rank slot.
  const fade = item.phase === 'enter' ? clamp01(t / 0.22) : item.phase === 'exit' ? clamp01((t - 0.68) / 0.32) : null;
  if (fade !== null) pose.alpha = item.alphaFrom + (item.alphaTo - item.alphaFrom) * easeInOutCubic(fade);
  return pose;
}

export function createDriveClock() {
  return { time: 0, distance: 0, motionElapsed: 0, step: 0, speed: CRUISE_SPEED };
}

// The common forward travel is at least the largest backwards rank move in
// this frame plus cruise travel. Hence even a falling Hub drives forward in
// road coordinates. Exact displacements avoid drift on long roads / low FPS.
export function advanceDriveClock(clock, items, motion, delta, running, playbackRate = 1) {
  clock.step = 0;
  if (!running) return;
  // Clamp wall time before scaling simulation time, so higher rates do not
  // get capped back to 1x at 20fps. Changing rate never resets the clock.
  const rate = Number.isFinite(playbackRate) ? Math.min(MAX_DRIVE_RATE, Math.max(MIN_DRIVE_RATE, playbackRate)) : DEFAULT_DRIVE_RATE;
  const step = Math.min(Math.max(delta, 0), 0.05) * rate;
  if (!step) return;
  let backwards = 0;
  if (motion) {
    const fromT = clamp01(clock.motionElapsed / motion.durationMs);
    const toT = clamp01((clock.motionElapsed + step * 1000) / motion.durationMs);
    const change = easeInOutCubic(toT) - easeInOutCubic(fromT);
    for (const item of items) {
      if (item.from) backwards = Math.max(backwards, (item.from.x - item.to.x) * change);
    }
    clock.motionElapsed += step * 1000;
  }
  const travel = CRUISE_SPEED * step + backwards;
  clock.time += step;
  clock.distance += travel;
  clock.speed = travel / step;
  clock.step = step;
}

export function driveHeading(item, t, durationMs, roadSpeed) {
  if (!item.from || t <= 0 || t >= 1) return 0;
  const epsilon = 0.001;
  const lo = Math.max(0, t - epsilon);
  const hi = Math.min(1, t + epsilon);
  const before = sampleDrivePose(item, lo);
  const after = sampleDrivePose(item, hi);
  const seconds = (hi - lo) * durationMs / 1000;
  const forward = Math.max(CRUISE_SPEED, roadSpeed + (after.x - before.x) / seconds);
  // +z is a clockwise turn when travelling +x in Three's coordinate system.
  return Math.max(-0.18, Math.min(0.18, -Math.atan2((after.z - before.z) / seconds, forward)));
}
