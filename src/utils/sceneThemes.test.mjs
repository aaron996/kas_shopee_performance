import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_THEMES, pickSceneTheme, hash01 } from './sceneThemes.js';
import { computeRoadsideLayout, roadsideWorldPose, ROADSIDE_CYCLE } from './sceneRoadside.js';

const HEX = /^#[0-9a-f]{6}$/i;
const hexes = (o) => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : v && typeof v === 'object' ? hexes(v) : []));
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

test('both themes define the same keys and only valid colours', () => {
  assert.deepEqual(Object.keys(SCENE_THEMES.dark).sort(), Object.keys(SCENE_THEMES.light).sort());
  for (const theme of Object.values(SCENE_THEMES)) {
    for (const value of hexes(theme).filter((v) => typeof v === 'string' && v.startsWith('#'))) assert.match(value, HEX);
    assert.ok(theme.treeCanopy.length >= 3);
  }
});

test('light theme is brighter than dark for sky and ground, asphalt stays darker than the ground in light', () => {
  assert.ok(lum(SCENE_THEMES.light.skyTop) > lum(SCENE_THEMES.dark.skyTop));
  assert.ok(lum(SCENE_THEMES.light.ground) > lum(SCENE_THEMES.dark.ground));
  assert.ok(lum(SCENE_THEMES.light.asphalt) < lum(SCENE_THEMES.light.ground));
});

test('pickSceneTheme', () => {
  assert.equal(pickSceneTheme(true), SCENE_THEMES.dark);
  assert.equal(pickSceneTheme(false), SCENE_THEMES.light);
});

test('hash01 is deterministic and in [0, 1)', () => {
  for (let i = -5; i < 200; i++) {
    const v = hash01(i);
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, hash01(i));
  }
});

test('logistics route is deterministic, varied and clears the road at every supported lane width', () => {
  for (const width of [3.2, 11, 16.2]) {
    const a = computeRoadsideLayout(36, width);
    assert.deepEqual(a, computeRoadsideLayout(36, width));
    assert.equal(a.span, ROADSIDE_CYCLE * 2);
    assert.deepEqual(new Set(a.landmarks.map(p => p.kind)), new Set(['billboard', 'depot', 'yard']));
    assert.ok(a.batches.cone.length > 0 && a.batches.round.length > 0 && a.batches.rock.length > 0);
    for (const [shape, parts] of Object.entries(a.batches)) for (const part of parts) {
      const halfZ = part.scale[2] * (['box', 'pole'].includes(shape) ? 0.5 : 1);
      if (part.streetlight && part.y > 4) assert.ok(part.y - Math.hypot(...part.scale) / 2 > 4.5, 'overhead lamp arms clear vehicles');
      else assert.ok(Math.abs(part.z) - halfZ >= width / 2, 'ground scenery clears asphalt');
      if (part.z > 0 && !part.streetlight) assert.ok(part.y + part.scale[1] * (['box', 'pole'].includes(shape) ? 0.5 : 1) <= 0.61, 'near shoulder stays low');
      assert.ok(part.scale.every(n => Number.isFinite(n) && n > 0));
    }
  }
});

test('route uses seven batches with bounded instance count', () => {
  const a = computeRoadsideLayout(2400, 16.2);
  assert.equal(Object.keys(a.batches).length, 7);
  assert.ok(Object.values(a.batches).flat().length < 12000);
  const small = computeRoadsideLayout(36, 11), large = computeRoadsideLayout(1400, 11);
  // Common clusters keep the same seed and geometry when Top N changes.
  const atFive = layout => layout.batches.cone.filter(p => p.anchor === 5);
  assert.deepEqual(atFive(small), atFive(large));
});

test('depot roof and stacked containers retain rigid distances on the curve and across recycling', () => {
  const layout = computeRoadsideLayout(36, 11);
  for (const kind of ['depot', 'yard']) {
    const { anchor } = layout.landmarks.find(p => p.kind === kind);
    const parts = layout.batches.box.filter(p => p.anchor === anchor);
    const origin = parts[0];
    for (const part of parts) for (const anchor of [-800, -193, -192, -91, 0, 192, 800]) {
      const a = roadsideWorldPose(origin, anchor, 36);
      const b = roadsideWorldPose(part, anchor, 36);
      const localLength = Math.hypot(part.x - origin.x, part.y - origin.y, part.z - origin.z);
      assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) - localLength) < 1e-9);
      assert.equal(a.heading, b.heading); assert.equal(a.pitch, b.pitch);
    }
  }
});
