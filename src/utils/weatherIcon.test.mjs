import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWeatherIcon } from './weatherIcon.js';

const hour = (weatherCode, start = '2026-10-18T03:00:00Z') => ({ weatherCode, start });
test('paper weather icons distinguish provider rain, storm, fog and cloud codes', () => {
  for (const code of [1192, 1195, 1243, 1246]) assert.equal(resolveWeatherIcon(hour(code)), 'heavy-rain');
  for (const code of [1063, 1150, 1183, 1189, 1240]) assert.equal(resolveWeatherIcon(hour(code)), 'rain');
  for (const code of [1087, 1273, 1276]) assert.equal(resolveWeatherIcon(hour(code)), 'storm');
  assert.equal(resolveWeatherIcon(hour(1030)), 'fog');
  assert.equal(resolveWeatherIcon(hour(1009)), 'cloudy');
});
test('day/night uses forecast hour in Vietnam, including the two clock boundaries', () => {
  assert.equal(resolveWeatherIcon(hour(1000, '2026-10-17T22:00:00Z')), 'night');
  assert.equal(resolveWeatherIcon(hour(1000, '2026-10-17T23:00:00Z')), 'sunny');
  assert.equal(resolveWeatherIcon(hour(1003, '2026-10-18T10:00:00Z')), 'partly-cloudy');
  assert.equal(resolveWeatherIcon(hour(1003, '2026-10-18T11:00:00Z')), 'cloudy-night');
});
test('missing, unsupported and invalid forecast data never invents a sunny/rain state', () => {
  for (const value of [null, {}, hour(null), hour(9999), hour(1213), hour(1279), hour(1000, 'bad-date')]) {
    assert.equal(resolveWeatherIcon(value), null);
  }
});
