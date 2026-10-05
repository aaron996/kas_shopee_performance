import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_THEMES, pickSceneTheme, hash01, computeRoadside } from './sceneThemes.js';

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

test('roadside props stay off the asphalt, inside the road span and are deterministic', () => {
  const length = 120;
  const width = 8;
  const a = computeRoadside(length, width);
  const b = computeRoadside(length, width);
  assert.deepEqual(a, b);
  assert.ok(a.trees.length > 10 && a.signs.length >= 2);
  for (const t of a.trees) {
    assert.ok(t.z < -(width / 2 + 1.5), `tree at z=${t.z} must stand on the far side, clear of the road`);
    assert.ok(Math.abs(t.x) <= length / 2 + 6);
    assert.ok(t.scale >= 0.7 && t.scale <= 1.2 && [0, 1, 2].includes(t.tint));
  }
  for (const s of a.signs) assert.ok(s.z < -(width / 2), 'signs stay on the far side too');
});

test('roadside prop counts stay small for the longest road (draw-call budget is instancing, memory is the limit)', () => {
  const { trees, signs } = computeRoadside(1400, 7.8);
  assert.ok(trees.length < 300 && signs.length < 40);
});
