import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Roadside from './Roadside.jsx';
import { advanceWorldJourney, nextWorld, worldTheme, WORLD_VISIT_SECONDS } from '../../utils/sceneWorld.js';
import { useWorldAtlas } from './worldSurfaces.js';

export default function WorldEnvironment({ world, journeyRef, roadLength, roadWidth, clockRef, lightingRef, streetlightCount, compact, running, reducedMotion, automatic, blocked, interactionRef, onAutomatic }) {
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
      lightingRef={lightingRef} streetlightCount={id === layers.to ? streetlightCount : 0} />)}
  </>;
}

// Gentle hemispheric reflection shared by every truck; no per-Hub textures.
export function TruckEnvironment() {
  const gl = useThree(state => state.gl), scene = useThree(state => state.scene);
  useLayoutEffect(() => {
    // Generate GPU resources in the effect so StrictMode's discarded render
    // does not allocate a second render target without a cleanup owner.
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const stage = new THREE.Scene();
    stage.background = new THREE.Color('#a4bacb');
    const sky = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 12), new THREE.MeshBasicMaterial({ color: '#cbd9df', side: THREE.BackSide }));
    stage.add(sky);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ color: '#fff2db' }));
    panel.position.set(0, 7, -4); panel.lookAt(0, 0, 0); stage.add(panel);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: '#505e59', side: THREE.DoubleSide }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -5; stage.add(ground);
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromScene(stage, 0.04, 0.1, 30);
    generator.dispose();
    for (const mesh of [sky, panel, ground]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    scene.environment = target.texture; scene.environmentIntensity = 0.38;
    return () => { scene.environment = previous; scene.environmentIntensity = previousIntensity; target.dispose(); };
  }, [scene, gl]);
  return null;
}
