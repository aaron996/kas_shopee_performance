import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  assignRegionLanes,
  computeSceneLayout,
  getRegionRoadLength,
  getRoadLength
} from '../../utils/rankingSceneLayout.js';
import {
  Checkpoint,
  LabelProjector,
  Road,
  SelectionRing,
  Trucks,
  SHADOW_MAX_TRUCKS
} from './roadScene3dParts.jsx';
import TruckTag from './TruckTag.jsx';

// Loaded via React.lazy so three stays out of the 2D path.
const SCENE_BG = '#0f172a';
const STAGGER_LANE_COUNT = 4;
const LANE_WIDTH = 1.8;
const FOV = 40;
const TILT_DEG = 35; // camera elevation above the road
const TARGET_Y = 1; // look slightly above the asphalt so gantries and labels fit
const SLA_FRACTION = 0.93; // SLA gate just past the last truck slot (0.88)
const START_GATE_FRACTION = 0.015;
const START_COLOR = '#38bdf8';
const SLA_COLOR = '#f59e0b';
const TAGGED_TOP_N = 10; // Top N trucks always get a label (when it fits)
const FOLLOW_OFFSET = new THREE.Vector3(-3.5, 5, 9); // camera offset from the followed truck
const FLIGHT_SPEED = 6; // exponential smoothing rate of the camera flight

const FALLBACK_COLORS = { good: '#0f6e56', bad: '#a13b2a' };

function readThemeColors() {
  if (typeof document === 'undefined') return FALLBACK_COLORS;
  const styles = getComputedStyle(document.body);
  const pick = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    good: pick('--status-success-fg', FALLBACK_COLORS.good),
    bad: pick('--status-danger-fg', FALLBACK_COLORS.bad)
  };
}

// Same tokens as the legend dots; re-read when the app toggles dark-mode on <body>.
function useThemeColors() {
  const [colors, setColors] = useState(readThemeColors);
  useEffect(() => {
    const update = () => {
      const next = readThemeColors();
      setColors((prev) => (prev.good === next.good && prev.bad === next.bad ? prev : next));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Frames the whole road at ~35 degrees ("Toàn cảnh") or flies to a followed truck
 * ("Bám xe"). Orbiting stays inside sane limits; the flight is skipped (camera
 * jumps) under prefers-reduced-motion, and any user drag cancels a flight.
 */
function CameraRig({ roadLength, roadWidth, focus, reducedMotion }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controlsRef = useRef(null);
  const flightRef = useRef(null);
  const placedRef = useRef(false);

  const fitDistance = useMemo(() => {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height));
    const horizontal = (roadLength * 0.54) / (tanHalf * aspect);
    const vertical = 11 / tanHalf; // road width + gantry height + labels
    return Math.max(horizontal, vertical);
  }, [roadLength, size.width, size.height]);

  const hasFocus = Boolean(focus);
  const focusX = focus ? focus.x : 0;
  const focusZ = focus ? focus.z : 0;

  const goal = useMemo(() => {
    if (hasFocus) {
      const target = new THREE.Vector3(focusX, 0.8, focusZ);
      return { target, position: target.clone().add(FOLLOW_OFFSET) };
    }
    const tilt = THREE.MathUtils.degToRad(TILT_DEG);
    return {
      target: new THREE.Vector3(0, TARGET_Y, 0),
      position: new THREE.Vector3(0, TARGET_Y + Math.sin(tilt) * fitDistance, Math.cos(tilt) * fitDistance)
    };
  }, [hasFocus, focusX, focusZ, fitDistance]);

  useLayoutEffect(() => {
    camera.near = 0.5;
    camera.far = fitDistance * 6 + 100;
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
    if (!flight || !controls) return;
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
  });

  const keepTargetOnRoad = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    const limitX = roadLength / 2;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limitX, limitX);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -roadWidth, roadWidth);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 3);
  };

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={false}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2 - 0.08} // never below the road surface
      minDistance={6}
      maxDistance={fitDistance * 1.35}
      onStart={() => { flightRef.current = null; }}
      onChange={keepTargetOnRoad}
    />
  );
}

export default function RoadScene3D({ sceneTrucks = [], selectedHubId = null, onSelectHub, onOpenDetail }) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const [laneMode, setLaneMode] = useState('stagger'); // 'stagger' | 'region'
  const [hoveredId, setHoveredId] = useState(null);
  const [camMode, setCamMode] = useState('overview'); // 'overview' | 'follow'

  // Selecting a Hub flies the camera to it; clearing the selection returns to the overview.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedHubId);
  if (prevSelectedId !== selectedHubId) {
    setPrevSelectedId(selectedHubId);
    setCamMode(selectedHubId ? 'follow' : 'overview');
  }

  const count = sceneTrucks.length;
  const regionMode = laneMode === 'region';
  const regionLanes = useMemo(() => (regionMode ? assignRegionLanes(sceneTrucks) : null), [regionMode, sceneTrucks]);
  const laneCount = regionLanes ? Math.max(1, regionLanes.lanes.length) : STAGGER_LANE_COUNT;
  const roadLength = regionMode ? getRegionRoadLength(sceneTrucks) : getRoadLength(count);
  const roadWidth = laneCount * LANE_WIDTH + 0.6;
  const shadowsOn = count <= SHADOW_MAX_TRUCKS;

  const trucks = useMemo(() => {
    const layout = computeSceneLayout(sceneTrucks, { roadLength, laneCount, laneWidth: LANE_WIDTH, laneMode });
    return layout.map((slot, i) => ({ ...slot, item: sceneTrucks[i], meetsTarget: Boolean(sceneTrucks[i].meetsTarget) }));
  }, [sceneTrucks, roadLength, laneCount, laneMode]);

  const selectedTruck = useMemo(() => trucks.find((t) => t.id === selectedHubId) || null, [trucks, selectedHubId]);
  const focus = camMode === 'follow' && selectedTruck ? { x: selectedTruck.x, z: selectedTruck.z } : null;

  const startX = (START_GATE_FRACTION - 0.5) * roadLength;
  const slaX = (SLA_FRACTION - 0.5) * roadLength;

  // HTML labels over the canvas, positioned by LabelProjector.
  const labelRefs = useRef(new Map());
  const labels = useMemo(() => {
    const list = [
      {
        key: 'start',
        position: [startX, 4.3, 0],
        anchor: 'center',
        priority: 60,
        content: <div className="prr-3d-checkpoint" style={{ borderColor: START_COLOR }}>Điểm tiếp nhận &amp; điều phối</div>
      },
      {
        key: 'sla',
        position: [slaX, 4.3, 0],
        anchor: 'center',
        priority: 60,
        content: <div className="prr-3d-checkpoint" style={{ borderColor: SLA_COLOR }}>Mốc chuẩn SLA</div>
      }
    ];
    if (regionLanes) {
      regionLanes.lanes.forEach((lane, i) => {
        list.push({
          key: `lane-${lane.key}`,
          position: [-roadLength / 2 + 0.6, 0.4, (i - (laneCount - 1) / 2) * LANE_WIDTH],
          anchor: 'center',
          priority: 65,
          content: <div className="prr-3d-lane-label">{lane.label}</div>
        });
      });
    }
    trucks.forEach((truck, idx) => {
      const isSelected = truck.id === selectedHubId;
      const isHovered = truck.id === hoveredId;
      if (idx >= TAGGED_TOP_N && !isSelected && !isHovered) return;
      list.push({
        key: `tag-${truck.id}`,
        position: [truck.x, 2.1 + (isHovered ? 0.25 : 0), truck.z],
        anchor: 'above',
        priority: isHovered ? 100 : isSelected ? 90 : 70 - idx * 0.1,
        nearOnly: !isSelected && !isHovered,
        className: isHovered ? 'is-hover' : isSelected ? 'is-selected' : '',
        content: <TruckTag item={truck.item} className="prr-truck-tag--3d" />
      });
    });
    return list;
  }, [startX, slaX, regionLanes, roadLength, laneCount, trucks, selectedHubId, hoveredId]);

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

  const top3 = sceneTrucks.slice(0, 3).map((t) => `${t.displayName || t.hub} (hạng ${t.rank})`).join(', ');
  const ariaLabel = `Cảnh 3D tuyến đường xếp hạng, ${count} Hub${top3 ? `, dẫn đầu: ${top3}` : ''}. Phím mũi tên trái phải để chuyển Hub, Enter để mở chi tiết. Số liệu chính xác xem ở bảng đối soát bên dưới.`;
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
        dpr={[1, 1.5]}
        shadows={shadowsOn ? 'percentage' : false}
        camera={{ position: [0, 9, 14], fov: FOV }}
      >
        <color attach="background" args={[SCENE_BG]} />
        <hemisphereLight args={['#e2e8f0', '#334155', 2]} />
        <directionalLight
          position={[roadLength * 0.1, 26, 14]}
          intensity={1.5}
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

        <Road roadLength={roadLength} laneCount={laneCount} laneWidth={LANE_WIDTH} sceneBackground={SCENE_BG} />
        <Checkpoint x={startX} roadWidth={roadWidth} color={START_COLOR} />
        <Checkpoint x={slaX} roadWidth={roadWidth} color={SLA_COLOR} line />
        <Trucks
          trucks={trucks}
          goodColor={colors.good}
          badColor={colors.bad}
          castShadow={shadowsOn}
          hoveredId={hoveredId}
          selectedId={selectedHubId}
          onHover={setHoveredId}
          onSelect={handleSelect}
        />
        {selectedTruck && <SelectionRing x={selectedTruck.x} z={selectedTruck.z} />}

        <LabelProjector labels={labels} elements={labelRefs} />
        <CameraRig roadLength={roadLength} roadWidth={roadWidth} focus={focus} reducedMotion={reducedMotion} />
      </Canvas>

      <div className="prr-3d-labels" aria-hidden="true">
        {labels.map((label) => (
          <div
            key={label.key}
            ref={(el) => {
              if (el) labelRefs.current.set(label.key, el);
              else labelRefs.current.delete(label.key);
            }}
            className={`prr-3d-label ${label.className || ''}`.trim()}
          >
            {label.content}
          </div>
        ))}
      </div>

      <div className="prr-3d-controls">
        <div className="prr-segmented-limit" role="group" aria-label="Chế độ camera">
          <button
            type="button"
            className={`seg-btn ${camMode === 'overview' || !selectedTruck ? 'active' : ''}`}
            aria-pressed={camMode === 'overview' || !selectedTruck}
            onClick={() => setCamMode('overview')}
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

      <div className="prr-3d-caption">Vị trí thể hiện thứ hạng, không tỉ lệ với KPI</div>
      <div className="prr-3d-sr" aria-live="polite">
        {selectedItem ? `Đã chọn Hub ${selectedItem.displayName || selectedItem.hub}, hạng ${selectedItem.rank}, KPI ${selectedItem.kpiD1.toFixed(1)}%.` : ''}
      </div>
    </div>
  );
}
