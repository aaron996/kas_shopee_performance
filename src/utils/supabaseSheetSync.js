// Reads the latest Pick / Deli / Ca1 / Leadtime snapshot from Supabase instead of
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
// policy) fully refreshes the kas_pick_data / kas_deli_data / kas_ca1_data /
// kas_leadtime_data tables on a timer via the sync_kas_*_data() RPC functions
// (atomic delete+insert — the real sheet has no natural unique key to upsert on).
// See docs/google-sheet-supabase-sync.md for the Apps Script + setup steps.
import { supabase } from './supabaseClient.js';
import { fetchAllSnapshotRows } from './supabaseTableReader.js';

// PostgREST caps any unpaginated select() at 1000 rows by default — these
// tables hold several thousand rows each (one row per sheet row, ~2 weeks
// of data), so a plain .select('*') silently truncates and only the most
// recently-inserted rows come back. Read all pages by primary-key cursor,
// avoiding OFFSET's repeated traversal of rows from earlier pages. Keep the
// full dataset: reports need history, client switches, rankings and exports.

export async function fetchSupabaseSheetSync(client = supabase, { onCoreReady } = {}) {
  const fetchAllRows = table => fetchAllSnapshotRows(client, table);
  try {
    const core = Promise.all([
      fetchAllRows('kas_pick_data'),
      fetchAllRows('kas_deli_data'),
      fetchAllRows('kas_fd_data').catch(err => {
        console.warn('Could not fetch kas_fd_data:', err?.message);
        return [];
      })
    ]).then(([pickData, deliData, fdData]) => {
      if (pickData.length && deliData.length) {
        onCoreReady?.({ pickData, deliData, fdData: fdData.length ? fdData : null });
      }
      return { pickData, deliData, fdData };
    });
    const [{ pickData, deliData, fdData }, ca1Data, leadtimeData] = await Promise.all([
      core,
      fetchAllRows('kas_ca1_data').catch(err => {
        console.warn('Could not fetch kas_ca1_data:', err?.message);
        return [];
      }),
      fetchAllRows('kas_leadtime_data').catch(err => {
        console.warn('Could not fetch kas_leadtime_data:', err?.message);
        return [];
      })
    ]);

    if (!pickData.length || !deliData.length) {
      return { success: false, error: 'NO_SYNCED_DATA' };
    }

    const updatedAt = [
      pickData[0]?.synced_at,
      deliData[0]?.synced_at,
      ca1Data[0]?.synced_at,
      leadtimeData[0]?.synced_at,
      fdData[0]?.synced_at
    ]
      .filter(Boolean)
      .sort()
      .pop();

    return {
      success: true,
      pickData,
      deliData,
      ca1Data: ca1Data.length ? ca1Data : null,
      leadtimeData: leadtimeData.length ? leadtimeData : null,
      fdData: fdData.length ? fdData : null,
      updatedAt
    };
  } catch (err) {
    return { success: false, error: err?.message || 'UNKNOWN_ERROR' };
  }
}
