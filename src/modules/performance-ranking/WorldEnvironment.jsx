import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Roadside from './Roadside.jsx';
import { advanceWorldJourney, nextWorld, worldTheme, WORLD_VISIT_SECONDS } from '../../utils/sceneWorld.js';
import { useWorldAtlas } from './worldSurfaces.js';

export default function WorldEnvironment({ world, journeyRef, roadLength, roadWidth, clockRef, lightingRef, streetlightCount, castShadow, compact, running, reducedMotion, automatic, blocked, interactionRef, onAutomatic }) {
  const [layers, setLayers] = useState({ from: world, to: world });
  const atlas = useWorldAtlas();
  useEffect(() => () => atlas.dispose(), [atlas]);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => { journeyRef.current.visit = 0; invalidate(); }, [world, automatic, invalidate, journeyRef]);
  useFrame((_, delta) => {
    const journey = advanceWorldJourney(journeyRef.current, world, delta, { active: running && !document.hidden && !reducedMotion, reducedMotion });
    if (blocked || interactionRef.current) journey.visit = 0;
    if (journey.from !== layers.from || journey.to !== layers.to) setLayers({ from: journey.from, to: journey.to });
    if (journey.mix < 1 && running && !reducedMotion && !document.hidden) invalidate();
    if (automatic && running && !reducedMotion && !document.hidden && !blocked && !interactionRef.current && journey.mix === 1 && journey.visit >= WORLD_VISIT_SECONDS) {
      journey.visit = 0; onAutomatic(nextWorld(journey.to));
    }
    if (import.meta.env.DEV && window.__ranking3d) window.__ranking3d.world = { ...journey, layers: layers.from === layers.to ? 1 : 2 };
  }, -1.5);
  return <>
    {[...new Set([layers.from, layers.to])].map(id => <Roadside key={id} world={id} journeyRef={journeyRef} compact={compact}
      roadLength={roadLength} roadWidth={roadWidth} theme={worldTheme(id)} clockRef={clockRef}
      castShadow={castShadow} lightingRef={lightingRef} streetlightCount={id === layers.to ? streetlightCount : 0} />)}
  </>;
}

// Shared sky reflection for glass, water and vehicles. Update a small cached
// probe a few times per simulated hour, never a cubemap per building/frame.
export function TruckEnvironment({ lightingRef }) {
  const gl = useThree(state => state.gl), scene = useThree(state => state.scene);
  const probeRef = useRef(null);
  useLayoutEffect(() => {
    // Generate GPU resources in the effect so StrictMode's discarded render
    // does not allocate a second render target without a cleanup owner.
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const stage = new THREE.Scene();
    const uniforms = {
      skyTop: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() }, keyColor: { value: new THREE.Color() },
      keyDirection: { value: new THREE.Vector3() }, keyPower: { value: 0 },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 12), new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide,
      vertexShader: 'varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 direction; uniform vec3 skyTop, horizon, ground, keyColor, keyDirection; uniform float keyPower;
        void main() {
          vec3 d = normalize(direction);
          vec3 sky = mix(horizon, skyTop, smoothstep(0.0, 0.8, d.y));
          sky = mix(ground, sky, smoothstep(-0.14, 0.04, d.y));
          float sun = pow(max(0.0, dot(d, keyDirection)), 192.0);
          gl_FragColor = vec4(sky + keyColor * sun * keyPower * 3.0, 1.0);
        }`,
    }));
    stage.add(sky);
    const generator = new THREE.PMREMGenerator(gl);
    probeRef.current = { stage, uniforms, generator, target: null, phase: null };
    return () => {
      probeRef.current?.target?.dispose(); probeRef.current = null;
      generator.dispose(); sky.geometry.dispose(); sky.material.dispose();
      scene.environment = previous; scene.environmentIntensity = previousIntensity;
    };
  }, [scene, gl]);
  useFrame(() => {
    const probe = probeRef.current, state = lightingRef.current;
    if (!probe || !state) return;
    const difference = probe.phase === null ? 1 : Math.abs(state.phase - probe.phase);
    if (probe.phase !== null && Math.min(difference, 1 - difference) < 1 / 48) return;
    const { uniforms } = probe;
    uniforms.skyTop.value.set(state.skyTop); uniforms.horizon.value.set(state.horizon);
    uniforms.ground.value.set(state.ambientGround).multiplyScalar(0.4);
    uniforms.keyColor.value.set(state.keyColor); uniforms.keyDirection.value.set(...state.keyDirection);
    uniforms.keyPower.value = state.keyIntensity;
    // Dispose replaced probes promptly; only one reflection texture stays live.
    const oldTarget = probe.target;
    probe.target = probe.generator.fromScene(probe.stage, 0.025, 0.1, 30, { size: 128 });
    scene.environment = probe.target.texture;
    oldTarget?.dispose(); probe.phase = state.phase;
  }, -0.05);
  return null;
}
