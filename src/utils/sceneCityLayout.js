import { hash01 } from './sceneThemes.js';
import { appendCityStreet } from './sceneCityStreet.js';

export const isCityWorld = world => world === 'hcm' || world === 'hanoi';

// City architecture shares the scenery's rigid anchor, instancing and recycling.
// These are compressed landmark compositions, not geographic scale models.
export function createCityLayout(source, roadWidth, city, compact, backdrop) {
  const batches = {}, landmarks = [];
  const add = (shape, part) => (batches[shape] ||= []).push(part);
  const painter = (anchor, ox, oz, landmark) => (shape, x, y, z, scale, color, extras = {}) =>
    add(shape, { anchor, radius: 15, x: ox + x, y, z: oz + z, scale, color, yaw: 0, roll: 0, landmark, ...extras });
  const edge = roadWidth / 2;
  if (backdrop) {
    for (let anchor = -source.span / 2 + 12; anchor < source.span / 2; anchor += 24) {
      const part = painter(anchor, 0, -(edge + 46), 'city-skyline');
      for (let i = 0; i < 4; i++) {
        const seed = anchor * 17 + i * 131, height = 3 + hash01(seed) * (city === 'hcm' ? 6 : 3);
        const x = -9 + i * 6, z = -hash01(seed + 3) * 5;
        part('box', x, height / 2, z, [5.8, height, 5], i % 2 ? 'backdropNear' : 'backdropFar');
        if (city === 'hanoi') part('cityRoof', x, height, z, [6, 0.9, 5.4], 'cityRoof');
        else if (!compact) part('box', x, height * 0.65, z + 2.55, [4, 0.25, 0.05], 'cityTrim');
      }
    }
    return { ...source, batches, landmarks };
  }

  // Retain curbs and fixtures, remove highway rails from the shopping street.
  for (const [shape, parts] of Object.entries(source.batches)) for (const part of parts) {
    if (part.streetlight || part.radius < 2 && part.y < 0.2) add(shape, part);
    else if (part.color === 'cloud') add(shape, { ...part, motion: 'cloud', phase: part.anchor, motionExtent: 3 });
  }
  appendCityStreet(add, source.span, roadWidth, city, compact);
  for (let anchor = -source.span / 2 + 48; anchor < source.span / 2; anchor += 96) {
    const landmark = (kind, x, z, draw) => {
      landmarks.push({ kind, anchor, x, z });
      draw(painter(anchor, x, z, kind), compact);
    };
    if (city === 'hcm') {
      const river = painter(anchor, 0, -(edge + 38), 'saigon-river');
      river('water', 0, 0.025, 0, [94, 1, 12], 'cityWater', { motion: 'water', phase: anchor });
      for (const z of [-6.2, 6.2]) river('box', 0, 0.15, z, [94, 0.3, 0.4], 'stone');
      landmark('bitexco', -16, -(edge + 23), bitexco);
      landmark('landmark-81', 12, -(edge + 25), landmark81);
    } else {
      const lake = painter(anchor, 0, -(edge + 18), 'hoan-kiem-lake');
      lake('water', 0, 0.025, 0, [42, 1, 20], 'cityWater', { motion: 'water', phase: anchor });
      lake('box', 0, 0.1, 10.2, [43, 0.2, 0.5], 'stone');
      landmark('turtle-tower', -7, -(edge + 20), turtleTower);
      landmark('the-huc', 8, -(edge + 15), theHuc);
      const temple = painter(anchor, 14, -(edge + 21), 'ngoc-son-roof');
      temple('box', 0, 0.15, 0, [7, 0.3, 5], 'stone');
      temple('box', 0, 1, 0, [4.8, 1.7, 3], 'cityWall');
      temple('cityRoof', 0, 1.85, 0, [6.4, 1.1, 4.2], 'cityRoof');
    }
    // A planted lake bank / rear street softens the distant architectural band.
    const greenery = painter(anchor, 0, -(edge + 33), 'city-trees');
    for (let i = 0; i < (compact ? 5 : 9); i++) {
      const x = -40 + i * (compact ? 18 : 10);
      greenery('pole', x, 1.4, 0, [0.3, 2.8, 0.3], 'treeTrunk');
      greenery('round', x, 3.6, 0, [2.5, 1.8, 2.1], `treeCanopy:${i % 4}`, { motion: 'wind', phase: anchor + i });
    }
  }
  return { ...source, batches, landmarks };
}

function landmark81(part, compact) {
  part('box', 0, 0.25, 0, [8, 0.5, 6.5], 'stone');
  const columns = [[-2.3, 0, 5.8], [2.3, 0, 7.7], [-1.15, 1.5, 8.6], [1.15, 1.5, 10.2], [0, -1.3, 11.2], [0, 0.15, 12.8]];
  for (const [x, z, height] of columns) {
    part('glass', x, height / 2 + 0.5, z, [1.65, height, 1.65], 'cityGlass');
    part('box', x, height + 0.5, z, [1.75, 0.16, 1.75], 'cityTrim');
    for (const side of compact ? [-1] : [-1, 1]) part('box', x + side * 0.72, height / 2 + 0.5, z + 0.84, [0.07, height, 0.06], 'cityTrim');
  }
  part('pole', 0, 14, 0.15, [0.13, 1.5, 0.13], 'cityTrim');
}

function bitexco(part, compact) {
  part('pole', 0, 0.2, 0, [5.5, 0.4, 4.5], 'stone');
  part('bitexco', 0, 0.4, 0, [4.1, 9.5, 3.4], 'cityGlass');
  // The projecting elliptical helipad is readable even without facade details.
  part('pole', 2, 6.75, 0.4, [4.6, 0.24, 3.1], 'cityTrim');
  part('pole', 2, 6.89, 0.4, [3.8, 0.035, 2.5], 'cityGlass');
  if (!compact) for (const x of [-0.9, 0, 0.9]) part('box', x, 4.8, 1.4, [0.045, 8.1 - Math.abs(x) * 1.5, 0.06], 'cityTrim');
}

function turtleTower(part, compact) {
  part('round', 0, 0.12, 0, [4.8, 0.3, 3.6], 'treeCanopy:2');
  part('box', 0, 0.35, 0, [5.4, 0.35, 3.8], 'stone');
  // Open arches on the lower tiers, instead of a solid stack of boxes.
  for (let tier = 0; tier < 2; tier++) {
    const y = 0.53 + tier * 1.65, width = 4.8 - tier * 0.65, depth = 3.1 - tier * 0.4;
    for (const side of [-1, 1]) {
      for (const x of [-1, 0, 1]) part('arch', x * width / 3, y, side * depth / 2, [width / 3, 1.4, 0.24], 'cream');
      part('arch', side * width / 2, y, 0, [depth, 1.4, 0.24], 'cream', { yaw: Math.PI / 2 });
    }
    part('box', 0, y + 1.46, 0, [width + 0.45, 0.22, depth + 0.4], 'stone');
  }
  part('box', 0, 4.05, 0, [2.3, 1, 1.8], 'cream');
  part('arch', 0, 3.6, 0.94, [1.1, 0.88, 0.1], 'cityWall');
  part('cityRoof', 0, 4.55, 0, [3.3, 1, 2.7], 'stone');
  if (!compact) for (const x of [-1.3, 1.3]) part('pole', x, 5.1, 0, [0.1, 0.5, 0.1], 'cream');
}

function theHuc(part, compact) {
  const segments = compact ? 8 : 12, length = 12, width = 1.7;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, x = (t - 0.5) * length, y = 0.4 + Math.sin(t * Math.PI) * 0.95;
    for (const side of [-1, 1]) {
      part('pole', x, y / 2, side * width / 2, [0.13, y, 0.13], 'cityRed');
      part('box', x, y + 0.45, side * width / 2, [0.11, 0.9, 0.11], 'cityRed');
    }
    if (i === segments) continue;
    const nextY = 0.4 + Math.sin((i + 1) / segments * Math.PI) * 0.95;
    const rise = nextY - y, run = length / segments, roll = Math.atan2(rise, run);
    part('box', x + run / 2, (y + nextY) / 2, 0, [Math.hypot(run, rise) + 0.02, 0.16, width + 0.16], 'cityRed', { roll });
    for (const side of [-1, 1]) for (const height of compact ? [0.8] : [0.35, 0.8])
      part('box', x + run / 2, (y + nextY) / 2 + height, side * width / 2, [Math.hypot(run, rise) + 0.02, 0.08, 0.08], 'cityRed', { roll });
  }
}
