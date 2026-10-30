// "Dữ liệu mới" alert: tells the user the DB moved on from what they are looking
// at, without re-downloading the ~125k-row snapshot to find out.
//
// sync_kas_*_data() replaces each table wholesale (delete + insert), so the last
// row's identity id and synced_at change on every refresh. One row per table is
// enough to compare — the same boundary trick supabaseTableReader.js already uses
// to detect a mid-read replacement.

// Dataset key in the sync payload -> the table it came from.
export const FRESHNESS_TABLES = {
  pickData: 'kas_pick_data',
  deliData: 'kas_deli_data',
  fdData: 'kas_fd_data',
  ca1Data: 'kas_ca1_data',
  leadtimeData: 'kas_leadtime_data'
};

const REQUEST_TIMEOUT_MS = 8000;

function boundaryKey(row) {
  if (!row || row.id === undefined || row.id === null) return null;
  return `${row.id}|${row.synced_at ?? ''}`;
}

// The snapshot in hand is the reference point, whatever produced it: a live sync
// or the IndexedDB cache both carry the raw id/synced_at columns.
export function fingerprintSnapshot(payload) {
  const marks = {};
  if (!payload) return marks;
  for (const dataset of Object.keys(FRESHNESS_TABLES)) {
    const rows = payload[dataset];
    if (!Array.isArray(rows) || !rows.length) continue;
    let best = null;
    let bestId = -Infinity;
    for (const row of rows) {
      const id = Number(row?.id);
      if (Number.isFinite(id) && id > bestId) {
        bestId = id;
        best = row;
      }
    }
    const key = boundaryKey(best);
    if (key) marks[dataset] = key;
  }
  return marks;
}

async function readTableBoundary(client, table) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const { data, error } = await client.from(table)
      .select('id,synced_at').order('id', { ascending: false }).limit(1)
      .abortSignal(controller.signal);
    if (error) throw error;
    return boundaryKey(data?.[0]);
  } finally {
    clearTimeout(timer);
  }
}

// A table that cannot be read is simply left out: a network blip must never be
// reported to the user as "there is new data".
export async function readFreshnessMarks(client, datasets = Object.keys(FRESHNESS_TABLES)) {
  const marks = {};
  const reads = datasets.map(async dataset => {
    const table = FRESHNESS_TABLES[dataset];
    if (!table) return;
    try {
      const key = await readTableBoundary(client, table);
      if (key) marks[dataset] = key;
    } catch {
      // best effort
    }
  });
  await Promise.all(reads);
  return marks;
}

// Stale only when a dataset we hold a mark for now reports a different one.
// A dataset missing on either side proves nothing.
export function hasNewerData(seen, current) {
  if (!seen || !current) return false;
  return Object.keys(seen).some(dataset => current[dataset] && current[dataset] !== seen[dataset]);
}
