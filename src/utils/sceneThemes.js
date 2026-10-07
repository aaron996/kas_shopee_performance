// Colours of the 3D scene per app theme (sky, ground, asphalt, roadside, lights).
// Pure data so it can be tested; the labels drawn over the scene keep their own opaque-ish backgrounds
// (see sceneLabelStyle.js), so they read on both palettes.

export const SCENE_THEMES = {
  dark: {
    skyTop: '#04080f',
    skyBottom: '#1b2c4a',
    horizon: '#1b2c4a',
    ground: '#23372f',
    asphalt: '#334155',
    shoulder: '#64748b',
    dash: '#cbd5e1',
    treeCanopy: ['#376249', '#4b7051', '#365b43', '#697449'],
    hill: ['#2d4637', '#334d3c'],
    cloud: '#6c7e8c',
    props: { orange: '#c65c2b', blue: '#315881', cream: '#a6ac9c', white: '#ffffff', curbOrange: '#d06b39', curbWhite: '#aab7b5', rail: '#81948e', stone: '#899b96', apron: '#45504e', wood: '#77634a', carton: '#a98b5a', door: '#1c2c35', doorRib: '#3e4f58' },
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
    ground: '#c5d899',
    asphalt: '#4b5a6e',
    shoulder: '#d6dfc0',
    dash: '#f1f5f9',
    treeCanopy: ['#668b4e', '#88a95b', '#55794b', '#a0b55f'],
    hill: ['#adc879', '#b8cf88'],
    cloud: '#f5f7eb',
    props: { orange: '#f15a22', blue: '#2d629a', cream: '#eee9d7', white: '#ffffff', curbOrange: '#f28b53', curbWhite: '#f5f4e9', rail: '#b3c3bd', stone: '#e1e5d6', apron: '#a9b7b0', wood: '#a78a5f', carton: '#c9ab72', door: '#263c4b', doorRib: '#516574' },
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
