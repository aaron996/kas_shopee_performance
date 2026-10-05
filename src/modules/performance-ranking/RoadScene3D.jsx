import React from 'react';
import { Canvas } from '@react-three/fiber';

// Sprint 0 placeholder: background + a flat road surface. Trucks, lanes and
// camera rig arrive in Sprint 1. Loaded via React.lazy so three stays out of
// the 2D path.
const SCENE_BG = '#0f172a';
const ROAD_COLOR = '#475569';

export default function RoadScene3D() {
  return (
    <div
      className="prr-scene3d"
      role="img"
      aria-label="Cảnh 3D tuyến đường xếp hạng Hub. Số liệu chính xác xem ở bảng đối soát bên dưới."
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [0, 9, 14], fov: 40 }}
      >
        <color attach="background" args={[SCENE_BG]} />
        <hemisphereLight args={['#e2e8f0', '#334155', 2]} />
        <directionalLight position={[6, 12, 8]} intensity={1.5} />
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[40, 8]} />
          <meshStandardMaterial color={ROAD_COLOR} />
        </mesh>
      </Canvas>
    </div>
  );
}
