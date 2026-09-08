import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateRequest, readBearerToken } from './auth.js';
import { reserveChatRequest } from './quota.js';

test('readBearerToken rejects missing credentials', () => {
  assert.throws(() => readBearerToken('Basic abc'), error => error.code === 'CHAT_UNAUTHORIZED');
  assert.equal(readBearerToken('Bearer token-123'), 'token-123');
});

test('authenticateRequest enforces the shared email policy', async () => {
  const createClients = () => ({
    userClient: { auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'person@gmail.com' } }, error: null }) } },
    serviceClient: {}
  });
  await assert.rejects(
    authenticateRequest('Bearer token', {}, { createClients }),
    error => error.code === 'CHAT_FORBIDDEN'
  );
});

test('reserveChatRequest sends quota limits through the service client RPC', async () => {
  const calls = [];
  const serviceClient = { rpc: async (name, params) => { calls.push({ name, params }); return { data: { ok: true }, error: null }; } };
  const config = {
    orgId: 'ghn-kas', requestReserveMicrousd: 25000, userDailyTurns: 60, orgDailyTurns: 600,
    userDailyMicrousd: 500000, orgDailyMicrousd: 5000000
  };
  await reserveChatRequest(serviceClient, config, { requestId: '550e8400-e29b-41d4-a716-446655440000' }, 'user-1', 'hash');
  assert.equal(calls[0].name, 'reserve_ai_chat_request');
  assert.equal(calls[0].params.p_reserved_microusd, 25000);
  assert.equal(calls[0].params.p_org_id, 'ghn-kas');
});
