import { hash01 } from './sceneThemes.js';
import { ROADSIDE_BUFFER, wrapRoadTravel } from './sceneDriving.js';
import { sampleRoadFrame } from './sceneRoadCurve.js';

// A route has six beats: grove, billboard, open grove, depot, grove, yard.
// Its seed and spacing never depend on KPI/Hub IDs. A short road still cycles
// through the entire route instead of repeating one landmark every few seconds.
export const ROADSIDE_BEAT = 32;
export const ROADSIDE_CYCLE = ROADSIDE_BEAT * 6;
export const ROADSIDE_SHAPES = ['box', 'cone', 'round', 'rock', 'hill', 'pole', 'sign'];

export function roadsidePose(part, distance, span, roadLength) {
  const anchor = wrapRoadTravel(part.anchor, distance, -span / 2, span);
  // Recycle the entire cluster together, outside view. Large structures finish
  // fading before any of their parts reach the wrap boundary.
  const fadeStart = roadLength / 2 + ROADSIDE_BUFFER - part.radius;
  const alpha = Math.max(0, Math.min(1, (fadeStart - Math.abs(anchor)) / 6));
  return { anchor, x: anchor + part.x, z: part.z, alpha };
}

// One rigid frame per cluster. Wall/roof/container offsets retain their lengths
// around a bend, instead of each piece being stretched along a separate arc.
export function roadsideWorldPose(part, distance, span, roadLength) {
  const pose = roadsidePose(part, distance, span, roadLength);
  const frame = sampleRoadFrame(pose.anchor, 0, roadLength);
  const cy = Math.cos(frame.heading), sy = Math.sin(frame.heading);
  const cp = Math.cos(frame.pitch), sp = Math.sin(frame.pitch);
  const along = cp * part.x - sp * part.y;
  return {
    x: frame.x + cy * along + sy * part.z,
    y: frame.y + sp * part.x + cp * part.y,
    z: frame.z - sy * along + cy * part.z,
    heading: frame.heading, pitch: frame.pitch, alpha: pose.alpha
  };
}

export function computeRoadsideLayout(roadLength, roadWidth) {
  const span = Math.max(ROADSIDE_CYCLE, Math.ceil((roadLength + ROADSIDE_BUFFER * 2 + 24) / ROADSIDE_CYCLE) * ROADSIDE_CYCLE);
  const batches = Object.fromEntries(ROADSIDE_SHAPES.map(shape => [shape, []]));
  const landmarks = [];
  const edge = roadWidth / 2;
  let anchor = 0, radius = 10;
  const part = (shape, x, y, z, scale, color, yaw = 0, roll = 0) => {
    batches[shape].push({ anchor, radius, x, y, z, scale, color, yaw, roll });
  };
  const box = (x, y, z, sx, sy, sz, color, yaw = 0) => part('box', x, y, z, [sx, sy, sz], color, yaw);
  const tree = (x, z, scale, style, tint) => {
    part('pole', x, 0.48 * scale, z, [0.24 * scale, 0.96 * scale, 0.24 * scale], 'treeTrunk');
    const canopy = `treeCanopy:${tint}`;
    if (style === 2) part('round', x, 1.55 * scale, z, [0.95 * scale, 1.15 * scale, 0.85 * scale], canopy);
    else {
      const height = (style === 0 ? 2.4 : 1.65) * scale;
      part('cone', x, 0.65 * scale + height / 2, z, [(style === 0 ? 0.7 : 1) * scale, height, (style === 0 ? 0.7 : 1) * scale], canopy);
    }
  };
  const pallet = (x, z, height = 0.8) => {
    box(x, 0.12, z, 1.1, 0.24, 0.85, 'wood');
    box(x, 0.24 + height / 2, z, 0.9, height, 0.75, 'carton');
    box(x, 0.25 + height / 2, z + 0.38, 0.05, height, 0.015, 'wood');
  };
  // Far shoulder is tall; near shoulder is deliberately limited to low curbs
  // and rails so the TV camera can see the trucks and podium labels.
  radius = 1.8;
  for (let x = -span / 2; x < span / 2; x += 3) {
    anchor = x;
    for (const side of [-1, 1]) {
      box(0, 0.09, side * (edge + 0.33), 2.96, 0.18, 0.55, Math.round(x / 3) % 2 ? 'curbOrange' : 'curbWhite');
      part('pole', 0, 0.3, side * (edge + 1), [0.07, 0.6, 0.07], 'rail');
      box(0, 0.45, side * (edge + 1), 2.98, 0.1, 0.08, 'rail');
    }
  }
  for (let index = -span / (2 * ROADSIDE_BEAT); index < span / (2 * ROADSIDE_BEAT); index++) {
    anchor = index * ROADSIDE_BEAT + 5;
    radius = 11;
    const beat = ((index % 6) + 6) % 6;
    const seed = index * 103;
    // Low distant hills, varied outline rather than an identical row of cones.
    part('hill', -6, -0.08, -(edge + 17), [12, 2 + hash01(seed + 4) * 1.2, 9], 'hill:0', hash01(seed + 6));
    part('hill', 7, -0.08, -(edge + 23), [14, 2.7, 11], 'hill:1', hash01(seed + 8));
    if (beat === 0 || beat === 4) {
      for (let puff = 0; puff < 3; puff++) part('round', -7 + puff * 1.5, 7 + puff % 2 * 0.35, -(edge + 27), [1.5, 0.6 + puff % 2 * 0.25, 0.8], 'cloud');
    }
    if (beat % 2 === 0) {
      part('rock', -7, 0.14, edge + 3.4, [0.6, 0.28, 0.5], 'stone');
      part('round', -5.6, 0.12, edge + 3.8, [0.6, 0.28, 0.45], 'treeCanopy:2');
    }
    const count = beat % 2 === 0 ? 10 : 8;
    for (let i = 0; i < count; i++) {
      const x = beat % 2 === 0 ? -12 + hash01(seed + i * 11 + 2) * 24 : (i % 2 ? -1 : 1) * (8 + hash01(seed + i * 11 + 2) * 4);
      const z = -(edge + 3.8 + hash01(seed + i * 13 + 7) * 6);
      tree(x, z, 0.85 + hash01(seed + i * 17 + 5) * 0.5, i % 3, i % 4);
    }
    for (let i = 0; i < 4; i++) {
      const x = -13 + hash01(seed + i * 19 + 1) * 26;
      const z = -(edge + 3 + hash01(seed + i * 7 + 3) * 7);
      // Leave the apron of landmark beats clear.
      if (beat % 2 && Math.abs(x) < 8) continue;
      part('rock', x, 0.18, z, [0.6 + hash01(seed + i) * 0.8, 0.45, 0.65], 'stone', i * 0.7);
      part('round', x + 0.9, 0.16, z - 1, [0.6, 0.35, 0.55], `treeCanopy:${(i + 1) % 4}`);
    }
    if (beat === 1) {
      const z = -(edge + 4.3);
      landmarks.push({ kind: 'billboard', anchor });
      for (const x of [-2.5, 2.5]) part('pole', x, 1.35, z, [0.12, 2.7, 0.12], 'rail');
      box(0, 2.55, z, 7.5, 2.3, 0.25, 'blue');
      part('sign', 0, 2.55, z + 0.14, [7.2, 2.05, 1], 'white');
    } else if (beat === 3) {
      const z = -(edge + 7.5);
      landmarks.push({ kind: 'depot', anchor });
      box(0, 0.02, z + 0.8, 12, 0.08, 9, 'apron');
      box(0, 1.5, z - 1.5, 8.8, 3, 4.8, 'cream');
      // Split pitched roof using two shallow rotated boxes.
      part('box', -2.25, 3.28, z - 1.5, [4.7, 0.2, 5.3], 'blue', 0, 0.12);
      part('box', 2.25, 3.28, z - 1.5, [4.7, 0.2, 5.3], 'blue', 0, -0.12);
      box(0, 2.65, z + 0.92, 8.9, 0.25, 0.12, 'orange');
      for (const x of [-2.7, 0, 2.7]) {
        box(x, 1.12, z + 0.93, 1.9, 2.2, 0.13, 'door');
        for (let j = 0; j < 5; j++) box(x, 0.38 + j * 0.35, z + 1.01, 1.8, 0.045, 0.025, 'doorRib');
      }
      part('sign', 0, 2.65, z + 1.04, [2.2, 0.62, 1], 'white');
      pallet(-4.6, z + 2.8); pallet(3.8, z + 3.4, 0.55);
      // Static small delivery van on the apron: cargo, cab, glazing, wheels.
      box(5, 0.9, z + 0.5, 1.5, 1.15, 1.1, 'orange');
      box(6, 0.7, z + 0.5, 0.7, 0.85, 1, 'blue');
      box(6.05, 1, z + 1.01, 0.5, 0.4, 0.025, 'door');
      for (const x of [4.6, 6]) for (const side of [-1, 1]) part('rock', x, 0.3, z + 0.5 + side * 0.55, [0.29, 0.3, 0.18], 'door');
    } else if (beat === 5) {
      const z = -(edge + 7);
      landmarks.push({ kind: 'yard', anchor });
      box(0, 0.02, z, 14, 0.08, 8, 'apron');
      const containers = [[-4, 0, 0, 'orange'], [2.5, 0, -0.8, 'blue'], [-3, 2, -1, 'cream'], [3.5, 0, -3.4, 'orange']];
      for (const [x, y, dz, color] of containers) {
        box(x, y + 1.03, z + dz, 5.8, 1.9, 2.3, color);
        // Shared box batch handles corrugation, no material/mesh per container.
        for (let rib = 0; rib < 13; rib++) box(x - 2.7 + rib * 0.45, y + 1.03, z + dz + 1.17, 0.045, 1.75, 0.05, color);
      }
      part('sign', 2.5, 1.05, z + 0.38, [2.2, 0.65, 1], 'white');
      for (const x of [-6.5, 6.5]) {
        part('pole', x, 2.2, z - 2, [0.1, 4.4, 0.1], 'rail');
        box(x, 4.4, z - 2, 0.65, 0.22, 0.35, 'cream');
      }
      pallet(5.5, z + 2.4, 0.6);
    }
  }
  return { span, batches, landmarks };
}
