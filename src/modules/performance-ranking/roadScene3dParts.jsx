import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { drawLabel, drawReplayChip, layoutLabel } from './labelOverlay.js';
import { computeRoadside } from '../../utils/sceneThemes.js';
import {
  REPLAY_ARROWS_MS,
} from '../../utils/rankingSceneLayout.js';
import {
  advanceDriveClock, driveHeading, sampleDrivePose, WHEEL_RADIUS,
  wrapRoadTravel, roadsideAlpha, ROADSIDE_BUFFER
} from '../../utils/sceneDriving.js';

export const SHADOW_MAX_TRUCKS = 60; // shadows off above this

const CARGO = '#2d3b50'; // lighter than the old slate-800 so cargo separates from the dark ground
const DARK = '#0f172a';
const GHN_ORANGE = '#f15a22';
const ARROW_UP = '#34d399';
const ARROW_DOWN = '#f87171';
// Roof badges for ranks 1-3 (same hues as the 2D DeliveryTruckIcon crown; silver is lighter for contrast).
const BADGE_COLORS = ['#f5b800', '#b8c4d0', '#a0522d'];
const LOGO_URL = '/ghn-icon.svg';

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
  // GHN mark on both cargo sides (texture drawn once from /ghn-icon.svg)
  { key: 'logoL', geo: 'plane', args: [0.6, 0.6], position: [-0.7, 1.22, 0.655], color: '#ffffff', basic: true, logo: true },
  { key: 'logoR', geo: 'plane', args: [0.6, 0.6], position: [-0.7, 1.22, -0.655], rotation: [0, Math.PI, 0], color: '#ffffff', basic: true, logo: true },
  // 3 axles; a cylinder spans the body width so each reads as a wheel on both sides
  { key: 'axle1', geo: 'cyl', args: [0.3, 0.3, 1.4, 14], position: [-1.0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: DARK, wheel: true },
  { key: 'axle2', geo: 'cyl', args: [0.3, 0.3, 1.4, 14], position: [-0.2, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: DARK, wheel: true },
  { key: 'axle3', geo: 'cyl', args: [0.3, 0.3, 1.4, 14], position: [1.0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: DARK, wheel: true },
  // A visible rim bar on each side makes rotation legible on otherwise uniform tyres.
  ...[-1.0, -0.2, 1.0].map((x, i) => ({ key: `rim${i}`, geo: 'box', args: [0.42, 0.065, 1.43], position: [x, 0.3, 0], color: '#cbd5e1', wheel: true, spin: true }))
];

const HOVER_LIFT = 0.025;
const SELECT_LIFT = 0.015;
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
const _truckMatrix = new THREE.Matrix4();
const _wheelMatrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();
const _arrowColor = new THREE.Color();
const _upAxis = new THREE.Vector3(0, 1, 0);

const noRaycast = () => {};

/** Shared simulation time. Runs before geometry/labels and freezes offscreen. */
export function DriveClock({ clockRef, items, motion, running, playbackRate }) {
  const invalidate = useThree(s => s.invalidate);
  const motionKey = motion?.key;
  useLayoutEffect(() => {
    clockRef.current.motionElapsed = 0;
  }, [clockRef, motionKey]);
  useLayoutEffect(() => {
    clockRef.current.step = 0;
    invalidate();
  }, [clockRef, running, invalidate]);
  useEffect(() => {
    if (!running) return undefined;
    // Cruise needs only 30fps; replay gets 60fps. No idle render loop when
    // paused/hidden, and camera interaction can still request its own frames.
    const timer = window.setInterval(invalidate, 1000 / (motionKey == null ? 30 : 60));
    return () => window.clearInterval(timer);
  }, [running, motionKey, invalidate]);
  useFrame((_, delta) => {
    advanceDriveClock(clockRef.current, items, motion, delta, running, playbackRate);
    if (import.meta.env.DEV) {
      const handle = (window.__ranking3d = window.__ranking3d || { glList: [] });
      handle.drive = { ...clockRef.current };
    }
  }, -2);
  return null;
}

function pickedId(e, items) {
  const item = e.instanceId == null ? null : items[e.instanceId];
  return item && !item.ghost ? item.id : null;
}

/** One InstancedMesh for a truck part. Registers itself (mesh + material) with the fleet. */
function FleetPart({ part, index, count, alphaArray, register, castShadow, logoTexture }) {
  const geometry = useMemo(() => {
    const g = part.geo === 'cyl'
      ? new THREE.CylinderGeometry(...part.args)
      : part.geo === 'plane' ? new THREE.PlaneGeometry(...part.args) : new THREE.BoxGeometry(...part.args);
    g.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(alphaArray, 1));
    return g;
  }, [part, alphaArray]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // transparent from the start: flipping `transparent` at runtime changes three's program key
  // (OPAQUE define) and compiled a new shader set the first time a replay faded a truck, a visible
  // hitch. At alpha 1 a transparent material renders the same as an opaque one.
  const materialProps = {
    transparent: true,
    onBeforeCompile: patchInstanceAlpha,
    customProgramCacheKey: alphaCacheKey
  };
  const color = part.color === 'status' ? '#ffffff' : part.color;

  return (
    <instancedMesh
      name={`prr-${part.key}`}
      ref={(m) => register(index, m)}
      args={[geometry, undefined, count]}
      castShadow={castShadow}
      frustumCulled={false}
      raycast={noRaycast}
    >
      {part.logo
        ? <meshBasicMaterial {...materialProps} map={logoTexture} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        : part.basic
        ? <meshBasicMaterial {...materialProps} color={color} />
        : <meshStandardMaterial {...materialProps} color={color} roughness={0.7} metalness={0.1} />}
    </instancedMesh>
  );
}

// Picking: three's InstancedMesh.raycast transforms the ray into every instance's space and
// tests its bounding sphere (and triangles), per mesh. With ~1,200 trucks x 11 parts that is
// ~13k tests on every pointer move, which is what made orbiting stutter. Instead one
// invisible mesh owns all pointer handlers and does a single ray-vs-box slab test per
// truck, using the animated positions the fleet writes each frame.
const WARMUP_FRAMES = 6; // ignored when judging frame rate
const PICK_HALF_X = 1.55;
const PICK_HALF_Z = 1.0; // includes the corner swept by the small steering angle
const PICK_HEIGHT = 1.7;
const PICK_MIN_ALPHA = 0.3; // fading-in/out trucks are not pickable

function createPickRaycast(itemsRef, alphaRef, positionsRef) {
  return function pickRaycast(raycaster, intersects) {
    const items = itemsRef.current;
    const alpha = alphaRef.current;
    const { origin, direction } = raycaster.ray;
    const inv = { x: 1 / direction.x, y: 1 / direction.y, z: 1 / direction.z };
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.ghost || alpha[i] < PICK_MIN_ALPHA) continue;
      const p = positionsRef.current.get(item.id);
      if (!p) continue;
      let t1 = (p.x - PICK_HALF_X - origin.x) * inv.x;
      let t2 = (p.x + PICK_HALF_X - origin.x) * inv.x;
      let tmin = Math.min(t1, t2);
      let tmax = Math.max(t1, t2);
      t1 = (p.lift - origin.y) * inv.y;
      t2 = (p.lift + PICK_HEIGHT - origin.y) * inv.y;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (p.z - PICK_HALF_Z - origin.z) * inv.z;
      t2 = (p.z + PICK_HALF_Z - origin.z) * inv.z;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax < Math.max(tmin, 0)) continue;
      const distance = tmin >= 0 ? tmin : tmax;
      if (distance < raycaster.near || distance > raycaster.far) continue;
      intersects.push({ distance, point: raycaster.ray.at(distance, new THREE.Vector3()), object: this, instanceId: i });
    }
  };
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
 * @param replayRef MutableRefObject<{active: boolean, t: number}> replay progress for the overlay chip
 * @param onMotionEnd (key) => void when a motion has finished
 * @param onMotionStats ({kind, frames, avgFps}) => void when a motion has finished (adaptive quality;
 *   avgFps is the fps implied by the median frame time)
 */
export function TruckFleet({
  items, motion, goodColor, badColor, castShadow, hoveredId, selectedId,
  onHover, onSelect, positionsRef, replayRef, onMotionEnd, onMotionStats, clockRef, reducedMotion
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const count = items.length;
  const hoverEnabled = useMemo(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches, []);
  const buffers = useMemo(() => ({
    xs: new Float32Array(count), ys: new Float32Array(count), zs: new Float32Array(count),
    headings: new Float32Array(count), bobs: new Float32Array(count)
  }), [count]);
  const alphaArray = useMemo(() => new Float32Array(count).fill(1), [count]);
  const arrowGeometry = useMemo(() => new THREE.ConeGeometry(0.45, 0.9, 12), []);
  useEffect(() => () => arrowGeometry.dispose(), [arrowGeometry]);
  const badgeGeometry = useMemo(() => new THREE.CylinderGeometry(0.4, 0.4, 0.1, 20), []);
  useEffect(() => () => badgeGeometry.dispose(), [badgeGeometry]);
  const badgeMesh = useRef(null);

  // The GHN mark: drawn once from the app icon (same file as the sidebar), shared by both decals.
  const logoTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, []);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = logoTexture.image;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 128, 128);
      ctx.drawImage(image, 0, 0, 128, 128);
      logoTexture.needsUpdate = true;
      invalidate();
    };
    image.src = LOGO_URL; // if it fails the decals simply stay transparent
    return () => { cancelled = true; logoTexture.dispose(); };
  }, [logoTexture, invalidate]);

  const meshes = useRef([]);
  const itemsRef = useRef(items);
  const alphaRef = useRef(alphaArray);
  const frameDeltas = useRef([]);
  const pickRaycast = useMemo(
    () => createPickRaycast(itemsRef, alphaRef, positionsRef),
    [positionsRef]
  );
  const pickHandlers = {
    // No hover updates while a button is held: that is an orbit drag, and re-rendering the
    // labels on every truck the pointer sweeps over made dragging stutter.
    onPointerOver: (e) => { e.stopPropagation(); if (hoverEnabled && !e.nativeEvent.buttons) onHover(pickedId(e, itemsRef.current)); },
    onPointerMove: (e) => { e.stopPropagation(); if (hoverEnabled && !e.nativeEvent.buttons) onHover(pickedId(e, itemsRef.current)); },
    onPointerOut: () => onHover(null),
    onClick: (e) => {
      if (e.delta > CLICK_TRAVEL_PX) return;
      e.stopPropagation();
      const id = pickedId(e, itemsRef.current);
      if (id) onSelect(id);
    }
  };
  const arrowMesh = useRef(null);
  const endedKeyRef = useRef(null);

  const register = (index, node) => {
    meshes.current[index] = node;
  };

  const goodC = useMemo(() => new THREE.Color(goodColor), [goodColor]);
  const badC = useMemo(() => new THREE.Color(badColor), [badColor]);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.cursor = hoveredId ? 'pointer' : '';
    return () => { canvas.style.cursor = ''; };
  }, [gl, hoveredId]);

  // Keep rank anchors stable while wheels and suspension travel around them.
  const write = (updateColors = false) => {
    itemsRef.current = items;
    alphaRef.current = alphaArray;
    const clock = clockRef.current;
    const now = clock.time * 1000;
    const t = motion ? Math.min(1, clock.motionElapsed / motion.durationMs) : 1;
    const animated = Boolean(motion);
    const positions = positionsRef.current;
    positions.clear();

    const { xs, ys, zs, headings, bobs } = buffers;
    for (let i = 0; i < count; i++) {
      const item = items[i];
      let x = item.x;
      let z = item.z;
      let a = 1;
      if (animated && item.from) {
        const f = sampleDrivePose(item, t);
        x = f.x; z = f.z; a = f.alpha;
      }
      const lift = item.ghost ? 0 : liftFor(item.id, hoveredId, selectedId);
      xs[i] = x; ys[i] = lift; zs[i] = z;
      headings[i] = animated ? driveHeading(item, t, motion.durationMs, clock.speed) : 0;
      bobs[i] = reducedMotion || item.ghost || count > SHADOW_MAX_TRUCKS ? 0 : Math.sin(clock.time * 8 + i * 2.399) * 0.012;
      alphaArray[i] = a;
      if (!item.ghost) positions.set(item.id, { x, z, lift });
    }

    TRUCK_PARTS.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      // A large fleet keeps suspension at rest: only the three rim meshes
      // need matrix uploads during cruise, rather than all body meshes.
      if (count > SHADOW_MAX_TRUCKS && !animated && !updateColors && !part.spin) return;
      _euler.set(...(part.rotation || [0, 0, 0]));
      _quat.setFromEuler(_euler);
      _partMatrix.compose(_pos.set(...part.position), _quat, _scale);
      const tinted = part.color === 'status';
      for (let i = 0; i < count; i++) {
        _quat.setFromAxisAngle(_upAxis, headings[i]);
        _truckMatrix.compose(_pos.set(xs[i], ys[i] + (part.wheel ? 0 : bobs[i]), zs[i]), _quat, _scale);
        if (part.spin) {
          _euler.set(0, 0, -(clock.distance + xs[i]) / WHEEL_RADIUS);
          _quat.setFromEuler(_euler);
          _wheelMatrix.compose(_pos.set(...part.position), _quat, _scale);
          _matrix.copy(_truckMatrix).multiply(_wheelMatrix);
        } else {
          _matrix.copy(_truckMatrix).multiply(_partMatrix);
        }
        mesh.setMatrixAt(i, _matrix);
        if (tinted && updateColors) mesh.setColorAt(i, items[i].meetsTarget ? goodC : badC);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor && updateColors) mesh.instanceColor.needsUpdate = true;
      const attribute = mesh.geometry.getAttribute('instanceAlpha');
      if (attribute) attribute.needsUpdate = true;
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

    // Gold / silver / bronze badge on the roof of ranks 1-3.
    const badges = badgeMesh.current;
    if (badges) {
      let shown = 0;
      for (let i = 0; i < count && shown < BADGE_COLORS.length; i++) {
        const rank = items[i].item ? items[i].item.rank : null;
        if (items[i].ghost || !(rank >= 1 && rank <= 3)) continue;
        _quat.identity();
        _matrix.compose(_pos.set(xs[i] - 0.45, 1.66 + ys[i], zs[i]), _quat, _scale);
        badges.setMatrixAt(shown, _matrix);
        badges.setColorAt(shown, _arrowColor.set(BADGE_COLORS[rank - 1]));
        shown++;
      }
      badges.count = shown;
      badges.instanceMatrix.needsUpdate = true;
      if (badges.instanceColor) badges.instanceColor.needsUpdate = true;
    }

    // Suspension is too small to warrant a new 2048px shadow map every cruise frame.
    if (animated || updateColors) gl.shadowMap.needsUpdate = true;

    return { t, active: animated && t < 1 };
  };

  // Rest state, hover/selection lift, colours, data changes and the start of a motion.
  const motionKey = motion ? motion.key : null;
  useLayoutEffect(() => {
    endedKeyRef.current = null;
    frameDeltas.current = [];
    write(true);
    invalidate();
    // write() closes over the props listed here; it is intentionally not a dependency itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, motionKey, goodC, badC, hoveredId, selectedId, reducedMotion, invalidate]);

  useFrame((_, delta) => {
    if (!clockRef.current.step) return;
    if (motion) frameDeltas.current.push(delta);
    const { t, active } = write();
    if (replayRef) replayRef.current = { active: motion?.kind === 'replay' && active, t };
    if (motion && !active && endedKeyRef.current !== motion.key) {
      endedKeyRef.current = motion.key;
      if (replayRef) replayRef.current = { active: false, t: 1 };
      if (onMotionStats) {
        // Frames are contiguous while animating, so frame times are real. Skip the first frames
        // (shader compile, first upload) and use the median so one hitch cannot flip the tier.
        const deltas = frameDeltas.current.slice(WARMUP_FRAMES).sort((a, b) => a - b);
        const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0;
        onMotionStats({ kind: motion.kind, frames: deltas.length, avgFps: median > 0 ? 1 / median : 60 });
      }
      if (onMotionEnd) onMotionEnd(motion.key);
    }
  }, -1);

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
          castShadow={castShadow}
          logoTexture={logoTexture}
        />
      ))}
      <mesh visible={false} raycast={pickRaycast} {...pickHandlers}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshBasicMaterial />
      </mesh>
      <instancedMesh ref={badgeMesh} args={[badgeGeometry, undefined, BADGE_COLORS.length]} frustumCulled={false} raycast={noRaycast}>
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
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
export function Road({ roadLength, laneCount, laneWidth, theme, clockRef }) {
  const roadWidth = laneCount * laneWidth + 0.6;
  const dashRef = useRef(null);
  const invalidate = useThree((s) => s.invalidate);
  const asphaltTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c4c4c4';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1100; i++) {
      ctx.fillStyle = i % 2 ? '#b4b4b4' : '#d0d0d0';
      ctx.fillRect((i * 73) % 128, (i * 37 + Math.floor(i / 128) * 19) % 128, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set((roadLength + 6) / 4, roadWidth / 4);
    return texture;
  }, [roadLength, roadWidth]);
  useEffect(() => () => asphaltTexture.dispose(), [asphaltTexture]);

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

  const writeRoad = () => {
    const mesh = dashRef.current;
    if (!mesh) return;
    const distance = clockRef.current.distance;
    const minX = -roadLength / 2 - 3;
    const span = Math.floor((roadLength + 6) / 4) * 4;
    dashes.forEach(([x, z], i) => {
      _matrix.makeTranslation(wrapRoadTravel(x, distance, minX, span), 0.012, z);
      mesh.setMatrixAt(i, _matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    asphaltTexture.offset.x = (distance / 4) % 1;
  };
  useLayoutEffect(() => {
    writeRoad();
    invalidate();
    // Geometry/texture changes need an initial draw even while playback is paused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashes, asphaltTexture, invalidate]);
  useFrame(() => {
    if (clockRef.current.step) writeRoad();
  });

  const edgeZ = roadWidth / 2 + 0.25;
  return (
    <group>
      {/* ground: unlit, fades into the sky colour through the scene fog, so there is no horizon band */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[roadLength * 4 + 400, 600]} />
        <meshBasicMaterial color={theme.ground} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roadLength + 6, roadWidth]} />
        <meshStandardMaterial color={theme.asphalt} map={asphaltTexture} roughness={0.95} />
      </mesh>
      {[edgeZ, -edgeZ].map((z) => (
        <mesh key={z} position={[0, 0.05, z]}>
          <boxGeometry args={[roadLength + 6, 0.1, 0.5]} />
          <meshStandardMaterial color={theme.shoulder} />
        </mesh>
      ))}
      <instancedMesh name="prr-road-dashes" key={dashes.length} ref={dashRef} args={[undefined, undefined, dashes.length]} frustumCulled={false}>
        <boxGeometry args={[2, 0.01, 0.1]} />
        <meshBasicMaterial color={theme.dash} />
      </instancedMesh>
      <Roadside roadLength={roadLength} roadWidth={roadWidth} theme={theme} clockRef={clockRef} />
    </group>
  );
}

/**
 * Low-poly trees and road signs along the far shoulder. Four instanced meshes in total (trunks,
 * canopies, sign poles, sign plates), so the draw-call cost does not depend on how many there are.
 * Share the road's travelled distance; recycling fades outside the asphalt.
 */
function Roadside({ roadLength, roadWidth, theme, clockRef }) {
  const trunkRef = useRef(null);
  const canopyRef = useRef(null);
  const poleRef = useRef(null);
  const plateRef = useRef(null);
  const invalidate = useThree((s) => s.invalidate);
  const span = roadLength + ROADSIDE_BUFFER * 2;
  const { trees, signs } = useMemo(() => computeRoadside(span, roadWidth), [span, roadWidth]);
  const treeAlpha = useMemo(() => new Float32Array(trees.length), [trees]);
  const signAlpha = useMemo(() => new Float32Array(signs.length), [signs]);
  const color = useMemo(() => new THREE.Color(), []);

  const writeRoadside = (updateColors = false) => {
    const distance = clockRef.current.distance;
    const trunk = trunkRef.current;
    const canopy = canopyRef.current;
    if (trunk && canopy) {
      trees.forEach((t, i) => {
        const x = wrapRoadTravel(t.x, distance, -span / 2, span);
        treeAlpha[i] = roadsideAlpha(x, roadLength);
        _quat.setFromAxisAngle(_upAxis, (i * 2.399) % (Math.PI * 2));
        _matrix.compose(_pos.set(x, 0.4 * t.scale, t.z), _quat, _scale.set(t.scale, t.scale, t.scale));
        trunk.setMatrixAt(i, _matrix);
        _matrix.compose(_pos.set(x, 1.6 * t.scale, t.z), _quat, _scale.set(t.scale, t.scale, t.scale));
        canopy.setMatrixAt(i, _matrix);
        if (updateColors) canopy.setColorAt(i, color.set(theme.treeCanopy[t.tint % theme.treeCanopy.length]));
      });
      if (canopy.instanceColor && updateColors) canopy.instanceColor.needsUpdate = true;
    }
    const pole = poleRef.current;
    const plate = plateRef.current;
    if (pole && plate) {
      signs.forEach((sg, i) => {
        const x = wrapRoadTravel(sg.x, distance, -span / 2, span);
        signAlpha[i] = roadsideAlpha(x, roadLength);
        _quat.identity();
        _matrix.compose(_pos.set(x, 1.3, sg.z), _quat, _scale.set(1, 1, 1));
        pole.setMatrixAt(i, _matrix);
        // the plate faces the road
        _quat.setFromAxisAngle(_upAxis, sg.side > 0 ? Math.PI : 0);
        _matrix.compose(_pos.set(x, 2.55, sg.z), _quat, _scale.set(1, 1, 1));
        plate.setMatrixAt(i, _matrix);
      });
    }
    for (const mesh of [trunk, canopy, pole, plate]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      const alpha = mesh.geometry.getAttribute('instanceAlpha');
      if (alpha) alpha.needsUpdate = true;
    }
    _scale.set(1, 1, 1);
  };
  useLayoutEffect(() => {
    writeRoadside(true);
    invalidate();
    // Colours are uploaded on theme/layout changes, never on each cruise frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trees, signs, theme, invalidate]);
  useFrame(() => {
    if (clockRef.current.step) writeRoadside();
  });

  const fadeMaterial = { transparent: true, depthWrite: false, onBeforeCompile: patchInstanceAlpha, customProgramCacheKey: alphaCacheKey };

  return (
    <group>
      <instancedMesh name="prr-roadside-trunks" key={`t-${trees.length}`} ref={trunkRef} args={[undefined, undefined, trees.length]} frustumCulled={false} raycast={noRaycast}>
        <cylinderGeometry args={[0.13, 0.18, 0.8, 6]}>
          <instancedBufferAttribute attach="attributes-instanceAlpha" args={[treeAlpha, 1]} />
        </cylinderGeometry>
        <meshStandardMaterial {...fadeMaterial} color={theme.treeTrunk} flatShading />
      </instancedMesh>
      <instancedMesh name="prr-roadside-canopies" key={`c-${trees.length}`} ref={canopyRef} args={[undefined, undefined, trees.length]} frustumCulled={false} raycast={noRaycast}>
        <coneGeometry args={[0.8, 2.0, 7]}>
          <instancedBufferAttribute attach="attributes-instanceAlpha" args={[treeAlpha, 1]} />
        </coneGeometry>
        <meshStandardMaterial {...fadeMaterial} color="#ffffff" flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh name="prr-roadside-poles" key={`p-${signs.length}`} ref={poleRef} args={[undefined, undefined, signs.length]} frustumCulled={false} raycast={noRaycast}>
        <cylinderGeometry args={[0.07, 0.07, 2.6, 6]}>
          <instancedBufferAttribute attach="attributes-instanceAlpha" args={[signAlpha, 1]} />
        </cylinderGeometry>
        <meshStandardMaterial {...fadeMaterial} color={theme.signPole} />
      </instancedMesh>
      <instancedMesh name="prr-roadside-signs" key={`s-${signs.length}`} ref={plateRef} args={[undefined, undefined, signs.length]} frustumCulled={false} raycast={noRaycast}>
        <boxGeometry args={[1.1, 0.75, 0.08]}>
          <instancedBufferAttribute attach="attributes-instanceAlpha" args={[signAlpha, 1]} />
        </boxGeometry>
        <meshStandardMaterial {...fadeMaterial} color={theme.signPlate} />
      </instancedMesh>
    </group>
  );
}

const LABEL_PADDING = 4;
const NEAR_RANGE_FACTOR = 2.5; // far-label cutoff = camera-to-target distance * this
const MIN_NEAR_RANGE = 30;
const COMPACT_WIDTH = 560; // canvas narrower than this: compact labels
const BOTTOM_RESERVED = 34; // px kept free of labels (caption + controls row)

/**
 * Projects 3D anchor points to screen space and draws the labels on a 2D overlay canvas
 * (see labelOverlay.js for why it is a canvas and not DOM nodes).
 *
 * Per frame: labels behind the camera are hidden; labels flagged `nearOnly` are hidden when
 * far from the camera; the rest are placed greedily by `priority` and any label whose box
 * overlaps one already placed is hidden. A label with `followId` tracks that truck's animated
 * position (positionsRef).
 *
 * @param labels Array<{key, spec, position: [x, y, z], followId?, baseY?, anchor?: 'above' | 'center', priority?: number, nearOnly?: boolean}>
 * @param overlayRef MutableRefObject<HTMLCanvasElement | null> the 2D overlay canvas
 * @param positionsRef MutableRefObject<Map<id, {x, z, lift}>>
 * @param replayRef MutableRefObject<{active: boolean, t: number}> while active, the replay chip is drawn
 * @param replayLabels {from: string, to: string} text of the replay chip ends
 */
export function LabelProjector({ labels, overlayRef, positionsRef, replayRef, replayLabels }) {
  const invalidate = useThree((s) => s.invalidate);
  const vec = useMemo(() => new THREE.Vector3(), []);
  const order = useMemo(() => [...labels].sort((a, b) => (b.priority || 0) - (a.priority || 0)), [labels]);
  const fontsRef = useRef(null);
  const boxes = useRef(new Map()); // label key -> measured layout (cleared when labels/fonts/size class change)
  const lastCompact = useRef(null);

  const resetMeasure = useMemo(() => () => { boxes.current = new Map(); }, []);

  useLayoutEffect(() => {
    const canvas = overlayRef.current;
    if (canvas) {
      const style = getComputedStyle(canvas);
      fontsRef.current = {
        family: style.fontFamily || 'sans-serif',
        mono: style.getPropertyValue('--font-mono').trim() || 'ui-monospace, Consolas, monospace'
      };
    }
    resetMeasure();
    invalidate();
  }, [labels, overlayRef, resetMeasure, invalidate]);

  // web fonts finishing late change text widths
  useEffect(() => {
    if (!document.fonts || !document.fonts.addEventListener) return undefined;
    const onLoaded = () => { resetMeasure(); invalidate(); };
    document.fonts.addEventListener('loadingdone', onLoaded);
    return () => document.fonts.removeEventListener('loadingdone', onLoaded);
  }, [resetMeasure, invalidate]);

  useFrame(({ camera, size, controls, gl }) => {
    const canvas = overlayRef.current;
    const fonts = fontsRef.current;
    if (!canvas || !fonts) return;
    const ctx = canvas.getContext('2d');
    const dpr = gl.getPixelRatio();
    const pxW = Math.round(size.width * dpr);
    const pxH = Math.round(size.height * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const compact = size.width < COMPACT_WIDTH;
    if (lastCompact.current !== compact) {
      lastCompact.current = compact;
      resetMeasure();
    }

    const target = controls && controls.target;
    const nearRange = Math.max(MIN_NEAR_RANGE, (target ? camera.position.distanceTo(target) : 0) * NEAR_RANGE_FACTOR);

    // The bottom strip holds the caption and the controls: labels never sit under them.
    const placed = [{ l: 0, r: size.width, t: size.height - BOTTOM_RESERVED, b: size.height }];
    const debug = [];
    for (const label of order) {
      const followed = label.followId ? positionsRef.current.get(label.followId) : null;
      if (followed) vec.set(followed.x, (label.baseY || 0) + followed.lift, followed.z);
      else vec.set(...label.position);
      const distance = camera.position.distanceTo(vec);
      vec.project(camera);
      if (vec.z > 1 || vec.z < -1 || (label.nearOnly && distance > nearRange)) continue;

      let box = boxes.current.get(label.key);
      if (!box) {
        box = layoutLabel(ctx, label.spec, fonts, compact);
        boxes.current.set(label.key, box);
      }
      // keep the label fully inside the canvas
      const half = box.w / 2;
      const cx = Math.min(Math.max((vec.x * 0.5 + 0.5) * size.width, half + LABEL_PADDING), size.width - half - LABEL_PADDING);
      const above = label.anchor !== 'center';
      const rawY = (-vec.y * 0.5 + 0.5) * size.height;
      const anchorY = above ? Math.max(rawY, box.h + LABEL_PADDING) : Math.max(rawY, box.h / 2 + LABEL_PADDING);
      const left = cx - half;
      const top = above ? anchorY - box.h : anchorY - box.h / 2;
      const hit = { l: left - LABEL_PADDING, r: left + box.w + LABEL_PADDING, t: top - LABEL_PADDING, b: top + box.h + LABEL_PADDING };
      if (placed.some((o) => hit.l < o.r && hit.r > o.l && hit.t < o.b && hit.b > o.t)) continue;
      placed.push(hit);
      drawLabel(ctx, label.spec, box, left, top, fonts);
      if (import.meta.env.DEV) {
        debug.push({ key: label.key, kind: label.spec.kind, state: label.spec.state || '', text: label.spec.name || label.spec.text || '', x: left, y: top, w: box.w, h: box.h });
      }
    }
    const replay = replayRef && replayRef.current;
    if (replay && replay.active && replayLabels) drawReplayChip(ctx, fonts, { ...replayLabels, t: replay.t }, size.width, compact);
    if (import.meta.env.DEV) {
      const handle = (window.__ranking3d = window.__ranking3d || { glList: [] });
      handle.labels = debug;
      handle.replay = replay ? { ...replay } : null;
    }
  });
  return null;
}
