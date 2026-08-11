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
// policy) pushes each tab's rows into the `sheet_sync_data` table on a timer.
// See docs/google-sheet-supabase-sync.md for the Apps Script + setup steps.
import { supabase } from './supabaseClient';

const TABS = ['pick', 'deli', 'ca1'];

export async function fetchSupabaseSheetSync() {
  try {
    const { data, error } = await supabase
      .from('sheet_sync_data')
      .select('tab_name, rows, row_count, updated_at')
      .in('tab_name', TABS);

    if (error) throw error;

    const byTab = Object.fromEntries((data || []).map(r => [r.tab_name, r]));

    const pick = byTab.pick;
    const deli = byTab.deli;
    const ca1 = byTab.ca1;

    if (!pick || !deli || !pick.rows?.length || !deli.rows?.length) {
      return { success: false, error: 'NO_SYNCED_DATA' };
    }

    const filterValidHubs = (rows) => rows.filter(r => {
      const type = r['hub type'] || r['Hub Type'] || r.hub_type || r.Hub_Type || r.hubType || r.HubType || '';
      return String(type).toLowerCase() !== 'ahamove';
    });

    const updatedAt = [pick.updated_at, deli.updated_at, ca1?.updated_at]
      .filter(Boolean)
      .sort()
      .pop();

    return {
      success: true,
      pickData: filterValidHubs(pick.rows),
      deliData: filterValidHubs(deli.rows),
      ca1Data: ca1?.rows?.length ? filterValidHubs(ca1.rows) : null,
      updatedAt
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
