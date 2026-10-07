// Rank layout remains in straight road coordinates (x = progress, z = lane).
// Rendering, picking and labels all use this same curved surface frame.
export function getRoadCurveRadius(roadLength) {
  return Math.max(48, roadLength * 1.35);
}

export function sampleRoadFrame(x, z, roadLength) {
  const radius = getRoadCurveRadius(roadLength);
  const angle = x / radius;
  const planetRadius = radius * 4.5;
  const heightAngle = x / planetRadius;
  return {
    x: (radius - z) * Math.sin(angle),
    y: planetRadius * (Math.cos(heightAngle) - 1),
    z: radius - (radius - z) * Math.cos(angle),
    heading: -angle,
    pitch: Math.atan2(-Math.sin(heightAngle), 1 - z / radius)
  };
}

// Inverse of yaw * pitch around a truck's road anchor. Used by O(n) box picking.
export function toRoadLocalVector(x, y, z, heading, pitch) {
  const cy = Math.cos(heading), sy = Math.sin(heading);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const along = cy * x - sy * z;
  return { x: cp * along + sp * y, y: -sp * along + cp * y, z: sy * x + cy * z };
}
