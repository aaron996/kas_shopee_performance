import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { computeSceneLayout, getRoadLength } from '../../utils/rankingSceneLayout.js';
import { Checkpoint, LabelProjector, Road, Trucks, SHADOW_MAX_TRUCKS } from './roadScene3dParts.jsx';

// Loaded via React.lazy so three stays out of the 2D path.
const SCENE_BG = '#0f172a';
const LANE_COUNT = 4;
const LANE_WIDTH = 1.8;
const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH + 0.6;
const FOV = 40;
const TILT_DEG = 35; // camera elevation above the road
const TARGET_Y = 1; // look slightly above the asphalt so gantries and labels fit
const SLA_FRACTION = 0.93; // SLA gate just past the last truck slot (0.88)
const START_GATE_FRACTION = 0.015;

const START_COLOR = '#38bdf8';
const SLA_COLOR = '#f59e0b';

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

/** Frames the whole road at ~35 degrees and keeps orbiting inside sane limits. */
function CameraRig({ roadLength }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controlsRef = useRef(null);

  const fitDistance = useMemo(() => {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height));
    const horizontal = (roadLength * 0.54) / (tanHalf * aspect);
    const vertical = 11 / tanHalf; // road width + gantry height + labels
    return Math.max(horizontal, vertical);
  }, [roadLength, size.width, size.height]);

  useLayoutEffect(() => {
    const tilt = THREE.MathUtils.degToRad(TILT_DEG);
    camera.position.set(0, TARGET_Y + Math.sin(tilt) * fitDistance, Math.cos(tilt) * fitDistance);
    camera.near = 0.5;
    camera.far = fitDistance * 6 + 100;
    camera.updateProjectionMatrix();
    camera.lookAt(0, TARGET_Y, 0);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(0, TARGET_Y, 0);
      controls.update();
    }
    invalidate();
  }, [camera, fitDistance, invalidate]);

  const keepTargetOnRoad = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    const limitX = roadLength / 2;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limitX, limitX);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -ROAD_WIDTH, ROAD_WIDTH);
    controls.target.y = TARGET_Y;
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
      onChange={keepTargetOnRoad}
    />
  );
}

export default function RoadScene3D({ sceneTrucks = [] }) {
  const colors = useThemeColors();
  const count = sceneTrucks.length;
  const roadLength = getRoadLength(count);
  const shadowsOn = count <= SHADOW_MAX_TRUCKS;

  const trucks = useMemo(() => {
    const layout = computeSceneLayout(sceneTrucks, { roadLength, laneCount: LANE_COUNT, laneWidth: LANE_WIDTH });
    return layout.map((slot, i) => ({ ...slot, meetsTarget: Boolean(sceneTrucks[i].meetsTarget) }));
  }, [sceneTrucks, roadLength]);

  const startX = (START_GATE_FRACTION - 0.5) * roadLength;
  const slaX = (SLA_FRACTION - 0.5) * roadLength;
  const labelRefs = useRef(new Map());
  const labels = useMemo(() => [
    { key: 'start', position: [startX, 4.3, 0], text: 'Điểm tiếp nhận & điều phối', color: START_COLOR },
    { key: 'sla', position: [slaX, 4.3, 0], text: 'Mốc chuẩn SLA', color: SLA_COLOR }
  ], [startX, slaX]);

  const top3 = sceneTrucks.slice(0, 3).map((t) => `${t.displayName || t.hub} (hạng ${t.rank})`).join(', ');
  const ariaLabel = `Cảnh 3D tuyến đường xếp hạng, ${count} Hub${top3 ? `, dẫn đầu: ${top3}` : ''}. Số liệu chính xác xem ở bảng đối soát bên dưới.`;

  return (
    <div className="prr-scene3d" role="img" aria-label={ariaLabel}>
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

        <Road roadLength={roadLength} laneCount={LANE_COUNT} laneWidth={LANE_WIDTH} sceneBackground={SCENE_BG} />
        <Checkpoint x={startX} roadWidth={ROAD_WIDTH} color={START_COLOR} />
        <Checkpoint x={slaX} roadWidth={ROAD_WIDTH} color={SLA_COLOR} line />
        <Trucks trucks={trucks} goodColor={colors.good} badColor={colors.bad} castShadow={shadowsOn} />

        <LabelProjector labels={labels} elements={labelRefs} />
        <CameraRig roadLength={roadLength} />
      </Canvas>
      <div className="prr-3d-labels" aria-hidden="true">
        {labels.map((label) => (
          <div
            key={label.key}
            ref={(el) => {
              if (el) labelRefs.current.set(label.key, el);
              else labelRefs.current.delete(label.key);
            }}
            className="prr-3d-checkpoint"
            style={{ borderColor: label.color }}
          >
            {label.text}
          </div>
        ))}
      </div>
      <div className="prr-3d-caption">Vị trí thể hiện thứ hạng, không tỉ lệ với KPI</div>
    </div>
  );
}
