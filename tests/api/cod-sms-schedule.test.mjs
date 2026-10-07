import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodSmsScheduleHandler, validateSchedule } from '../../api/cod-sms-schedule.js';
import { readDispatchId } from '../../server/cod-sms/schedule.js';

const response = () => ({ statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } });
test('schedule API denies non-Dev reads and writes before accessing schedule RPCs', async () => {
  let calls = 0;
  const handler = createCodSmsScheduleHandler({ readConfig: () => ({}),
    authenticate: async () => ({ userClient: { rpc: () => { calls++; } } }), authorizeDev: async () => false });
  for (const method of ['GET', 'POST']) {
    const res = response(); await handler({ method, headers: {}, body: { time: '09:00', enabled: true } }, res);
    assert.equal(res.statusCode, 403); assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  assert.equal(calls, 0);
});
test('schedule API validates input and returns committed schedule including history', async () => {
  let stored = { time: '09:00', enabled: false, ready: true, history: [] };
  const handler = createCodSmsScheduleHandler({ readConfig: () => ({}), authorizeDev: async () => true,
    authenticate: async () => ({ userClient: { rpc: async (name, args) => {
      if (name === 'set_cod_sms_schedule') stored = { ...stored, time: args.p_time, enabled: args.p_enabled };
      return { data: stored };
    } } }) });
  for (const time of ['00:00', '23:59', '09:00']) assert.equal(validateSchedule({ time, enabled: true }).time, time);
  for (const body of [{ time: '24:00', enabled: true }, { time: '9:00', enabled: true }, { time: '09:00', enabled: 'true' }, { time: '09:00', enabled: true, endpoint: 'https://attacker' }]) {
    const res = response(); await handler({ method: 'POST', headers: {}, body }, res); assert.equal(res.statusCode, 400);
  }
  const res = response(); await handler({ method: 'POST', headers: {}, body: JSON.stringify({ time: '05:30', enabled: true }) }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.time, '05:30'); assert.equal(res.body.enabled, true);
});
test('schedule API makes missing backend and malformed JSON actionable', async () => {
  const handler = createCodSmsScheduleHandler({ readConfig: () => ({}), authorizeDev: async () => true,
    authenticate: async () => ({ userClient: { rpc: async () => ({ error: { code: '55000' } }) } }) });
  const invalid = response(); await handler({ method: 'POST', headers: {}, body: '{' }, invalid); assert.equal(invalid.statusCode, 400);
  const missing = response(); await handler({ method: 'POST', headers: {}, body: { enabled: true, time: '09:00' } }, missing); assert.equal(missing.statusCode, 409);
});
test('dispatch payload requires a valid UUID; old untracked cron calls cannot run', () => {
  for (const value of [undefined, {}, '{', { dispatchId: 'not-an-id' }]) assert.throws(() => readDispatchId(value), { status: 400 });
  assert.equal(readDispatchId('{"dispatchId":"00000000-0000-0000-0000-000000000001"}'), '00000000-0000-0000-0000-000000000001');
});
