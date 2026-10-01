// Stale-while-revalidate cache for the dashboard's Supabase snapshot.
//
// Why: every F5 used to refetch ~125k rows through ~150–200 paginated REST calls
// (10–15s, and a single slow page fails the whole load). The last successful
// snapshot is now kept in IndexedDB (localStorage is far too small) so a reload
// can show yesterday's/this morning's numbers immediately while the real sync
// runs quietly in the background (see handleSyncLiveSheet in App.jsx).
//
// Layout: one object store, two records written in one transaction —
//   'meta' (tiny; lets App decide "cache or splash?" in a few ms)
//   'data' (the raw rows exactly as fetchSupabaseSheetSync returned them).
//
// Every function here is best-effort: IndexedDB can be unavailable (private
// windows, quota, old browsers) and the cache must never break the app, so
// failures resolve to null/false instead of throwing.

// Bump when the stored row shape changes in a way old rows can't be rendered with.
export const SYNC_CACHE_VERSION = 1;
// Older than this and the numbers are no use as a placeholder; show the splash.
export const SYNC_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const DB_NAME = 'kas-sync-cache';
const STORE = 'snapshots';
const META_KEY = 'meta';
const DATA_KEY = 'data';
// Tolerate small client clock drift, but not a snapshot "from the future".
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

export function buildSyncMeta(email, payload, now = Date.now()) {
  return {
    version: SYNC_CACHE_VERSION,
    email: normaliseEmail(email),
    savedAt: now,
    updatedAt: payload?.updatedAt || null,
    counts: {
      pick: payload?.pickData?.length || 0,
      deli: payload?.deliData?.length || 0,
      ca1: payload?.ca1Data?.length || 0,
      leadtime: payload?.leadtimeData?.length || 0,
      fd: payload?.fdData?.length || 0
    }
  };
}

export function isSyncMetaUsable(meta, { email, now = Date.now() } = {}) {
  if (!meta || meta.version !== SYNC_CACHE_VERSION) return false;
  if (!meta.email || meta.email !== normaliseEmail(email)) return false;
  if (!Number.isFinite(meta.savedAt)) return false;
  const age = now - meta.savedAt;
  if (age > SYNC_CACHE_MAX_AGE_MS || age < -CLOCK_SKEW_MS) return false;
  // The app refuses to render without Pick + Deli, so such a snapshot is useless.
  return (meta.counts?.pick || 0) > 0 && (meta.counts?.deli || 0) > 0;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('NO_INDEXEDDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IDB_BLOCKED'));
  });
}

const settle = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function withStore(mode, run) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IDB_ABORTED'));
    });
    const result = await run(tx.objectStore(STORE));
    await done;
    return result;
  } finally {
    db.close();
  }
}

/** Fast check (reads only the tiny meta record). Returns the meta when usable, else null. */
export async function probeSyncSnapshot(email) {
  try {
    const meta = await withStore('readonly', (store) => settle(store.get(META_KEY)));
    return isSyncMetaUsable(meta, { email }) ? meta : null;
  } catch {
    return null;
  }
}

/** Loads the full snapshot, shaped like a successful fetchSupabaseSheetSync() result. */
export async function loadSyncSnapshot(email) {
  try {
    return await withStore('readonly', async (store) => {
      const [meta, data] = await Promise.all([settle(store.get(META_KEY)), settle(store.get(DATA_KEY))]);
      if (!isSyncMetaUsable(meta, { email }) || !data?.pickData?.length || !data?.deliData?.length) return null;
      return { success: true, ...data, savedAt: meta.savedAt };
    });
  } catch {
    return null;
  }
}

export async function saveSyncSnapshot(email, payload) {
  try {
    const meta = buildSyncMeta(email, payload);
    if (!isSyncMetaUsable(meta, { email })) return false;
    const data = {
      pickData: payload.pickData,
      deliData: payload.deliData,
      ca1Data: payload.ca1Data || null,
      leadtimeData: payload.leadtimeData || null,
      fdData: payload.fdData || null,
      updatedAt: payload.updatedAt || null
    };
    await withStore('readwrite', (store) => {
      store.put(data, DATA_KEY);
      store.put(meta, META_KEY);
    });
    return true;
  } catch {
    return false;
  }
}

/** Called on logout / "clear session data" so numbers never outlive their owner's session. */
export async function clearSyncSnapshot() {
  try {
    await withStore('readwrite', (store) => {
      store.clear();
    });
    return true;
  } catch {
    return false;
  }
}
