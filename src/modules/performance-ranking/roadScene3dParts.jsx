import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  REPLAY_ARROWS_MS,
  easeInOutCubic,
  interpolateFrame
} from '../../utils/rankingSceneLayout.js';

export const SHADOW_MAX_TRUCKS = 60; // shadows off above this

const CARGO = '#1e293b';
const DARK = '#0f172a';
const GHN_ORANGE = '#f15a22';
const ARROW_UP = '#34d399';
const ARROW_DOWN = '#f87171';

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

const HOVER_LIFT = 0.25;
const SELECT_LIFT = 0.12;
// A click only counts if the pointer did not travel (otherwise it was an orbit drag).
const CLICK_TRAVEL_PX = 4;

function liftFor(id, hoveredId, selectedId) {
  if (id === hoveredId) return HOVER_LIFT;
  if (id === selectedId) return SELECT_LIFT;
  return 0;
}

// Per-instance opacity: every truck-part geometry carries an `instanceAlpha`
// attribute (one shared Float32Array) that scales the fragment alpha. Needed to
// fade trucks in/out inside a single InstancedMesh.
function patchInstanceAlpha(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstanceAlpha;');
}
const alphaCacheKey = () => 'instanceAlpha';

const _matrix = new THREE.Matrix4();
const _partMatrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();
const _arrowColor = new THREE.Color();

/** One InstancedMesh for a truck part. Registers itself (mesh + material) with the fleet. */
function FleetPart({ part, index, count, alphaArray, register, items, castShadow, onHover, onSelect }) {
  const geometry = useMemo(() => {
    const g = part.geo === 'cyl' ? new THREE.CylinderGeometry(...part.args) : new THREE.BoxGeometry(...part.args);
    g.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(alphaArray, 1));
    return g;
  }, [part, alphaArray]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const idOf = (e) => {
    const item = e.instanceId == null ? null : items[e.instanceId];
    return item && !item.ghost ? item.id : null;
  };

  const materialProps = {
    ref: (m) => register(index, 'material', m),
    onBeforeCompile: patchInstanceAlpha,
    customProgramCacheKey: alphaCacheKey
  };
  const color = part.color === 'status' ? '#ffffff' : part.color;

  return (
    <instancedMesh
      ref={(m) => register(index, 'mesh', m)}
      args={[geometry, undefined, count]}
      castShadow={castShadow}
      frustumCulled={false}
      onPointerOver={(e) => { e.stopPropagation(); onHover(idOf(e)); }}
      onPointerMove={(e) => { e.stopPropagation(); onHover(idOf(e)); }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        if (e.delta > CLICK_TRAVEL_PX) return;
        e.stopPropagation();
        const id = idOf(e);
        if (id) onSelect(id);
      }}
    >
      {part.basic
        ? <meshBasicMaterial {...materialProps} color={color} />
        : <meshStandardMaterial {...materialProps} color={color} roughness={0.7} metalness={0.1} />}
    </instancedMesh>
  );
}

/**
 * All trucks as one InstancedMesh per part (a handful of draw calls for any count),
 * plus the animation loop for Replay and scene transitions.
 *
 * @param items Array<{id, x, z, meetsTarget, ghost?, from?, to?, alphaFrom?, alphaTo?, dir?}>
 *   Items with from/to are animated while `motion` is set; otherwise they sit at x/z.
 *   Remount (key) whenever items.length changes: an InstancedMesh cannot be resized.
 * @param motion null | {key, kind: 'replay' | 'transition', durationMs}
 * @param positionsRef MutableRefObject<Map<id, {x, z, lift}>> written every update (labels follow it)
 * @param onProgress (t: number | null) => void called per frame during a replay (t = 0..1)
 * @param onMotionEnd (key) => void when a motion has finished
 */
export function TruckFleet({
  items, motion, goodColor, badColor, castShadow, hoveredId, selectedId,
  onHover, onSelect, positionsRef, onProgress, onMotionEnd
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const count = items.length;
  const alphaArray = useMemo(() => new Float32Array(count).fill(1), [count]);
  const arrowGeometry = useMemo(() => new THREE.ConeGeometry(0.45, 0.9, 12), []);
  useEffect(() => () => arrowGeometry.dispose(), [arrowGeometry]);

  const meshes = useRef([]);
  const materials = useRef([]);
  const arrowMesh = useRef(null);
  const startRef = useRef(null);
  const endedKeyRef = useRef(null);

  const register = (index, kind, node) => {
    (kind === 'mesh' ? meshes : materials).current[index] = node;
  };

  const goodC = useMemo(() => new THREE.Color(goodColor), [goodColor]);
  const badC = useMemo(() => new THREE.Color(badColor), [badColor]);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.cursor = hoveredId ? 'pointer' : '';
    return () => { canvas.style.cursor = ''; };
  }, [gl, hoveredId]);

  // Writes every instance for time `now`; returns { t, active }.
  const write = (now) => {
    let t = 1;
    if (motion && startRef.current != null) t = Math.min(1, Math.max(0, (now - startRef.current) / motion.durationMs));
    const e = easeInOutCubic(t);
    const animated = Boolean(motion);
    let fading = false;
    const positions = positionsRef.current;
    positions.clear();

    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    const zs = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const item = items[i];
      let x = item.x;
      let z = item.z;
      let a = 1;
      if (animated && item.from) {
        const f = interpolateFrame(item, e);
        x = f.x; z = f.z; a = f.alpha;
      }
      const lift = item.ghost ? 0 : liftFor(item.id, hoveredId, selectedId);
      xs[i] = x; ys[i] = lift; zs[i] = z;
      alphaArray[i] = a;
      if (a < 0.999) fading = true;
      if (!item.ghost) positions.set(item.id, { x, z, lift });
    }

    TRUCK_PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      _euler.set(...(part.rotation || [0, 0, 0]));
      _quat.setFromEuler(_euler);
      _partMatrix.compose(_pos.set(...part.position), _quat, _scale);
      const tinted = part.color === 'status';
      for (let i = 0; i < count; i++) {
        _matrix.makeTranslation(xs[i], ys[i], zs[i]).multiply(_partMatrix);
        mesh.setMatrixAt(i, _matrix);
        if (tinted) mesh.setColorAt(i, items[i].meetsTarget ? goodC : badC);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const attribute = mesh.geometry.getAttribute('instanceAlpha');
      if (attribute) attribute.needsUpdate = true;
      const material = materials.current[p];
      if (material) material.transparent = fading;
    });

    // Rank arrows over the trucks that moved, during the last REPLAY_ARROWS_MS of a replay.
    const arrows = arrowMesh.current;
    if (arrows) {
      let shown = 0;
      const showArrows = motion && motion.kind === 'replay' && t < 1 && (1 - t) * motion.durationMs <= REPLAY_ARROWS_MS;
      if (showArrows) {
        const bob = Math.sin(now / 160) * 0.12;
        for (let i = 0; i < count; i++) {
          const item = items[i];
          if (!item.dir || item.ghost) continue;
          _euler.set(item.dir < 0 ? Math.PI : 0, 0, 0);
          _quat.setFromEuler(_euler);
          _matrix.compose(_pos.set(xs[i] + 0.3, 2.3 + bob + ys[i], zs[i]), _quat, _scale);
          arrows.setMatrixAt(shown, _matrix);
          arrows.setColorAt(shown, _arrowColor.set(item.dir > 0 ? ARROW_UP : ARROW_DOWN));
          shown++;
        }
      }
      arrows.count = shown;
      arrows.instanceMatrix.needsUpdate = true;
      if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
    }

    return { t, active: animated && t < 1 };
  };

  // Rest state, hover/selection lift, colours, data changes and the start of a motion.
  const motionKey = motion ? motion.key : null;
  useLayoutEffect(() => {
    startRef.current = motionKey == null ? null : performance.now();
    endedKeyRef.current = null;
    write(performance.now());
    invalidate();
    // write() closes over the props listed here; it is intentionally not a dependency itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, motionKey, goodC, badC, hoveredId, selectedId, invalidate]);

  useFrame(() => {
    if (!motion || startRef.current == null) return;
    const { t, active } = write(performance.now());
    if (motion.kind === 'replay' && onProgress) onProgress(t);
    if (active) {
      invalidate(); // keep rendering while animating (frameloop is on demand)
    } else if (endedKeyRef.current !== motion.key) {
      endedKeyRef.current = motion.key;
      if (onProgress) onProgress(null);
      if (onMotionEnd) onMotionEnd(motion.key);
    }
  });

  return (
    <group>
      {TRUCK_PARTS.map((part, index) => (
        <FleetPart
          key={part.key}
          part={part}
          index={index}
          count={count}
          alphaArray={alphaArray}
          register={register}
          items={items}
          castShadow={castShadow}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
      <instancedMesh ref={arrowMesh} args={[arrowGeometry, undefined, Math.max(1, count)]} frustumCulled={false}>
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
    </group>
  );
}

/** Flat highlight ring on the asphalt under the selected truck (same cyan as the 2D spotlight). */
export function SelectionRing({ id, x, z, positionsRef }) {
  const ref = useRef(null);
  useFrame(() => {
    const p = positionsRef.current.get(id);
    if (p && ref.current) ref.current.position.set(p.x, 0.04, p.z);
  });
  return (
    <mesh ref={ref} position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.62, 1]}>
      <ringGeometry args={[2.0, 2.25, 48]} />
      <meshBasicMaterial color="#38bdf8" />
    </mesh>
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

/** Operational checkpoint: a gantry over the road (its label is an HTML overlay, see LabelProjector). */
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

const LABEL_PADDING = 4;
const NEAR_RANGE_FACTOR = 2.5; // far-label cutoff = camera-to-target distance * this
const MIN_NEAR_RANGE = 30;

/**
 * Projects 3D anchor points to screen space and moves matching DOM nodes.
 * Used instead of drei <Html>, which creates a React root per label and logs
 * "synchronously unmount a root" warnings under React 19.
 *
 * Per frame: labels behind the camera are hidden; labels flagged `nearOnly` are
 * hidden when far from the camera; the rest are placed greedily by `priority`
 * and any label whose box overlaps one already placed is hidden.
 * A label with `followId` tracks that truck's animated position (positionsRef).
 *
 * @param labels Array<{key, position: [x, y, z], followId?, baseY?, anchor?: 'above' | 'center', priority?: number, nearOnly?: boolean}>
 * @param elements MutableRefObject<Map<string, HTMLElement>> owned by the overlay
 * @param positionsRef MutableRefObject<Map<id, {x, z, lift}>>
 */
export function LabelProjector({ labels, elements, positionsRef }) {
  const invalidate = useThree((s) => s.invalidate);
  const vec = useMemo(() => new THREE.Vector3(), []);
  const order = useMemo(() => [...labels].sort((a, b) => (b.priority || 0) - (a.priority || 0)), [labels]);

  useLayoutEffect(() => { invalidate(); }, [labels, invalidate]);

  useFrame(({ camera, size, controls }) => {
    const target = controls && controls.target;
    const nearRange = Math.max(MIN_NEAR_RANGE, (target ? camera.position.distanceTo(target) : 0) * NEAR_RANGE_FACTOR);

    // reads first (offsetWidth/Height), writes after, to avoid layout thrash
    const measured = [];
    for (const label of order) {
      const el = elements.current.get(label.key);
      if (!el) continue;
      const followed = label.followId ? positionsRef.current.get(label.followId) : null;
      if (followed) vec.set(followed.x, (label.baseY || 0) + followed.lift, followed.z);
      else vec.set(...label.position);
      const distance = camera.position.distanceTo(vec);
      vec.project(camera);
      measured.push({
        el,
        label,
        hidden: vec.z > 1 || vec.z < -1 || (label.nearOnly && distance > nearRange),
        ndcX: vec.x,
        ndcY: vec.y,
        w: el.offsetWidth,
        h: el.offsetHeight
      });
    }

    const placed = [];
    for (const m of measured) {
      if (m.hidden) {
        m.el.style.visibility = 'hidden';
        continue;
      }
      // keep the label fully inside the canvas
      const half = m.w / 2;
      const px = Math.min(Math.max((m.ndcX * 0.5 + 0.5) * size.width, half + LABEL_PADDING), size.width - half - LABEL_PADDING);
      const above = m.label.anchor !== 'center';
      const rawY = (-m.ndcY * 0.5 + 0.5) * size.height;
      const py = above ? Math.max(rawY, m.h + LABEL_PADDING) : Math.max(rawY, m.h / 2 + LABEL_PADDING);
      const top = above ? py - m.h : py - m.h / 2;
      const box = { l: px - half - LABEL_PADDING, r: px + half + LABEL_PADDING, t: top - LABEL_PADDING, b: top + m.h + LABEL_PADDING };
      const overlaps = placed.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
      if (overlaps) {
        m.el.style.visibility = 'hidden';
        continue;
      }
      placed.push(box);
      m.el.style.visibility = 'visible';
      m.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, ${above ? '-100%' : '-50%'})`;
    }
  });
  return null;
}
