import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDayPhase, DAY_CYCLE_SECONDS, formatSceneTime, INITIAL_DAY_PHASE, phaseForLightingMode, sampleSceneLighting, wrapDayPhase } from './sceneLighting.js';

test('solar time loops after six active minutes at different frame rates', () => {
  for (const fps of [20, 30, 60]) {
    let phase = INITIAL_DAY_PHASE;
    for (let i = 0; i < fps * DAY_CYCLE_SECONDS; i++) phase = advanceDayPhase(phase, 1 / fps);
    assert.ok(Math.abs(phase - INITIAL_DAY_PHASE) < 1e-9);
  }
  assert.equal(formatSceneTime(0), '00:00');
  assert.equal(formatSceneTime(1), '00:00');
  assert.equal(formatSceneTime(9 / 24), '09:00');
  assert.equal(formatSceneTime(23 / 24 + 59 / 1440), '23:59');
});

test('pause freezes time and a background gap cannot skip hours', () => {
  assert.equal(advanceDayPhase(0.5, 10, false), 0.5);
  assert.equal(advanceDayPhase(0.5, -1), 0.5);
  assert.equal(advanceDayPhase(0.5, NaN), 0.5);
  assert.ok(Math.abs(advanceDayPhase(0.5, 120) - (0.5 + 0.1 / DAY_CYCLE_SECONDS)) < 1e-12);
  assert.equal(wrapDayPhase(Infinity), INITIAL_DAY_PHASE);
  assert.equal(wrapDayPhase(-0.25), 0.75);
});

test('manual presets and returning to auto preserve the selected time', () => {
  assert.equal(phaseForLightingMode('day', 0.75), 0.5);
  assert.equal(phaseForLightingMode('night', 0.5), 0);
  assert.equal(phaseForLightingMode('auto', 0.75), 0.75);
});

test('sun and moon follow opposite normalized orbits and the key stays above the horizon', () => {
  for (let minute = 0; minute < 1440; minute++) {
    const s = sampleSceneLighting(minute / 1440);
    assert.ok(Math.abs(Math.hypot(...s.sunDirection) - 1) < 1e-12);
    assert.ok(s.sunDirection.every((value, i) => value === -s.moonDirection[i]));
    assert.ok(s.keyDirection[1] >= -1e-12);
    assert.ok(s.keyIntensity >= 0 && s.keyIntensity <= 2.2);
    assert.ok(s.ambientIntensity >= 0.46 && s.ambientIntensity < 1.8);
    assert.ok(s.shadowIntensity >= 0 && s.shadowIntensity <= 0.85);
    assert.ok(s.sunOpacity >= 0 && s.sunOpacity <= 1);
    assert.ok(s.moonOpacity >= 0 && s.moonOpacity <= 1);
  }
});

test('day has stronger light and shorter shadows than early morning; moonlight is softer', () => {
  const dawn = sampleSceneLighting(7 / 24), noon = sampleSceneLighting(12 / 24), night = sampleSceneLighting(0);
  const shadowLength = s => Math.hypot(s.keyDirection[0], s.keyDirection[2]) / s.keyDirection[1];
  assert.equal(noon.source, 'sun'); assert.equal(night.source, 'moon');
  assert.ok(noon.keyIntensity > dawn.keyIntensity && dawn.keyIntensity > night.keyIntensity);
  assert.ok(shadowLength(dawn) > shadowLength(noon));
  assert.ok(noon.ambientIntensity > night.ambientIntensity);
  assert.ok(noon.shadowIntensity > night.shadowIntensity);
  assert.equal(noon.moonOpacity, 0); assert.equal(night.sunOpacity, 0);
});

test('sunrise, sunset and midnight wrap have continuous brightness and sky colours', () => {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (const phase of [0, 0.25, 0.75, 1]) {
    const a = sampleSceneLighting(phase - 1e-6), b = sampleSceneLighting(phase + 1e-6);
    for (const key of ['keyIntensity', 'ambientIntensity', 'shadowIntensity', 'sunOpacity', 'moonOpacity']) assert.ok(Math.abs(a[key] - b[key]) < 0.001, key);
    for (const key of ['skyTop', 'horizon']) assert.ok(rgb(a[key]).every((value, i) => Math.abs(value - rgb(b[key])[i]) <= 1), key);
  }
});
