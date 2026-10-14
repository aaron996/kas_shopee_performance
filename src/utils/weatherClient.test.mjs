import test from 'node:test';
import assert from 'node:assert/strict';
import { requestWeatherPosition, observeWeatherPermission } from './weatherClient.js';

test('geolocation is one explicit request with bounded age and timeout', async () => {
  let calls = 0;
  const result = await requestWeatherPosition({ geolocation: { getCurrentPosition(resolve, _reject, options) {
    calls++; assert.deepEqual(options, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }); resolve({ timestamp: 123 });
  } } });
  assert.equal(calls, 1); assert.equal(result.timestamp, 123);
  await assert.rejects(requestWeatherPosition({}), { code: 'unsupported' });
});
test('permission revocation is observed without reading a location and listener is removed on cleanup', async () => {
  let listener, removed = false, revoked = 0;
  const status = { state: 'granted', addEventListener(_event, fn) { listener = fn; }, removeEventListener(_event, fn) { removed = fn === listener; } };
  const stop = observeWeatherPermission(() => { revoked++; }, { permissions: { query: async () => status } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(revoked, 0); status.state = 'denied'; listener(); assert.equal(revoked, 1);
  stop(); assert.equal(removed, true); listener(); assert.equal(revoked, 1);
});
test('unsupported permission query and disposed pending observer are harmless', async () => {
  let revoked = 0;
  observeWeatherPermission(() => { revoked++; }, { permissions: { query: async () => { throw Error(); } } })();
  observeWeatherPermission(() => { revoked++; }, { permissions: { query: async () => ({ state: 'denied' }) } })();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(revoked, 0);
});
