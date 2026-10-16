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
  easeInOutCubic,
  snapshotSceneFleet,
  getRegionRoadLength,
  getRoadLength
} from '../../utils/rankingSceneLayout.js';
import { RotateCcw, Video, Scan, Focus, Pin, Route } from 'lucide-react';
import { Shuffle, MoveRight } from 'lucide';
import MorphIcon from '../../components/ui/MorphIcon.jsx';
import useSceneIdle from './useSceneIdle.js';
import { createTrafficExtras } from '../../utils/sceneIdle.js';
import TrafficUnloading from './TrafficUnloading.jsx';
import { createDriveClock, DEFAULT_DRIVE_RATE } from '../../utils/sceneDriving.js';
import { WORLD_REGIONS, worldTheme, initialWorld, createWorldJourney } from '../../utils/sceneWorld.js';
import WorldEnvironment, { TruckEnvironment } from './WorldEnvironment.jsx';
import LeaderTrail from './LeaderTrail.jsx';
import { INITIAL_DAY_PHASE } from '../../utils/sceneLighting.js';
import SceneLighting from './SceneLighting.jsx';
import SceneTimeControl from './SceneTimeControl.jsx';
import TruckRoadLighting from './TruckRoadLighting.jsx';
import RankingLeaderboard from './RankingLeaderboard.jsx';
import './sceneLighting.css';
import { sampleRoadFrame, getRoadCurveRadius } from '../../utils/sceneRoadCurve.js';
import { followCameraGoal, tvCameraGoal } from '../../utils/sceneCamera.js';
import { createTourConvoy, tourProgress, tourShot, viewOffset, RANKING_ROAD_LENGTH, VIEW_TOUR_DURATION_MS, VIEW_TOUR_REVEAL } from '../../utils/rankingViewTour.js';
import {
  LabelProjector,
  Road,
  SelectionRing,
  TruckFleet,
  SHADOW_MAX_TRUCKS,
  DriveClock
} from './roadScene3dParts.jsx';

// Loaded via React.lazy to keep three out of the initial dashboard bundle.
const STAGGER_LANE_COUNT = 4;
const LANE_WIDTH = 2.6; // breathing room for the taller GHN truck model
const LEADER_GAP = 6; // two truck lengths; visual rank emphasis, not a KPI distance
const FOV = 64; // wide perspective complements the bowed road and planet surface
const INITIAL_CAMERA = { position: [0, 9, 14], fov: FOV }; // keep orbit when lighting controls re-render
// CSS landscape rotates the stage; its bounding box swaps axes, but the camera
// and label canvas need the local layout dimensions before that transform.
const CANVAS_RESIZE = { offsetSize: true };
const TILT_DEG = 35; // camera elevation above the road
const TARGET_Y = 1; // look slightly above the asphalt so truck labels fit
const TAGGED_TOP_N = 10; // Top N trucks always get a label (when it fits)
const ALWAYS_LABELLED = 3; // podium labels get first placement and collision offsets
const MEDAL_BORDER = ['#f5b800', '#b8c4d0', '#a0522d'];
const QUALITY_MIN_FPS = 30; // median fps of a replay/transition below this counts as slow
const QUALITY_STRIKES = 2; // slow motions in a row before dropping to the low tier
const QUALITY_MIN_FRAMES = 12;
const FLIGHT_SPEED = 6; // exponential smoothing rate of the camera flight

// Auto-play the replay once per page load (not on every scene remount).
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

// Phones and tablets use smaller shadow maps and a lower pixel-ratio cap.
function useCompactDevice() {
  const [compact, setCompact] = useState(() => window.matchMedia('(pointer: coarse), (max-width: 768px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse), (max-width: 768px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return compact;
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
function CameraRig({ roadLength, localLength, rankView, roadWidth, focus, mode, running, reducedMotion, animateViewChange, positionsRef, motion, clockRef, tour, onTourReveal, onTourEnd }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controlsRef = useRef(null);
  const flightRef = useRef(null);
  const placedRef = useRef(false);
  const followedRef = useRef(null);
  const tourRef = useRef(null);
  const cameraViewRef = useRef(rankView);
  const localLengthRef = useRef(localLength);
  const cameraGoalRef = useRef(null);

  useEffect(() => {
    const resetTime = () => { if (tourRef.current) tourRef.current.lastTime = performance.now(); };
    document.addEventListener('visibilitychange', resetTime);
    return () => document.removeEventListener('visibilitychange', resetTime);
  }, []);
  useEffect(() => {
    if (tourRef.current) tourRef.current.lastTime = performance.now();
    if (running) invalidate();
  }, [running, invalidate]);

  // On a narrow canvas the whole road would shrink to a thin strip: frame the leading part of it
  // (rank 1 end) and let the user orbit or pinch for the rest. Wide canvases still frame it all.
  const aspectRatio = size.width / Math.max(1, size.height);
  const visibleSpan = aspectRatio >= 1.6 ? localLength : Math.max(Math.min(localLength, 26), localLength * Math.max(0.4, aspectRatio / 1.6));
  const offsetX = viewOffset(rankView, localLength);
  const centerX = offsetX + (rankView === 'worst' ? -1 : 1) * (localLength / 2 - visibleSpan / 2 - (visibleSpan < localLength ? localLength * 0.04 : 0));

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
      const follow = followCameraGoal(f, aspectRatio);
      return { target: new THREE.Vector3(...follow.target), position: new THREE.Vector3(...follow.position), fov: follow.fov };
    }
    if (mode === 'tv') {
      const tv = tvCameraGoal(roadLength, roadWidth, aspectRatio, { view: rankView, localLength, offsetX });
      return { target: new THREE.Vector3(...tv.target), position: new THREE.Vector3(...tv.position), fov: tv.fov, roadX: tv.roadX };
    }
    const tilt = THREE.MathUtils.degToRad(TILT_DEG);
    const x = visibleSpan < localLength ? centerX : offsetX;
    const f = sampleRoadFrame(x, 0, roadLength);
    const radius = getRoadCurveRadius(roadLength);
    const bow = radius * (1 - Math.cos(visibleSpan / (2 * radius)));
    const target = new THREE.Vector3(f.x, f.y + TARGET_Y, f.z + bow * 0.35);
    return {
      target, fov: FOV,
      position: target.clone().add(new THREE.Vector3(0, Math.sin(tilt) * fitDistance, Math.cos(tilt) * fitDistance))
    };
  }, [hasFocus, focusX, focusZ, fitDistance, visibleSpan, roadLength, localLength, roadWidth, centerX, offsetX, rankView, mode, aspectRatio]);

  const tourKey = tour?.key;
  const motionKey = motion?.key;

  useLayoutEffect(() => {
    const sameGoal = cameraGoalRef.current === goal;
    cameraGoalRef.current = goal;
    // Finishing fleet motion must not restart a flight cancelled by an orbit.
    if (sameGoal && !motionKey && !tourKey && !reducedMotion) {
      if (flightRef.current?.motionKey) {
        camera.position.copy(goal.position);
        controlsRef.current.target.copy(goal.target);
        controlsRef.current.update();
        flightRef.current = null;
      }
      return;
    }
    camera.near = 0.5;
    camera.far = Math.max(fitDistance * 6 + 100, roadLength * 2);
    if (!tourKey || reducedMotion) camera.fov = goal.fov;
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    const instantSwitch = !animateViewChange && cameraViewRef.current !== rankView;
    cameraViewRef.current = rankView;
    const resizing = localLengthRef.current !== localLength || Boolean(flightRef.current?.motionKey);
    localLengthRef.current = localLength;
    if (!placedRef.current || reducedMotion || instantSwitch) {
      camera.position.copy(goal.position);
      camera.lookAt(goal.target);
      if (controls) {
        controls.target.copy(goal.target);
        controls.update();
      }
      flightRef.current = null;
      tourRef.current = null;
    } else if (tourKey) {
      const radius = getRoadCurveRadius(roadLength);
      const fromTarget = controls.target.clone();
      const startX = Math.asin(THREE.MathUtils.clamp(fromTarget.x / radius, -1, 1)) * radius;
      tourRef.current = {
        key: tourKey, elapsed: 0, lastTime: performance.now(), revealed: false, startX,
        startTarget: fromTarget, startPosition: camera.position.clone(), startFov: camera.fov
      };
      flightRef.current = null;
    } else {
      tourRef.current = null;
      const clock = clockRef.current;
      // A count change moves the cohort along the road. Keep its camera on
      // the fleet's simulation clock instead of flying ahead to an empty slot.
      // Retarget from the displayed shot when another count interrupts it.
      flightRef.current = resizing && motion?.kind === 'transition' && !hasFocus ? {
        ...goal, motionKey, durationMs: motion.durationMs,
        startProgress: easeInOutCubic(clock.motionElapsed / motion.durationMs),
        startPosition: camera.position.clone(), startTarget: controls.target.clone()
      } : goal;
    }
    placedRef.current = true;
    invalidate();
  }, [camera, goal, fitDistance, reducedMotion, animateViewChange, rankView, invalidate, roadLength, localLength, tourKey, motionKey, motion?.kind, motion?.durationMs, hasFocus, clockRef]);

  useFrame((_, delta) => {
    const flight = flightRef.current;
    const controls = controlsRef.current;
    if (!controls) return;
    const travel = tourRef.current;
    if (travel) {
      const now = performance.now();
      if (document.hidden || !running) { travel.lastTime = now; return; }
      // Wall time keeps the camera trip at 3s even on a low-FPS device;
      // document visibility resets the timestamp without skipping the trip.
      travel.elapsed += now - travel.lastTime;
      travel.lastTime = now;
      const t = Math.min(1, travel.elapsed / VIEW_TOUR_DURATION_MS);
      const p = tourProgress(t);
      const shot = tourShot(p);
      const roadX = THREE.MathUtils.lerp(travel.startX, goal.roadX, p);
      const direction = Math.sign(goal.roadX - travel.startX);
      const frame = sampleRoadFrame(roadX + direction * shot.lookAhead, 0, roadLength);
      const startFrame = sampleRoadFrame(travel.startX, 0, roadLength);
      const targetOnRoad = new THREE.Vector3(frame.x, frame.y + 0.6, frame.z);
      const correction = travel.startTarget.clone().sub(new THREE.Vector3(startFrame.x, startFrame.y + 0.6, startFrame.z)).multiplyScalar(1 - p);
      controls.target.copy(targetOnRoad).add(correction);
      const cameraOffset = travel.startPosition.clone().sub(travel.startTarget).lerp(goal.position.clone().sub(goal.target), p);
      cameraOffset.multiplyScalar(shot.distanceScale);
      cameraOffset.y += shot.lift;
      camera.position.copy(controls.target).add(cameraOffset);
      camera.fov = THREE.MathUtils.lerp(travel.startFov, goal.fov, p) + shot.fovOffset;
      camera.updateProjectionMatrix();
      controls.update();
      if (!travel.revealed && p >= VIEW_TOUR_REVEAL) {
        travel.revealed = true;
        onTourReveal(travel.key);
      }
      if (import.meta.env.DEV && window.__ranking3d) window.__ranking3d.tour = { key: travel.key, t, p, roadX, view: rankView, stage: shot.stage };
      if (t === 1) {
        camera.position.copy(goal.position);
        controls.target.copy(goal.target);
        controls.update();
        tourRef.current = null;
        onTourEnd(travel.key);
      } else invalidate();
      return;
    }
    const pose = focus ? positionsRef.current.get(focus.id) : null;
    if (pose) {
      const previous = followedRef.current;
      if (previous?.id === focus.id) {
        // Translate the camera with its truck while preserving the user's
        // orbit angle and zoom. Rank changes never turn the camera around.
        const weight = reducedMotion || flight ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * FLIGHT_SPEED);
        const dx = (pose.x - previous.x) * weight;
        const dz = (pose.z - previous.z) * weight;
        const dy = (pose.lift - previous.lift) * weight;
        camera.position.x += dx;
        camera.position.z += dz;
        camera.position.y += dy;
        controls.target.x += dx;
        controls.target.z += dz;
        controls.target.y += dy;
        followedRef.current = { id: focus.id, x: previous.x + dx, z: previous.z + dz, lift: previous.lift + dy };
        if (Math.abs(pose.x - followedRef.current.x) + Math.abs(pose.z - followedRef.current.z) > 0.003) invalidate();
      } else {
        followedRef.current = { id: focus.id, x: pose.x, z: pose.z, lift: pose.lift };
      }
      if (flight) {
        const follow = followCameraGoal({ ...pose, y: pose.lift }, aspectRatio);
        flight.target.fromArray(follow.target);
        flight.position.fromArray(follow.position);
      }
      controls.update();
    } else {
      followedRef.current = null;
    }
    if (!flight) return;
    if (flight.motionKey) {
      const t = Math.min(1, clockRef.current.motionElapsed / flight.durationMs);
      const p = flight.startProgress < 1 ? Math.max(0, (easeInOutCubic(t) - flight.startProgress) / (1 - flight.startProgress)) : 1;
      camera.position.lerpVectors(flight.startPosition, flight.position, p);
      controls.target.lerpVectors(flight.startTarget, flight.target, p);
      controls.update();
      if (t >= 1) flightRef.current = null;
      else if (running) invalidate();
      return;
    }
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
      enabled={!tourKey}
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
  d1Label = '', d8Label = '', metricLabel = '', target = null, running = true, reducedMotion = false, playbackRate = DEFAULT_DRIVE_RATE,
  rankView = 'best', animateViewChange = true
}) {
  const colors = useThemeColors();
  const idle = useSceneIdle(reducedMotion);
  // UI theme changes label/status colours; the world follows its own solar time.
  const [world, setWorld] = useState(() => {
    try { return initialWorld(localStorage.getItem('ghn-ranking-world-pin')); }
    catch { return initialWorld(); }
  });
  const [pinnedWorld, setPinnedWorld] = useState(() => { try { return Boolean(localStorage.getItem('ghn-ranking-world-pin')); } catch { return false; } });
  const [automaticWorld, setAutomaticWorld] = useState(false);
  const journeyRef = useRef(createWorldJourney(world));
  const worldInteractionRef = useRef(false);
  const theme = useMemo(() => worldTheme(world), [world]);
  useEffect(() => {
    try {
      if (pinnedWorld) localStorage.setItem('ghn-ranking-world-pin', world);
      else localStorage.removeItem('ghn-ranking-world-pin');
    } catch { /* Storage can be disabled; the current scene remains usable. */ }
  }, [world, pinnedWorld]);
  const clockRef = useRef(createDriveClock());
  const trafficRef = useRef(null);
  const [lightingMode, setLightingMode] = useState('auto');
  const phaseRef = useRef(INITIAL_DAY_PHASE);
  const lightingRef = useRef(null);
  const timeRef = useRef(null);
  const laneMode = 'stagger'; // 'stagger' | 'region'
  const paintMode = 'hub'; // stable roof identity by default
  const [hoveredId, setHoveredId] = useState(null);
  const [camMode, setCamMode] = useState(selectedHubId ? 'follow' : 'tv');
  const sceneCamMode = useRef('tv'); // restore the chosen scene view after clearing a Hub
  const [previousView, setPreviousView] = useState(rankView);
  if (previousView !== rankView) {
    setPreviousView(rankView);
    sceneCamMode.current = 'tv';
    setCamMode('tv');
    setHoveredId(null);
  }

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
  const localLength = regionMode ? getRegionRoadLength(sceneTrucks) + LEADER_GAP / 0.83 : getRoadLength(count);
  const roadLength = RANKING_ROAD_LENGTH;
  const roadWidth = laneCount * LANE_WIDTH + 0.6;
  const compact = useCompactDevice();
  // Adaptive quality: a motion that ran under QUALITY_MIN_FPS drops to the low tier for good.
  const [quality, setQuality] = useState('high');
  const lowQuality = quality === 'low';
  const shadowsOn = count <= SHADOW_MAX_TRUCKS && !lowQuality;
  const streetlightCount = lowQuality ? 0 : compact || count > SHADOW_MAX_TRUCKS ? 2 : 4;
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
    const layout = computeSceneLayout(sceneTrucks, { roadLength: localLength, laneCount, laneWidth: LANE_WIDTH, laneMode, leaderGap: LEADER_GAP, view: rankView, offsetX: viewOffset(rankView, localLength) });
    return layout.map((slot, i) => ({ ...slot, item: sceneTrucks[i], meetsTarget: Boolean(sceneTrucks[i].meetsTarget), worstOrder: rankView === 'worst' ? i + 1 : null }));
  }, [sceneTrucks, localLength, laneCount, laneMode, rankView]);

  // What is actually on screen: the last committed trucks plus an optional motion
  // (a replay, or a transition from the previous layout). Computed during render so
  // the first frame of a transition already starts from the old positions.
  const motionCounter = useRef(0);
  const positionsRef = useRef(new Map());
  const [scene, setScene] = useState(() => ({ trucks, desired: trucks, view: rankView, motion: null, tour: null }));
  if (scene.view !== rankView) {
    const previous = snapshotSceneFleet(scene.motion?.items || scene.trucks, positionsRef.current);
    const tour = reducedMotion || !animateViewChange ? null : {
      key: ++motionCounter.current, items: createTourConvoy(previous), revealed: false
    };
    setScene({ trucks: tour ? scene.trucks : trucks, desired: trucks, view: rankView, motion: null, tour });
  } else if (reducedMotion && (scene.motion || scene.tour)) {
    setScene({ ...scene, trucks, desired: trucks, motion: null, tour: null });
  } else if (scene.desired !== trucks) {
    // identical positions (e.g. only the selection changed): keep whatever is running
    let motion = reducedMotion ? null : scene.motion;
    if (!scene.tour && !reducedMotion && scene.trucks.length > 0 && trucks.length > 0) {
      // A filter/lane change can interrupt replay. Start at the visible pose,
      // rather than teleporting back to the previous committed rank slots.
      const previous = snapshotSceneFleet(scene.motion?.items || scene.trucks, positionsRef.current);
      const transition = computeTransitionFrames(previous, trucks, { maxCount: 50, view: rankView });
      if (transition.changed) {
        motion = { key: ++motionCounter.current, kind: 'transition', durationMs: TRANSITION_DURATION_MS, items: transition.items };
      } else motion = null;
    }
    setScene({ trucks, desired: trucks, view: rankView, motion, tour: null });
  }

  const canReplay = !scene.tour && Boolean(d8Label) && trucks.some((t) => t.item.hasCommonBaseline === true);
  const replaying = Boolean(scene.motion && scene.motion.kind === 'replay');

  const startReplay = useCallback(() => {
    if (reducedMotion) return;
    const frames = computeReplayFrames(sceneTrucks, { roadLength: localLength, laneCount, laneWidth: LANE_WIDTH, laneMode, leaderGap: LEADER_GAP, view: rankView, offsetX: viewOffset(rankView, localLength) });
    const items = trucks.map((truck, i) => ({ ...truck, ...frames[i] }));
    setScene({ trucks, desired: trucks, view: rankView, tour: null, motion: { key: ++motionCounter.current, kind: 'replay', durationMs: REPLAY_DURATION_MS, items } });
  }, [sceneTrucks, trucks, localLength, laneCount, laneMode, reducedMotion, rankView]);

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
  const fleetItems = scene.tour && !scene.tour.revealed ? scene.tour.items : scene.motion ? scene.motion.items : scene.trucks;
  const drawItems = useMemo(() => [...fleetItems, ...createTrafficExtras(fleetItems)], [fleetItems]);
  const revealTour = useCallback(key => {
    setScene(current => current.tour?.key === key ? { ...current, trucks: current.desired, tour: { ...current.tour, revealed: true } } : current);
  }, []);
  const finishTour = useCallback(key => {
    setScene(current => current.tour?.key === key ? { ...current, trucks: current.desired, tour: null } : current);
  }, []);

  const selectedTruck = useMemo(() => trucks.find((t) => t.id === selectedHubId) || null, [trucks, selectedHubId]);
  const activeCamMode = scene.tour ? 'tv' : camMode === 'follow' && !selectedTruck ? sceneCamMode.current : camMode;
  const focus = !scene.tour && camMode === 'follow' && selectedTruck ? { id: selectedTruck.id, x: selectedTruck.x, z: selectedTruck.z } : null;

  // Labels drawn on the 2D overlay canvas by LabelProjector.
  const overlayRef = useRef(null);
  const hudRef = useRef(null);
  const labels = useMemo(() => {
    if (scene.tour && !scene.tour.revealed) return [];
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
        priority: idx < ALWAYS_LABELLED ? 120 - idx : isHovered ? 100 : isSelected ? 90 : 70 - idx * 0.1,
        nearOnly: !isSelected && !isHovered && idx >= ALWAYS_LABELLED,
        spec: {
          kind: 'tag',
          rank: item.rank,
          viewRank: rankView === 'worst' ? idx + 1 : null,
          emphasized: idx < ALWAYS_LABELLED,
          // Past the podium a tag shrinks to one row (rank + name) until hovered/selected, so a packed convoy stays readable.
          mini: idx >= ALWAYS_LABELLED && !isSelected && !isHovered,
          sample: Number.isFinite(item.sampleD1) ? `n ${item.sampleD1.toLocaleString('vi-VN')}` : null,
          name: item.displayName || item.hub,
          kpi: `${item.kpiD1.toFixed(1)}%`,
          good: Boolean(item.meetsTarget),
          delta,
          warn: Boolean(item.isSmallSample),
          medal: rankView === 'best' && item.rank >= 1 && item.rank <= 3 ? MEDAL_BORDER[item.rank - 1] : null,
          state: isHovered ? 'hover' : isSelected ? 'selected' : 'rest'
        }
      });
    });
    return list;
  }, [regionLanes, roadLength, laneCount, trucks, selectedHubId, hoveredId, rankView, scene.tour]);

  const handleSelect = useCallback((id) => {
    if (typeof onSelectHub === 'function') onSelectHub(id);
  }, [onSelectHub]);

  const handleKeyDown = (e) => {
    if (e.target !== e.currentTarget || trucks.length === 0 || scene.tour) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const current = trucks.findIndex((t) => t.id === selectedHubId);
      // better ranks sit further along +x (to the right), so ArrowRight = one rank up
      let next = current < 0 ? 0 : current + (e.key === 'ArrowRight' ? -1 : 1) * (rankView === 'worst' ? -1 : 1);
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
  const canvasLabel = `${rankView === 'worst' ? 'Worst' : 'Best'}. ${kpiPart}${count} Hub trên đường, ${meetCount} đạt mục tiêu${top3 ? `. ${rankView === 'worst' ? 'Cuối bảng' : 'Dẫn đầu'}: ${top3}` : ''}. Mở Bảng số liệu để xem số liệu chính xác.`;
  const ariaLabel = 'Cảnh 3D tuyến đường xếp hạng. Phím mũi tên trái phải để chuyển Hub, Enter để mở chi tiết.';
  const selectedItem = selectedTruck ? selectedTruck.item : null;
  const leaderboard = useMemo(() => sceneTrucks.slice(0, 5), [sceneTrucks]);

  return (
    <div
      className="prr-scene3d"
      data-rank-view={rankView}
      data-world={world}
      data-view-tour={scene.tour ? 'travelling' : 'idle'}
      data-idle-enabled={idle.enabled}
      data-idle-active={idle.active && !scene.motion && !scene.tour}
      role="group"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      onPointerDown={() => { worldInteractionRef.current = true; }}
      onPointerUp={() => { worldInteractionRef.current = false; }}
      onPointerCancel={() => { worldInteractionRef.current = false; }}
      onPointerLeave={() => { worldInteractionRef.current = false; }}
    >
      <Canvas
        resize={CANVAS_RESIZE}
        frameloop="demand"
        dpr={dprRange}
        shadows={shadowsOn ? 'percentage' : false}
        camera={INITIAL_CAMERA}
        onCreated={({ gl, scene, camera }) => {
          // Dev-only handle for perf/leak measurement (docs/performance-ranking-3d.md, "Đo hiệu năng").
          // Moving casters refresh in the same frame; unchanged paused maps can be reused.
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
        <DriveClock clockRef={clockRef} items={drawItems} motion={scene.motion} running={running && !reducedMotion} playbackRate={playbackRate}
          trafficRef={trafficRef} idleActive={idle.active && !scene.motion && !scene.tour} roadWidth={roadWidth} reducedMotion={reducedMotion} />
        <TruckEnvironment lightingRef={lightingRef} />
        <WorldEnvironment world={world} journeyRef={journeyRef} roadLength={roadLength} roadWidth={roadWidth} clockRef={clockRef}
          lightingRef={lightingRef} streetlightCount={streetlightCount} castShadow={shadowsOn} compact={compact || lowQuality} running={running}
          reducedMotion={reducedMotion} automatic={automaticWorld && !pinnedWorld && !compact}
          blocked={Boolean(scene.tour || selectedHubId || hoveredId)} interactionRef={worldInteractionRef} onAutomatic={setWorld} />
        <SceneLighting mode={lightingMode} phaseRef={phaseRef} lightingRef={lightingRef} clockRef={clockRef} running={running} reducedMotion={reducedMotion}
          roadLength={roadLength} shadowsOn={shadowsOn} compact={compact} timeRef={timeRef} journeyRef={journeyRef} />

        <Road roadLength={roadLength} laneCount={laneCount} laneWidth={LANE_WIDTH} theme={theme} clockRef={clockRef} journeyRef={journeyRef} trafficRef={trafficRef} />
        <TruckFleet
          // an InstancedMesh cannot be resized: remount when the number of drawn trucks changes
          key={drawItems.length}
          items={drawItems}
          motion={scene.motion}
          trafficRef={trafficRef}
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
          roadWidth={roadWidth}
          paintMode={paintMode}
        />
        <TrafficUnloading positionsRef={positionsRef} roadLength={roadLength} />
        <LeaderTrail items={fleetItems} positionsRef={positionsRef} clockRef={clockRef} roadLength={roadLength}
          journeyRef={journeyRef} compact={compact || lowQuality} reducedMotion={reducedMotion} motion={scene.motion} />
        <TruckRoadLighting key={`lighting-${drawItems.length}`} items={drawItems} positionsRef={positionsRef} roadLength={roadLength} lightingRef={lightingRef} />
        {selectedTruck && !scene.tour && (
          <SelectionRing id={selectedTruck.id} x={selectedTruck.x} z={selectedTruck.z} positionsRef={positionsRef} roadLength={roadLength} />
        )}

        <LabelProjector hudRef={hudRef} labels={labels} overlayRef={overlayRef} positionsRef={positionsRef} replayRef={replayRef} replayLabels={replayLabels} />
        <ContextWatcher onLost={handleContextLost} />
        <SharedTextureRelease />
        <CanvasSetup label={canvasLabel} />
        <CameraRig roadLength={roadLength} localLength={localLength} rankView={rankView} roadWidth={roadWidth} focus={focus} mode={activeCamMode} running={running} reducedMotion={reducedMotion} animateViewChange={animateViewChange} positionsRef={positionsRef}
          motion={scene.motion} clockRef={clockRef} tour={scene.tour} onTourReveal={revealTour} onTourEnd={finishTour} />
      </Canvas>

      <canvas ref={overlayRef} className="prr-3d-labels" aria-hidden="true" />
      <div className="prr-world-controls" role="group" aria-label="Vùng cảnh quan">
        <select aria-label="Chọn vùng cảnh quan" value={world} onChange={event => setWorld(event.target.value)} disabled={Boolean(scene.tour)}>
          {WORLD_REGIONS.map(region => <option key={region.id} value={region.id}>{region.label}</option>)}
        </select>
        <button type="button" aria-label="Giữ vùng yêu thích" aria-pressed={pinnedWorld} title="Giữ vùng này cho lần mở tiếp theo" onClick={() => setPinnedWorld(value => !value)}><Pin size={16} aria-hidden="true" /></button>
        {!compact && <button type="button" aria-label="Tự động đổi vùng" aria-pressed={automaticWorld} disabled={reducedMotion || pinnedWorld}
          title={pinnedWorld ? 'Bỏ ghim vùng để bật hành trình tự động' : 'Tự động đổi vùng sau 55 giây đang xem'} onClick={() => setAutomaticWorld(value => !value)}><Route size={16} aria-hidden="true" /></button>}
      </div>
      <SceneTimeControl mode={lightingMode} onChange={setLightingMode} timeRef={timeRef} />
      {scene.tour && <div className="prr-tour-status" role="status">{rankView === 'worst' ? 'Lùi về cuối đoàn · Worst' : 'Tiến về đầu đoàn · Best'}</div>}

      <div className="prr-3d-controls">
        <button type="button" className="prr-replay-btn prr-idle-toggle"
          aria-label="Mô phỏng giao thông khi rời trình duyệt" aria-pressed={idle.enabled}
          disabled={reducedMotion}
          title={reducedMotion ? 'Thiết bị đang bật chế độ giảm chuyển động' : idle.enabled ? 'Idle đang bật · Rời trình duyệt 10 giây để mô phỏng giao thông' : 'Idle đang tắt · Bật mô phỏng giao thông khi rời trình duyệt'}
          onClick={() => idle.setEnabled(value => !value)}>
          <MorphIcon icon={idle.enabled ? Shuffle : MoveRight} size={16} />
        </button>
        <button
          type="button"
          className="prr-replay-btn"
          aria-label="Xem lại thay đổi thứ hạng D-8 sang D-1"
          disabled={!canReplay || replaying || !running || reducedMotion}
          title={reducedMotion ? 'Thiết bị đang bật chế độ giảm chuyển động' : !running ? 'Tiếp tục chuyển động xe để chạy replay' : canReplay ? 'Xem lại thứ hạng chuyển từ D-8 sang D-1 (hạng trong nhóm đối soát chung)' : 'Chưa có dữ liệu D-8 để so sánh'}
          onClick={startReplay}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        <div className="prr-segmented-limit" role="group" aria-label="Chế độ camera">
          <button type="button" disabled={Boolean(scene.tour)} className={`seg-btn prr-camera-icon ${activeCamMode === 'tv' ? 'active' : ''}`} aria-label="TV cam" aria-pressed={activeCamMode === 'tv'} title="TV cam · Góc nhìn chéo dọc tuyến, tập trung vào nhóm đang xem" onClick={() => { sceneCamMode.current = 'tv'; setCamMode('tv'); }}><Video size={16} aria-hidden="true" /></button>
          <button
            type="button"
            className={`seg-btn prr-camera-icon ${activeCamMode === 'overview' ? 'active' : ''}`}
            aria-label="Toàn cảnh"
            title="Toàn cảnh"
            disabled={Boolean(scene.tour)}
            aria-pressed={activeCamMode === 'overview'}
            onClick={() => { sceneCamMode.current = 'overview'; setCamMode('overview'); }}
          >
            <Scan size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`seg-btn prr-camera-icon ${camMode === 'follow' && selectedTruck ? 'active' : ''}`}
            aria-label="Bám xe"
            aria-pressed={camMode === 'follow' && Boolean(selectedTruck)}
            disabled={!selectedTruck || Boolean(scene.tour)}
            title={selectedTruck ? 'Bám xe' : 'Bám xe · Chọn một xe để camera bám theo'}
            onClick={() => setCamMode('follow')}
          >
            <Focus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="prr-3d-hud" ref={hudRef}>
        <RankingLeaderboard items={leaderboard} rankView={rankView} selectedHubId={selectedHubId}
          onSelect={handleSelect} onViewTable={onViewTable} d8Label={d8Label} />
      </div>
      <div className="prr-3d-sr" aria-live="polite">
        {replaying ? `${running ? 'Đang chạy' : 'Đã tạm dừng'} Replay D-8 ${d8Label} sang D-1 ${d1Label}.` : selectedItem ? `Đã chọn Hub ${selectedItem.displayName || selectedItem.hub}, hạng ${selectedItem.rank}, KPI ${selectedItem.kpiD1.toFixed(1)}%.` : ''}
      </div>
    </div>
  );
}
