import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForecast, fetchProviderForecast, readWeatherConfig, createForecastLoader, createRestWeatherCache } from './forecast.js';
import { WEATHER_LOCATIONS } from '../../src/data/weatherLocations.js';
const location = WEATHER_LOCATIONS[0];
const now = Date.parse('2026-10-14T16:30:00Z');
const raw = () => ({ current: { last_updated_epoch: now / 1000, temp_c: 29 }, forecast: { forecastday: [{ hour: [
  { time_epoch: Date.parse('2026-10-14T16:00:00Z') / 1000, precip_mm: 0, chance_of_rain: '0', temp_c: 29, wind_kph: 4, condition: { code: 1000 } },
  { time_epoch: Date.parse('2026-10-14T17:00:00Z') / 1000, precip_mm: null, chance_of_rain: null, temp_c: null }
] }] } });
test('WeatherAPI normalizer uses hour timestamp as start, preserves null vs zero and actual code namespace', () => {
  const dto = normalizeForecast(raw(), location, now);
  assert.equal(dto.provider, 'WeatherAPI.com');
  assert.equal(dto.hourly[0].start, '2026-10-14T16:00:00.000Z');
  assert.equal(dto.hourly[0].end, '2026-10-14T17:00:00.000Z');
  assert.equal(dto.hourly[0].precipitationMm, 0); assert.equal(dto.hourly[0].precipitationProbabilityPct, 0);
  assert.equal(dto.hourly[0].weatherCode, 1000); assert.equal(dto.hourly[1].precipitationMm, null);
  assert.equal(dto.hourly[1].precipitationProbabilityPct, null);
  assert.throws(() => normalizeForecast({}, location, now));
  const bad = raw(); bad.forecast.forecastday[0].hour[0].time_epoch = null;
  assert.throws(() => normalizeForecast(bad, location, now));
});
test('provider uses HTTPS fixed endpoint, key stays server side, translates quota/config errors', async () => {
  let called;
  const result = await fetchProviderForecast(location, { apiKey: 'test-secret' }, { now: () => now, fetchImpl: async url => {
    called = url; return { ok: true, json: async () => raw() };
  } });
  assert.equal(called.origin, 'https://api.weatherapi.com'); assert.equal(called.pathname, '/v1/forecast.json');
  assert.equal(called.searchParams.get('days'), '2'); assert.equal(called.searchParams.get('q'), '10.82302,106.62965');
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
  await assert.rejects(fetchProviderForecast(location, {}), { code: 'WEATHER_CONFIG_MISSING' });
  for (const [code, expected] of [[2007, 'WEATHER_QUOTA'], [2006, 'WEATHER_CONFIG_MISSING']]) {
    await assert.rejects(fetchProviderForecast(location, { apiKey: 'test-secret' }, { fetchImpl: async () => ({ ok: false, json: async () => ({ error: { code, message: 'test-secret' } }) }) }), { code: expected });
  }
});
test('cache deduplicates in-flight requests, refreshes after 30 min and only serves stale for 2 hours', async () => {
  let clock = now, calls = 0, failing = false;
  const loader = createForecastLoader({ now: () => clock, fetchForecast: async () => { calls++; if (failing) throw Error(); return { ...normalizeForecast(raw(), location, now), fetchedAt: new Date(clock).toISOString(), hourly: [{ start: new Date(clock).toISOString(), end: new Date(clock + 24 * 3600000).toISOString() }] }; } });
  await Promise.all([loader(location, {}), loader(location, {})]); assert.equal(calls, 1);
  await loader(location, {}); assert.equal(calls, 1);
  clock += 31 * 60000; failing = true;
  assert.equal((await loader(location, {})).stale, true);
  clock = now + 121 * 60000; await assert.rejects(loader(location, {}));
});
test('shared cache lock contention never causes extra provider calls', async () => {
  let calls = 0;
  const load = createForecastLoader({ fetchForecast: async () => { calls++; }, now: () => now });
  await assert.rejects(load(location, {}, { get: async () => null, lock: async () => null }), { code: 'WEATHER_BUSY' });
  assert.equal(calls, 0);
});
test('Redis REST adapter sets expiry and lock and configuration reads only WEATHERAPI_KEY', async () => {
  const commands = [];
  const cache = createRestWeatherCache({ cacheUrl: 'https://example.upstash.io', cacheToken: 'secret' }, async (_url, init) => {
    commands.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ result: 'OK' }) };
  });
  await cache.set('key', {}); await cache.lock('key');
  assert.deepEqual(commands[0], ['SET', 'key', '{}', 'EX', '7200']);
  assert.deepEqual(commands[1], ['SET', 'key:lock', '1', 'NX', 'EX', '12']);
  assert.equal(readWeatherConfig({ WEATHERAPI_KEY: ' x ', OPEN_METEO_API_KEY: 'old' }).apiKey, 'x');
  assert.equal(readWeatherConfig({ WEATHER_ALLOW_PUBLIC_API: 'true' }).apiKey, undefined);
});
