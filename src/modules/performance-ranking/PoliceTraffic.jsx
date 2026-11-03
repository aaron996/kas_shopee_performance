import React, { useMemo, useEffect, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { sampleRoadFrame } from '../../utils/sceneRoadCurve.js';
import { samplePoliceAnimation } from '../../utils/scenePoliceAnimation.js';

export default function PoliceTraffic({ trafficRef, clockRef, roadLength, reducedMotion }) {
  const root = useRef();
  const [bikeSource, officerSource] = useLoader(GLTFLoader, ['/models/csgt-motorcycle-v1.glb', '/models/csgt-check-sequence-v1.glb']);
  const asset = useMemo(() => {
    const bike = clone(bikeSource.scene), officer = clone(officerSource.scene);
    const materials = [];
    for (const scene of [bike, officer]) scene.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = node.receiveShadow = true;
      node.raycast = () => {};
      const source = Array.isArray(node.material) ? node.material : [node.material];
      const copies = source.map(m => { const copy = m.clone(); materials.push({ material: copy, opacity: copy.opacity, transparent: copy.transparent }); return copy; });
      node.material = Array.isArray(node.material) ? copies : copies[0];
    });
    const wheels = [];
    bike.traverse(n => { if (n.name.includes('wheel-')) wheels.push(n); });
    const mixer = new THREE.AnimationMixer(officer);
    return { bike, officer, mixer, wheels, materials };
  }, [bikeSource, officerSource]);
  useEffect(() => {
    const action = asset.mixer.clipAction(officerSource.animations[0]);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.reset().play();
    asset.action = action;
    asset.sampledTime = -1;
    for (const m of asset.materials) m.material.needsUpdate = true;
    return () => {
      asset.mixer.stopAllAction(); asset.mixer.uncacheRoot(asset.officer);
      for (const m of asset.materials) m.material.dispose();
    };
  }, [asset, officerSource]);
  useFrame(() => {
    const state = trafficRef.current, p = state?.police;
    if (!root.current) return;
    root.current.visible = Boolean(!reducedMotion && state?.mode === 'traffic' && p?.alpha > .001);
    if (!root.current.visible) return;
    const f = sampleRoadFrame(p.x, p.z, roadLength);
    root.current.position.set(f.x, f.y, f.z);
    root.current.rotation.set(0, f.heading, 0);
    root.current.rotateZ(f.pitch);
    asset.officer.position.set(.05, .02, 0);
    asset.officer.rotation.y = Math.PI / 2;
    const clipTime = p.phase === 'check' ? p.elapsed : 0;
    if (asset.sampledTime !== clipTime) {
      samplePoliceAnimation(asset.mixer, asset.action, clipTime);
      asset.sampledTime = clipTime;
    }
    for (const wheel of asset.wheels) wheel.rotation.z = -p.wheelTravel / .32;
    if (clockRef.current.step) {
      // Beacon lamps use the existing actor materials, no per-frame resources.
      for (const m of asset.materials) if (/Beacon/.test(m.material.name)) {
        m.material.emissive.copy(m.material.color);
        m.material.emissiveIntensity = Math.sin(state.time * 12 + (/Blue/.test(m.material.name) ? Math.PI : 0)) > 0 ? .7 : .05;
      }
    }
    if (import.meta.env.DEV && window.__ranking3d) window.__ranking3d.police = { ...p };
  });
  return <group ref={root} visible={false} dispose={null}>
    <primitive object={asset.bike} />
    <primitive object={asset.officer} />
  </group>;
}
