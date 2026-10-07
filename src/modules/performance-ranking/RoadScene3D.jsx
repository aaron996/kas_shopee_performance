import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  REPLAY_DURATION_MS,
  TRANSITION_DURATION_MS,
  assignRegionLanes,
  computeReplayFrames,
  computeSceneLayout,
  computeTransitionFrames,
  snapshotSceneFleet,
  getRegionRoadLength,
  getRoadLength
} from '../../utils/rankingSceneLayout.js';
import { Play } from 'lucide-react';
import { createDriveClock, DEFAULT_DRIVE_RATE } from '../../utils/sceneDriving.js';
import { pickSceneTheme } from '../../utils/sceneThemes.js';
import { sampleRoadFrame, getRoadCurveRadius } from '../../utils/sceneRoadCurve.js';
import { tvCameraGoal } from '../../utils/sceneCamera.js';
import {
  LabelProjector,
  Road,
  SelectionRing,
  TruckFleet,
  SHADOW_MAX_TRUCKS,
  DriveClock
} from './roadScene3dParts.jsx';

// Loaded via React.lazy so three stays out of the 2D path.
const STAGGER_LANE_COUNT = 4;
const LANE_WIDTH = 2.6; // breathing room for the taller GHN truck model
const LEADER_GAP = 6; // two truck lengths; visual rank emphasis, not a KPI distance
const FOV = 64; // wide perspective complements the bowed road and planet surface
const TILT_DEG = 35; // camera elevation above the road
const TARGET_Y = 1; // look slightly above the asphalt so truck labels fit
const TAGGED_TOP_N = 10; // Top N trucks always get a label (when it fits)
const ALWAYS_LABELLED = 3; // podium labels get first placement and collision offsets
const MEDAL_BORDER = ['#f5b800', '#b8c4d0', '#a0522d'];
const FOLLOW_OFFSET = new THREE.Vector3(-3.5, 5, 9); // camera offset from the followed truck
const QUALITY_MIN_FPS = 30; // median fps of a replay/transition below this counts as slow
const QUALITY_STRIKES = 2; // slow motions in a row before dropping to the low tier
const QUALITY_MIN_FRAMES = 12;
const FLIGHT_SPEED = 6; // exponential smoothing rate of the camera flight

// Auto-play the replay once per page load (not on every 2D/3D switch).
let autoReplayDone = false;

const FALLBACK_COLORS = { good: '#0f6e56', bad: '#a13b2a', isDark: false };

function readThemeColors() {
  if (typeof document === 'undefined') return FALLBACK_COLORS;
  const styles = getComputedStyle(document.body);
  const pick = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    good: pick('--status-success-fg', FALLBACK_COLORS.good),
    bad: pick('--status-danger-fg', FALLBACK_COLORS.bad),
    isDark: document.body.classList.contains('dark-mode')
  };
}

// Status colours use the same tokens as the legend dots; everything is re-read when the app
// toggles dark-mode on <body>.
function useThemeColors() {
  const [colors, setColors] = useState(readThemeColors);
  useEffect(() => {
    const update = () => {
      const next = readThemeColors();
      setColors((prev) => (prev.good === next.good && prev.bad === next.bad && prev.isDark === next.isDark ? prev : next));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

// Phones and tablets: no shadows and a lower pixel-ratio cap.
function useCompactDevice() {
  const [compact] = useState(() => window.matchMedia('(pointer: coarse), (max-width: 768px)').matches);
  return compact;
}

/**
 * Sky gradient (scene.background) and fog. The default camera looks down at the road, so most of
 * the time only the ground and its fade into the horizon colour are visible; the sky shows when the
 * user orbits down towards the horizon. Fog starts beyond the road so trucks are never washed out.
 */
function Atmosphere({ theme, roadLength }) {
  const sky = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, theme.skyTop);
    gradient.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [theme]);
  useEffect(() => () => sky.dispose(), [sky]);
  const near = roadLength * 0.9 + 60;
  return (
    <>
      <primitive object={sky} attach="background" />
      <fog attach="fog" args={[theme.horizon, near, near * 2.6 + 260]} />
    </>
  );
}

/**
 * Releases three's shared DFG look-up texture when the scene unmounts.
 *
 * three keeps one module-level `DataTexture` (the DFG LUT) for every MeshStandard / Lambert / Phong
 * material and each WebGLRenderer adds a 'dispose' listener to it that closes over that renderer.
 * Nothing removes the listener when the renderer is disposed, so every visit to the 3D scene left a
 * whole renderer (canvas, WebGL context object, and through the canvas the entire detached page
 * subtree, ~6 MB with the ranking table) reachable forever. Disposing the LUT fires the event and
 * removes the listener; the texture itself stays valid and is re-uploaded by the next renderer.
 * The LUT is read from a rendered material's uniforms while the scene is alive, because the material
 * (and its properties) is already gone when the unmount cleanup runs.
 */
function SharedTextureRelease() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const lutRef = useRef(null);

  useFrame(() => {
    if (lutRef.current) return;
    scene.traverse((object) => {
      if (lutRef.current || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const lut = gl.properties.get(material)?.uniforms?.dfgLUT?.value;
        if (lut) { lutRef.current = lut; return; }
      }
    });
  });

  useEffect(() => () => {
    if (lutRef.current) lutRef.current.dispose();
    lutRef.current = null;
  }, []);
  return null;
}

/** Reports WebGL context loss (GPU reset, driver crash, too many contexts) to the parent. */
function ContextWatcher({ onLost }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const handler = (event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener('webglcontextlost', handler);
    // removed on unmount, so the deliberate context release of a normal unmount does not count
    return () => canvas.removeEventListener('webglcontextlost', handler);
  }, [gl, onLost]);
  return null;
}

/** Gives the <canvas> itself an accessible name (role=img). */
function CanvasSetup({ label }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
  }, [gl, label]);
  return null;
}

/**
 * Defaults to a diagonal leading-stretch TV view, offers the whole-road overview,
 * or flies to a followed truck. Orbiting stays inside sane limits; the flight is skipped (camera
 * jumps) under prefers-reduced-motion, and any user drag cancels a flight.
 */
function CameraRig({ roadLength, roadWidth, focus, mode, reducedMotion, positionsRef }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controlsRef = useRef(null);
  const flightRef = useRef(null);
  const placedRef = useRef(false);
  const followedRef = useRef(null);

  // On a narrow canvas the whole road would shrink to a thin strip: frame the leading part of it
  // (rank 1 end) and let the user orbit or pinch for the rest. Wide canvases still frame it all.
  const aspectRatio = size.width / Math.max(1, size.height);
  const visibleSpan = aspectRatio >= 1.6 ? roadLength : Math.max(Math.min(roadLength, 26), roadLength * Math.max(0.4, aspectRatio / 1.6));
  const centerX = roadLength / 2 - visibleSpan / 2 - (visibleSpan < roadLength ? roadLength * 0.04 : 0);

  const fitDistance = useMemo(() => {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height));
    const horizontal = (visibleSpan * 0.54) / (tanHalf * aspect);
    const radius = getRoadCurveRadius(roadLength);
    const bow = radius * (1 - Math.cos(visibleSpan / (2 * radius)));
    const vertical = (roadWidth * 0.65 + 4 + bow * 0.35) / tanHalf;
    return Math.max(horizontal, vertical);
  }, [visibleSpan, roadLength, roadWidth, size.width, size.height]);

  const hasFocus = Boolean(focus);
  const focusX = focus ? focus.x : 0;
  const focusZ = focus ? focus.z : 0;

  const goal = useMemo(() => {
    if (hasFocus) {
      const f = sampleRoadFrame(focusX, focusZ, roadLength);
      const target = new THREE.Vector3(f.x, f.y + 0.8, f.z);
      return { target, position: target.clone().add(FOLLOW_OFFSET), fov: FOV };
    }
    if (mode === 'tv') {
      const tv = tvCameraGoal(roadLength, roadWidth, aspectRatio);
      return { target: new THREE.Vector3(...tv.target), position: new THREE.Vector3(...tv.position), fov: tv.fov };
    }
    const tilt = THREE.MathUtils.degToRad(TILT_DEG);
    const x = visibleSpan < roadLength ? centerX : 0;
    const f = sampleRoadFrame(x, 0, roadLength);
    const radius = getRoadCurveRadius(roadLength);
    const bow = radius * (1 - Math.cos(visibleSpan / (2 * radius)));
    const target = new THREE.Vector3(f.x, f.y + TARGET_Y, f.z + bow * 0.35);
    return {
      target, fov: FOV,
      position: target.clone().add(new THREE.Vector3(0, Math.sin(tilt) * fitDistance, Math.cos(tilt) * fitDistance))
    };
  }, [hasFocus, focusX, focusZ, fitDistance, visibleSpan, roadLength, roadWidth, centerX, mode, aspectRatio]);

  useLayoutEffect(() => {
    camera.near = 0.5;
    camera.far = fitDistance * 6 + 100;
    camera.fov = goal.fov;
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (!placedRef.current || reducedMotion) {
      camera.position.copy(goal.position);
      camera.lookAt(goal.target);
      if (controls) {
        controls.target.copy(goal.target);
        controls.update();
      }
      flightRef.current = null;
    } else {
      flightRef.current = goal;
    }
    placedRef.current = true;
    invalidate();
  }, [camera, goal, fitDistance, reducedMotion, invalidate]);

  useFrame((_, delta) => {
    const flight = flightRef.current;
    const controls = controlsRef.current;
    if (!controls) return;
    const pose = focus ? positionsRef.current.get(focus.id) : null;
    if (pose) {
      const previous = followedRef.current;
      if (previous?.id === focus.id) {
        // Translate the camera with its truck while preserving the user's
        // orbit angle and zoom. Rank changes never turn the camera around.
        const dx = pose.x - previous.x;
        const dz = pose.z - previous.z;
        const dy = pose.lift - previous.lift;
        camera.position.x += dx;
        camera.position.z += dz;
        camera.position.y += dy;
        controls.target.x += dx;
        controls.target.z += dz;
        controls.target.y += dy;
      }
      followedRef.current = { id: focus.id, x: pose.x, z: pose.z, lift: pose.lift };
      if (flight) {
        flight.target.set(pose.x, pose.lift + 0.8, pose.z);
        flight.position.copy(flight.target).add(FOLLOW_OFFSET);
      }
      controls.update();
    } else {
      followedRef.current = null;
    }
    if (!flight) return;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * FLIGHT_SPEED);
    camera.position.lerp(flight.position, k);
    controls.target.lerp(flight.target, k);
    controls.update();
    if (camera.position.distanceTo(flight.position) < 0.03 && controls.target.distanceTo(flight.target) < 0.03) {
      camera.position.copy(flight.position);
      controls.target.copy(flight.target);
      controls.update();
      flightRef.current = null;
    } else {
      invalidate(); // keep rendering while flying (frameloop is on demand)
    }
  }, -0.5);

  const keepTargetOnRoad = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    const limitX = roadLength / 2;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limitX, limitX);
    const radius = getRoadCurveRadius(roadLength);
    const bow = radius * (1 - Math.cos(roadLength / (2 * radius)));
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -roadWidth, roadWidth + bow);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, -roadLength * 0.1, 3);
  };

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={false}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2 - 0.08} // never below the road surface
      minDistance={6}
      maxDistance={Math.max(fitDistance * 1.35, goal.position.distanceTo(goal.target) * 1.5)}
      onStart={() => { flightRef.current = null; }}
      onChange={keepTargetOnRoad}
    />
  );
}

export default function RoadScene3D({
  sceneTrucks = [], selectedHubId = null, onSelectHub, onOpenDetail, onViewTable, onContextLost,
  d1Label = '', d8Label = '', metricLabel = '', target = null, running = true, reducedMotion = false, playbackRate = DEFAULT_DRIVE_RATE
}) {
  const colors = useThemeColors();
  const theme = pickSceneTheme(colors.isDark);
  const clockRef = useRef(createDriveClock());
  const [laneMode, setLaneMode] = useState('stagger'); // 'stagger' | 'region'
  const [paintMode, setPaintMode] = useState('hub'); // stable roof identity by default
  const [hoveredId, setHoveredId] = useState(null);
  const [camMode, setCamMode] = useState(selectedHubId ? 'follow' : 'tv');
  const sceneCamMode = useRef('tv'); // restore the chosen scene view after clearing a Hub

  // Clearing a followed Hub restores the last TV/overview choice.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedHubId);
  if (prevSelectedId !== selectedHubId) {
    setPrevSelectedId(selectedHubId);
    setCamMode(selectedHubId ? 'follow' : sceneCamMode.current);
  }

  const count = sceneTrucks.length;
  const regionMode = laneMode === 'region';
  const regionLanes = useMemo(() => (regionMode ? assignRegionLanes(sceneTrucks) : null), [regionMode, sceneTrucks]);
  const laneCount = regionLanes ? Math.max(1, regionLanes.lanes.length) : STAGGER_LANE_COUNT;
  const roadLength = regionMode ? getRegionRoadLength(sceneTrucks) + LEADER_GAP / 0.83 : getRoadLength(count);
  const roadWidth = laneCount * LANE_WIDTH + 0.6;
  const compact = useCompactDevice();
  // Adaptive quality: a motion that ran under QUALITY_MIN_FPS drops to the low tier for good.
  const [quality, setQuality] = useState('high');
  const lowQuality = quality === 'low';
  const shadowsOn = count <= SHADOW_MAX_TRUCKS && !compact && !lowQuality;
  const dprRange = lowQuality ? 0.8 : [1, compact ? 1.25 : 1.5];
  // One slow motion can be a hiccup (tab in background, first shader compile), so the tier only
  // drops after QUALITY_STRIKES slow motions in a row; a good one resets the count.
  const slowStrikes = useRef(0);
  const handleMotionStats = useCallback((stats) => {
    if (import.meta.env.DEV) {
      const handle = (window.__ranking3d = window.__ranking3d || { glList: [] });
      (handle.motionStats = handle.motionStats || []).push({ ...stats });
    }
    // Transitions follow a KPI/filter change, whose React work (re-ranking, ~1,000-row table) starves
    // the frames for reasons unrelated to the scene; only replays say anything about 3D speed.
    if (stats.kind !== 'replay' || stats.frames < QUALITY_MIN_FRAMES) return;
    if (stats.avgFps >= QUALITY_MIN_FPS) {
      slowStrikes.current = 0;
      return;
    }
    slowStrikes.current += 1;
    if (slowStrikes.current >= QUALITY_STRIKES) setQuality('low');
  }, []);

  const trucks = useMemo(() => {
    const layout = computeSceneLayout(sceneTrucks, { roadLength, laneCount, laneWidth: LANE_WIDTH, laneMode, leaderGap: LEADER_GAP });
    return layout.map((slot, i) => ({ ...slot, item: sceneTrucks[i], meetsTarget: Boolean(sceneTrucks[i].meetsTarget) }));
  }, [sceneTrucks, roadLength, laneCount, laneMode]);

  // What is actually on screen: the last committed trucks plus an optional motion
  // (a replay, or a transition from the previous layout). Computed during render so
  // the first frame of a transition already starts from the old positions.
  const motionCounter = useRef(0);
  const positionsRef = useRef(new Map());
  const [scene, setScene] = useState(() => ({ trucks, motion: null }));
  if (reducedMotion && scene.motion) setScene({ ...scene, motion: null });
  if (scene.trucks !== trucks) {
    // identical positions (e.g. only the selection changed): keep whatever is running
    let motion = reducedMotion ? null : scene.motion;
    if (!reducedMotion && scene.trucks.length > 0 && trucks.length > 0) {
      // A filter/lane change can interrupt replay. Start at the visible pose,
      // rather than teleporting back to the previous committed rank slots.
      const previous = snapshotSceneFleet(scene.motion?.items || scene.trucks, positionsRef.current);
      const transition = computeTransitionFrames(previous, trucks);
      if (transition.changed) {
        motion = { key: ++motionCounter.current, kind: 'transition', durationMs: TRANSITION_DURATION_MS, items: transition.items };
      }
    }
    setScene({ trucks, motion });
  }

  const canReplay = Boolean(d8Label) && trucks.some((t) => t.item.hasCommonBaseline === true);
  const replaying = Boolean(scene.motion && scene.motion.kind === 'replay');

  const startReplay = useCallback(() => {
    if (reducedMotion) return;
    const frames = computeReplayFrames(sceneTrucks, { roadLength, laneCount, laneWidth: LANE_WIDTH, laneMode, leaderGap: LEADER_GAP });
    const items = trucks.map((truck, i) => ({ ...truck, ...frames[i] }));
    setScene({ trucks, motion: { key: ++motionCounter.current, kind: 'replay', durationMs: REPLAY_DURATION_MS, items } });
  }, [sceneTrucks, trucks, roadLength, laneCount, laneMode, reducedMotion]);

  // First time the 3D scene is shown: replay once (never with reduced motion).
  useEffect(() => {
    if (autoReplayDone || reducedMotion || !canReplay || !running) return;
    autoReplayDone = true;
    startReplay();
  }, [canReplay, reducedMotion, startReplay, running]);

  const handleMotionEnd = useCallback((key) => {
    setScene((current) => (current.motion && current.motion.key === key ? { ...current, motion: null } : current));
  }, []);

  const replayRef = useRef({ active: false, t: 0 });
  const replayLabels = useMemo(() => ({ from: `D-8 ${d8Label}`, to: `D-1 ${d1Label}` }), [d8Label, d1Label]);
  const fleetItems = scene.motion ? scene.motion.items : scene.trucks;

  const selectedTruck = useMemo(() => trucks.find((t) => t.id === selectedHubId) || null, [trucks, selectedHubId]);
  const activeCamMode = camMode === 'follow' && !selectedTruck ? sceneCamMode.current : camMode;
  const focus = camMode === 'follow' && selectedTruck ? { id: selectedTruck.id, x: selectedTruck.x, z: selectedTruck.z } : null;

  // Labels drawn on the 2D overlay canvas by LabelProjector.
  const overlayRef = useRef(null);
  const labels = useMemo(() => {
    const list = [];
    if (regionLanes) {
      regionLanes.lanes.forEach((lane, i) => {
        const f = sampleRoadFrame(-roadLength / 2 + 0.6, (i - (laneCount - 1) / 2) * LANE_WIDTH, roadLength);
        list.push({
          key: `lane-${lane.key}`,
          position: [f.x, f.y + 0.4, f.z],
          anchor: 'center',
          priority: 65,
          spec: { kind: 'lane', text: lane.label }
        });
      });
    }
    trucks.forEach((truck, idx) => {
      const isSelected = truck.id === selectedHubId;
      const isHovered = truck.id === hoveredId;
      if (idx >= TAGGED_TOP_N && !isSelected && !isHovered) return;
      const item = truck.item;
      const f = sampleRoadFrame(truck.x, truck.z, roadLength);
      let delta = null;
      if (item.hasCommonBaseline === false) delta = { text: 'Mới', tone: 'none' };
      else if (item.deltaRank !== null && item.deltaRank !== 0) {
        delta = { text: item.deltaRank > 0 ? `+${item.deltaRank}` : String(item.deltaRank), tone: item.deltaRank > 0 ? 'up' : 'down' };
      }
      list.push({
        key: `tag-${truck.id}`,
        position: [f.x, f.y + 2.1, f.z],
        followId: truck.id,
        baseY: 2.1,
        anchor: 'above',
        priority: item.rank <= ALWAYS_LABELLED ? 120 - item.rank : isHovered ? 100 : isSelected ? 90 : 70 - idx * 0.1,
        nearOnly: !isSelected && !isHovered && idx >= ALWAYS_LABELLED,
        spec: {
          kind: 'tag',
          rank: item.rank,
          name: item.displayName || item.hub,
          kpi: `${item.kpiD1.toFixed(1)}%`,
          good: Boolean(item.meetsTarget),
          delta,
          warn: Boolean(item.isSmallSample),
          medal: item.rank >= 1 && item.rank <= 3 ? MEDAL_BORDER[item.rank - 1] : null,
          state: isHovered ? 'hover' : isSelected ? 'selected' : 'rest'
        }
      });
    });
    return list;
  }, [regionLanes, roadLength, laneCount, trucks, selectedHubId, hoveredId]);

  const handleSelect = useCallback((id) => {
    if (typeof onSelectHub === 'function') onSelectHub(id);
  }, [onSelectHub]);

  const handleKeyDown = (e) => {
    if (e.target !== e.currentTarget || trucks.length === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const current = trucks.findIndex((t) => t.id === selectedHubId);
      // better ranks sit further along +x (to the right), so ArrowRight = one rank up
      let next = current < 0 ? 0 : current + (e.key === 'ArrowRight' ? -1 : 1);
      next = Math.min(trucks.length - 1, Math.max(0, next));
      // the parent toggles on re-select, so never re-select the current Hub
      if (trucks[next].id !== selectedHubId) handleSelect(trucks[next].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedHubId) {
        if (typeof onOpenDetail === 'function') onOpenDetail();
      } else {
        handleSelect(trucks[0].id);
      }
    }
  };

  const handleContextLost = useCallback(() => {
    if (typeof onContextLost === 'function') onContextLost();
  }, [onContextLost]);

  const top3 = sceneTrucks.slice(0, 3).map((t) => `${t.displayName || t.hub} (hạng ${t.rank})`).join(', ');
  const meetCount = sceneTrucks.filter((t) => t.meetsTarget).length;
  const kpiPart = metricLabel ? `${metricLabel}${target != null ? `, mục tiêu ${target}%` : ''}: ` : '';
  const canvasLabel = `${kpiPart}${count} Hub trên đường, ${meetCount} đạt mục tiêu${top3 ? `. Dẫn đầu: ${top3}` : ''}. Số liệu chính xác xem ở bảng đối soát bên dưới.`;
  const ariaLabel = 'Cảnh 3D tuyến đường xếp hạng. Phím mũi tên trái phải để chuyển Hub, Enter để mở chi tiết.';
  const selectedItem = selectedTruck ? selectedTruck.item : null;

  return (
    <div
      className="prr-scene3d"
      role="group"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      <Canvas
        frameloop="demand"
        dpr={dprRange}
        shadows={shadowsOn ? 'percentage' : false}
        camera={{ position: [0, 9, 14], fov: FOV }}
        onCreated={({ gl, scene, camera }) => {
          // Dev-only handle for perf/leak measurement (docs/performance-ranking-3d.md, "Đo hiệu năng").
          // The light never moves, so the shadow map is re-rendered only when trucks change.
          gl.shadowMap.autoUpdate = false;
          gl.shadowMap.needsUpdate = true;
          if (import.meta.env.DEV) {
            const handle = (window.__ranking3d = window.__ranking3d || { glList: [] });
            handle.gl = gl;
            handle.scene = scene;
            handle.camera = camera;
            handle.glList.push(new WeakRef(gl)); // weak: the hook itself must not keep renderers alive
          }
        }}
      >
        <DriveClock clockRef={clockRef} items={fleetItems} motion={scene.motion} running={running && !reducedMotion} playbackRate={playbackRate} />
        <Atmosphere theme={theme} roadLength={roadLength} />
        <hemisphereLight args={[theme.hemisphere.sky, theme.hemisphere.ground, theme.hemisphere.intensity]} />
        <directionalLight
          position={[roadLength * 0.1, 26, 14]}
          color={theme.sun.color}
          intensity={theme.sun.intensity}
          castShadow={shadowsOn}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-roadLength / 2 - 6}
          shadow-camera-right={roadLength / 2 + 6}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-camera-near={1}
          shadow-camera-far={80}
          shadow-radius={4}
        />

        <Road roadLength={roadLength} laneCount={laneCount} laneWidth={LANE_WIDTH} theme={theme} clockRef={clockRef} />
        <TruckFleet
          // an InstancedMesh cannot be resized: remount when the number of drawn trucks changes
          key={fleetItems.length}
          items={fleetItems}
          motion={scene.motion}
          goodColor={colors.good}
          badColor={colors.bad}
          castShadow={shadowsOn}
          hoveredId={hoveredId}
          selectedId={selectedHubId}
          onHover={setHoveredId}
          onSelect={handleSelect}
          positionsRef={positionsRef}
          replayRef={replayRef}
          onMotionEnd={handleMotionEnd}
          onMotionStats={handleMotionStats}
          clockRef={clockRef}
          reducedMotion={reducedMotion}
          roadLength={roadLength}
          paintMode={paintMode}
        />
        {selectedTruck && (
          <SelectionRing id={selectedTruck.id} x={selectedTruck.x} z={selectedTruck.z} positionsRef={positionsRef} roadLength={roadLength} />
        )}

        <LabelProjector labels={labels} overlayRef={overlayRef} positionsRef={positionsRef} replayRef={replayRef} replayLabels={replayLabels} />
        <ContextWatcher onLost={handleContextLost} />
        <SharedTextureRelease />
        <CanvasSetup label={canvasLabel} />
        <CameraRig roadLength={roadLength} roadWidth={roadWidth} focus={focus} mode={activeCamMode} reducedMotion={reducedMotion} positionsRef={positionsRef} />
      </Canvas>

      <canvas ref={overlayRef} className="prr-3d-labels" aria-hidden="true" />

      <div className="prr-3d-controls">
        <div className="prr-segmented-limit" role="group" aria-label="Màu xe">
          <button type="button" className={`seg-btn ${paintMode === 'ghn' ? 'active' : ''}`} aria-pressed={paintMode === 'ghn'} onClick={() => setPaintMode('ghn')}>GHN</button>
          <button type="button" className={`seg-btn ${paintMode === 'hub' ? 'active' : ''}`} aria-pressed={paintMode === 'hub'} title="Mỗi Hub có dải màu nóc cố định, độc lập với KPI và thứ hạng" onClick={() => setPaintMode('hub')}>Theo Hub</button>
        </div>
        <button
          type="button"
          className="prr-replay-btn"
          disabled={!canReplay || replaying || !running || reducedMotion}
          title={reducedMotion ? 'Thiết bị đang bật chế độ giảm chuyển động' : !running ? 'Tiếp tục chuyển động xe để chạy replay' : canReplay ? 'Xem lại thứ hạng chuyển từ D-8 sang D-1 (hạng trong nhóm đối soát chung)' : 'Chưa có dữ liệu D-8 để so sánh'}
          onClick={startReplay}
        >
          <Play size={12} aria-hidden="true" />
          <span>Replay D-8 → D-1</span>
        </button>
        <div className="prr-segmented-limit" role="group" aria-label="Chế độ camera">
          <button type="button" className={`seg-btn ${activeCamMode === 'tv' ? 'active' : ''}`} aria-pressed={activeCamMode === 'tv'} title="Góc nhìn chéo dọc tuyến, tập trung vào nhóm dẫn đầu" onClick={() => { sceneCamMode.current = 'tv'; setCamMode('tv'); }}>TV cam</button>
          <button
            type="button"
            className={`seg-btn ${activeCamMode === 'overview' ? 'active' : ''}`}
            aria-pressed={activeCamMode === 'overview'}
            onClick={() => { sceneCamMode.current = 'overview'; setCamMode('overview'); }}
          >
            Toàn cảnh
          </button>
          <button
            type="button"
            className={`seg-btn ${camMode === 'follow' && selectedTruck ? 'active' : ''}`}
            aria-pressed={camMode === 'follow' && Boolean(selectedTruck)}
            disabled={!selectedTruck}
            title={selectedTruck ? undefined : 'Chọn một xe để camera bám theo'}
            onClick={() => setCamMode('follow')}
          >
            Bám xe
          </button>
        </div>
        <div className="prr-segmented-limit" role="group" aria-label="Cách chia làn">
          <button
            type="button"
            className={`seg-btn ${!regionMode ? 'active' : ''}`}
            aria-pressed={!regionMode}
            onClick={() => setLaneMode('stagger')}
          >
            Làn xen kẽ
          </button>
          <button
            type="button"
            className={`seg-btn ${regionMode ? 'active' : ''}`}
            aria-pressed={regionMode}
            onClick={() => setLaneMode('region')}
          >
            Làn theo Vùng
          </button>
        </div>
      </div>

      <div className="prr-3d-caption">
        <span>Vị trí thể hiện thứ hạng, không tỉ lệ với KPI</span>
        <button type="button" className="prr-3d-table-link" onClick={onViewTable}>Xem dạng bảng</button>
      </div>
      <div className="prr-3d-sr" aria-live="polite">
        {replaying ? `${running ? 'Đang chạy' : 'Đã tạm dừng'} Replay D-8 ${d8Label} sang D-1 ${d1Label}.` : selectedItem ? `Đã chọn Hub ${selectedItem.displayName || selectedItem.hub}, hạng ${selectedItem.rank}, KPI ${selectedItem.kpiD1.toFixed(1)}%.` : ''}
      </div>
    </div>
  );
}
