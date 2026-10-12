// A bounded, unlabelled convoy bridges the two ends of the ranking road.
// These are scenery trucks, never synthetic Hub/KPI records or pick targets.
export const VIEW_TOUR_LENGTH = 112;
export const VIEW_TOUR_DURATION_MS = 3000;
export const VIEW_TOUR_REVEAL = 0.78;
export const viewOffset = (view, localLength) => (view === 'worst' ? -1 : 1) * (VIEW_TOUR_LENGTH + localLength) / 2;

const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const window = (p, start, end) => {
  const midpoint = (start + end) / 2;
  return p < midpoint ? smooth((p - start) / (midpoint - start)) : 1 - smooth((p - midpoint) / (end - midpoint));
};

// One continuous trip: leave the current cohort, pass close to the convoy,
// then open up and settle on the destination. Exact endpoint pose/FOV remain
// the rig's presets, even after an interrupted or reversed trip.
export function tourShot(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const convoy = window(p, 0.16, 0.76);
  return {
    stage: p < 0.16 ? 'depart' : p < 0.76 ? 'convoy' : 'arrive',
    distanceScale: 1 - convoy * 0.22,
    lift: window(p, 0, 0.24) * 1.2 - convoy * 0.8 + window(p, 0.7, 1) * 1.5,
    lookAhead: convoy * 2.5,
    fovOffset: convoy * 4
  };
}

export function createTourConvoy(sourceTrucks, maxCount = 50) {
  const source = sourceTrucks.filter(t => !t.ghost).slice(0, 20).map(t => ({ ...t, ghost: true }));
  const count = Math.min(26, Math.max(0, maxCount - source.length));
  const convoy = Array.from({ length: count }, (_, i) => ({
    id: `tour-scenery-${i}`, x: -47 + i * 3.6, z: -1.3,
    ghost: true, meetsTarget: false
  }));
  return [...source, ...convoy];
}

// CSS's strong on-screen movement curve: cubic-bezier(0.77, 0, 0.175, 1).
// Solve its time axis so camera and reveal use the same spatial progress.
export function tourProgress(time) {
  const t = Math.min(1, Math.max(0, time));
  if (t === 0 || t === 1) return t;
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const u = (lo + hi) / 2;
    const x = 3 * (1 - u) ** 2 * u * 0.77 + 3 * (1 - u) * u ** 2 * 0.175 + u ** 3;
    if (x < t) lo = u; else hi = u;
  }
  const u = (lo + hi) / 2;
  return 3 * (1 - u) * u ** 2 + u ** 3;
}
