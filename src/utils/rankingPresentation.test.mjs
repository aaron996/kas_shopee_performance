import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRankingLandscape, releaseRankingLandscape } from './rankingPresentation.js';

function browserApi() {
  const calls = [];
  const documentApi = { fullscreenElement: null, async exitFullscreen() { calls.push('exit'); this.fullscreenElement = null; } };
  const element = { async requestFullscreen() { calls.push('fullscreen'); documentApi.fullscreenElement = element; } };
  const orientation = { async lock(value) { calls.push(value); }, unlock() { calls.push('unlock'); } };
  return { calls, documentApi, element, orientation };
}

test('landscape waits for fullscreen before locking, and releases both on exit', async () => {
  const { calls, documentApi, element, orientation } = browserApi();
  assert.equal(await requestRankingLandscape(element, documentApi, orientation), 'native');
  assert.deepEqual(calls, ['fullscreen', 'landscape']);
  await releaseRankingLandscape(element, documentApi, orientation);
  assert.deepEqual(calls, ['fullscreen', 'landscape', 'unlock', 'exit']);
});

test('unsupported orientation uses CSS without requesting unnecessary fullscreen', async () => {
  const { calls, documentApi, element } = browserApi();
  assert.equal(await requestRankingLandscape(element, documentApi, {}), 'fallback');
  assert.deepEqual(calls, []);
});

test('unsupported fullscreen and rejected fullscreen both allow CSS rotation', async () => {
  const { documentApi, orientation } = browserApi();
  assert.equal(await requestRankingLandscape({}, documentApi, orientation), 'fallback');
  assert.equal(await requestRankingLandscape({ async requestFullscreen() { throw Error('denied'); } }, documentApi, orientation), 'fallback');
});

test('orientation rejection exits fullscreen so CSS rotation is not suppressed', async () => {
  const { documentApi, element } = browserApi();
  assert.equal(await requestRankingLandscape(element, documentApi, { async lock() { throw Error('unsupported'); } }), 'fallback');
  assert.equal(documentApi.fullscreenElement, null);
});

test('cleanup never exits fullscreen belonging to another element', async () => {
  const { calls, documentApi, element, orientation } = browserApi();
  documentApi.fullscreenElement = {};
  await releaseRankingLandscape(element, documentApi, orientation);
  assert.ok(!calls.includes('exit'));
});

test('leaving while fullscreen is pending cancels the lock and releases acquired fullscreen', async () => {
  const { calls, documentApi, element, orientation } = browserApi();
  assert.equal(await requestRankingLandscape(element, documentApi, orientation, () => false), 'cancelled');
  assert.deepEqual(calls, ['fullscreen', 'unlock', 'exit']);
  assert.equal(documentApi.fullscreenElement, null);
});

test('leaving while orientation lock settles releases it even when it rejects', async () => {
  const { calls, documentApi, element, orientation } = browserApi();
  let current = true;
  orientation.lock = async () => { current = false; throw Error('cancelled'); };
  assert.equal(await requestRankingLandscape(element, documentApi, orientation, () => current), 'cancelled');
  assert.equal(documentApi.fullscreenElement, null);
  assert.deepEqual(calls, ['fullscreen', 'unlock', 'exit']);
});
