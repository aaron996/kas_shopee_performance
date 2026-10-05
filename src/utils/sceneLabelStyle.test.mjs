import test from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_PALETTE as P, SCENE_BACKGROUND, composite, contrastRatio, layered } from './sceneLabelStyle.js';

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const scene = hexToRgb(SCENE_BACKGROUND);
const AA = 4.5;

test('contrast helper matches known WCAG values', () => {
  assert.equal(Math.round(contrastRatio([0, 0, 0], [255, 255, 255])), 21);
  assert.equal(contrastRatio([255, 255, 255], [255, 255, 255]), 1);
  assert.deepEqual(composite('#ffffff', 0.5, '#000000'), [128, 128, 128]);
});

// The scene is dark in both light and dark app themes, so one palette check covers both.
test('truck tag text meets WCAG AA on the tag background', () => {
  const tagBg = layered(P.tagBackground, scene);
  for (const [name, color] of [['rank', P.rank], ['name', P.name], ['kpi', P.kpi]]) {
    assert.ok(contrastRatio(hexToRgb(color), tagBg) >= AA, `${name} contrast ${contrastRatio(hexToRgb(color), tagBg).toFixed(2)}`);
  }
});

test('delta and warning chips meet WCAG AA', () => {
  const tagBg = layered(P.tagBackground, scene);
  for (const [name, chip] of [['up', P.deltaUp], ['down', P.deltaDown], ['none', P.deltaNone], ['warning', P.warning]]) {
    const bg = layered(chip.background, tagBg);
    const ratio = contrastRatio(hexToRgb(chip.text), bg);
    assert.ok(ratio >= AA, `${name} chip contrast ${ratio.toFixed(2)}`);
  }
});

test('checkpoint pills and lane labels meet WCAG AA', () => {
  const pill = layered(P.pillBackground, scene);
  assert.ok(contrastRatio(hexToRgb(P.pillText), pill) >= AA);
  const lane = layered(P.laneBackground, scene);
  assert.ok(contrastRatio(hexToRgb(P.laneText), lane) >= AA);
});

test('status accent borders are distinguishable from the tag background (UI contrast >= 3)', () => {
  const tagBg = layered(P.tagBackground, scene);
  for (const color of [P.tagGood, P.tagBelow, P.selected]) {
    assert.ok(contrastRatio(hexToRgb(color), tagBg) >= 3);
  }
});
