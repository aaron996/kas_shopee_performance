import { supabase } from './supabaseClient';

const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 15000;
// COD data is a periodically synced snapshot. Keep it in memory briefly so
// navigating away from and back to the tab does not re-download every row.
// This intentionally does not persist across a page reload or browser session.
const COD_SUSPICION_CACHE_TTL_MS = 5 * 60 * 1000;
let codSuspicionCache = null;

function withTimeout(promise, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`REQUEST_TIMEOUT:${label}`)), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

/**
 * Fetch all suspicion records and latest metadata snapshot.
 *
 * `forceRefresh` is reserved for an explicit retry/refresh action. It bypasses
 * the short-lived in-memory snapshot cache so operations can see a newly
 * synced batch immediately.
 */
export async function fetchCodSuspicionData({ forceRefresh = false } = {}) {
  if (!forceRefresh && codSuspicionCache && codSuspicionCache.expiresAt > Date.now()) {
    return codSuspicionCache.result;
  }

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

    const result = {
      success: true,
      rows,
      metadata: metadata || {
        synced_at: rows[0]?.synced_at || null,
        total_drivers: new Set(rows.map(r => r.driver_id)).size,
        total_orders: rows.length
      }
    };
    codSuspicionCache = {
      result,
      expiresAt: Date.now() + COD_SUSPICION_CACHE_TTL_MS
    };
    return result;
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
 * Read workflow metadata separately from KAS-221 source records. RLS limits
 * this endpoint to the two currently authorized Dev Admin accounts.
 */
export async function fetchCodSuspicionCaseResolutions() {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('cod_suspicion_driver_resolutions')
        .select('driver_id, suspicion_type, status, contact_channel, note, attachments, finding_outcome, enforcement_status, resolved_at, resolved_by, updated_at')
        .eq('status', 'resolved'),
      'cod_suspicion_driver_resolutions'
    );

    if (error) throw error;
    return { success: true, rows: data || [] };
  } catch (err) {
    console.error('Failed to fetch COD resolution metadata:', err);
    return { success: false, error: err.message || 'UNKNOWN_ERROR', rows: [] };
  }
}

/**
 * The database verifies permission, source-case existence, resolver identity,
 * and timestamp. The browser only submits the stable source-case coordinates.
 */
export async function saveCodSuspicionDriverResolution({ driverId, suspicionType, contactChannel, note, attachments, findingOutcome, enforcementStatus }) {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('upsert_cod_suspicion_driver_resolution', {
        p_driver_id: driverId,
        p_suspicion_type: suspicionType,
        p_contact_channel: contactChannel,
        p_note: note || '',
        p_attachments: attachments || [],
        p_finding_outcome: findingOutcome,
        p_enforcement_status: enforcementStatus
      }),
      'upsert_cod_suspicion_driver_resolution'
    );

    if (error) throw error;
    return { success: true, row: Array.isArray(data) ? data[0] : data };
  } catch (err) {
    console.error('Failed to resolve COD suspicion case:', err);
    return { success: false, error: err.message || 'UNKNOWN_ERROR', row: null };
  }
}

export async function undoCodSuspicionDriverResolution({ driverId, suspicionType }) {
  try {
    const { error } = await withTimeout(
      supabase.rpc('undo_cod_suspicion_driver_resolution', {
        p_driver_id: driverId,
        p_suspicion_type: suspicionType
      }),
      'undo_cod_suspicion_driver_resolution'
    );
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Failed to undo COD driver resolution:', err);
    return { success: false, error: err.message || 'UNKNOWN_ERROR' };
  }
}

export async function uploadCodResolutionEvidence(driverId, file) {
  const safeDriverId = String(driverId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${safeDriverId}/${crypto.randomUUID()}.${extension}`;
  try {
    const { error } = await withTimeout(
      supabase.storage.from('cod-resolution-evidence').upload(path, file, {
        contentType: file.type,
        upsert: false
      }),
      'cod-resolution-evidence-upload'
    );
    if (error) throw error;
    return { success: true, path };
  } catch (err) {
    console.error('Failed to upload COD resolution evidence:', err);
    return { success: false, error: err.message || 'UNKNOWN_ERROR', path: null };
  }
}

export async function removeCodResolutionEvidence(paths) {
  const validPaths = (paths || []).filter(Boolean);
  if (validPaths.length === 0) return { success: true };
  try {
    const { error } = await withTimeout(
      supabase.storage.from('cod-resolution-evidence').remove(validPaths),
      'cod-resolution-evidence-delete'
    );
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Failed to delete COD resolution evidence:', err);
    return { success: false, error: err.message || 'UNKNOWN_ERROR' };
  }
}

async function getAuthHeader() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch (err) {
    console.warn('Could not read auth session for COD SMS assessments:', err);
  }
  return {};
}

/**
 * Fetch batch summary of COD SMS AI assessments (contract v1).
 * Never requests evidence (include_evidence=false).
 */
export async function fetchCodSmsAssessmentsSummary({ limit = 500 } = {}) {
  try {
    const authHeaders = await getAuthHeader();
    const parsedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const url = `/api/cod-sms-assessments?limit=${parsedLimit}`;

    const res = await withTimeout(
      fetch(url, {
        headers: {
          ...authHeaders,
          'Accept': 'application/json'
        }
      }),
      'cod-sms-assessments-summary'
    );

    if (!res.ok) {
      let errPayload;
      try { errPayload = await res.json(); } catch { /* ignore */ }
      return {
        success: false,
        error: errPayload?.error?.message || `Yêu cầu thất bại (${res.status})`,
        assessments: []
      };
    }

    const data = await res.json();
    return {
      success: true,
      contractVersion: data.contractVersion || '1',
      assessments: Array.isArray(data.assessments) ? data.assessments : [],
      meta: data.meta || {}
    };
  } catch (err) {
    console.error('Failed to fetch COD SMS assessments summary:', err);
    return {
      success: false,
      error: err.message || 'UNKNOWN_ERROR',
      assessments: []
    };
  }
}

/**
 * Fetch verbatim evidence for a specific case (Dev Admin only).
 * Exactly targets one case by (suspicion_type, driver_id, order_code).
 */
export async function fetchCodSmsAssessmentEvidence({ suspicionType, driverId, orderCode }) {
  try {
    const authHeaders = await getAuthHeader();
    const params = new URLSearchParams({
      suspicion_type: String(suspicionType || '').trim(),
      driver_id: String(driverId || '').trim(),
      order_code: String(orderCode || '').trim(),
      include_evidence: 'true',
      limit: '1'
    });
    const url = `/api/cod-sms-assessments?${params.toString()}`;

    const res = await withTimeout(
      fetch(url, {
        headers: {
          ...authHeaders,
          'Accept': 'application/json'
        }
      }),
      'cod-sms-assessment-evidence'
    );

    if (!res.ok) {
      let errPayload;
      try { errPayload = await res.json(); } catch { /* ignore */ }
      return {
        success: false,
        error: errPayload?.error?.message || `Không thể tải bằng chứng SMS (${res.status})`,
        assessment: null
      };
    }

    const data = await res.json();
    const assessment = Array.isArray(data.assessments) && data.assessments.length > 0
      ? data.assessments[0]
      : null;

    return {
      success: true,
      contractVersion: data.contractVersion || '1',
      assessment
    };
  } catch (err) {
    console.error('Failed to fetch COD SMS assessment evidence:', err);
    return {
      success: false,
      error: err.message || 'UNKNOWN_ERROR',
      assessment: null
    };
  }
}
