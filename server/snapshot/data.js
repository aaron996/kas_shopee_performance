// Raw rows for the /snapshot page. The page runs the dashboard's own
// processing on them (reassignKaRegion, filters, Report1/Report5), so this
// endpoint only reads — it never aggregates or reshapes business data.
//
// Rows go out column-packed ({ columns, rows: [[...]] }): a full table as
// plain JSON objects is ~11MB, over Vercel's 4.5MB response cap, and nearly
// all of that is repeated key names.
export const SNAPSHOT_TABLES = {
  pick: { table: 'kas_pick_data', byClient: true },
  deli: { table: 'kas_deli_data', byClient: true },
  fd: { table: 'kas_fd_data', byClient: true },
  // The Ca1 source has no client split (see Report5 / App.jsx exportContext).
  ca1: { table: 'kas_ca1_data', byClient: false }
};

export const SNAPSHOT_CLIENTS = ['SPB', 'SPE'];

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const PARALLEL_PAGES = 6;
const DROPPED_COLUMNS = new Set(['id', 'synced_at']);

export function packRows(rows) {
  const columns = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key) && !DROPPED_COLUMNS.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return { columns, rows: rows.map(row => columns.map(key => row[key] ?? null)) };
}

export async function fetchSnapshotRows(client, { report, clientName }) {
  const source = SNAPSHOT_TABLES[report];
  const scoped = (options) => {
    const query = client.from(source.table).select('*', options);
    return source.byClient ? query.eq('client_name', clientName) : query;
  };

  const { count, error: countError } = await scoped({ count: 'exact', head: true });
  if (countError) throw countError;

  const pageCount = Math.min(Math.ceil((count || 0) / PAGE_SIZE), MAX_PAGES);
  const pages = [];
  for (let start = 0; start < pageCount; start += PARALLEL_PAGES) {
    const batch = [];
    for (let page = start; page < Math.min(start + PARALLEL_PAGES, pageCount); page++) {
      const from = page * PAGE_SIZE;
      batch.push(scoped().order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1));
    }
    for (const { data, error } of await Promise.all(batch)) {
      if (error) throw error;
      pages.push(data || []);
    }
  }
  // The sheet sync can insert rows between the count and the page reads;
  // keep reading while the last page came back full.
  while (pages.length > 0 && pages.length < MAX_PAGES && pages[pages.length - 1].length === PAGE_SIZE) {
    const from = pages.length * PAGE_SIZE;
    const { data, error } = await scoped().order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    pages.push(data || []);
  }
  return pages.flat();
}
