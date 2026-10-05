import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const INSTANCING_THRESHOLD = 30; // > 30 trucks -> InstancedMesh
export const SHADOW_MAX_TRUCKS = 60; // shadows off above this

const CARGO = '#1e293b';
const DARK = '#0f172a';
const GHN_ORANGE = '#f15a22';

// Truck facing +x, ~3 long, ~1.3 wide. `color: 'status'` is tinted per truck
// (meets target / below target); `basic` parts are unlit so the theme token
// colour is shown as-is.
const TRUCK_PARTS = [
  { key: 'chassis', geo: 'box', args: [3.0, 0.15, 1.2], position: [0, 0.35, 0], color: DARK },
  { key: 'cargo', geo: 'box', args: [2.0, 1.1, 1.3], position: [-0.45, 1.0, 0], color: CARGO },
  { key: 'stripe', geo: 'box', args: [2.02, 0.18, 1.32], position: [-0.45, 0.9, 0], color: GHN_ORANGE },
  { key: 'cab', geo: 'box', args: [0.9, 0.85, 1.25], position: [1.0, 0.82, 0], color: '#e2e8f0' },
  { key: 'glass', geo: 'box', args: [0.06, 0.38, 1.0], position: [1.46, 1.0, 0], color: '#bae6fd' },
  { key: 'beacon', geo: 'box', args: [0.5, 0.08, 0.9], position: [1.0, 1.28, 0], color: 'status', basic: true },
  { key: 'lightL', geo: 'box', args: [0.06, 0.14, 0.22], position: [1.47, 0.55, 0.42], color: '#fef08a', basic: true },
  { key: 'lightR', geo: 'box', args: [0.06, 0.14, 0.22], position: [1.47, 0.55, -0.42], color: '#fef08a', basic: true },
  // 3 axles; a cylinder spans the body width so each reads as a wheel on both sides
  { key: 'axle1', geo: 'cyl', args: [0.3, 0.3, 1.4, 14], position: [-1.0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: DARK },
  { key: 'axle2', geo: 'cyl', args: [0.3, 0.3, 1.4, 14], position: [-0.2, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: DARK },
  { key: 'axle3', geo: 'cyl', args: [0.3, 0.3, 1.4, 14], position: [1.0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: DARK }
];

function PartGeometry({ part }) {
  return part.geo === 'cyl'
    ? <cylinderGeometry args={part.args} />
    : <boxGeometry args={part.args} />;
}

function PartMaterial({ part, statusColor }) {
  const color = part.color === 'status' ? statusColor : part.color;
  return part.basic
    ? <meshBasicMaterial color={color} />
    : <meshStandardMaterial color={color} roughness={0.7} metalness={0.1} />;
}

/** One truck as a plain group (<= INSTANCING_THRESHOLD trucks). */
function TruckModel({ x, z, statusColor, castShadow }) {
  return (
    <group position={[x, 0, z]}>
      {TRUCK_PARTS.map((part) => (
        <mesh key={part.key} position={part.position} rotation={part.rotation} castShadow={castShadow}>
          <PartGeometry part={part} />
          <PartMaterial part={part} statusColor={statusColor} />
        </mesh>
      ))}
    </group>
  );
}

const _matrix = new THREE.Matrix4();
const _partMatrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);
const _color = new THREE.Color();

/** One InstancedMesh per truck part; per-instance colour only for tinted parts. */
function InstancedTruckPart({ part, trucks, goodColor, badColor, castShadow }) {
  const ref = useRef(null);
  const invalidate = useThree((s) => s.invalidate);
  const tinted = part.color === 'status';

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    _euler.set(...(part.rotation || [0, 0, 0]));
    _quat.setFromEuler(_euler);
    _partMatrix.compose(new THREE.Vector3(...part.position), _quat, _scale);
    trucks.forEach((truck, i) => {
      _matrix.makeTranslation(truck.x, 0, truck.z).multiply(_partMatrix);
      mesh.setMatrixAt(i, _matrix);
      if (tinted) mesh.setColorAt(i, _color.set(truck.meetsTarget ? goodColor : badColor));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [part, trucks, tinted, goodColor, badColor, invalidate]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, trucks.length]} castShadow={castShadow} frustumCulled={false}>
      <PartGeometry part={part} />
      <PartMaterial part={part} statusColor="#ffffff" />
    </instancedMesh>
  );
}

/**
 * @param trucks Array<{id, x, z, meetsTarget}> (layout merged with Hub data)
 */
export function Trucks({ trucks, goodColor, badColor, castShadow }) {
  if (trucks.length > INSTANCING_THRESHOLD) {
    return (
      <group>
        {TRUCK_PARTS.map((part) => (
          <InstancedTruckPart
            // count is part of the key: an InstancedMesh cannot be resized in place
            key={`${part.key}-${trucks.length}`}
            part={part}
            trucks={trucks}
            goodColor={goodColor}
            badColor={badColor}
            castShadow={castShadow}
          />
        ))}
      </group>
    );
  }
  return (
    <group>
      {trucks.map((truck) => (
        <TruckModel
          key={truck.id}
          x={truck.x}
          z={truck.z}
          statusColor={truck.meetsTarget ? goodColor : badColor}
          castShadow={castShadow}
        />
      ))}
    </group>
  );
}

/** Asphalt, shoulders and dashed lane markings (dashes merged into one InstancedMesh). */
export function Road({ roadLength, laneCount, laneWidth, sceneBackground }) {
  const roadWidth = laneCount * laneWidth + 0.6;
  const dashRef = useRef(null);
  const invalidate = useThree((s) => s.invalidate);

  const dashes = useMemo(() => {
    const list = [];
    const step = 4;
    const count = Math.floor((roadLength + 6) / step);
    for (let boundary = 1; boundary < laneCount; boundary++) {
      const z = (boundary - laneCount / 2) * laneWidth;
      for (let i = 0; i < count; i++) list.push([-roadLength / 2 - 3 + step / 2 + i * step, z]);
    }
    return list;
  }, [roadLength, laneCount, laneWidth]);

  useLayoutEffect(() => {
    const mesh = dashRef.current;
    if (!mesh) return;
    dashes.forEach(([x, z], i) => {
      _matrix.makeTranslation(x, 0.012, z);
      mesh.setMatrixAt(i, _matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [dashes, invalidate]);

  const edgeZ = roadWidth / 2 + 0.25;
  return (
    <group>
      {/* unlit ground in the background colour: no visible horizon band */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[roadLength * 4 + 400, 600]} />
        <meshBasicMaterial color={sceneBackground} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roadLength + 6, roadWidth]} />
        <meshStandardMaterial color="#334155" roughness={0.95} />
      </mesh>
      {[edgeZ, -edgeZ].map((z) => (
        <mesh key={z} position={[0, 0.05, z]}>
          <boxGeometry args={[roadLength + 6, 0.1, 0.5]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      ))}
      <instancedMesh key={dashes.length} ref={dashRef} args={[undefined, undefined, dashes.length]} frustumCulled={false}>
        <boxGeometry args={[2, 0.01, 0.1]} />
        <meshBasicMaterial color="#cbd5e1" />
      </instancedMesh>
    </group>
  );
}

/** Operational checkpoint: a gantry over the road (its label is an HTML overlay, see sceneLabels). */
export function Checkpoint({ x, roadWidth, color, line = false }) {
  const half = roadWidth / 2 + 0.2;
  return (
    <group position={[x, 0, 0]}>
      {[half, -half].map((z) => (
        <mesh key={z} position={[0, 1.8, z]}>
          <boxGeometry args={[0.25, 3.6, 0.25]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[0.3, 0.3, half * 2 + 0.25]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {line && (
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.35, 0.02, roadWidth]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Projects 3D anchor points to screen space and moves matching DOM nodes.
 * Used instead of drei <Html>, which creates a React root per label and logs
 * "synchronously unmount a root" warnings under React 19.
 * @param labels Array<{key: string, position: [x, y, z]}>
 * @param elements MutableRefObject<Map<string, HTMLElement>> owned by the overlay
 */
export function LabelProjector({ labels, elements }) {
  const invalidate = useThree((s) => s.invalidate);
  const vec = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => { invalidate(); }, [labels, invalidate]);

  useFrame(({ camera, size }) => {
    for (const label of labels) {
      const el = elements.current.get(label.key);
      if (!el) continue;
      vec.set(...label.position).project(camera);
      if (vec.z > 1 || vec.z < -1) {
        el.style.visibility = 'hidden';
        continue;
      }
      // keep the label fully inside the canvas
      const half = el.offsetWidth / 2;
      const px = Math.min(Math.max((vec.x * 0.5 + 0.5) * size.width, half + 4), size.width - half - 4);
      const py = (-vec.y * 0.5 + 0.5) * size.height;
      el.style.visibility = 'visible';
      el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
    }
  });
  return null;
}
