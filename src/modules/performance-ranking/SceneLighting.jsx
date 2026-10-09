import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { advanceDayPhase, DAY_CYCLE_SECONDS, formatSceneTime, phaseForLightingMode, sampleSceneLighting, wrapDayPhase } from '../../utils/sceneLighting.js';

const SKY_VERTEX = `varying vec3 vDirection;
void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAGMENT = `uniform vec3 topColor; uniform vec3 horizonColor; varying vec3 vDirection;
void main() {
  float height = normalize(vDirection).y;
  vec3 color = mix(horizonColor, topColor, smoothstep(0.0, 0.75, height));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;
const GLOW_VERTEX = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOW_FRAGMENT = `uniform vec3 color; uniform float opacity; varying vec2 vUv;
void main() { float r = length(vUv - 0.5) * 2.0;
  gl_FragColor = vec4(color, pow(max(0.0, 1.0 - r), 3.0) * opacity);
  #include <colorspace_fragment>
}`;

function makeMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e1e8f1'; ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 38; i++) {
    const x = (i * 73 + 21) % 256, y = (i * 47 + 17) % 128, radius = 2 + i % 7;
    ctx.fillStyle = 'rgba(104,128,153,0.22)';
    ctx.beginPath(); ctx.ellipse(x, y, radius * 1.25, radius, 0, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Mutates a small fixed pool; no React renders or texture uploads per frame.
export default function SceneLighting({ mode, phaseRef, lightingRef, clockRef, running, reducedMotion, roadLength, shadowsOn, compact, timeRef }) {
  const skyRef = useRef(null), sunRef = useRef(null), moonRef = useRef(null);
  const sunGlowRef = useRef(null), moonGlowRef = useRef(null), lightRef = useRef(null), ambientRef = useRef(null), fogRef = useRef(null);
  const invalidate = useThree(state => state.invalidate);
  const target = useMemo(() => new THREE.Object3D(), []);
  const moonTexture = useMemo(makeMoonTexture, []);
  const skyUniforms = useMemo(() => ({ topColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() } }), []);
  const sunGlow = useMemo(() => ({ color: { value: new THREE.Color('#ffbb69') }, opacity: { value: 0.65 } }), []);
  const moonGlow = useMemo(() => ({ color: { value: new THREE.Color('#a6caff') }, opacity: { value: 0.24 } }), []);
  const previous = useRef({ mode: null, phase: null, shadowElapsed: Infinity, source: null, extent: 0, focus: new THREE.Vector3(Infinity, Infinity, Infinity) });
  const sampled = useRef(null);
  useEffect(() => () => moonTexture.dispose(), [moonTexture]);
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const handle = (window.__ranking3d = window.__ranking3d || { glList: [] });
    const setTime = phase => { phaseRef.current = wrapDayPhase(phase); previous.current.shadowElapsed = Infinity; invalidate(); };
    handle.setSceneTime = setTime;
    return () => { if (handle.setSceneTime === setTime) delete handle.setSceneTime; };
  }, [phaseRef, invalidate]);
  useLayoutEffect(() => { invalidate(); }, [mode, shadowsOn, compact, roadLength, running, reducedMotion, invalidate]);

  useFrame(({ camera, controls, gl }, delta) => {
    const cache = previous.current;
    if (cache.mode !== mode) {
      phaseRef.current = phaseForLightingMode(mode, phaseRef.current);
      cache.mode = mode;
      cache.shadowElapsed = Infinity;
    }
    phaseRef.current = advanceDayPhase(phaseRef.current, delta, mode === 'auto' && running && !reducedMotion && clockRef.current.step > 0 && !document.hidden);
    if (cache.phase !== phaseRef.current) {
      sampled.current = sampleSceneLighting(phaseRef.current);
      cache.phase = phaseRef.current;
    }
    const state = sampled.current;
    if (lightingRef) lightingRef.current = state;
    const radius = camera.far * 0.82;
    skyRef.current.position.copy(camera.position);
    skyRef.current.scale.setScalar(camera.far * 0.94);
    skyUniforms.topColor.value.set(state.skyTop);
    skyUniforms.horizonColor.value.set(state.horizon);
    fogRef.current.color.set(state.horizon);
    ambientRef.current.color.set(state.ambientSky);
    ambientRef.current.groundColor.set(state.ambientGround);
    ambientRef.current.intensity = state.ambientIntensity;
    for (const [body, glow, direction, opacity, size] of [
      [sunRef.current, sunGlowRef.current, state.sunDirection, state.sunOpacity, 0.018],
      [moonRef.current, moonGlowRef.current, state.moonDirection, state.moonOpacity, 0.015]
    ]) {
      body.position.set(...direction).multiplyScalar(radius).add(camera.position);
      body.scale.setScalar(radius * size);
      body.visible = opacity > 0.001;
      body.material.opacity = opacity;
      glow.position.copy(body.position);
      glow.quaternion.copy(camera.quaternion);
      glow.scale.setScalar(radius * size * 7);
      glow.visible = body.visible;
      glow.material.uniforms.opacity.value = opacity * (body === sunRef.current ? 0.65 : 0.24);
    }
    sunRef.current.material.color.set(state.sunColor);
    const light = lightRef.current;
    const focus = controls?.target || target.position;
    // Track the viewed road segment, including Best/Worst and follow camera.
    const extent = Math.max(24, camera.position.distanceTo(focus) * Math.max(1, camera.aspect) * 0.75);
    const distance = extent * 3;
    target.position.copy(focus); target.updateMatrixWorld();
    light.position.set(...state.keyDirection).multiplyScalar(distance).add(focus);
    light.color.set(state.keyColor); light.intensity = state.keyIntensity;
    const shadow = light.shadow;
    shadow.intensity = state.shadowIntensity;
    const sc = shadow.camera;
    if (Math.abs(cache.extent - extent) > 0.1) {
      sc.left = sc.bottom = -extent; sc.right = sc.top = extent;
      sc.near = 0.5; sc.far = distance + extent * 2;
      sc.updateProjectionMatrix(); cache.extent = extent;
      gl.shadowMap.needsUpdate = true;
    }
    // One shadow source; 10 Hz while cruising, replay can request faster updates.
    cache.shadowElapsed += Math.min(delta, 0.1);
    if (shadowsOn && (cache.shadowElapsed >= 0.1 || cache.source !== state.source || cache.focus.distanceToSquared(focus) > 0.01)) {
      gl.shadowMap.needsUpdate = true;
      cache.shadowElapsed = 0; cache.source = state.source; cache.focus.copy(focus);
    }
    const text = formatSceneTime(state.phase);
    if (timeRef.current && timeRef.current.textContent !== text) timeRef.current.textContent = text;
    if (import.meta.env.DEV) {
      const handle = (window.__ranking3d = window.__ranking3d || { glList: [] });
      handle.lighting = { ...state, mode, cycleSeconds: DAY_CYCLE_SECONDS, shadowsOn, shadowSize: compact ? 1024 : 2048, shadowExtent: extent };
    }
  }, -0.5);

  const fogNear = roadLength * 0.9 + 60;
  return <>
    <mesh name="prr-sky" ref={skyRef} renderOrder={-20} frustumCulled={false} raycast={() => {}}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial vertexShader={SKY_VERTEX} fragmentShader={SKY_FRAGMENT} uniforms={skyUniforms} side={THREE.BackSide} depthWrite={false} />
    </mesh>
    <fog ref={fogRef} attach="fog" args={['#d8e9ed', fogNear, fogNear * 2.6 + 260]} />
    <mesh name="prr-sun" ref={sunRef} raycast={() => {}}>
      <sphereGeometry args={[1, 24, 16]} /><meshBasicMaterial color="#fff2d5" fog={false} toneMapped={false} transparent />
    </mesh>
    <mesh name="prr-moon" ref={moonRef} raycast={() => {}}>
      <sphereGeometry args={[1, 24, 16]} /><meshBasicMaterial map={moonTexture} fog={false} toneMapped={false} transparent />
    </mesh>
    {[[sunGlowRef, sunGlow, 'sun'], [moonGlowRef, moonGlow, 'moon']].map(([ref, uniforms, name]) => <mesh key={name} name={`prr-${name}-glow`} ref={ref} raycast={() => {}}>
      <planeGeometry args={[1, 1]} /><shaderMaterial vertexShader={GLOW_VERTEX} fragmentShader={GLOW_FRAGMENT} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>)}
    <hemisphereLight ref={ambientRef} />
    <primitive object={target} />
    <directionalLight name="prr-celestial-light" ref={lightRef} target={target} castShadow={shadowsOn}
      shadow-mapSize={[compact ? 1024 : 2048, compact ? 1024 : 2048]} shadow-bias={-0.00015} shadow-normalBias={0.08} shadow-radius={2} />
  </>;
}
