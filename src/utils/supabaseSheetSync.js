// Reads the latest Pick / Deli / Ca1 snapshot from Supabase instead of
// fetching the Google Sheet's public CSV export directly.
//
// Why: the old approach (src/utils/googleSheetsSync.js) called the Sheet's
// "export?format=csv" URL straight from the browser with no auth. That only
// ever worked because the Sheet was shared as "Anyone with link can view" —
// a plain fetch() never carries the viewer's Google login, so no other
// sharing tier could have kept it working. Once GHN's Workspace admin
// blocked external link-sharing, that endpoint started returning 401/403
// for everyone.
//
// The new pipeline: a Google Apps Script bound to the source Sheet (running
// under the sheet owner's own Google identity, unaffected by the sharing
// policy) fully refreshes the kas_pick_data / kas_deli_data / kas_ca1_data
// tables on a timer via the sync_kas_*_data() RPC functions (atomic
// delete+insert — the real sheet has no natural unique key to upsert on).
// See docs/google-sheet-supabase-sync.md for the Apps Script + setup steps.
import { supabase } from './supabaseClient';

// PostgREST caps any unpaginated select() at 1000 rows by default — these
// tables hold several thousand rows each (one row per sheet row, ~2 weeks
// of data), so a plain .select('*') silently truncates and only the most
// recently-inserted rows come back. Page through with .range() until a
// page returns fewer rows than requested.
const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 15000;

function withTimeout(promise, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`REQUEST_TIMEOUT:${label}`)), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function fetchAllRows(table) {
  const rows = [];
  let from = 0;
  // Safety cap so a runaway table can't turn this into an infinite loop.
  for (let page = 0; page < 100; page++) {
    const { data, error } = await withTimeout(supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1), table);

    if (error) throw error;
    rows.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function fetchSupabaseSheetSync() {
  try {
    const [pickData, deliData, ca1Data] = await Promise.all([
      fetchAllRows('kas_pick_data'),
      fetchAllRows('kas_deli_data'),
      fetchAllRows('kas_ca1_data')
    ]);

    if (!pickData.length || !deliData.length) {
      return { success: false, error: 'NO_SYNCED_DATA' };
    }

    const filterValidHubs = (rows) => rows.filter(r => {
      const type = r['hub type'] || r['Hub Type'] || r.hub_type || r.Hub_Type || r.hubType || r.HubType || '';
      return String(type).toLowerCase() !== 'ahamove';
    });

    const updatedAt = [pickData[0]?.synced_at, deliData[0]?.synced_at, ca1Data[0]?.synced_at]
      .filter(Boolean)
      .sort()
      .pop();

    return {
      success: true,
      pickData: filterValidHubs(pickData),
      deliData: filterValidHubs(deliData),
      ca1Data: ca1Data.length ? filterValidHubs(ca1Data) : null,
      updatedAt
    };
  } catch (err) {
    return { success: false, error: err?.message || 'UNKNOWN_ERROR' };
  }
}
