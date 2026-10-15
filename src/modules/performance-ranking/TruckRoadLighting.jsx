import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleRoadFrame } from '../../utils/sceneRoadCurve.js';
import { TRUCK_LIGHTS } from '../../utils/sceneTruckSurface.js';
import { sceneVehicleKind, RIDER_LIGHTS } from '../../utils/sceneVehicles.js';

function softTexture(beam = false) {
  const width = 64, height = 128, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + 0.5) / width * 2 - 1, v = (y + 0.5) / height;
    const radius = u * u + (v * 2 - 1) ** 2;
    const spread = 0.45 + v * 0.55;
    const alpha = beam
      ? Math.max(0, 1 - (u / spread) ** 2) ** 2 * Math.sin(Math.PI * v) ** 0.6 * (1 - v) ** 1.6
      : Math.max(0, 1 - radius) ** 2;
    const i = (y * width + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(alpha * 255);
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

// Four shared batches, no point lights or extra shadow passes per vehicle.
// Lamps follow the sprung body; their footprints stay on the curved asphalt.
export default function TruckRoadLighting({ items, positionsRef, roadLength, lightingRef }) {
  const heads = useRef(null), tails = useRef(null), beams = useRef(null), contacts = useRef(null);
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => ({
    matrix: new THREE.Matrix4(), body: new THREE.Matrix4(), rotation: new THREE.Quaternion(), pitch: new THREE.Quaternion(), roll: new THREE.Quaternion(),
    flat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
    x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1),
    position: new THREE.Vector3(), scale: new THREE.Vector3(), beamTexture: softTexture(true), contactTexture: softTexture()
  }), []);
  useEffect(() => () => { resources.beamTexture.dispose(); resources.contactTexture.dispose(); }, [resources]);
  useLayoutEffect(() => {
    for (const ref of [heads, tails, beams, contacts]) ref.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    invalidate();
  }, [items, invalidate]);

  useFrame(() => {
    const r = resources, night = lightingRef.current?.streetlightPower || 0;
    heads.current.material.color.set('#ffe6b2').multiplyScalar(0.8 + night * 2.2);
    tails.current.material.color.set('#ff3925').multiplyScalar(0.7 + night * 1.6);
    beams.current.material.opacity = night * 0.38;
    beams.current.visible = night > 0.001;
    let lights = 0, ground = 0;
    for (const item of items) {
      const pose = positionsRef.current.get(item.id);
      if (!pose || pose.alpha < 0.08) continue;
      const rider = sceneVehicleKind(item) === 'rider';
      const lamps = rider ? RIDER_LIGHTS : TRUCK_LIGHTS;
      const body = pose.body || { ...pose.visual, y: pose.visual.lift, roll: 0 };
      r.rotation.setFromAxisAngle(r.y, body.heading).multiply(r.pitch.setFromAxisAngle(r.z, body.pitch)).multiply(r.roll.setFromAxisAngle(r.x, body.roll));
      r.body.compose(r.position.set(body.x, body.y, body.z), r.rotation, r.scale.setScalar(1));
      for (const side of rider ? [1] : [-1, 1]) {
        for (const [ref, lamp] of [[heads, lamps.head], [tails, lamps.tail]]) {
          r.position.set(lamp.x, lamp.y, lamp.z * side).applyMatrix4(r.body);
          r.matrix.compose(r.position, r.rotation, r.scale.set(pose.alpha, pose.alpha, pose.alpha));
          ref.current.setMatrixAt(lights, r.matrix);
        }
        lights++;
      }
      const footprint = sampleRoadFrame(pose.roadX, pose.visual.roadZ, roadLength);
      r.rotation.setFromAxisAngle(r.y, footprint.heading).multiply(r.pitch.setFromAxisAngle(r.z, footprint.pitch)).multiply(r.flat);
      r.matrix.compose(r.position.set(footprint.x, footprint.y + 0.014, footprint.z), r.rotation, r.scale.set((rider ? 2.1 : 3.0) * pose.alpha, (rider ? 0.65 : 1.65) * pose.alpha, 1));
      contacts.current.setMatrixAt(ground, r.matrix);
      // A short tapered light pool follows the steering angle but is placed
      // from the road frame so suspension cannot lift it off the asphalt.
      const distance = lamps.beamLength / 2 + lamps.head.x;
      const steering = body.heading - footprint.heading;
      const beamFrame = sampleRoadFrame(pose.roadX + Math.cos(steering) * distance,
        pose.visual.roadZ - Math.sin(steering) * distance, roadLength);
      r.rotation.setFromAxisAngle(r.y, beamFrame.heading + steering)
        .multiply(r.pitch.setFromAxisAngle(r.z, beamFrame.pitch)).multiply(r.flat)
        .multiply(r.roll.setFromAxisAngle(r.z, -Math.PI / 2));
      r.matrix.compose(r.position.set(beamFrame.x, beamFrame.y + 0.018, beamFrame.z), r.rotation,
        r.scale.set(lamps.beamWidth * pose.alpha, lamps.beamLength * pose.alpha, 1));
      beams.current.setMatrixAt(ground, r.matrix);
      ground++;
    }
    for (const [ref, count] of [[heads, lights], [tails, lights], [beams, ground], [contacts, ground]]) {
      ref.current.count = count; ref.current.instanceMatrix.needsUpdate = true;
    }
  });
  return <group name="prr-truck-road-lighting">
    <instancedMesh name="prr-headlamps" ref={heads} args={[undefined, undefined, items.length * 2]} frustumCulled={false} raycast={() => {}}>
      <boxGeometry args={[0.045, 0.12, 0.19]} /><meshBasicMaterial color="#ffe6b2" toneMapped={false} />
    </instancedMesh>
    <instancedMesh name="prr-taillamps" ref={tails} args={[undefined, undefined, items.length * 2]} frustumCulled={false} raycast={() => {}}>
      <boxGeometry args={[0.045, 0.1, 0.15]} /><meshBasicMaterial color="#ff3925" toneMapped={false} />
    </instancedMesh>
    <instancedMesh name="prr-headlight-pools" ref={beams} args={[undefined, undefined, items.length]} frustumCulled={false} raycast={() => {}} renderOrder={2}>
      <planeGeometry /><meshBasicMaterial color="#ffe0a2" map={resources.beamTexture} transparent opacity={0}
        blending={THREE.AdditiveBlending} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
    </instancedMesh>
    <instancedMesh name="prr-contact-shadows" ref={contacts} args={[undefined, undefined, items.length]} frustumCulled={false} raycast={() => {}} renderOrder={1}>
      <planeGeometry /><meshBasicMaterial color="#060c12" map={resources.contactTexture} transparent opacity={0.3}
        depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
    </instancedMesh>
  </group>;
}
