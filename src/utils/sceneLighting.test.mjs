import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDayPhase, DAY_CYCLE_SECONDS, formatSceneTime, INITIAL_DAY_PHASE, phaseForLightingMode, sampleSceneLighting, sceneFogRange, stepLightingPhase, wrapDayPhase } from './sceneLighting.js';

test('manual lighting eases across midnight and retargets without jumping; reduced motion is immediate', () => {
  const phase = stepLightingPhase(23 / 24, 1 / 24, 1 / 60);
  assert.ok(phase > 23 / 24 && phase < 1);
  const reversed = stepLightingPhase(phase, 20 / 24, 1 / 60);
  assert.ok(reversed < phase && reversed > 20 / 24);
  for (const fps of [20, 60]) {
    let value = 0.5;
    for (let frame = 0; frame < fps; frame++) value = stepLightingPhase(value, 0, 1 / fps);
    assert.equal(value, 0);
  }
  assert.equal(stepLightingPhase(0.5, 0, 0), 0.5);
  assert.equal(stepLightingPhase(0.5, 0, 0.01, true), 0);
});

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

test('fog preserves the near fleet and expands with overview zoom rather than total road length', () => {
  for (const distance of [6, 10, 20, 35, 80, 200]) {
    const range = sceneFogRange(distance);
    assert.ok(range.near > distance && range.far > range.near + 60);
    assert.ok(Number.isFinite(range.near) && Number.isFinite(range.far));
  }
  assert.ok(sceneFogRange(20).near < 50);
  assert.ok(sceneFogRange(20).far < 200);
  assert.ok(sceneFogRange(80).near > sceneFogRange(20).far / 2);
  assert.deepEqual(sceneFogRange(NaN), sceneFogRange(20));
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
  assert.equal(formatSceneTime(phaseForLightingMode('dawn', 0.5)), '06:00');
  assert.equal(formatSceneTime(phaseForLightingMode('dusk', 0.5)), '18:00');
  assert.equal(phaseForLightingMode('day', 0.75), 0.5);
  assert.equal(phaseForLightingMode('night', 0.5), 0);
  assert.equal(phaseForLightingMode('auto', 0.75), 0.75);
});

test('dawn and dusk light opposite facades with warm grazing sunlight', () => {
  const dawn = sampleSceneLighting(phaseForLightingMode('dawn', 0));
  const dusk = sampleSceneLighting(phaseForLightingMode('dusk', 0));
  for (const state of [dawn, dusk]) {
    assert.equal(state.source, 'sun');
    assert.ok(state.keyIntensity > 0.2);
    assert.ok(state.keyDirection[1] > 0 && state.keyDirection[1] < 0.1);
    assert.ok(state.shadowIntensity > 0.1);
    assert.equal(state.keyColor, '#ff9b55');
  }
  assert.ok(dawn.keyDirection[0] > 0 && dusk.keyDirection[0] < 0);
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
  assert.ok(night.ambientIntensity >= 0.65 && night.keyIntensity >= 0.45, 'night retains readable vehicle forms');
  assert.ok(noon.ambientIntensity < 1.5, 'daylight leaves room for directional shape');
});

test('sunrise, sunset and midnight wrap have continuous brightness and sky colours', () => {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (const phase of [0, 0.25, 0.75, 1]) {
    const a = sampleSceneLighting(phase - 1e-6), b = sampleSceneLighting(phase + 1e-6);
    for (const key of ['keyIntensity', 'ambientIntensity', 'shadowIntensity', 'sunOpacity', 'moonOpacity']) assert.ok(Math.abs(a[key] - b[key]) < 0.001, key);
    for (const key of ['skyTop', 'horizon']) assert.ok(rgb(a[key]).every((value, i) => Math.abs(value - rgb(b[key])[i]) <= 1), key);
  }
});
