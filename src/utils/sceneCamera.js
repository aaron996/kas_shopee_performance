import { sampleRoadFrame } from './sceneRoadCurve.js';

// A low, road-local view opens the horizon while keeping the leading stretch readable.
// Local road axes keep this view consistent even far along a long curved road.
export function tvCameraGoal(roadLength, roadWidth, aspect, { view = 'best', localLength = roadLength, offsetX = 0 } = {}) {
  const span = Math.min(localLength, Math.max(22, Math.min(40, aspect * 17 + 12)));
  const inset = span * (aspect < 1.1 ? 0.12 : 0.28);
  const centreX = offsetX + (view === 'worst' ? -localLength * 0.45 + inset : localLength * 0.38 - inset);
  const frame = sampleRoadFrame(centreX, 0, roadLength);
  const compact = Math.max(0, Math.min(1, (1.1 - aspect) / 0.5));
  const fov = 56 + compact * 4;
  const distance = Math.max(18, roadWidth * 1.25 + 6, span * 0.45 / (Math.tan(fov / 2 * Math.PI / 180) * Math.max(0.4, aspect)));
  const elevation = (23 + compact * 5) * Math.PI / 180, yaw = (42 - compact * 8) * Math.PI / 180;
  const along = Math.sin(yaw) * Math.cos(elevation) * distance * (view === 'worst' ? -1 : 1);
  const across = Math.cos(yaw) * Math.cos(elevation) * distance;
  const cy = Math.cos(frame.heading), sy = Math.sin(frame.heading);
  const target = [frame.x, frame.y + 0.6, frame.z];
  return {
    target,
    position: [target[0] + cy * along + sy * across, target[1] + Math.sin(elevation) * distance, target[2] - sy * along + cy * across],
    distance,
    roadX: centreX,
    fov
  };
}

// Establish the follow shot in the road's frame; once settled, the rig retains
// the user's orbit/zoom and translates with the truck instead of re-locking it.
export function followCameraGoal(frame, aspect = 1.8) {
  const cy = Math.cos(frame.heading), sy = Math.sin(frame.heading);
  const cp = Math.cos(frame.pitch), sp = Math.sin(frame.pitch);
  const point = (along, up, across) => [
    frame.x + cy * (cp * along - sp * up) + sy * across,
    frame.y + sp * along + cp * up,
    frame.z - sy * (cp * along - sp * up) + cy * across
  ];
  // Portrait has little horizontal field of view: keep the followed vehicle
  // inside the frame instead of spending its width on the road ahead.
  return { target: point(aspect < 1.1 ? 0.35 : 2.6, 0.85, 0), position: point(-3.8, 4.2, 8.5), fov: aspect < 1.1 ? 60 : 58 };
}
