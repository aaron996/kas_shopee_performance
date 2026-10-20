import test from 'node:test';
import assert from 'node:assert/strict';
import { callDashboardRpc } from './db.js';
import { toPublicError } from './errors.js';

test('database timeout is actionable without leaking database details', async () => {
  const error = { code: '57014', message: 'secret SQL statement' };
  await assert.rejects(callDashboardRpc({ rpc: async () => ({ error }) }, 'get_ai_chat_metric', { p_client: 'SPE' }), e => {
    assert.equal(e.cause, error);
    assert.equal(e.code, 'CHAT_DATA_TIMEOUT');
    assert.equal(toPublicError(e).status, 503);
    assert.doesNotMatch(toPublicError(e).message, /secret/);
    return true;
  });
});

test('other database failures keep their public error', async () => {
  await assert.rejects(callDashboardRpc({ rpc: async () => ({ error: { code: '42501' } }) }, 'get_ai_chat_metric', { p_client: 'SPE' }), { code: 'CHAT_DATA_UNAVAILABLE' });
});
