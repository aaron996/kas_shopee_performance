import assert from 'node:assert/strict';
import test from 'node:test';
import { checkEmailAllowed, isGhnEmail } from './authPolicy.js';

const clientReturning = (result, calls = []) => ({
  rpc: async (name, params) => { calls.push({ name, params }); return result; }
});

test('ghn.vn addresses are allowed without a database lookup', async () => {
  const calls = [];
  assert.equal(isGhnEmail(' Person@GHN.vn '), true);
  assert.equal(await checkEmailAllowed('Person@ghn.vn', clientReturning({ data: false, error: null }, calls)), true);
  assert.equal(calls.length, 0);
});

test('other addresses are allowed only when the database allowlist says so', async () => {
  const calls = [];
  assert.equal(await checkEmailAllowed(' Khac@Gmail.com ', clientReturning({ data: true, error: null }, calls)), true);
  assert.deepEqual(calls, [{ name: 'is_email_allowed', params: { p_email: 'khac@gmail.com' } }]);
  assert.equal(await checkEmailAllowed('x@gmail.com', clientReturning({ data: false, error: null })), false);
});

test('allowlist check fails closed on errors, bad input and missing client', async () => {
  assert.equal(await checkEmailAllowed('x@gmail.com', clientReturning({ data: true, error: { message: 'boom' } })), false);
  assert.equal(await checkEmailAllowed('x@gmail.com', { rpc: async () => { throw new Error('network'); } }), false);
  assert.equal(await checkEmailAllowed('x@gmail.com', null), false);
  assert.equal(await checkEmailAllowed('', clientReturning({ data: true, error: null })), false);
  assert.equal(await checkEmailAllowed(undefined, clientReturning({ data: true, error: null })), false);
});
