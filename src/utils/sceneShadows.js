import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Match the GHN model's cargo box, cab and chassis. Wheel tread, mirrors and
// paint do not need a second detailed render just to produce a road shadow.
export function createTruckShadowGeometry() {
  const boxes = [
    { size: [1.95, 1.24, 1.34], center: [-0.525, 0.94, 0] },
    { size: [1.05, 0.98, 1.18], center: [0.975, 0.74, 0] },
    { size: [2.8, 0.28, 1.1], center: [0, 0.22, 0] }
  ].map(({ size, center }) => new THREE.BoxGeometry(...size).translate(...center));
  const geometry = mergeGeometries(boxes);
  boxes.forEach(box => box.dispose());
  return geometry;
}

export function shouldRefreshSceneShadow({ enabled, moving, changed }) {
  // Moving casters must never reuse a shadow from an earlier simulation pose.
  // Demand rendering still permits a paused, unchanged scene to reuse its map.
  return Boolean(enabled && (moving || changed));
}
