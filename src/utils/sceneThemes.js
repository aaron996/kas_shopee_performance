// Colours of the 3D scene per app theme (sky, ground, asphalt, roadside, lights).
// Pure data so it can be tested; the labels drawn over the scene keep their own opaque-ish backgrounds
// (see sceneLabelStyle.js), so they read on both palettes.

export const SCENE_THEMES = {
  dark: {
    skyTop: '#04080f',
    skyBottom: '#1b2c4a',
    horizon: '#1b2c4a',
    ground: '#0d1626',
    asphalt: '#334155',
    shoulder: '#64748b',
    dash: '#cbd5e1',
    treeCanopy: ['#1d4a38', '#225a43', '#1a4232'],
    treeTrunk: '#3b2a1e',
    signPole: '#94a3b8',
    signPlate: '#1d4ed8',
    hemisphere: { sky: '#e2e8f0', ground: '#334155', intensity: 2 },
    sun: { color: '#ffffff', intensity: 1.5 }
  },
  light: {
    skyTop: '#8fb7e3',
    skyBottom: '#e4eef8',
    horizon: '#e4eef8',
    ground: '#d3dce6',
    asphalt: '#4b5a6e',
    shoulder: '#9aa8b8',
    dash: '#f1f5f9',
    treeCanopy: ['#5f8f6e', '#6a9b79', '#547f63'],
    treeTrunk: '#6b4a32',
    signPole: '#64748b',
    signPlate: '#2563eb',
    hemisphere: { sky: '#ffffff', ground: '#aab8c8', intensity: 2.3 },
    sun: { color: '#fff3dc', intensity: 1.9 }
  }
};

export function pickSceneTheme(isDark) {
  return isDark ? SCENE_THEMES.dark : SCENE_THEMES.light;
}

// Deterministic 0..1 value from an integer (roadside props must not move between renders).
export function hash01(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * Roadside props along the far shoulder: trees every ~TREE_STEP units, signs every ~SIGN_STEP.
 * @returns {{trees: Array<{x, z, scale, tint}>, signs: Array<{x, z, side}>}}
 */
export const TREE_STEP = 11;
export const SIGN_STEP = 52;
export function computeRoadside(roadLength, roadWidth) {
  const half = roadLength / 2 + 3;
  const trees = [];
  const signs = [];
  const edge = roadWidth / 2 + 0.5;
  let i = 0;
  // The camera looks from the +z side, so props stand on the far (-z) side only: they frame the
  // road without ever covering a truck or a label.
  for (let x = -half; x <= half; x += TREE_STEP, i++) {
    const h = hash01(i * 2 + 1);
    // skip some slots so the line of trees is not a fence
    if (h < 0.22) continue;
    trees.push({
      x: x + (hash01(i * 7 + 2) - 0.5) * 5,
      z: -(edge + 2.4 + hash01(i * 5 + 11) * 3.6),
      scale: 0.7 + hash01(i * 13 + 5) * 0.5,
      tint: Math.floor(hash01(i * 3 + 17) * 3)
    });
  }
  let j = 0;
  for (let x = -half + SIGN_STEP / 2; x <= half; x += SIGN_STEP, j++) {
    signs.push({ x, z: -(edge + 0.9), side: -1 });
  }
  return { trees, signs };
}
