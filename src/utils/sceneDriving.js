import { easeInOutCubic, interpolateFrame } from './rankingSceneLayout.js';

export const CRUISE_SPEED = 2.4; // world units / second; independent of KPI
export const DEFAULT_DRIVE_RATE = 2;
export const MIN_DRIVE_RATE = 0.25;
export const MAX_DRIVE_RATE = 4;
export const WHEEL_RADIUS = 0.3;
export const ROADSIDE_BUFFER = 12; // wrap beyond the asphalt, away from rank slots
const ROADSIDE_FADE = 6;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Every environmental layer uses the same travelled distance. Different loop
// lengths affect only where a prop recycles, never its speed relative to tyres.
export function wrapRoadTravel(x, distance, minX, span) {
  return minX + ((x - minX - distance % span) % span + span) % span;
}

export function roadsideAlpha(x, roadLength) {
  return clamp01((roadLength / 2 + ROADSIDE_BUFFER - Math.abs(x)) / ROADSIDE_FADE);
}

// The lateral move starts after acceleration and finishes before settling.
// Rank endpoints and alpha remain exactly the existing layout contract.
export function sampleDrivePose(item, t) {
  if (!item.from) return { x: item.x, z: item.z, alpha: 1 };
  const pose = interpolateFrame(item, easeInOutCubic(t));
  pose.z = item.from.z + (item.to.z - item.from.z) * easeInOutCubic(clamp01((t - 0.15) / 0.7));
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
      if (item.from && !item.ghost) backwards = Math.max(backwards, (item.from.x - item.to.x) * change);
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
