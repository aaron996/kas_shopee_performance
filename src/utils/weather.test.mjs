import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherLocationsInScope, unmappedWeatherRegions, WEATHER_LOCATIONS } from '../data/weatherLocations.js';
import { distanceKm, suggestWeatherPoint, readWeatherPreference, writeWeatherPreference, clearWeatherPreference, WEATHER_PREFERENCE_KEY, weatherHours, weatherLabel } from './weather.js';

test('weather scope is independent of KPI rows and never treats an unknown region as all', () => {
  assert.deepEqual(weatherLocationsInScope([]), []);
  assert.deepEqual(weatherLocationsInScope(['NTB']), []);
  assert.deepEqual(weatherLocationsInScope(['HCM', 'HCM - KA']).map(l => l.id), ['hcm-city']);
  assert.deepEqual(weatherLocationsInScope(['HNO - CK']).map(l => l.id), ['hanoi-city']);
  assert.deepEqual(unmappedWeatherRegions(['HNO', 'GXT - Bắc', 'NTB']), ['GXT - Bắc', 'NTB']);
});
test('position suggestion rejects stale/invalid/ambiguous coordinates and returns only public point id', () => {
  const now = Date.now();
  const position = { coords: { latitude: 10.82302, longitude: 106.62965, accuracy: 50 }, timestamp: now };
  assert.equal(distanceKm(position.coords, WEATHER_LOCATIONS[0]), 0);
  const result = suggestWeatherPoint(position, WEATHER_LOCATIONS, now);
  assert.equal(result.locationId, 'hcm-city');
  assert.equal(result.kind, 'suggested');
  assert.equal(Object.hasOwn(result, 'latitude'), false);
  for (const bad of [null, { ...position, timestamp: now - 301000 }, { ...position, timestamp: now + 61000 },
    { ...position, coords: { ...position.coords, latitude: NaN } }]) assert.equal(suggestWeatherPoint(bad, WEATHER_LOCATIONS, now).kind, 'unavailable');
  assert.equal(suggestWeatherPoint({ ...position, coords: { ...position.coords, accuracy: 1000000 } }, WEATHER_LOCATIONS, now).kind, 'inaccurate');
});
test('stored preference whitelists ids and never contains raw GPS', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_k, v) => { saved = v; }, removeItem: () => { saved = null; } };
  writeWeatherPreference(storage, { selectedId: 'hcm-city', source: 'nearby', pinnedIds: ['hcm-city'], latitude: 10, longitude: 100 });
  assert.equal(saved.includes('latitude'), false);
  assert.deepEqual(readWeatherPreference(storage), { selectedId: 'hcm-city', source: 'nearby', dismissed: false, pinnedIds: ['hcm-city'] });
  saved = JSON.stringify({ selectedId: 'unknown', pinnedIds: ['unknown', 'hanoi-city', 'hanoi-city'] });
  assert.equal(readWeatherPreference(storage).selectedId, null);
  assert.deepEqual(readWeatherPreference(storage).pinnedIds, ['hanoi-city']);
  clearWeatherPreference(storage); assert.equal(saved, null);
  assert.equal(readWeatherPreference({ getItem: () => { throw Error(); } }).selectedId, null);
  assert.equal(WEATHER_PREFERENCE_KEY, 'ghn_weather_preference_v1');
});
test('forecast hours are future intervals and labels use Vietnam timezone across midnight', () => {
  const hours = [{ start: '2026-10-14T15:00:00Z', end: '2026-10-14T16:00:00Z' }, { start: '2026-10-14T16:00:00Z', end: '2026-10-14T17:00:00Z' }];
  assert.equal(weatherHours({ hourly: hours, fetchedAt: '2026-10-14T15:00:00Z' }, 12, Date.parse('2026-10-14T16:00:00Z')).length, 1);
  assert.match(weatherLabel('2026-10-14T17:00:00Z', { day: '2-digit', month: '2-digit' }), /15[/-]10/);
});
test('location preference belongs to one account even before parent sign-out effects run', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_k, v) => { saved = v; } };
  writeWeatherPreference(storage, { selectedId: 'hcm-city', source: 'nearby' }, 'account-a');
  assert.equal(readWeatherPreference(storage, 'account-a').selectedId, 'hcm-city');
  assert.equal(readWeatherPreference(storage, 'account-b').selectedId, null);
});
test('suggestion refuses a distant pilot point even with accurate GPS', () => {
  const now = Date.now();
  assert.equal(suggestWeatherPoint({ coords: { latitude: 16.06778, longitude: 108.22083, accuracy: 30 }, timestamp: now }, WEATHER_LOCATIONS, now).kind, 'outside-pilot');
  const hcm = WEATHER_LOCATIONS[0];
  assert.equal(suggestWeatherPoint({ coords: { ...hcm, accuracy: 5001 }, timestamp: now }, WEATHER_LOCATIONS, now).kind, 'inaccurate');
});
test('forecast expires in the UI after two hours even when future intervals remain', () => {
  const now = Date.now();
  const forecast = { fetchedAt: new Date(now - 2 * 3600000).toISOString(), hourly: [{ start: new Date(now).toISOString(), end: new Date(now + 3600000).toISOString() }] };
  assert.deepEqual(weatherHours(forecast, 12, now), []);
  const receivedAfterMount = { ...forecast, fetchedAt: new Date(now + 200).toISOString() };
  assert.equal(weatherHours(receivedAfterMount, 12, now).length, 1);
  assert.deepEqual(weatherHours({ ...forecast, fetchedAt: new Date(now + 61000).toISOString() }, 12, now), []);
});
