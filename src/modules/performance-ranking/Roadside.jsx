import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { advanceRoadsideFleet, createRoadsideFleet, roadsideWorldPose, sampleSceneryFrame } from '../../utils/sceneRoadside.js';
import { createWorldLayout, worldPartMotion } from '../../utils/sceneWorldLayout.js';
import { worldGeometry, patchWorldMaterial } from './worldGeometry.js';
import { useWorldAtlas } from './worldSurfaces.js';
import { getRoadCurveRadius } from '../../utils/sceneRoadCurve.js';
import RoadsideLights from './RoadsideLights.jsx';
import { createCityShopTexture } from './cityShopTexture.js';
import { isCityWorld } from '../../utils/sceneCityLayout.js';

function SceneryTravel({ fleet, span, roadLength, clockRef }) {
  const view = useMemo(() => ({ matrix: new THREE.Matrix4(), frustum: new THREE.Frustum(), sphere: new THREE.Sphere() }), []);
  useFrame(({ camera }) => {
    if (!clockRef.current.step) return;
    camera.updateMatrixWorld();
    view.frustum.setFromProjectionMatrix(view.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const isVisible = (anchor, radius) => {
      const pose = sampleSceneryFrame(anchor, 0, roadLength);
      view.sphere.center.set(pose.x, pose.y, pose.z);
      view.sphere.radius = radius;
      return view.frustum.intersectsSphere(view.sphere);
    };
    const recycled = advanceRoadsideFleet(fleet, clockRef.current.distance, span, isVisible);
    if (import.meta.env.DEV && window.__ranking3d) {
      window.__ranking3d.scenery = {
        distance: fleet.distance, clusters: fleet.clusters.size, span,
        recycled: recycled.map(event => ({ ...event, fromVisible: isVisible(event.from, fleet.clusters.get(event.id).radius), toVisible: isVisible(event.to, fleet.clusters.get(event.id).radius) })),
      };
    }
  }, -0.25);
  return null;
}

function brandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 288;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f15a22'; ctx.fillRect(0, 0, 1024, 288);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(885, 288); ctx.lineTo(1024, 70); ctx.lineTo(1024, 288); ctx.fill();
  ctx.fillStyle = '#225a9c';
  ctx.beginPath(); ctx.moveTo(937, 288); ctx.lineTo(1024, 148); ctx.lineTo(1024, 288); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.font = 'italic 900 150px Arial'; ctx.fillText('GHN', 490, 174);
  ctx.font = '600 42px Arial'; ctx.fillText('Giao Hàng Nhanh', 490, 241);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function paletteColor(theme, token) {
  const [key, index] = token.split(':');
  if (index !== undefined) return theme[key][Number(index) % theme[key].length];
  return theme[key] || theme.props[key];
}

function SceneryBatch({ shape, parts, fleet, roadLength, theme, clockRef, texture, shopTexture, castShadow, backdrop = false, world, journeyRef }) {
  const meshRef = useRef(null);
  const atlas = useWorldAtlas();
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => {
    const geometry = worldGeometry(shape, backdrop);
    if (shape === 'shopSign') geometry.setAttribute('instanceShop', new THREE.InstancedBufferAttribute(Float32Array.from(parts.map(part => part.shopIndex)), 1));
    geometry.setAttribute('instanceSurface', new THREE.InstancedBufferAttribute(Float32Array.from(parts.map(part =>
      part.color === 'wood' || part.color === 'treeTrunk' ? 1
        : part.color === 'stone' || shape === 'mesa' || shape === 'peak' || shape === 'rock' ? 2
          : part.color === 'apron' || part.color === 'cityPaving' ? 3
            : part.color === 'rail' || part.color === 'cityTrim' ? 4
              : part.color.startsWith('cityFacade') || part.color === 'cityWall' || part.color === 'cream' ? 5
                : part.color === 'cityRoof' || shape === 'cityRoof' ? 6 : 0)), 1));
    return { geometry, matrix: new THREE.Matrix4(), position: new THREE.Vector3(), scale: new THREE.Vector3(), rotation: new THREE.Quaternion(), localRotation: new THREE.Quaternion(), axis: new THREE.Vector3(0, 1, 0), pitchAxis: new THREE.Vector3(0, 0, 1), pitch: new THREE.Quaternion(), roll: new THREE.Quaternion(), color: new THREE.Color() };
  }, [shape, backdrop, parts]);
  const visibility = useMemo(() => ({ value: 1 }), []);
  useEffect(() => () => resources.geometry.dispose(), [resources]);
  const write = (colors = false) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { matrix, position, scale, rotation, localRotation, axis, pitchAxis, pitch, roll, color } = resources;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const motion = worldPartMotion(part, journeyRef.current.time);
      const movingPart = motion ? { ...part, x: part.x + motion.x, y: part.y + motion.y } : part;
      const pose = roadsideWorldPose(movingPart, fleet.clusters.get(part.anchor).anchor, roadLength);
      // Buildings are rigid clusters: curve the anchor, then transform local
      // offsets together. Curving every roof/wall separately pulls them apart.
      rotation.setFromAxisAngle(axis, pose.heading).multiply(pitch.setFromAxisAngle(pitchAxis, pose.pitch));
      position.set(pose.x, pose.y, pose.z);
      rotation.multiply(localRotation.setFromAxisAngle(axis, part.yaw + (motion?.yaw || 0))).multiply(roll.setFromAxisAngle(pitchAxis, part.roll + (motion?.roll || 0)));
      scale.fromArray(part.scale);
      if (motion?.scaleY) scale.y *= motion.scaleY;
      // A curb/rail segment follows the inner/outer arc length of its shoulder.
      if (shape === 'box' && part.radius < 2) scale.x *= 1 - part.z / getRoadCurveRadius(roadLength);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(i, matrix);
      if (colors) mesh.setColorAt(i, color.set(paletteColor(theme, part.color)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  useLayoutEffect(() => {
    meshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    write(true); invalidate();
    // Only repaint when layout/theme changes; cruise uploads poses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, fleet, roadLength, theme, resources, invalidate]);
  useFrame(() => {
    const journey = journeyRef.current;
    visibility.value = world === journey.to ? journey.mix : world === journey.from ? 1 - journey.mix : 0;
    // Opaque scenery writes depth in its resting state. During the brief blend
    // both environments share the frame without invisible depth occluders.
    meshRef.current.visible = visibility.value > 0.001;
    meshRef.current.material.depthWrite = shape !== 'shopGlass' && visibility.value >= 0.999;
    if (clockRef.current.step) write();
  });
  const glass = ['glass', 'shopGlass', 'bitexco'].includes(shape);
  const Material = glass ? 'meshPhysicalMaterial' : 'meshStandardMaterial';
  return <instancedMesh name={`prr-${backdrop ? 'backdrop' : 'scenery'}-${shape}`} ref={meshRef} args={[resources.geometry, undefined, parts.length]} frustumCulled={false} raycast={() => {}}
    castShadow={castShadow && !backdrop && ['cone', 'round', 'box', 'pole', 'glass', 'bitexco', 'cityRoof', 'arch', 'awning', 'leaf', 'rock'].includes(shape)} receiveShadow={!backdrop && shape !== 'hill'}>
    <Material color="#ffffff" map={shape === 'shopSign' ? shopTexture : shape === 'sign' ? texture : null} transparent
      emissive={shape === 'shopSign' ? '#ffffff' : '#000000'} emissiveMap={shape === 'shopSign' ? shopTexture : null} emissiveIntensity={shape === 'shopSign' ? 0.12 : 0}
      roughness={glass ? 0.075 : shape === 'water' ? 0.14 : 0.86} metalness={0}
      {...(glass ? { ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.06, specularIntensity: 1, envMapIntensity: 1.45 } : {})}
      opacity={shape === 'shopGlass' ? 0.82 : 1} depthWrite={shape !== 'shopGlass'}
      side={shape === 'leaf' || shape === 'water' ? THREE.DoubleSide : THREE.FrontSide}
      onBeforeCompile={shader => patchWorldMaterial(shader, visibility, shape, atlas)} customProgramCacheKey={() => `world-surface-v4-${shape}`} />
  </instancedMesh>;
}

function Backdrop({ roadLength, roadWidth, theme, clockRef, world, compact, journeyRef }) {
  const layout = useMemo(() => createWorldLayout(roadLength, roadWidth, world, compact, true), [roadLength, roadWidth, world, compact]);
  const fleet = useMemo(() => createRoadsideFleet(layout, clockRef.current.distance), [layout, clockRef]);
  return <group name="prr-distant-landscape">
    <SceneryTravel fleet={fleet} span={layout.span} roadLength={roadLength} clockRef={clockRef} />
    {Object.entries(layout.batches).map(([shape, parts]) => <SceneryBatch key={shape} shape={shape} parts={parts}
      fleet={fleet} roadLength={roadLength} theme={theme} clockRef={clockRef} castShadow={false} world={world} journeyRef={journeyRef} backdrop />)}
  </group>;
}

export default function Roadside({ roadLength, roadWidth, theme, clockRef, castShadow = false, lightingRef, streetlightCount = 0, world = 'canyon', compact = false, journeyRef }) {
  const layout = useMemo(() => createWorldLayout(roadLength, roadWidth, world, compact), [roadLength, roadWidth, world, compact]);
  const fleet = useMemo(() => createRoadsideFleet(layout, clockRef.current.distance), [layout, clockRef]);
  const texture = useMemo(brandTexture, []);
  const shopTexture = useMemo(() => isCityWorld(world) ? createCityShopTexture() : null, [world]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => shopTexture?.dispose(), [shopTexture]);
  return <group name="prr-logistics-roadside">
    <Backdrop roadLength={roadLength} roadWidth={roadWidth} theme={theme} clockRef={clockRef} world={world} compact={compact} journeyRef={journeyRef} />
    <SceneryTravel fleet={fleet} span={layout.span} roadLength={roadLength} clockRef={clockRef} />
    {Object.entries(layout.batches).map(([shape, parts]) => <SceneryBatch key={`${shape}-${parts.length}`} shape={shape} parts={parts} fleet={fleet} roadLength={roadLength} theme={theme} clockRef={clockRef} texture={texture} shopTexture={shopTexture} castShadow={castShadow} world={world} journeyRef={journeyRef} />)}
    <RoadsideLights lamps={layout.streetlights} fleet={fleet} roadLength={roadLength} clockRef={clockRef} lightingRef={lightingRef} sourceCount={streetlightCount} />
  </group>;
}
