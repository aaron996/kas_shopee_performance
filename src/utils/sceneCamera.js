import { sampleRoadFrame } from './sceneRoadCurve.js';

// Frame the leading stretch from the side instead of fitting the entire fleet.
// Local road axes keep this view consistent even far along a long curved road.
export function tvCameraGoal(roadLength, roadWidth, aspect) {
  const span = Math.min(roadLength, Math.max(22, Math.min(40, aspect * 17 + 12)));
  const centreX = roadLength * 0.38 - span * (aspect < 1.1 ? 0.2 : 0.28);
  const frame = sampleRoadFrame(centreX, 0, roadLength);
  const distance = Math.max(16, roadWidth * 1.15 + 5, span * 0.45 / (Math.tan(29 * Math.PI / 180) * Math.max(0.75, aspect)));
  const elevation = 34 * Math.PI / 180, yaw = 28 * Math.PI / 180;
  const along = Math.sin(yaw) * Math.cos(elevation) * distance;
  const across = Math.cos(yaw) * Math.cos(elevation) * distance;
  const cy = Math.cos(frame.heading), sy = Math.sin(frame.heading);
  const target = [frame.x, frame.y + 0.6, frame.z];
  return {
    target,
    position: [target[0] + cy * along + sy * across, target[1] + Math.sin(elevation) * distance, target[2] - sy * along + cy * across],
    distance,
    fov: 58
  };
}
