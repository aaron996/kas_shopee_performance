// A bounded, unlabelled convoy bridges the two ends of the ranking road.
// These are scenery trucks, never synthetic Hub/KPI records or pick targets.
export const VIEW_TOUR_LENGTH = 112;
export const VIEW_TOUR_DURATION_MS = 3000;
export const VIEW_TOUR_REVEAL = 0.78;
export const viewOffset = (view, localLength) => (view === 'worst' ? -1 : 1) * (VIEW_TOUR_LENGTH + localLength) / 2;

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
