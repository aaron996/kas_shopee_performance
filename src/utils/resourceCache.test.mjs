import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceCache, withConsumerSignal } from './resourceCache.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('cache reuses reads until TTL, then refreshes; failures are retried', async () => {
  let clock = 100;
  let calls = 0;
  const cache = createResourceCache({ now: () => clock });
  const load = () => ++calls;
  assert.equal(await cache.read('a', load, { ttlMs: 10 }), 1);
  assert.equal(cache.peek('a'), 1);
  clock = 109;
  assert.equal(await cache.read('a', load), 1);
  clock = 110;
  assert.equal(cache.peek('a'), undefined);
  assert.equal(await cache.read('a', load), 2);
  await assert.rejects(cache.read('failed', () => { throw new Error('server error'); }));
  assert.equal(cache.peek('failed'), undefined);
  assert.equal(await cache.read('failed', () => 'recovered'), 'recovered');
});

test('simultaneous reads share work but keys keep filters, identity and role separate', async () => {
  const cache = createResourceCache();
  const slow = deferred();
  let calls = 0;
  const key = JSON.stringify(['dev-a', 'dev', 'chat', '7d']);
  const first = cache.read(key, () => { calls++; return slow.promise; });
  const second = cache.read(key, () => { calls++; return 'wrong'; });
  await Promise.resolve();
  assert.equal(calls, 1);
  slow.resolve('shared');
  assert.deepEqual(await Promise.all([first, second]), ['shared', 'shared']);
  for (const other of [['dev-b', 'dev', 'chat', '7d'], ['dev-a', 'user', 'chat', '7d'], ['dev-a', 'dev', 'cod', '7d'], ['dev-a', 'dev', 'chat', 'today']]) {
    assert.equal(cache.peek(JSON.stringify(other)), undefined);
  }
});

test('explicit refresh supersedes pending reads and late responses cannot overwrite it', async () => {
  const cache = createResourceCache();
  const old = deferred();
  const oldRead = cache.read('config', () => old.promise);
  assert.equal(await cache.read('config', () => 'new', { forceRefresh: true }), 'new');
  old.resolve('old');
  assert.equal(await oldRead, 'old');
  assert.equal(cache.peek('config'), 'new');
});

test('invalidation during mutation/sign-out discards pending cache writes', async () => {
  const cache = createResourceCache();
  const old = deferred();
  const oldRead = cache.read('roles', () => old.promise);
  cache.invalidate();
  old.resolve('old roles');
  await oldRead;
  assert.equal(cache.peek('roles'), undefined);
  assert.equal(await cache.read('roles', () => 'new roles'), 'new roles');
});

test('cancelling one consumer keeps shared work available for the next mounted view', async () => {
  const cache = createResourceCache();
  const work = deferred();
  const read = cache.read('logs', () => work.promise);
  const controller = new AbortController();
  const cancelled = withConsumerSignal(read, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  const reopened = cache.read('logs', () => 'wrong');
  work.resolve('complete logs');
  assert.equal(await reopened, 'complete logs');
  assert.equal(cache.peek('logs'), 'complete logs');
  await assert.rejects(withConsumerSignal(Promise.resolve('cached'), controller.signal), { name: 'AbortError' });
});

test('cache bounds stored resources and selective invalidation preserves other keys', async () => {
  const cache = createResourceCache({ maxEntries: 2 });
  for (const key of ['a', 'b', 'c']) await cache.read(key, () => key);
  assert.equal(cache.peek('a'), undefined);
  cache.invalidate(key => key === 'b');
  assert.equal(cache.peek('b'), undefined);
  assert.equal(cache.peek('c'), 'c');
});
