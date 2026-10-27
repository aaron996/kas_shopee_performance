// Best-effort persisted cache for MTD sums (v1 held full daily detail rows).
export const OVERVIEW_MTD_CACHE_VERSION = 2;
export const OVERVIEW_MTD_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const DB_NAME = 'kas-overview-mtd-cache';
const STORE = 'datasets';

export function buildOverviewMtdCacheKey(dataset, from, to, scope) {
  return JSON.stringify([String(scope || '').trim().toLowerCase(), dataset, from, to]);
}

export function isOverviewMtdCacheFresh(record, now = Date.now()) {
  if (!record || record.version !== OVERVIEW_MTD_CACHE_VERSION || !Array.isArray(record.rows)) return false;
  if (!Number.isFinite(record.savedAt)) return false;
  const age = now - record.savedAt;
  return age >= 0 && age <= OVERVIEW_MTD_CACHE_MAX_AGE_MS;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('NO_INDEXEDDB'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IDB_BLOCKED'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
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

export async function loadOverviewMtdCache(key, now = Date.now()) {
  try {
    const record = await withStore('readonly', store => requestResult(store.get(key)));
    return isOverviewMtdCacheFresh(record, now) ? record.rows : null;
  } catch {
    return null;
  }
}

export async function saveOverviewMtdCache(key, rows, savedAt = Date.now()) {
  if (!Array.isArray(rows)) return false;
  try {
    await withStore('readwrite', async store => {
      const keys = await requestResult(store.getAllKeys());
      // Keep at most the latest range per owner/dataset; old months do not accumulate.
      const [owner, dataset] = JSON.parse(key);
      for (const existing of keys) {
        const [oldOwner, oldDataset] = JSON.parse(existing);
        if (oldOwner === owner && oldDataset === dataset && existing !== key) store.delete(existing);
      }
      store.put({ version: OVERVIEW_MTD_CACHE_VERSION, savedAt, rows }, key);
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearOverviewMtdCache() {
  try {
    await withStore('readwrite', store => { store.clear(); });
    return true;
  } catch {
    return false;
  }
}
