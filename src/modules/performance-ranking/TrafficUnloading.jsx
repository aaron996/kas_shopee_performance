import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { sampleRoadFrame } from '../../utils/sceneRoadCurve.js';
import { easeInOutCubic } from '../../utils/rankingSceneLayout.js';

// At most two delivery stops run together. Reuse these small groups rather
// than creating objects or React state at frame rate. All movement derives
// from the paused traffic clock, including the three finite parcel handoffs.
export default function TrafficUnloading({ positionsRef, roadLength }) {
  const bays = useRef([]);
  const workers = useRef([]);
  const parcels = useRef([]);
  const carried = useRef([]);
  useFrame(() => {
    const stopped = [...positionsRef.current.values()].filter(p => p.alpha > 0.1 && ['unloading', 'waiting'].includes(p.trafficPhase));
    for (let i = 0; i < 2; i++) {
      const group = bays.current[i], pose = stopped[i];
      if (!group) continue;
      group.visible = Boolean(pose);
      if (!pose) continue;
      const f = sampleRoadFrame(pose.roadX, pose.roadZ, roadLength);
      group.position.set(f.x, f.y, f.z);
      group.rotation.set(0, f.heading, f.pitch, 'YXZ');
      const progress = pose.unloadProgress * 3;
      const done = Math.min(3, Math.floor(progress));
      const leg = progress - done;
      const walk = done === 3 ? 1 : easeInOutCubic(leg < 0.65 ? leg / 0.65 : (1 - leg) / 0.35);
      workers.current[i]?.position.set(-2.05, 0, -0.5 - walk * 1.1);
      const box = carried.current[i];
      if (box) { box.visible = done < 3 && leg < 0.65; box.position.set(-1.8, 0.85, -0.5 - walk * 1.1); }
      for (let p = 0; p < 3; p++) if (parcels.current[i * 3 + p]) parcels.current[i * 3 + p].visible = p < done;
    }
  }, -0.5);
  return <group name="prr-traffic-unloading">
    {[0, 1].map(i => <group key={i} visible={false} ref={node => { bays.current[i] = node; }}>
      <group ref={node => { workers.current[i] = node; }}>
        <mesh position={[0, 0.83, 0]}><boxGeometry args={[0.36, 0.58, 0.28]} /><meshStandardMaterial color="#f97316" /></mesh>
        <mesh position={[0, 1.29, 0]}><sphereGeometry args={[0.16, 8, 6]} /><meshStandardMaterial color="#e5b78d" /></mesh>
        <mesh position={[0, 1.41, 0]}><sphereGeometry args={[0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#f97316" /></mesh>
        {[-0.1, 0.1].map(x => <mesh key={x} position={[x, 0.28, 0]}><boxGeometry args={[0.12, 0.55, 0.15]} /><meshStandardMaterial color="#24354b" /></mesh>)}
        <mesh position={[0.2, 0.85, 0]}><boxGeometry args={[0.35, 0.12, 0.12]} /><meshStandardMaterial color="#f97316" /></mesh>
      </group>
      <mesh ref={node => { carried.current[i] = node; }}><boxGeometry args={[0.5, 0.4, 0.4]} /><meshStandardMaterial color="#c58b4e" /></mesh>
      {[0, 1, 2].map(p => <group key={p} position={[-1.8 + (p % 2) * 0.6, 0.22 + Math.floor(p / 2) * 0.44, -1.85]} ref={node => { parcels.current[i * 3 + p] = node; }}>
        <mesh><boxGeometry args={[0.54, 0.42, 0.45]} /><meshStandardMaterial color="#c58b4e" /></mesh>
        <mesh position={[0, 0.216, 0]}><boxGeometry args={[0.1, 0.015, 0.46]} /><meshStandardMaterial color="#f0dcaf" /></mesh>
      </group>)}
    </group>)}
  </group>;
}
