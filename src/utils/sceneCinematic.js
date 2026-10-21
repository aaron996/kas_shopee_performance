// Adapted from the six promo shots; runtime pacing is deliberately slower.
// Offsets use the subject's road frame: [along, up, across]. Stay on one
// side of the road so every shot preserves the convoy's screen direction.
export const CINEMATIC_SHOT_SECONDS = 14;
export const CINEMATIC_BLEND_SECONDS = 3;
export const CINEMATIC_SHOTS = [
  { id: 'tracking', label: 'Bám thấp', from: [-8, 3.4, 10], to: [-3, 4.2, 11] },
  { id: 'lateral', label: 'Lia ngang', from: [-7, 5.5, 14], to: [6, 5, 14] },
  { id: 'crane', label: 'Hạ từ cao', from: [-6, 23, 19], to: [-4, 6, 14] },
  { id: 'aerial', label: 'Bay vòng rộng', arc: [-38, 32, 27], height: [18, 14] },
  { id: 'hero', label: 'Vòng quanh xe', arc: [32, -38, 14], height: [5, 6] },
  { id: 'reveal', label: 'Kéo xa, nâng cao', from: [2, 5, 12], to: [12, 26, 32] }
];
const mix = (a, b, t) => a + (b - a) * t;

export function cinematicBeat(seconds) {
  const time = Math.max(0, seconds);
  const index = Math.floor(time / CINEMATIC_SHOT_SECONDS);
  return { index, shot: CINEMATIC_SHOTS[index % CINEMATIC_SHOTS.length],
    progress: (time % CINEMATIC_SHOT_SECONDS) / CINEMATIC_SHOT_SECONDS };
}

export function cinematicCameraGoal(frame, seconds, aspect = 1.8) {
  const { shot, progress } = cinematicBeat(seconds);
  let offset;
  if (shot.arc) {
    const angle = mix(shot.arc[0], shot.arc[1], progress) * Math.PI / 180;
    offset = [Math.sin(angle) * shot.arc[2], mix(...shot.height, progress), Math.cos(angle) * shot.arc[2]];
  } else offset = shot.from.map((value, i) => mix(value, shot.to[i], progress));
  // Portrait backs off instead of cropping the vehicle/label. No roll, shake
  // or animated FOV: this camera must remain comfortable on a dashboard.
  const distanceScale = Math.max(1, Math.min(2.8, 1.05 / Math.max(0.3, aspect)));
  const cy = Math.cos(frame.heading), sy = Math.sin(frame.heading);
  const cp = Math.cos(frame.pitch ?? 0), sp = Math.sin(frame.pitch ?? 0);
  const target = [frame.x, frame.y + 1, frame.z];
  const [along, up, across] = offset.map(value => value * distanceScale);
  return { target, position: [target[0] + cy * (cp * along - sp * up) + sy * across,
    target[1] + sp * along + cp * up, target[2] - sy * (cp * along - sp * up) + cy * across], fov: 52 };
}

// Idle is a temporary override, never a mutation of the user's chosen camera.
export function resolveCameraMode({ chosen, fallback = 'tv', hasSelection, idle, dismissed, busy, touring, reducedMotion }) {
  if (touring) return 'tv';
  if (reducedMotion && chosen === 'cinematic') return fallback === 'cinematic' ? 'tv' : fallback;
  if (!busy && !reducedMotion && ((idle && !dismissed) || chosen === 'cinematic')) return 'cinematic';
  if (chosen === 'cinematic') return 'tv';
  return chosen === 'follow' && !hasSelection ? fallback : chosen;
}
