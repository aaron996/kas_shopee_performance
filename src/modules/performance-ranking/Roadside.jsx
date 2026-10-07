import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { computeRoadsideLayout, roadsideWorldPose } from '../../utils/sceneRoadside.js';
import { getRoadCurveRadius } from '../../utils/sceneRoadCurve.js';

function patchFade(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstanceAlpha;');
}
const fadeKey = () => 'roadside-cluster-alpha-v1';

function makeGeometry(shape) {
  if (shape === 'cone') return new THREE.ConeGeometry(1, 1, 6);
  if (shape === 'round' || shape === 'rock') return new THREE.IcosahedronGeometry(1, 0);
  if (shape === 'hill') {
    const geometry = new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    return geometry;
  }
  if (shape === 'pole') return new THREE.CylinderGeometry(0.5, 0.5, 1, 5);
  if (shape === 'sign') return new THREE.PlaneGeometry(1, 1);
  return new THREE.BoxGeometry(1, 1, 1);
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

function SceneryBatch({ shape, parts, span, roadLength, theme, clockRef, texture }) {
  const meshRef = useRef(null);
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => {
    const alpha = new Float32Array(parts.length);
    const geometry = makeGeometry(shape);
    geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    return { geometry, alpha, matrix: new THREE.Matrix4(), position: new THREE.Vector3(), scale: new THREE.Vector3(), rotation: new THREE.Quaternion(), localRotation: new THREE.Quaternion(), axis: new THREE.Vector3(0, 1, 0), pitchAxis: new THREE.Vector3(0, 0, 1), pitch: new THREE.Quaternion(), roll: new THREE.Quaternion(), color: new THREE.Color() };
  }, [parts, shape]);
  useEffect(() => () => resources.geometry.dispose(), [resources]);
  const write = (colors = false) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { matrix, position, scale, rotation, localRotation, axis, pitchAxis, pitch, roll, alpha, color } = resources;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const pose = roadsideWorldPose(part, clockRef.current.distance, span, roadLength);
      alpha[i] = pose.alpha;
      // Buildings are rigid clusters: curve the anchor, then transform local
      // offsets together. Curving every roof/wall separately pulls them apart.
      rotation.setFromAxisAngle(axis, pose.heading).multiply(pitch.setFromAxisAngle(pitchAxis, pose.pitch));
      position.set(pose.x, pose.y, pose.z);
      rotation.multiply(localRotation.setFromAxisAngle(axis, part.yaw)).multiply(roll.setFromAxisAngle(pitchAxis, part.roll));
      scale.fromArray(part.scale);
      // A curb/rail segment follows the inner/outer arc length of its shoulder.
      if (shape === 'box' && part.radius < 2) scale.x *= 1 - part.z / getRoadCurveRadius(roadLength);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(i, matrix);
      if (colors) mesh.setColorAt(i, color.set(paletteColor(theme, part.color)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    resources.geometry.getAttribute('instanceAlpha').needsUpdate = true;
  };
  useLayoutEffect(() => {
    meshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    write(true); invalidate();
    // Only repaint when layout/theme changes; cruise uploads poses and opacity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, span, roadLength, theme, resources, invalidate]);
  useFrame(() => { if (clockRef.current.step) write(); });
  return <instancedMesh name={`prr-scenery-${shape}`} ref={meshRef} args={[resources.geometry, undefined, parts.length]} frustumCulled={false} raycast={() => {}}>
    <meshStandardMaterial color="#ffffff" map={shape === 'sign' ? texture : null} roughness={0.95} flatShading transparent alphaTest={0.015} depthWrite onBeforeCompile={patchFade} customProgramCacheKey={fadeKey} />
  </instancedMesh>;
}

export default function Roadside({ roadLength, roadWidth, theme, clockRef }) {
  const layout = useMemo(() => computeRoadsideLayout(roadLength, roadWidth), [roadLength, roadWidth]);
  const texture = useMemo(brandTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group name="prr-logistics-roadside">
    {Object.entries(layout.batches).map(([shape, parts]) => <SceneryBatch key={`${shape}-${parts.length}`} shape={shape} parts={parts} span={layout.span} roadLength={roadLength} theme={theme} clockRef={clockRef} texture={texture} />)}
  </group>;
}
