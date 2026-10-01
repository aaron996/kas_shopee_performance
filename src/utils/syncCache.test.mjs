import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SYNC_CACHE_MAX_AGE_MS,
  SYNC_CACHE_VERSION,
  buildSyncMeta,
  isSyncMetaUsable,
  probeSyncSnapshot,
  loadSyncSnapshot,
  saveSyncSnapshot,
  clearSyncSnapshot
} from './syncCache.js';

const payload = { pickData: [{ a: 1 }], deliData: [{ b: 2 }], ca1Data: null, leadtimeData: [{ c: 3 }], fdData: null, updatedAt: '2026-10-01T08:30:00Z' };
const NOW = Date.parse('2026-10-01T12:00:00Z');
const meta = (over = {}) => ({ ...buildSyncMeta('Vinhlt@GHN.vn', payload, NOW - 60_000), ...over });

test('a fresh snapshot for the same user is usable (email is case-insensitive)', () => {
  assert.equal(isSyncMetaUsable(meta(), { email: 'vinhlt@ghn.vn', now: NOW }), true);
});

test('rejects other users, old schema versions, stale and future snapshots', () => {
  const opts = { email: 'vinhlt@ghn.vn', now: NOW };
  assert.equal(isSyncMetaUsable(meta(), { ...opts, email: 'someone@ghn.vn' }), false);
  assert.equal(isSyncMetaUsable(meta({ version: SYNC_CACHE_VERSION + 1 }), opts), false);
  assert.equal(isSyncMetaUsable(meta({ savedAt: NOW - SYNC_CACHE_MAX_AGE_MS - 1 }), opts), false);
  assert.equal(isSyncMetaUsable(meta({ savedAt: NOW + 3_600_000 }), opts), false);
  assert.equal(isSyncMetaUsable(null, opts), false);
});

test('a snapshot without Pick and Deli rows is not usable', () => {
  const empty = buildSyncMeta('vinhlt@ghn.vn', { ...payload, pickData: [] }, NOW - 1000);
  assert.equal(isSyncMetaUsable(empty, { email: 'vinhlt@ghn.vn', now: NOW }), false);
});

test('without IndexedDB (node, private windows) every call degrades quietly', async () => {
  assert.equal(await probeSyncSnapshot('a@ghn.vn'), null);
  assert.equal(await loadSyncSnapshot('a@ghn.vn'), null);
  assert.equal(await saveSyncSnapshot('a@ghn.vn', payload), false);
  assert.equal(await clearSyncSnapshot(), false);
});

test('App restores the cache without overwriting live data, and clears it on logout/reset', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
  assert.match(app, /if \(liveSyncDoneRef\.current\) return;\s*\n\s*applySupabaseRows\(snapshot, 'Bộ nhớ đệm'\)/);
  assert.match(app, /liveSyncDoneRef\.current = true;/);
  assert.match(app, /await clearSyncSnapshot\(\);\s*\n\s*await supabase\.auth\.signOut\(\)/);
  assert.match(app, /void clearSyncSnapshot\(\);/);
  assert.match(app, /cacheState === 'miss' && <BrandSplash/, 'splash must never flash when a cache hit is pending');
});
