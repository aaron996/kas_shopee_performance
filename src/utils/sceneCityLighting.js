import { hash01 } from './sceneThemes.js';

const WARM = '#ffbc72', SOFT = '#ffe0a3', COOL = '#c5e8ff';

// Stable per address: recycling, quality changes and rerenders keep the same
// closed shops and occupied rooms. Shop type supplies character, not randomness.
export function cityLightProfile(index, side, shopIndex) {
  const seed = index * 137 + (side === 1 ? 71 : 19);
  const open = hash01(seed) > 0.3;
  const type = [0, 10, 13, 14].includes(shopIndex) ? 'pendant'
    : [2, 3, 4, 15].includes(shopIndex) ? 'tube'
      : [7, 8, 11, 12].includes(shopIndex) ? 'neon' : 'lantern';
  const color = type === 'tube' ? COOL : type === 'neon' ? (index % 2 ? '#ffa4b9' : '#86ded3') : type === 'pendant' ? WARM : SOFT;
  const strength = open ? 0.45 + hash01(seed + 23) * 0.85 : 0;
  return { seed, open, type, color, strength, fixtures: 1 + Math.floor(hash01(seed + 43) * 3) };
}

export function cityRoomLight(profile, floor, pane) {
  const seed = profile.seed + floor * 53 + pane * 29;
  // Some whole houses are dark; occupied houses still have unlit rooms.
  const occupied = hash01(profile.seed + 97) > 0.28 && hash01(seed + 11) > 0.48;
  return { color: hash01(seed + 7) > 0.8 ? COOL : hash01(seed + 3) > 0.5 ? WARM : SOFT,
    strength: occupied ? 0.28 + hash01(seed + 17) * 0.7 : 0 };
}
