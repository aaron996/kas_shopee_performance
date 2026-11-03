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

export function cinematicCameraGoal(frame, seconds, aspect = 1.8, contextScale = 1) {
  const { shot, progress } = cinematicBeat(seconds);
  let offset;
  if (shot.arc) {
    const angle = mix(shot.arc[0], shot.arc[1], progress) * Math.PI / 180;
    offset = [Math.sin(angle) * shot.arc[2], mix(...shot.height, progress), Math.cos(angle) * shot.arc[2]];
  } else offset = shot.from.map((value, i) => mix(value, shot.to[i], progress));
  // Portrait backs off instead of cropping the vehicle/label. No roll, shake
  // or animated FOV: this camera must remain comfortable on a dashboard.
  const distanceScale = Math.max(1, Math.min(2.8, 1.05 / Math.max(0.3, aspect))) * contextScale;
  const cy = Math.cos(frame.heading), sy = Math.sin(frame.heading);
  const cp = Math.cos(frame.pitch ?? 0), sp = Math.sin(frame.pitch ?? 0);
  const target = [frame.x, frame.y + 1, frame.z];
  const [along, up, across] = offset.map(value => value * distanceScale);
  return { target, position: [target[0] + cy * (cp * along - sp * up) + sy * across,
    target[1] + sp * along + cp * up, target[2] - sy * (cp * along - sp * up) + cy * across], fov: 52 };
}

export function cinematicPoliceSubject(police, positions) {
  if (!police?.targetId || police.alpha <= .1) return null;
  return positions.get(police.targetId)?.alpha >= .65 ? police.targetId : null;
}

// Keep the six moving shot directions, but frame the pair as one close scene.
// Fit both vehicle silhouettes and the walking officer to each moving view;
// portrait uses its narrower horizontal field of view to avoid cropping either.
export function cinematicInspectionGoal(vehicle, patrol, seconds, aspect = 1.8) {
  const frame = { ...vehicle, x: (vehicle.x + patrol.x) / 2,
    y: (vehicle.y + patrol.y) / 2, z: (vehicle.z + patrol.z) / 2 };
  const shot = cinematicCameraGoal(frame, seconds, aspect);
  const offset = shot.position.map((value, i) => value - shot.target[i]);
  const length = Math.hypot(...offset);
  const direction = offset.map(value => value / length);
  const rightLength = Math.hypot(direction[0], direction[2]);
  const right = [direction[2]/rightLength, 0, -direction[0]/rightLength];
  const up = [-direction[1]*right[2], direction[2]*right[0]-direction[0]*right[2], direction[1]*right[0]];
  const tanY = Math.tan(shot.fov * Math.PI / 360) * .85, tanX = tanY * aspect;
  const dot = (a,b) => a.reduce((sum,value,i)=>sum+value*b[i],0);
  let distance = 0;
  for (const actor of [vehicle, patrol]) {
    const cy = Math.cos(actor.heading), sy = Math.sin(actor.heading);
    const cp = Math.cos(actor.pitch ?? 0), sp = Math.sin(actor.pitch ?? 0);
    for (const x of [-1.8,1.8]) for (const y of [0,2.2]) for (const z of [-1.1,1.1]) {
      const point = [actor.x + cy*(cp*x-sp*y)+sy*z-shot.target[0],
        actor.y+sp*x+cp*y-shot.target[1], actor.z-sy*(cp*x-sp*y)+cy*z-shot.target[2]];
      const depth = dot(point,direction);
      distance = Math.max(distance, depth+.75, depth+Math.abs(dot(point,right))/tanX, depth+Math.abs(dot(point,up))/tanY);
    }
  }
  return { ...shot, position: offset.map((value, i) => shot.target[i] + value / length * distance) };
}

// Idle is a temporary override, never a mutation of the user's chosen camera.
export function resolveCameraMode({ chosen, fallback = 'tv', hasSelection, idle, dismissed, busy, touring, reducedMotion }) {
  if (touring) return 'tv';
  if (reducedMotion && chosen === 'cinematic') return fallback === 'cinematic' ? 'tv' : fallback;
  if (!busy && !reducedMotion && ((idle && !dismissed) || chosen === 'cinematic')) return 'cinematic';
  if (chosen === 'cinematic') return 'tv';
  return chosen === 'follow' && !hasSelection ? fallback : chosen;
}
