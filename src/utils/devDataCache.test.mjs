import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevDataClient } from './devDataCache.js';

function fixture() {
  let session = { access_token: 'test-token', user: { email: 'dev@ghn.vn' } };
  let fail = false;
  const requests = [];
  const auth = { getSession: async () => ({ data: { session } }) };
  const client = createDevDataClient({ auth, fetchImpl: async (url, options) => {
    requests.push({ url, method: options.method || 'GET', headers: options.headers });
    return new Response(JSON.stringify(fail ? { error: { message: 'failed probe' } } : { version: requests.length }), {
      status: fail ? 500 : 200, headers: { 'Content-Type': 'application/json' }
    });
  } });
  const user = { email: 'dev@ghn.vn', role: 'dev', isDevAdmin: true };
  return { client, user, requests, setSession: value => { session = value; }, setFail: value => { fail = value; } };
}

test('reopening a Dev view reuses its result; refresh and different query parameters fetch again', async () => {
  const { client, user, requests } = fixture();
  const url = '/api/ai-ops?view=model-config&feature=chat';
  await client.fetchDevApi(user, url);
  assert.equal(client.peekDevResource(user, url).version, 1);
  await client.fetchDevApi(user, url);
  assert.equal(requests.length, 1);
  await client.fetchDevApi(user, url, { forceRefresh: true });
  await client.fetchDevApi(user, url.replace('feature=chat', 'feature=cod_sms'));
  assert.equal(requests.length, 3);
  assert.equal(requests[0].headers.Authorization, 'Bearer test-token');
});

test('cached reads still check the session; sign-out and identity/role changes cannot reuse data', async () => {
  const { client, user, setSession, requests } = fixture();
  await client.fetchDevApi(user, '/api/ai-ops');
  assert.equal(client.peekDevResource({ ...user, role: 'admin' }, '/api/ai-ops'), undefined);
  assert.equal(client.peekDevResource({ ...user, isDevAdmin: false }, '/api/ai-ops'), undefined);
  setSession(null);
  await assert.rejects(client.fetchDevApi(user, '/api/ai-ops'), /hết hạn/);
  setSession({ access_token: 'other', user: { email: 'other@ghn.vn' } });
  await assert.rejects(client.fetchDevApi(user, '/api/ai-ops'), /hết hạn/);
  await client.fetchDevApi({ ...user, email: 'other@ghn.vn' }, '/api/ai-ops');
  assert.equal(requests.length, 2);
  client.clearDevDataCache();
  assert.equal(client.peekDevResource(user, '/api/ai-ops'), undefined);
});

test('successful mutations invalidate all Dev resources before the next read', async () => {
  const { client, user, requests } = fixture();
  await client.fetchDevApi(user, '/api/ai-ops?view=model-config');
  await client.readDevResource(user, 'roles:all', async () => ['role']);
  await client.fetchDevApi(user, '/api/ai-ops', { method: 'POST', body: '{}' });
  assert.equal(client.peekDevResource(user, 'roles:all'), undefined);
  await client.fetchDevApi(user, '/api/ai-ops?view=model-config');
  assert.equal(requests.length, 3);
});

test('failed mutations invalidate persisted probe state; failed GET requests are never cached', async () => {
  const { client, user, requests, setFail } = fixture();
  await client.fetchDevApi(user, '/api/ai-ops?view=model-registry');
  setFail(true);
  await assert.rejects(client.fetchDevApi(user, '/api/ai-ops', { method: 'POST', body: '{}' }), /failed probe/);
  assert.equal(client.peekDevResource(user, '/api/ai-ops?view=model-registry'), undefined);
  await assert.rejects(client.fetchDevApi(user, '/api/ai-ops?view=model-registry'));
  setFail(false);
  await client.fetchDevApi(user, '/api/ai-ops?view=model-registry');
  assert.equal(requests.length, 4);
});

test('direct RPC resources share pending reads and explicit reload runs their loader again', async () => {
  const { client, user } = fixture();
  let calls = 0;
  const loader = async () => { calls++; return { users: [], total: 0 }; };
  await Promise.all([client.readDevResource(user, 'roles:all', loader), client.readDevResource(user, 'roles:all', loader)]);
  assert.equal(calls, 1);
  await client.readDevResource(user, 'roles:all', loader, { forceRefresh: true });
  assert.equal(calls, 2);
});
