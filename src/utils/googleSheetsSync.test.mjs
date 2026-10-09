import test from 'node:test';
import assert from 'node:assert/strict';
import { syncAllGoogleSheetTabs } from './googleSheetsSync.js';

test('CSV fallback starts every tab and exposes core rows before slow Ca1 completes', async context => {
  let releaseCa1;
  const ca1Gate = new Promise(resolve => { releaseCa1 = resolve; });
  let signalCore;
  const coreReady = new Promise(resolve => { signalCore = resolve; });
  const gids = [];
  context.mock.method(globalThis, 'fetch', async url => {
    const gid = new URL(url).searchParams.get('gid');
    gids.push(gid);
    if (gid === '1405399014') await ca1Gate;
    return new Response('hub,value\nHub A,10\n');
  });
  let finished = false;
  const sync = syncAllGoogleSheetTabs(undefined, { onCoreReady: signalCore }).then(result => {
    finished = true;
    return result;
  });
  const core = await coreReady;
  assert.equal(gids.length, 3);
  assert.equal(finished, false);
  assert.equal(core.pickData[0].value, 10);
  assert.equal(core.deliData[0].value, 10);
  releaseCa1();
  const result = await sync;
  assert.equal(result.success, true);
  assert.equal(result.ca1Data[0].value, 10);
});

test('CSV fallback keeps core data available when optional Ca1 fails', async context => {
  context.mock.method(globalThis, 'fetch', async url =>
    new URL(url).searchParams.get('gid') === '1405399014'
      ? new Response('', { status: 403 })
      : new Response('hub,value\nHub A,10\n'));
  const result = await syncAllGoogleSheetTabs();
  assert.equal(result.success, true);
  assert.equal(result.ca1Data, null);
});

test('CSV fallback never signals readiness when Pickup fails', async context => {
  context.mock.method(globalThis, 'fetch', async url =>
    new URL(url).searchParams.get('gid') === '1312031199'
      ? new Response('', { status: 403 })
      : new Response('hub,value\nHub A,10\n'));
  let ready = false;
  const result = await syncAllGoogleSheetTabs(undefined, { onCoreReady: () => { ready = true; } });
  assert.equal(result.success, false);
  assert.equal(ready, false);
});
