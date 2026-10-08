import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { drawLabel, drawReplayChip, layoutLabel } from './labelOverlay.js';
import Roadside from './Roadside.jsx';
import { sampleRoadFrame, getRoadCurveRadius, toRoadLocalVector } from '../../utils/sceneRoadCurve.js';
import { getRoadsideSpan, sampleSceneryFrame } from '../../utils/sceneRoadside.js';
import { hubPaintColor, hubRoofCode, patchTruckPaint } from '../../utils/sceneTruckPaint.js';
import {
  REPLAY_ARROWS_MS,
} from '../../utils/rankingSceneLayout.js';
import {
  advanceDriveClock, driveHeading, sampleDrivePose, leaderSurge, WHEEL_RADIUS,
  wrapRoadTravel
} from '../../utils/sceneDriving.js';

export const SHADOW_MAX_TRUCKS = 60; // shadows off above this

const ARROW_UP = '#34d399';
const ARROW_DOWN = '#f87171';
const TRUCK_MODEL_URL = '/models/ghn-truck-wheels-v1.glb';

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
const _pitchAxis = new THREE.Vector3(0, 0, 1);
const _pitchQuat = new THREE.Quaternion();
const _ringQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
function roadQuaternion(heading, pitch) {
  return _quat.setFromAxisAngle(_upAxis, heading).multiply(_pitchQuat.setFromAxisAngle(_pitchAxis, pitch));
}
const paintCacheKey = () => 'instanceAlpha-truckRoof-v2';

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
function FleetPart({ part, index, count, alphaArray, paintArray, codeArray, glyphTexture, register, castShadow }) {
  const painted = part.key === 'body';
  const geometry = useMemo(() => {
    // Fleet-owned geometry carries its alpha attribute; the cached GLTF stays unchanged.
    const g = part.sourceGeometry ? part.sourceGeometry.clone() : new THREE.BoxGeometry(...part.args);
    g.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(alphaArray, 1));
    if (painted) {
      g.setAttribute('instancePaint', new THREE.InstancedBufferAttribute(paintArray, 3));
      g.setAttribute('instanceRoofCode', new THREE.InstancedBufferAttribute(codeArray, 4));
    }
    return g;
  }, [part, alphaArray, painted, paintArray, codeArray]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // transparent from the start: flipping `transparent` at runtime changes three's program key
  // (OPAQUE define) and compiled a new shader set the first time a replay faded a truck, a visible
  // hitch. At alpha 1 a transparent material renders the same as an opaque one.
  const materialProps = {
    transparent: true,
    onBeforeCompile: painted ? (shader) => { patchInstanceAlpha(shader); patchTruckPaint(shader, glyphTexture); } : patchInstanceAlpha,
    customProgramCacheKey: painted ? paintCacheKey : alphaCacheKey
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
      {part.basic
        ? <meshBasicMaterial {...materialProps} color={color} />
        : <meshStandardMaterial {...materialProps} color={color} map={part.map} roughness={0.85} metalness={0} />}
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
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.ghost || alpha[i] < PICK_MIN_ALPHA) continue;
      const p = positionsRef.current.get(item.id);
      if (!p) continue;
      const o = toRoadLocalVector(origin.x - p.x, origin.y - p.lift, origin.z - p.z, p.heading, p.pitch);
      const d = toRoadLocalVector(direction.x, direction.y, direction.z, p.heading, p.pitch);
      const inv = { x: 1 / d.x, y: 1 / d.y, z: 1 / d.z };
      let t1 = (-PICK_HALF_X - o.x) * inv.x;
      let t2 = (PICK_HALF_X - o.x) * inv.x;
      let tmin = Math.min(t1, t2);
      let tmax = Math.max(t1, t2);
      t1 = -o.y * inv.y;
      t2 = (PICK_HEIGHT - o.y) * inv.y;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (-PICK_HALF_Z - o.z) * inv.z;
      t2 = (PICK_HALF_Z - o.z) * inv.z;
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
  onHover, onSelect, positionsRef, replayRef, onMotionEnd, onMotionStats, clockRef, reducedMotion, roadLength, paintMode
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const count = items.length;
  const model = useLoader(GLTFLoader, TRUCK_MODEL_URL);
  const truckParts = useMemo(() => {
    const parts = [];
    model.scene.traverse(node => {
      if (!node.isMesh) return;
      parts.push({ key: node.name, sourceGeometry: node.geometry, map: node.material.map,
        position: node.position.toArray(), color: '#ffffff', wheel: Boolean(node.userData.wheel),
        spin: Boolean(node.userData.wheel), radius: node.userData.radius });
    });
    // Preserve the existing KPI colour cue without tinting GHN's brand texture.
    parts.push({ key: 'beacon', args: [0.45, 0.045, 0.8], position: [0.95, 1.30, 0], color: 'status', basic: true });
    return parts;
  }, [model]);
  const hoverEnabled = useMemo(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches, []);
  const buffers = useMemo(() => ({
    xs: new Float32Array(count), ys: new Float32Array(count), zs: new Float32Array(count),
    travelXs: new Float32Array(count), pitches: new Float32Array(count), headings: new Float32Array(count), bobs: new Float32Array(count)
  }), [count]);
  const alphaArray = useMemo(() => new Float32Array(count).fill(1), [count]);
  const paintArray = useMemo(() => {
    const array = new Float32Array(count * 3).fill(-1);
    if (paintMode === 'hub') items.forEach((item, i) => new THREE.Color(hubPaintColor(item.id)).toArray(array, i * 3));
    return array;
  }, [items, count, paintMode]);
  const codeArray = useMemo(() => Float32Array.from(items.flatMap(item =>
    [...hubRoofCode(item.id)].map(digit => parseInt(digit, 16)))), [items]);
  const glyphTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 96;
    const context = canvas.getContext('2d');
    context.font = 'bold 72px monospace';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    [...'0123456789ABCDEF'].forEach((glyph, i) => context.fillText(glyph, i * 64 + 32, 48));
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }, []);
  useEffect(() => () => glyphTexture.dispose(), [glyphTexture]);
  const arrowGeometry = useMemo(() => new THREE.ConeGeometry(0.45, 0.9, 12), []);
  useEffect(() => () => arrowGeometry.dispose(), [arrowGeometry]);
  const nitroGeometry = useMemo(() => new THREE.ConeGeometry(1, 1, 8), []);
  useEffect(() => () => nitroGeometry.dispose(), [nitroGeometry]);
  const nitroOuter = useRef(null);
  const nitroInner = useRef(null);
  const leaderStreaks = useRef(null);
  const flameScale = useMemo(() => new THREE.Vector3(), []);

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

    const { xs, ys, zs, travelXs, pitches, headings, bobs } = buffers;
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
      const frame = sampleRoadFrame(x, z, roadLength);
      const surge = animated && !reducedMotion ? leaderSurge(item, t) : 0;
      xs[i] = frame.x; ys[i] = frame.y + lift; zs[i] = frame.z; travelXs[i] = x; pitches[i] = frame.pitch + surge * 0.045;
      headings[i] = frame.heading + (animated ? driveHeading(item, t, motion.durationMs, clock.speed) : 0);
      bobs[i] = reducedMotion || item.ghost || count > SHADOW_MAX_TRUCKS ? 0 : Math.sin(clock.time * 8 + i * 2.399) * 0.012;
      alphaArray[i] = a;
      positions.set(item.id, { x: frame.x, z: frame.z, lift: frame.y + lift, heading: headings[i], pitch: frame.pitch, roadX: x, roadZ: z, alpha: a, ghost: Boolean(item.ghost) });
    }

    truckParts.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      // A large fleet keeps suspension at rest: only the four wheel meshes
      // need matrix uploads during cruise, rather than all body meshes.
      if (count > SHADOW_MAX_TRUCKS && !animated && !updateColors && !part.spin) return;
      _euler.set(...(part.rotation || [0, 0, 0]));
      _quat.setFromEuler(_euler);
      _partMatrix.compose(_pos.set(...part.position), _quat, _scale);
      const tinted = part.color === 'status';
      for (let i = 0; i < count; i++) {
        roadQuaternion(headings[i], pitches[i]);
        _truckMatrix.compose(_pos.set(xs[i], ys[i] + (part.wheel ? 0 : bobs[i]), zs[i]), _quat, _scale);
        if (part.spin) {
          _euler.set(0, 0, -(clock.distance + travelXs[i]) / (part.radius || WHEEL_RADIUS));
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
          _partMatrix.compose(_pos.set(0.3, 2.3 + bob, 0), _quat, _scale);
          _truckMatrix.compose(_pos.set(xs[i], ys[i], zs[i]), roadQuaternion(headings[i], pitches[i]), _scale);
          _matrix.copy(_truckMatrix).multiply(_partMatrix);
          arrows.setMatrixAt(shown, _matrix);
          arrows.setColorAt(shown, _arrowColor.set(item.dir > 0 ? ARROW_UP : ARROW_DOWN));
          shown++;
        }
      }
      arrows.count = shown;
      arrows.instanceMatrix.needsUpdate = true;
      if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
    }

    // Two exhaust jets, two shared meshes: no particle system or extra GLB.
    const leader = items.findIndex(item => !item.ghost && item.item?.rank === 1);
    [nitroOuter.current, nitroInner.current].forEach((mesh, layer) => {
      if (!mesh) return;
      const visible = !reducedMotion && leader >= 0 && alphaArray[leader] > 0.3;
      mesh.count = visible ? 2 : 0;
      if (!visible) return;
      const item = items[leader];
      const surge = motion ? leaderSurge(item, t) : 0;
      const pulse = 1 + Math.sin(clock.time * 22) * 0.12;
      const length = (1.8 + surge * 3.2) * pulse * (layer ? 0.7 : 1);
      const width = (layer ? 0.12 : 0.23) * (1 + surge * 0.5);
      mesh.material.color.set(surge > 0 ? (layer ? '#fff5c2' : '#ffbd35') : (layer ? '#d9fbff' : '#16bfff'));
      _truckMatrix.compose(_pos.set(xs[leader], ys[leader], zs[leader]), roadQuaternion(headings[leader], pitches[leader]), _scale);
      _quat.setFromAxisAngle(_pitchAxis, Math.PI / 2); // cone tip trails towards -x
      for (let jet = 0; jet < 2; jet++) {
        _partMatrix.compose(_pos.set(-1.43 - length / 2, 0.42, jet ? 0.32 : -0.32), _quat, flameScale.set(width, length, width));
        mesh.setMatrixAt(jet, _matrix.copy(_truckMatrix).multiply(_partMatrix));
      }
      mesh.material.opacity = (layer ? 0.95 : 0.6) * alphaArray[leader];
      mesh.instanceMatrix.needsUpdate = true;
    });

    const streaks = leaderStreaks.current;
    if (streaks) {
      const surge = leader >= 0 && motion && !reducedMotion ? leaderSurge(items[leader], t) : 0;
      streaks.count = surge > 0 && alphaArray[leader] > 0.3 ? 3 : 0;
      if (streaks.count) {
        _truckMatrix.compose(_pos.set(xs[leader], ys[leader], zs[leader]), roadQuaternion(headings[leader], pitches[leader]), _scale);
        for (let i = 0; i < 3; i++) {
          const length = (2.5 + surge * 4) * (i === 1 ? 0.75 : 1);
          _partMatrix.compose(_pos.set(-2.8 - length / 2, 0.12, (i - 1) * 0.85), _quat.identity(), flameScale.set(length, 0.035, 0.055));
          streaks.setMatrixAt(i, _matrix.copy(_truckMatrix).multiply(_partMatrix));
        }
        streaks.material.opacity = surge * alphaArray[leader] * 0.8;
        streaks.instanceMatrix.needsUpdate = true;
      }
    }

    if (import.meta.env.DEV) {
      const handle = (window.__ranking3d = window.__ranking3d || { glList: [] });
      handle.fleet = { items, positions, motion, t };
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
  }, [items, motionKey, goodC, badC, hoveredId, selectedId, reducedMotion, roadLength, paintMode, invalidate]);

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
      {truckParts.map((part, index) => (
        <FleetPart
          key={part.key}
          part={part}
          index={index}
          count={count}
          alphaArray={alphaArray}
          paintArray={paintArray}
          codeArray={codeArray}
          glyphTexture={glyphTexture}
          register={register}
          castShadow={castShadow}
        />
      ))}
      <mesh visible={false} raycast={pickRaycast} {...pickHandlers}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshBasicMaterial />
      </mesh>
      <instancedMesh name="prr-nitro-outer" ref={nitroOuter} args={[nitroGeometry, undefined, 2]} frustumCulled={false} raycast={noRaycast}>
        <meshBasicMaterial color="#16bfff" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
      <instancedMesh name="prr-nitro-inner" ref={nitroInner} args={[nitroGeometry, undefined, 2]} frustumCulled={false} raycast={noRaycast}>
        <meshBasicMaterial color="#d9fbff" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
      <instancedMesh name="prr-leader-streaks" ref={leaderStreaks} args={[undefined, undefined, 3]} frustumCulled={false} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffd36a" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
      <instancedMesh ref={arrowMesh} args={[arrowGeometry, undefined, Math.max(1, count)]} frustumCulled={false}>
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
    </group>
  );
}

/** Flat highlight ring on the asphalt under the selected truck (same cyan as the 2D spotlight). */
export function SelectionRing({ id, x, z, positionsRef, roadLength }) {
  const ref = useRef(null);
  const initial = sampleRoadFrame(x, z, roadLength);
  useFrame(() => {
    const p = positionsRef.current.get(id);
    if (p && ref.current) {
      ref.current.position.set(p.x, p.lift + 0.04, p.z);
      ref.current.quaternion.copy(roadQuaternion(p.heading, p.pitch)).multiply(_ringQuat);
    }
  });
  return (
    <mesh ref={ref} position={[initial.x, initial.y + 0.04, initial.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.62, 1]}>
      <ringGeometry args={[2.0, 2.25, 48]} />
      <meshBasicMaterial color="#38bdf8" />
    </mesh>
  );
}

function curvedStrip(length, width, centreZ, height, roadLength, across = 1) {
  const g = new THREE.PlaneGeometry(length, width, Math.min(512, Math.max(64, Math.ceil(length / 0.75))), across);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const f = sampleSceneryFrame(p.getX(i), p.getZ(i) + centreZ, roadLength);
    p.setXYZ(i, f.x, f.y + height, f.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Asphalt, shoulders and dashed lane markings (dashes merged into one InstancedMesh). */
export function Road({ roadLength, laneCount, laneWidth, theme, clockRef }) {
  const roadWidth = laneCount * laneWidth + 0.6;
  const pavedLength = getRoadsideSpan(roadLength);
  const edgeZ = roadWidth / 2 + 0.25;
  const surfaces = useMemo(() => ({
    ground: curvedStrip(pavedLength + 100, getRoadCurveRadius(roadLength) * 1.8, 0, -0.04, roadLength, 20),
    asphalt: curvedStrip(pavedLength, roadWidth, 0, 0, roadLength),
    shoulders: [edgeZ, -edgeZ].map(z => curvedStrip(pavedLength, 0.5, z, 0.04, roadLength))
  }), [roadLength, roadWidth, edgeZ, pavedLength]);
  useEffect(() => () => {
    surfaces.ground.dispose(); surfaces.asphalt.dispose(); surfaces.shoulders.forEach(g => g.dispose());
  }, [surfaces]);
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
    texture.repeat.set(pavedLength / 4, roadWidth / 4);
    return texture;
  }, [pavedLength, roadWidth]);
  useEffect(() => () => asphaltTexture.dispose(), [asphaltTexture]);

  const dashes = useMemo(() => {
    const list = [];
    const step = 4;
    const count = Math.floor(pavedLength / step);
    for (let boundary = 1; boundary < laneCount; boundary++) {
      const z = (boundary - laneCount / 2) * laneWidth;
      for (let i = 0; i < count; i++) list.push([-pavedLength / 2 + step / 2 + i * step, z]);
    }
    return list;
  }, [pavedLength, laneCount, laneWidth]);

  const writeRoad = () => {
    const mesh = dashRef.current;
    if (!mesh) return;
    const distance = clockRef.current.distance;
    const minX = -pavedLength / 2;
    const span = Math.floor(pavedLength / 4) * 4;
    dashes.forEach(([x, z], i) => {
      const f = sampleSceneryFrame(wrapRoadTravel(x, distance, minX, span), z, roadLength);
      _matrix.compose(_pos.set(f.x, f.y + 0.012, f.z), roadQuaternion(f.heading, f.pitch), _scale);
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

  return (
    <group>
      {/* ground: unlit, fades into the sky colour through the scene fog, so there is no horizon band */}
      <mesh geometry={surfaces.ground}>
        <meshBasicMaterial color={theme.ground} />
      </mesh>
      <mesh geometry={surfaces.asphalt} receiveShadow>
        <meshStandardMaterial color={theme.asphalt} map={asphaltTexture} roughness={0.95} />
      </mesh>
      {surfaces.shoulders.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
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
    if (!canvas) return;
    // The DOM canvas can commit after the Fiber scene (especially a cached
    // GLB mount). Initialise once it exists, rather than losing every label.
    if (!fontsRef.current) {
      const style = getComputedStyle(canvas);
      fontsRef.current = { family: style.fontFamily || 'sans-serif', mono: style.getPropertyValue('--font-mono').trim() || 'ui-monospace, Consolas, monospace' };
    }
    const fonts = fontsRef.current;
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
    const reserved = size.width < 400 ? 140 : compact ? 100 : BOTTOM_RESERVED;
    const placed = [{ l: 0, r: size.width, t: size.height - reserved, b: size.height }];
    const debug = [];
    for (const label of order) {
      const followed = label.followId ? positionsRef.current.get(label.followId) : null;
      if (followed && (followed.ghost || followed.alpha < 0.08)) continue;
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
      let left = cx - half;
      let top = above ? anchorY - box.h : anchorY - box.h / 2;
      const collides = h => placed.some(o => h.l < o.r && h.r > o.l && h.t < o.b && h.b > o.t);
      const bounds = (x, y) => ({ l: x - LABEL_PADDING, r: x + box.w + LABEL_PADDING, t: y - LABEL_PADDING, b: y + box.h + LABEL_PADDING });
      let hit = bounds(left, top);
      if (label.spec.medal && collides(hit)) {
        // Keep all three podium labels legible, with a tether to the real truck.
        let candidate = null;
        for (const dy of [0, -box.h - 8, -2 * (box.h + 8), box.h + 8]) {
          for (const dx of [0, -box.w - 8, box.w + 8]) {
            const x = Math.max(LABEL_PADDING, Math.min(size.width - box.w - LABEL_PADDING, left + dx));
            const y = Math.max(LABEL_PADDING, top + dy);
            const h = bounds(x, y);
            if (!collides(h)) { candidate = { x, y, h }; break; }
          }
          if (candidate) break;
        }
        if (candidate) { left = candidate.x; top = candidate.y; hit = candidate.h; }
      }
      if (collides(hit)) continue;
      placed.push(hit);
      ctx.save();
      ctx.globalAlpha = followed?.alpha ?? 1;
      if (label.spec.medal) {
        ctx.beginPath(); ctx.moveTo(left + box.w / 2, top + box.h); ctx.lineTo(cx, rawY + 8);
        ctx.strokeStyle = label.spec.medal; ctx.lineWidth = 1.5; ctx.stroke();
      }
      drawLabel(ctx, label.spec, box, left, top, fonts);
      ctx.restore();
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
