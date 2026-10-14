import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherHandler } from '../../server/weather/handler.js';
import { createContextHandler } from '../../api/chat-suggestions.js';
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } });
const config = { enabled: true, apiKey: 'secret', supabaseUrl: 'url', supabaseAnonKey: 'anon', supabaseServiceRoleKey: 'service' };
const req = url => ({ method: 'GET', headers: { authorization: 'Bearer token' }, url });
test('weather authentication runs before cache/provider and errors never expose key', async () => {
  let calls = 0;
  const handler = createWeatherHandler({ readConfig: () => config, authenticate: async () => { throw { status: 401 }; }, load: async () => { calls++; } });
  const res = response(); await handler(req('/api/weather?regions=HCM'), res);
  assert.equal(res.statusCode, 401); assert.equal(calls, 0); assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('empty scope skips upstream, unknown regions and out-of-scope points are rejected', async () => {
  let calls = 0;
  const handler = createWeatherHandler({ readConfig: () => config, authenticate: async () => ({}), load: async () => { calls++; } });
  for (const [url, expected] of [['/api/weather?regions=', 200], ['/api/weather?regions=HCM&locations=hanoi-city', 403], ['/api/weather?regions=unknown', 400], ['/api/weather?regions=HCM&latitude=10', 400]]) {
    const res = response(); await handler(req(url), res); assert.equal(res.statusCode, expected);
  }
  assert.equal(calls, 0);
});
test('weather serves only requested scoped points and isolates partial upstream failure', async () => {
  const ids = [];
  const handler = createWeatherHandler({ readConfig: () => config, authenticate: async () => ({}), load: async l => {
    ids.push(l.id); if (l.id === 'hanoi-city') throw Error('secret'); return { locationId: l.id };
  } });
  const res = response(); await handler(req('/api/weather?regions=HCM,HNO'), res);
  assert.equal(res.statusCode, 200); assert.deepEqual(ids, ['hcm-city', 'hanoi-city']);
  assert.equal(res.body.forecasts.length, 1); assert.equal(res.body.errors[0].locationId, 'hanoi-city');
  assert.equal(JSON.stringify(res.body).includes('secret'), false);
});
test('missing WeatherAPI key and shared production cache have a concrete configuration state', async () => {
  for (const cfg of [{ ...config, apiKey: '' }, { ...config, production: true }]) {
    const handler = createWeatherHandler({ readConfig: () => cfg, authenticate: async () => ({}) });
    const res = response(); await handler(req('/api/weather?regions=HCM'), res);
    assert.equal(res.statusCode, 503); assert.match(res.body.error.code, /CONFIG/);
  }
});
test('context router preserves suggestions and the weather alias without calling AI/quota', async () => {
  let suggestions = 0, weather = 0;
  const handler = createContextHandler({ suggestions: () => { suggestions++; }, weather: request => {
    weather++; assert.equal(request.url, '/api/weather?regions=HCM');
  } });
  handler(req('/api/weather?regions=HCM'), response());
  handler(req('/api/chat-suggestions?__weather=1&regions=HCM'), response());
  handler(req('/api/chat-suggestions?regions=HCM'), response());
  assert.equal(suggestions, 1); assert.equal(weather, 2);
});
