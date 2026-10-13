import { computeRoadsideLayout, computeBackdropLayout } from './sceneRoadside.js';
import { hash01 } from './sceneThemes.js';

export function createWorldLayout(roadLength, roadWidth, world, compact = false, backdrop = false) {
  const source = backdrop ? computeBackdropLayout(roadLength, roadWidth) : computeRoadsideLayout(roadLength, roadWidth);
  const batches = {};
  const add = (shape, part) => (batches[shape] ||= []).push(part);
  for (const [shape, parts] of Object.entries(source.batches)) for (const original of parts) {
    const part = { ...original, scale: [...original.scale] };
    const seed = part.anchor * 13 + part.x * 7 + part.z;
    if (shape === 'hill') {
      if (world === 'canyon') {
        part.scale[0] *= 0.58; part.scale[2] *= 0.58;
        part.scale[1] = backdrop ? 5 + hash01(seed) * 5 : 2.5 + hash01(seed) * 2;
        part.z -= backdrop ? 16 : 6; add('mesa', part);
      }
      else if (world === 'alpine') {
        part.scale[0] *= 0.48; part.scale[2] *= 0.5;
        part.scale[1] = backdrop ? 8 + hash01(seed) * 7 : 3 + hash01(seed) * 2;
        part.z -= backdrop ? 12 : 7; add('peak', part);
      }
      else if (world === 'harbor') {
        if (backdrop) { part.y = 0.1; part.scale[1] = 2.8 + hash01(seed) * 5; part.scale[0] *= 0.32; part.scale[2] *= 0.22; add('box', part); }
      } else { part.scale[0] *= 0.72; part.scale[2] *= 0.7; part.scale[1] *= 0.65; add(shape, part); }
      continue;
    }
    const foliage = part.color.startsWith('treeCanopy');
    if (foliage && part.y > 0.5) {
      if (world === 'canyon') {
        const height = 1.8 + hash01(seed) * 1.4;
        add('pole', { ...part, y: height / 2, scale: [0.3, height, 0.3], motion: 'wind', phase: seed });
        if (!compact || hash01(seed) > 0.5) {
          add('pole', { ...part, x: part.x + 0.35, y: height * 0.56, scale: [0.19, 0.7, 0.19], roll: Math.PI / 2 });
          add('pole', { ...part, x: part.x + 0.66, y: height * 0.68, scale: [0.18, height * 0.34, 0.18] });
        }
      } else if (world === 'rainforest') {
        // Broad overlapping crowns and folded leaves give a readable jungle silhouette.
        const crownHeight = 3.6 + hash01(seed) * 2;
        add('pole', { ...part, y: crownHeight / 2, scale: [0.24, crownHeight, 0.28], color: 'treeTrunk' });
        add('round', { ...part, y: crownHeight, scale: [part.scale[0] * 1.75, 1, part.scale[2] * 1.5], motion: 'wind', phase: seed });
        for (let leaf = 0; leaf < (compact ? 3 : 5); leaf++) {
          const a = leaf * 2.399 + seed;
          add('leaf', { ...part, x: part.x + Math.cos(a) * 0.9, y: crownHeight - 0.3, z: part.z + Math.sin(a) * 0.9, scale: [2.2, 1.6, 2.2], yaw: a, roll: 0.2, motion: 'wind', phase: seed + leaf });
        }
      } else if (world === 'alpine') {
        add('cone', { ...part, scale: [part.scale[0] * 0.75, part.scale[1] * 1.2, part.scale[2] * 0.75], motion: 'wind', phase: seed });
        if (!compact) add('cone', { ...part, y: part.y + 0.8, scale: [part.scale[0] * 0.52, part.scale[1], part.scale[2] * 0.52], motion: 'wind', phase: seed });
      } else if (hash01(seed) > 0.7) add('round', { ...part, scale: [0.9, 0.65, 0.9], motion: 'wind', phase: seed });
      continue;
    }
    if (world === 'canyon' && part.color === 'treeTrunk') continue;
    if (world === 'harbor' && part.color === 'treeTrunk') continue;
    if (part.color === 'cloud') { part.motion = 'cloud'; part.phase = seed; part.motionExtent = 3; }
    // The original functional dock/doors/brand are retained; adapt the envelope.
    const depotBeat = Math.round((part.anchor - 5) / 32);
    const isDepot = ((depotBeat % 6) + 6) % 6 === 3;
    if (!backdrop && isDepot && part.z < -(roadWidth / 2 + 2)) {
      if (world === 'canyon' || world === 'alpine') {
        if (part.color === 'cream') part.color = world === 'alpine' ? 'stone' : 'wood';
        if (shape === 'box' && part.roll) part.color = 'wood';
      }
      if (world === 'rainforest' && ['box', 'sign'].includes(shape) && part.color !== 'apron') part.y += 0.5;
    }
    add(shape, part);
  }
  if (!backdrop) {
    const edge = roadWidth / 2;
    for (let anchor = -source.span / 2 + 5; anchor < source.span / 2; anchor += 64) {
      const part = (shape, x, y, z, scale, color, extras = {}) => add(shape, { anchor, radius: 15, x, y, z, scale, color, yaw: 0, roll: 0, ...extras });
      if (world === 'canyon') {
        part('tumble', -2, 0.65, edge + 2.5, [1, 1, 1], 'wood', { motion: 'tumble', phase: anchor, motionExtent: 7 });
        part('mesa', 7, 0, -(edge + 22), [5, 3.8, 4], 'hill:1');
        // Weathered timber fence beside the far shoulder.
        for (let x = -8; x <= 8; x += 4) part('pole', x, 0.55, -(edge + 2), [0.14, 1.1, 0.14], 'wood');
        part('box', 0, 0.7, -(edge + 2), [16, 0.12, 0.1], 'wood');
      } else if (world === 'rainforest') {
        for (let i = 0; i < (compact ? 3 : 6); i++) {
          part('leaf', i * 2 - 6, 0.45, -(edge + 2.7), [1.8, 1.5, 1.8], `treeCanopy:${i % 4}`, { yaw: i * 2.4, roll: 0.35, motion: 'wind', phase: anchor + i });
        }
        part('water', 0, 0.03, -(edge + 13), [48, 1, 8], 'hill:0', { motion: 'water', phase: anchor });
      } else if (world === 'alpine') {
        for (let i = 0; i < (compact ? 3 : 7); i++) part('leaf', i * 2 - 6, 0.16, -(edge + 2.8), [0.6, 0.9, 0.5], `treeCanopy:${i % 4}`, { yaw: i, roll: 0.6, motion: 'wind', phase: anchor + i });
        part('rock', 4, 0.5, edge + 3, [1.2, 0.8, 0.9], 'stone');
      } else {
        const z = -(edge + 23);
        part('water', 0, 0.05, -(edge + 21), [64, 1, 24], 'hill:0', { motion: 'water', phase: anchor });
        part('box', 0, 4.5, z, [0.45, 9, 0.65], 'blue');
        part('box', 0, 8.6, z, [13, 0.45, 0.5], 'orange');
        part('pole', 3, 6.1, z, [0.06, 5, 0.06], 'rail', { motion: 'hoistCable', phase: anchor, motionExtent: 1 });
        part('box', 3, 3, z, [3.5, 1.2, 1.8], 'orange', { motion: 'hoist', phase: anchor, motionExtent: 1 });
        part('box', -10, 0.35, z - 10, [14, 0.9, 4], 'blue');
        part('box', -11, 1.5, z - 10, [6, 1.5, 3], 'cream');
      }
      // A readable regional post office, repeated independently of the old
      // six-beat depot rhythm so short visits encounter a working landmark.
      {
        const z = -(edge + 8), base = world === 'rainforest' ? 0.55 : 0;
        const wall = world === 'canyon' ? 'wood' : world === 'alpine' ? 'stone' : 'cream';
        part('box', 0, base + 1.5, z, [7.5, 3, 3.8], wall);
        part('box', 0, base + 2.25, z + 1.95, [7.7, 0.25, 0.1], 'orange');
        part('sign', 0, base + 2.25, z + 2.03, [2.3, 0.65, 1], 'white');
        for (const x of [-2.5, 2.5]) {
          part('box', x, base + 1.5, z + 1.96, [1.1, 0.9, 0.08], 'door');
          part('box', x, base + 1.47, z + 2.02, [1, 0.035, 0.03], 'cream');
          part('pole', x, base + 0.95, z + 3.2, [0.16, 1.9, 0.16], 'wood');
        }
        part('box', 0, base + 0.9, z + 1.97, [1.2, 1.8, 0.1], 'door');
        part('box', 0, base + 2, z + 2.6, [8.4, 0.18, 2.2], world === 'harbor' ? 'orange' : 'wood', { roll: -0.05 });
        if (world === 'alpine' || world === 'canyon') {
          for (const side of [-1, 1]) part('box', side * 1.95, base + 3.55, z, [4.3, 0.22, 4.5], 'wood', { roll: side * -0.24 });
          if (world === 'alpine') part('box', 2.5, 4, z - 0.8, [0.6, 2.2, 0.6], 'stone');
        } else part('box', 0, base + 3.18, z, [8.5, 0.2, 4.6], 'blue', { roll: -0.08 });
        if (world === 'rainforest') {
          part('box', 0, 0.5, z + 1, [9, 0.25, 6], 'wood');
          for (const x of [-3, 3]) for (const dz of [-1, 2]) part('pole', x, 0.3, z + dz, [0.22, 0.6, 0.22], 'wood');
        }
        for (let i = 0; i < 3; i++) {
          part('box', -3.4 + i * 0.5, base + 0.4 + i % 2 * 0.25, z + 2.8, [0.65, 0.75, 0.65], 'carton');
        }
        // Shared animated parcels on the loading porch; no traffic on the ranking lanes.
        part('box', 2.4, base + 0.6, z + 2.7, [0.55, 0.5, 0.5], 'carton', { motion: 'parcel', phase: anchor, motionExtent: 1.2 });
      }
    }
  }
  return { ...source, batches };
}

export function worldPartMotion(part, time) {
  const phase = (part.phase || 0) * 0.37;
  if (part.motion === 'wind') return { x: 0, y: 0, yaw: Math.sin(time * 0.8 + phase) * 0.025, roll: Math.sin(time * 1.2 + phase) * 0.035 };
  if (part.motion === 'cloud') return { x: Math.sin(time * 0.08 + phase) * 2.5, y: 0, yaw: 0, roll: 0 };
  if (part.motion === 'tumble') return { x: Math.sin(time * 0.42 + phase) * 5, y: Math.abs(Math.sin(time * 2.6 + phase)) * 0.15, yaw: time * 0.6, roll: time * 1.8 };
  if (part.motion === 'crane') return { x: 0, y: 0, yaw: Math.sin(time * 0.13 + phase) * 0.12, roll: 0 };
  if (part.motion === 'hoist') return { x: 0, y: Math.sin(time * 0.3 + phase) * 0.6, yaw: 0, roll: 0 };
  if (part.motion === 'hoistCable') { const rise = Math.sin(time * 0.3 + phase) * 0.6; return { x: 0, y: rise / 2, yaw: 0, roll: 0, scaleY: 1 - rise / 5 }; }
  if (part.motion === 'parcel') return { x: Math.sin(time * 0.65 + phase) * 0.8, y: 0, yaw: 0, roll: 0 };
  if (part.motion === 'water') return { x: 0, y: Math.sin(time * 1.2 + phase) * 0.015, yaw: 0, roll: 0 };
  return null;
}
