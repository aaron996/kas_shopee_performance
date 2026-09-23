import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCodSmsThresholdHandler, validateThreshold } from './cod-sms-threshold.js';

function response() {
  return {
    headers: {}, statusCode: 0, headersSent: false, writableEnded: false,
    setHeader(key, value) { this.headers[key] = value; },
    end(text) { this.body = JSON.parse(text); this.writableEnded = true; }
  };
}

function createHarness(isDev = false) {
  let threshold = 1;
  let writes = 0;
  const row = () => ({ threshold, updated_at: '2026-09-23T00:00:00Z', updated_by: 'dev-user-id' });
  const serviceClient = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: row(), error: null }) }) }) }) };
  const userClient = { rpc: async (name, args) => {
    assert.equal(name, 'set_cod_sms_escalation_threshold');
    if (!isDev) return { error: { code: '42501' } };
    writes++;
    threshold = args.p_threshold;
    return { data: row(), error: null };
  } };
  const handler = createCodSmsThresholdHandler({
    readConfig: () => ({}),
    authenticate: async () => ({ userClient, serviceClient }),
    authorizeDev: async () => isDev
  });
  const call = async (method, value) => {
    const req = { method, headers: { authorization: 'Bearer token' }, body: value === undefined ? undefined : { threshold: value } };
    const res = response();
    await handler(req, res);
    return res;
  };
  return { call, getWrites: () => writes };
}

test('1 and 9 are accepted; outside range, decimal and nonnumber are rejected', async () => {
  for (const value of [1, 9]) assert.equal(validateThreshold(value), value);
  for (const value of [0, 10, -1, 1.5, '5', null]) {
    assert.throws(() => validateThreshold(value), { status: 400 });
  }
  const dev = createHarness(true);
  for (const value of [0, 10, 1.5]) assert.equal((await dev.call('POST', value)).statusCode, 400);
  assert.equal(dev.getWrites(), 0);
});

test('ordinary user reads effective value only and forged write is denied', async () => {
  const user = createHarness(false);
  assert.deepEqual((await user.call('GET')).body, { threshold: 1 });
  const denied = await user.call('POST', 9);
  assert.equal(denied.statusCode, 403);
  assert.equal(user.getWrites(), 0);
});

test('Dev saves and reads the same persisted value; reset returns to 1', async () => {
  const dev = createHarness(true);
  assert.equal((await dev.call('POST', 9)).body.threshold, 9);
  assert.equal((await dev.call('GET')).body.threshold, 9);
  assert.equal((await dev.call('POST', 1)).body.threshold, 1);
  assert.equal((await dev.call('GET')).body.threshold, 1);
  assert.equal(dev.getWrites(), 2);
});

test('migration locks table writes and audits the database-derived actor', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260923010000_cod_sms_escalation_threshold.sql', import.meta.url), 'utf8');
  assert.match(migration, /check \(threshold between 1 and 9\)/i);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all on public\.cod_sms_escalation_config, public\.cod_sms_escalation_config_audit from public, anon, authenticated/i);
  assert.match(migration, /auth\.uid\(\) is null or not public\.is_dev_admin\(\)/i);
  assert.match(migration, /insert into public\.cod_sms_escalation_config_audit/i);
  assert.match(migration, /p_threshold <> trunc\(p_threshold\)/i);
  assert.match(migration, /grant execute on function public\.set_cod_sms_escalation_threshold\(numeric\) to authenticated/i);
  assert.doesNotMatch(migration, /update public\.cod_suspicion_sms_assessments/i);
});
