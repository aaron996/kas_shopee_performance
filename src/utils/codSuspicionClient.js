import { supabase } from './supabaseClient';
import { normalizeEmail } from './authPolicy';

const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 15000;

function withTimeout(promise, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`REQUEST_TIMEOUT:${label}`)), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

/**
 * Check if the user has QC role access (or Dev Admin).
 * Server-side RLS remains the source of truth.
 */
export async function checkUserQcRole(currentUser) {
  if (!currentUser?.email) return false;
  const cleanEmail = normalizeEmail(currentUser.email);

  // Dev Admin has full access
  if (cleanEmail === 'vinhlt@ghn.vn') {
    return true;
  }

  try {
    const { data, error } = await supabase
      .from('user_module_roles')
      .select('module_role')
      .eq('module_role', 'QC')
      .limit(1);

    if (error) {
      console.warn('Could not query user_module_roles:', error.message);
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.warn('Error checking QC role:', err?.message);
    return false;
  }
}

/**
 * Fetch all suspicion records and latest metadata snapshot
 */
export async function fetchCodSuspicionData() {
  try {
    // 1. Fetch metadata snapshot
    let metadata = null;
    const { data: metaRows, error: metaErr } = await withTimeout(
      supabase
        .from('kas_cod_suspicion_metadata')
        .select('*')
        .order('id', { ascending: false })
        .limit(1),
      'kas_cod_suspicion_metadata'
    );

    if (!metaErr && metaRows && metaRows.length > 0) {
      metadata = metaRows[0];
    }

    // 2. Fetch suspicion rows with pagination
    const rows = [];
    let from = 0;
    for (let page = 0; page < 50; page++) {
      const { data, error } = await withTimeout(
        supabase
          .from('kas_cod_suspicion_data')
          .select('*')
          .order('total_score', { ascending: false })
          .range(from, from + PAGE_SIZE - 1),
        'kas_cod_suspicion_data'
      );

      if (error) throw error;
      rows.push(...(data || []));

      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return {
      success: true,
      rows,
      metadata: metadata || {
        synced_at: rows[0]?.synced_at || null,
        total_drivers: new Set(rows.map(r => r.driver_id)).size,
        total_orders: rows.length
      }
    };
  } catch (err) {
    console.error('Failed to fetch COD suspicion data:', err);
    return {
      success: false,
      error: err.message || 'UNKNOWN_ERROR',
      rows: [],
      metadata: null
    };
  }
}

/**
 * Dev Admin: List all users and their QC status
 */
export async function adminListUsersQcRoles(search = '') {
  try {
    const { data, error } = await supabase.rpc('admin_list_users_qc_roles', {
      p_search: search.trim() || null
    });

    if (error) throw error;
    return { success: true, users: data || [] };
  } catch (err) {
    console.error('Failed to list QC roles:', err);
    return { success: false, error: err.message || 'FAILED_TO_LOAD_USERS', users: [] };
  }
}

/**
 * Dev Admin: Grant or revoke QC role for a user
 */
export async function adminSetUserQcRole(userId, userEmail, hasQc) {
  try {
    const { data, error } = await supabase.rpc('admin_set_user_qc_role', {
      p_user_id: userId,
      p_user_email: userEmail,
      p_has_qc: Boolean(hasQc)
    });

    if (error) throw error;
    return { success: true, result: data };
  } catch (err) {
    console.error('Failed to update QC role:', err);
    return { success: false, error: err.message || 'FAILED_TO_UPDATE_QC_ROLE' };
  }
}
