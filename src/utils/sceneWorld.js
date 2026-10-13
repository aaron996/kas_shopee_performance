import { SCENE_THEMES } from './sceneThemes.js';

export const WORLD_REGIONS = [
  { id: 'canyon', label: 'Miền Tây', subtitle: 'Canyon Run', ground: '#bd8854', shoulder: '#d5af76', hill: ['#a95435', '#c87346'], trees: ['#547647', '#697e49', '#7c874e', '#536d43'], near: '#bc7957', far: '#cf9e86', wood: '#846044', stone: '#a86b4d', cream: '#d8b18a', trail: '#dcc3a1' },
  { id: 'rainforest', label: 'Rừng mưa', subtitle: 'Rainforest Passage', ground: '#58724b', shoulder: '#83906a', hill: ['#3b6550', '#4d7960'], trees: ['#305b42', '#477a4e', '#618653', '#396a50'], near: '#678b78', far: '#9eb8ac', wood: '#70533d', stone: '#6b7967', cream: '#b6bf9c', trail: '#c8ded7' },
  { id: 'alpine', label: 'Alps', subtitle: 'Alpine Link', ground: '#9caa70', shoulder: '#bdc3a0', hill: ['#737f87', '#929da2'], trees: ['#365d4c', '#4e7160', '#64836a', '#3d6753'], near: '#8eaaa9', far: '#bbcbd2', wood: '#8a6b4f', stone: '#a1aaa6', cream: '#dfdccd', trail: '#e2e8e5' },
  { id: 'harbor', label: 'Cảng biển', subtitle: 'Harbor Shift', ground: '#818f91', shoulder: '#b0b9b4', hill: ['#658994', '#799eaa'], trees: ['#486f63', '#648373', '#779784', '#4e756c'], near: '#859ea7', far: '#b3c5cd', wood: '#8b775e', stone: '#9ca6a6', cream: '#c9d0cb', trail: '#c7d8df' }
];
export const WORLD_CHANGE_SECONDS = 1.6;
export const WORLD_VISIT_SECONDS = 55;
export function worldRegion(id) { return WORLD_REGIONS.find(region => region.id === id) || WORLD_REGIONS[0]; }
export function nextWorld(id) { return WORLD_REGIONS[(WORLD_REGIONS.findIndex(region => region.id === id) + 1) % WORLD_REGIONS.length].id; }
export function worldTheme(id) {
  const region = worldRegion(id), base = SCENE_THEMES.light;
  return { ...base, ground: region.ground, shoulder: region.shoulder, hill: region.hill,
    treeCanopy: region.trees, backdropNear: region.near, backdropFar: region.far,
    backdropDepot: region.near, treeTrunk: region.wood,
    props: { ...base.props, stone: region.stone, wood: region.wood, cream: region.cream, curbOrange: '#bd754b', rail: id === 'canyon' ? region.wood : '#9aaba6' } };
}

// One request in flight; rapid choices replace the pending destination, never
// remount the truck scene or accumulate multiple full environments.
export function createWorldJourney(id) { return { from: id, to: id, mix: 1, elapsed: 0, visit: 0, time: 0 }; }
export function advanceWorldJourney(state, requested, delta, { active = true, reducedMotion = false } = {}) {
  requested = worldRegion(requested).id;
  const dt = active ? Math.min(Math.max(delta, 0), 0.1) : 0;
  state.time += dt;
  if ((!active || reducedMotion) && requested !== state.to) {
    state.from = state.to = worldRegion(requested).id; state.mix = 1; state.elapsed = 0; state.visit = 0;
    return state;
  }
  if (state.mix === 1 && state.to !== requested) {
    state.from = state.to; state.to = worldRegion(requested).id; state.elapsed = 0;
    state.mix = reducedMotion || !active ? 1 : 0; state.visit = 0;
  }
  if (state.mix < 1) {
    if (reducedMotion) state.elapsed = WORLD_CHANGE_SECONDS;
    else state.elapsed += dt;
    const t = Math.min(1, state.elapsed / WORLD_CHANGE_SECONDS);
    state.mix = t * t * (3 - 2 * t);
    if (state.mix === 1) state.from = state.to;
  } else state.visit += active ? Math.min(Math.max(delta, 0), 1) : 0;
  return state;
}
