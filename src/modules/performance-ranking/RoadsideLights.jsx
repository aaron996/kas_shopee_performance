import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { roadsideWorldPose } from '../../utils/sceneRoadside.js';
import { selectStreetlightSources } from '../../utils/sceneStreetlights.js';

function makePoolTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const index = (y * size + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = 255;
    data[index + 3] = Math.round(Math.max(0, 1 - r * r) ** 3 * 255);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export default function RoadsideLights({ lamps, fleet, roadLength, clockRef, lightingRef, sourceCount }) {
  const bulbsRef = useRef(null), poolsRef = useRef(null), halosRef = useRef(null);
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => ({
    matrix: new THREE.Matrix4(), position: new THREE.Vector3(), scale: new THREE.Vector3(),
    rotation: new THREE.Quaternion(), yaw: new THREE.Quaternion(), pitch: new THREE.Quaternion(),
    x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1),
    texture: makePoolTexture(), positions: lamps.map(() => new THREE.Vector3()),
    targets: lamps.map(() => new THREE.Vector3()),
    slots: Array.from({ length: sourceCount }, () => ({ ref: React.createRef(), target: new THREE.Object3D() }))
  }), [lamps, sourceCount]);
  useLayoutEffect(() => {
    bulbsRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    poolsRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    halosRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    invalidate();
    return () => resources.texture.dispose();
  }, [resources, invalidate]);
  const initialized = useRef(null);
  const wasLit = useRef(false);

  useFrame(({ controls, camera }) => {
    const { matrix, position, scale, rotation, yaw, pitch, positions, targets, slots } = resources;
    const power = lightingRef?.current?.streetlightPower || 0;
    const lit = power > 0.001;
    if (initialized.current !== resources || clockRef.current.step || (lit && !wasLit.current)) {
      for (let index = 0; index < lamps.length; index++) {
        const lamp = lamps[index], anchor = fleet.clusters.get(lamp.anchor).anchor;
        const emitter = roadsideWorldPose(lamp.emitter, anchor, roadLength);
        positions[index].set(emitter.x, emitter.y, emitter.z);
        rotation.setFromAxisAngle(resources.y, emitter.heading).multiply(pitch.setFromAxisAngle(resources.z, emitter.pitch));
        matrix.compose(position.copy(positions[index]), rotation, scale.fromArray(lamp.emitter.scale));
        bulbsRef.current.setMatrixAt(index, matrix);
        if (lit) {
          const pool = roadsideWorldPose(lamp.footprint, anchor, roadLength);
          rotation.setFromAxisAngle(resources.y, pool.heading).multiply(pitch.setFromAxisAngle(resources.z, pool.pitch)).multiply(yaw.setFromAxisAngle(resources.x, -Math.PI / 2));
          matrix.compose(position.set(pool.x, pool.y, pool.z), rotation, scale.set(lamp.footprint.scale[0], lamp.footprint.scale[2], 1));
          poolsRef.current.setMatrixAt(index, matrix);
          const target = roadsideWorldPose(lamp.target, anchor, roadLength);
          targets[index].set(target.x, target.y, target.z);
        }
      }
      bulbsRef.current.instanceMatrix.needsUpdate = true;
      if (lit) poolsRef.current.instanceMatrix.needsUpdate = true;
      initialized.current = resources;
    }
    wasLit.current = lit;
    bulbsRef.current.material.emissiveIntensity = power * 4;
    poolsRef.current.material.opacity = power * 0.15;
    poolsRef.current.visible = lit;
    halosRef.current.material.opacity = power * 0.5;
    halosRef.current.visible = lit;
    if (lit) {
      positions.forEach((emitter, index) => {
        matrix.compose(position.copy(emitter), camera.quaternion, scale.set(0.95, 0.95, 1));
        halosRef.current.setMatrixAt(index, matrix);
      });
      halosRef.current.instanceMatrix.needsUpdate = true;
    }
    const focus = controls?.target || camera.position;
    const selected = lit ? selectStreetlightSources(positions, focus, slots.length) : [];
    slots.forEach((slot, index) => {
      const light = slot.ref.current;
      if (!light) return;
      const chosen = selected[index];
      // Zero intensity still leaves a light in Three's shader light list.
      // Hide the daylight pool so road/truck fragments skip those light loops.
      light.visible = chosen !== undefined;
      if (chosen === undefined) { light.intensity = 0; return; }
      light.position.copy(positions[chosen]);
      slot.target.position.copy(targets[chosen]); slot.target.updateMatrixWorld();
      // Fade distant sources while their inexpensive road pools remain visible.
      const fade = 1 - THREE.MathUtils.smoothstep(positions[chosen].distanceTo(focus), 26, 48);
      light.intensity = 95 * power * fade;
    });
    if (import.meta.env.DEV && window.__ranking3d) window.__ranking3d.streetlights = {
      count: lamps.length, power, sourceCount: slots.length,
      sources: slots.map((slot, index) => ({ id: lamps[selected[index]]?.id, intensity: slot.ref.current?.intensity || 0 })),
      distance: fleet.distance
    };
  });

  return <group name="prr-streetlights">
    <instancedMesh name="prr-streetlight-bulbs" ref={bulbsRef} args={[undefined, undefined, lamps.length]} frustumCulled={false} raycast={() => {}}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#c8d5d8" emissive="#ffe1a3" emissiveIntensity={0} roughness={0.35} toneMapped={false} />
    </instancedMesh>
    <instancedMesh name="prr-streetlight-pools" ref={poolsRef} args={[undefined, undefined, lamps.length]} frustumCulled={false} raycast={() => {}} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffd58c" map={resources.texture} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
    </instancedMesh>
    <instancedMesh name="prr-streetlight-halos" ref={halosRef} args={[undefined, undefined, lamps.length]} frustumCulled={false} raycast={() => {}}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffe1a3" map={resources.texture} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    {resources.slots.map((slot, index) => <React.Fragment key={index}>
      <primitive object={slot.target} />
      <spotLight name={`prr-streetlight-source-${index}`} ref={slot.ref} target={slot.target} color="#ffe1af" intensity={0}
        angle={1.03} penumbra={0.75} distance={22} decay={2} castShadow={false} />
    </React.Fragment>)}
  </group>;
}
