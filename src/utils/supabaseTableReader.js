const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 15000;

class SnapshotChangedError extends Error {
  constructor(table) {
    super(`SNAPSHOT_CHANGED:${table}`);
  }
}

function rowId(value, table) {
  // bigint IDs may be returned as strings. Never round a cursor or compare
  // numeric strings lexicographically: either can skip operational rows.
  if ((typeof value === 'number' && Number.isSafeInteger(value)) ||
      (typeof value === 'string' && /^\d+$/.test(value))) {
    return BigInt(value);
  }
  throw new Error(`INVALID_ROW_ID:${table}`);
}

async function readRequest(query, table, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`REQUEST_TIMEOUT:${table}`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([query.abortSignal(controller.signal), timeout]);
    if (error) throw error;
    return data || [];
  } finally {
    clearTimeout(timer);
  }
}

function sameBoundary(before, after, table) {
  return after && rowId(before.id, table) === rowId(after.id, table) &&
    before.synced_at === after.synced_at;
}

async function readSnapshot(client, table, { pageSize, maxPages, timeoutMs }) {
  // The sync RPC atomically replaces a table and advances its identity IDs.
  // Bound this read to the current last ID, then verify the boundary again.
  // This catches a replacement even when it leaves a later page empty.
  const readBoundary = async () => (await readRequest(client.from(table)
    .select('id,synced_at').order('id', { ascending: false }).limit(1), table, timeoutMs))[0];
  const boundary = await readBoundary();
  if (!boundary) return [];
  const upperId = rowId(boundary.id, table);
  const rows = [];
  let cursor = null;
  let cursorId = null;

  for (let page = 0; page < maxPages; page++) {
    let query = client.from(table).select('*')
      .lte('id', boundary.id).order('id', { ascending: true }).limit(pageSize);
    if (cursor !== null) query = query.gt('id', cursor);
    const data = await readRequest(query, table, timeoutMs);
    if (!data.length) break;
    for (const row of data) {
      const id = rowId(row.id, table);
      if ((cursorId !== null && id <= cursorId) || id > upperId) {
        throw new Error(`INVALID_PAGE_ORDER:${table}`);
      }
      rows.push(row);
      cursor = row.id;
      cursorId = id;
    }
    // Do not treat a short page as the end: PostgREST's server-side row cap
    // may be smaller than the requested limit. Only the boundary proves EOF.
    if (cursorId === upperId) break;
  }

  if (!sameBoundary(boundary, await readBoundary(), table)) {
    throw new SnapshotChangedError(table);
  }
  // Never return a capped or incomplete dataset as a successful KPI snapshot.
  if (cursorId !== upperId) throw new Error(`INCOMPLETE_SNAPSHOT:${table}`);
  return rows;
}

export async function fetchAllSnapshotRows(client, table, {
  pageSize = PAGE_SIZE, maxPages = MAX_PAGES, timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  // One restart is enough for the scheduled full refresh. Repeated changes
  // fail through the existing stale-cache/error handling instead of looping.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await readSnapshot(client, table, { pageSize, maxPages, timeoutMs });
    } catch (error) {
      if (!(error instanceof SnapshotChangedError) || attempt === 1) throw error;
    }
  }
}
