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

export async function fetchSupabaseSheetSync() {
  try {
    const [pickRes, deliRes, ca1Res] = await Promise.all([
      supabase.from('kas_pick_data').select('*'),
      supabase.from('kas_deli_data').select('*'),
      supabase.from('kas_ca1_data').select('*')
    ]);

    if (pickRes.error) throw pickRes.error;
    if (deliRes.error) throw deliRes.error;
    if (ca1Res.error) throw ca1Res.error;

    const pickData = pickRes.data || [];
    const deliData = deliRes.data || [];
    const ca1Data = ca1Res.data || [];

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
    return { success: false, error: err.message };
  }
}
