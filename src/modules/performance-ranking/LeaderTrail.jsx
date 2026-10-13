import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createLeaderTrail, emitLeaderTrail, sampleTrailParticle } from '../../utils/sceneLeaderTrail.js';
import { sampleRoadFrame } from '../../utils/sceneRoadCurve.js';
import { worldRegion } from '../../utils/sceneWorld.js';

function densityTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 60);
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)'); gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
function patchAlpha(shader) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float trailAlpha; varying float vTrailAlpha;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrailAlpha = trailAlpha;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTrailAlpha;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vTrailAlpha;');
}
export default function LeaderTrail({ items, positionsRef, clockRef, roadLength, journeyRef, compact, reducedMotion, motion }) {
  const meshRef = useRef(null), count = compact ? 12 : 32;
  const resources = useMemo(() => {
    const alpha = new Float32Array(count), geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('trailAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    return { alpha, geometry, texture: densityTexture(), pool: createLeaderTrail(count), matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(), scale: new THREE.Vector3(), rotation: new THREE.Quaternion(), axis: new THREE.Vector3(0, 0, 1), turn: new THREE.Quaternion(), color: new THREE.Color() };
  }, [count]);
  useEffect(() => () => { resources.geometry.dispose(); resources.texture.dispose(); }, [resources]);
  useEffect(() => { if (reducedMotion) resources.pool = createLeaderTrail(count); }, [resources, reducedMotion, count]);
  useFrame(({ camera }) => {
    const mesh = meshRef.current, clock = clockRef.current;
    if (reducedMotion) {
      mesh.count = 0;
      if (import.meta.env.DEV && window.__ranking3d) window.__ranking3d.leaderTrail = { count: 0, capacity: count, leader: null };
      return;
    }
    const leader = items.find(item => !item.ghost && !item.worstOrder && item.item?.rank === 1);
    const pose = leader && positionsRef.current.get(leader.id);
    if (clock.step && pose?.alpha > 0.3) emitLeaderTrail(resources.pool, { ...pose, id: leader.id }, clock.time, clock.distance, journeyRef.current.to, compact ? 0.12 : 0.055);
    let visible = 0;
    for (const particle of resources.pool.particles) {
      const state = sampleTrailParticle(particle, clock.time, clock.distance);
      if (!state) continue;
      const frame = sampleRoadFrame(state.roadX, state.roadZ, roadLength);
      resources.position.set(frame.x, frame.y + state.y, frame.z);
      resources.rotation.copy(camera.quaternion).multiply(resources.turn.setFromAxisAngle(resources.axis, state.roll));
      resources.matrix.compose(resources.position, resources.rotation, resources.scale.set(state.size * 1.3, state.size, 1));
      mesh.setMatrixAt(visible, resources.matrix);
      mesh.setColorAt(visible, resources.color.set(worldRegion(particle.region).trail));
      const surge = motion ? Math.sin(Math.PI * Math.min(1, clock.motionElapsed / motion.durationMs)) : 0;
      resources.alpha[visible] = state.alpha * (1 + surge * 0.5); visible++;
    }
    mesh.count = visible; mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    resources.geometry.attributes.trailAlpha.needsUpdate = true;
    if (import.meta.env.DEV && window.__ranking3d) window.__ranking3d.leaderTrail = { count: visible, capacity: count, leader: leader?.id || null };
  }, -0.05);
  return <instancedMesh name="prr-leader-trail" ref={meshRef} args={[resources.geometry, undefined, count]} frustumCulled={false} raycast={() => {}}>
    <meshBasicMaterial color="#ffffff" map={resources.texture} transparent depthWrite={false} side={THREE.DoubleSide}
      onBeforeCompile={patchAlpha} customProgramCacheKey={() => 'leader-trail-v1'} />
  </instancedMesh>;
}
