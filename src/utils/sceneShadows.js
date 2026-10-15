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

export function createRiderShadowGeometry() {
  const parts = [
    new THREE.BoxGeometry(0.65, 0.5, 0.48).translate(-0.72, 1.06, 0),
    new THREE.BoxGeometry(0.5, 0.7, 0.42).translate(0.03, 1.16, 0),
    new THREE.BoxGeometry(1.5, 0.3, 0.35).translate(0, 0.6, 0),
    new THREE.SphereGeometry(0.19, 8, 6).translate(-0.01, 1.55, 0),
    ...[-0.62, 0.75].map(x => new THREE.CylinderGeometry(0.31, 0.31, 0.1, 12).rotateX(Math.PI / 2).translate(x, 0.31, 0))
  ];
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return geometry;
}
