import { supabase } from './supabaseClient.js';
import { COD_SMS_ASSESSMENT_MAX_LIMIT, collectCodSmsAssessmentPages } from './codSmsAssessmentPagination.js';
export { collectCodSmsAssessmentPages } from './codSmsAssessmentPagination.js';

const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 15000;
// A manual scoring batch can legitimately run for minutes (server maxDuration
// is 300s), unlike the other short read/write calls in this file.
const BATCH_RUN_TIMEOUT_MS = 280000;
// COD data is a periodically synced snapshot. Keep it in memory briefly so
// navigating away from and back to the tab does not re-download every row.
// This intentionally does not persist across a page reload or browser session.
const COD_SUSPICION_CACHE_TTL_MS = 5 * 60 * 1000;
let codSuspicionCache = null;

function withTimeout(promise, label, timeoutMs = REQUEST_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`REQUEST_TIMEOUT:${label}`)), timeoutMs);
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
 * Fetch all COD SMS AI assessments using the contract-v1 GET pagination.
 * Each request stays within the 500-row limit and never requests evidence.
 */
export async function fetchCodSmsAssessmentsSummary({ limit = 500 } = {}) {
  try {
    const authHeaders = await getAuthHeader();
    const parsedLimit = Math.min(Math.max(Number(limit) || 200, 1), COD_SMS_ASSESSMENT_MAX_LIMIT);

    return await collectCodSmsAssessmentPages(async ({ limit: pageLimit, offset }) => {
      const params = new URLSearchParams({ limit: String(pageLimit), offset: String(offset) });
      const res = await withTimeout(
        fetch(`/api/cod-sms-assessments?${params.toString()}`, {
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
          assessments: [],
          meta: {}
        };
      }

      const data = await res.json();
      return {
        success: true,
        contractVersion: data.contractVersion || '1',
        assessments: Array.isArray(data.assessments) ? data.assessments : [],
        meta: data.meta || {}
      };
    }, { limit: parsedLimit });
  } catch (err) {
    console.error('Failed to fetch COD SMS assessments summary:', err);
    return {
      success: false,
      error: err.message || 'UNKNOWN_ERROR',
      assessments: []
    };
  }
}

async function getCodSmsJson(params, label) {
  try {
    const authHeaders = await getAuthHeader();
    const res = await withTimeout(
      fetch(`/api/cod-sms-assessments?${params.toString()}`, {
        headers: {
          ...authHeaders,
          'Accept': 'application/json'
        }
      }),
      label
    );
    if (!res.ok) {
      let errPayload;
      try { errPayload = await res.json(); } catch { /* ignore */ }
      return { success: false, error: errPayload?.error?.message || `Yêu cầu thất bại (${res.status})` };
    }
    return { success: true, data: await res.json() };
  } catch (err) {
    console.error(`Failed to fetch ${label}:`, err);
    return { success: false, error: err.message || 'UNKNOWN_ERROR' };
  }
}

/**
 * Fetch a page of SMS AI scoring runs (cron + manual batches), newest first,
 * for the Dev Admin history panel. Server rejects non-Dev callers.
 */
export async function fetchCodSmsRuns({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({
    view: 'runs',
    limit: String(Math.min(Math.max(Number(limit) || 20, 1), 100)),
    offset: String(Math.max(Number(offset) || 0, 0))
  });
  const result = await getCodSmsJson(params, 'cod-sms-runs');
  if (!result.success) return { success: false, error: result.error, runs: [], meta: {} };
  return {
    success: true,
    runs: Array.isArray(result.data.runs) ? result.data.runs : [],
    meta: result.data.meta || {}
  };
}

/**
 * Fetch every per-order outcome recorded for one run (Dev Admin only).
 * Never includes SMS evidence.
 */
export async function fetchCodSmsRunItems(runId) {
  const params = new URLSearchParams({ view: 'run_items', run_id: String(runId) });
  const result = await getCodSmsJson(params, 'cod-sms-run-items');
  if (!result.success) return { success: false, error: result.error, items: [] };
  return {
    success: true,
    items: Array.isArray(result.data.items) ? result.data.items : []
  };
}

/**
 * Fetch verbatim evidence for a specific case (Dev Admin only).
 * Exactly targets one case by (suspicion_type, driver_id, order_code).
 */
export async function fetchCodSmsAssessmentEvidence({ suspicionType, driverId, orderCode, signal = null }) {
  if (signal?.aborted) {
    return {
      success: false,
      aborted: true,
      error: 'Yêu cầu tải bằng chứng đã bị hủy.',
      assessment: null
    };
  }
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
        },
        signal
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
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      return {
        success: false,
        aborted: true,
        error: 'Yêu cầu tải bằng chứng đã bị hủy.',
        assessment: null
      };
    }
    console.error('Failed to fetch COD SMS assessment evidence:', err);
    return {
      success: false,
      error: err.message || 'UNKNOWN_ERROR',
      assessment: null
    };
  }
}

export const COD_SMS_EVIDENCE_CACHE_TTL_MS = 5 * 60 * 1000;
const codSmsEvidenceCache = new Map();

/**
 * Builds a deterministic cache key ensuring:
 * 1. Proper user scope (user email + role) so one user/role cannot see or poison another's cached data.
 * 2. Stable 3-tuple identifier (suspicionType, driverId, orderCode) matching backend criteria.
 */
export function getCodSmsEvidenceCacheKey({
  suspicionType,
  driverId,
  orderCode,
  userEmail = '',
  isDevAdmin = false
} = {}) {
  const normEmail = String(userEmail || '').trim().toLowerCase();
  const roleScope = isDevAdmin ? 'dev' : 'viewer';
  const sType = String(suspicionType || '').trim();
  const dId = String(driverId || '').trim();
  const oCode = String(orderCode || '').trim();
  return `${normEmail}::${roleScope}::${sType}\u0000${dId}\u0000${oCode}`;
}

/**
 * Read cached SMS evidence if present and not expired.
 */
export function getCachedCodSmsEvidence(params) {
  const key = getCodSmsEvidenceCacheKey(params);
  const entry = codSmsEvidenceCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    codSmsEvidenceCache.delete(key);
    return null;
  }
  return entry.result;
}

/**
 * Invalidate cached SMS evidence by key/pattern or clear all if no parameter provided.
 */
export function invalidateCodSmsEvidenceCache(params) {
  if (!params) {
    codSmsEvidenceCache.clear();
    return;
  }
  if (typeof params === 'string') {
    codSmsEvidenceCache.delete(params);
    for (const k of codSmsEvidenceCache.keys()) {
      if (k.endsWith(params) || k.includes(params)) {
        codSmsEvidenceCache.delete(k);
      }
    }
    return;
  }
  const key = getCodSmsEvidenceCacheKey(params);
  codSmsEvidenceCache.delete(key);
}

export function clearCodSmsEvidenceCache() {
  codSmsEvidenceCache.clear();
}

/**
 * Fetches SMS evidence with in-memory caching and AbortSignal support.
 * Serves immediately from cache if available and unexpired.
 */
export async function fetchCodSmsAssessmentEvidenceCached({
  suspicionType,
  driverId,
  orderCode,
  userEmail = '',
  isDevAdmin = false,
  forceRefresh = false,
  signal = null
}) {
  const cacheKey = getCodSmsEvidenceCacheKey({ suspicionType, driverId, orderCode, userEmail, isDevAdmin });

  if (!forceRefresh) {
    const cached = getCachedCodSmsEvidence({ suspicionType, driverId, orderCode, userEmail, isDevAdmin });
    if (cached) {
      return {
        ...cached,
        fromCache: true
      };
    }
  }

  const result = await fetchCodSmsAssessmentEvidence({
    suspicionType,
    driverId,
    orderCode,
    signal
  });

  if (result.success && result.assessment) {
    codSmsEvidenceCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + COD_SMS_EVIDENCE_CACHE_TTL_MS
    });
  }

  return {
    ...result,
    fromCache: false
  };
}

// Mirrors ChatPanel.jsx's readSse helper: the manual-run endpoint streams
// `progress` events while a batch runs, then one `batch_end` (or `error`).
async function readSse(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Không nhận được luồng phản hồi từ máy chủ.');

  const decoder = new TextDecoder();
  let buffer = '';
  const dispatchFrame = frame => {
    const lines = frame.split(/\r?\n/);
    let eventName = 'message';
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let payload;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      throw new Error('Phản hồi chấm điểm SMS không đúng định dạng.');
    }
    onEvent(eventName, payload);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    frames.forEach(dispatchFrame);
    if (done) break;
  }
  if (buffer.trim()) dispatchFrame(buffer);
}

/**
 * Combines a caller-supplied AbortSignal (e.g. a "Dừng" button) with a hard
 * safety timeout, so a batch run either stops on user request or eventually
 * gives up — same 280s ceiling the old non-streaming timeout used.
 */
function withStreamAbort(externalSignal, timeoutMs = BATCH_RUN_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error(`REQUEST_TIMEOUT:cod-sms-assessments-batch`)), timeoutMs);
  const onExternalAbort = () => controller.abort(externalSignal.reason);
  externalSignal?.addEventListener('abort', onExternalAbort);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  };
}

async function postCodSmsBatchStream(body, { onProgress, signal } = {}) {
  const authHeaders = await getAuthHeader();
  const { signal: combinedSignal, cleanup } = withStreamAbort(signal);

  try {
    const res = await fetch('/api/cod-sms-assessments', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(body),
      signal: combinedSignal
    });

    if (!res.ok) {
      let errPayload;
      try { errPayload = await res.json(); } catch { /* ignore */ }
      throw new Error(errPayload?.error?.message || `Yêu cầu thất bại (${res.status})`);
    }

    let finalPayload = null;
    let streamError = null;
    await readSse(res, (event, payload) => {
      if (event === 'progress') onProgress?.(payload);
      else if (event === 'batch_end') finalPayload = payload;
      else if (event === 'error') streamError = payload;
    });

    if (streamError) {
      throw new Error(streamError.message || 'Chấm điểm SMS thất bại.');
    }
    if (!finalPayload) {
      throw new Error('Không nhận được kết quả chấm điểm SMS.');
    }
    return finalPayload;
  } catch (err) {
    if (combinedSignal.aborted && !signal?.aborted) {
      // Our own safety timeout fired, not the caller's Stop button.
      throw new Error('Yêu cầu chấm điểm SMS quá thời gian chờ.');
    }
    throw err;
  } finally {
    cleanup();
  }
}

function sumBatchTotals(base, extra) {
  const merged = { ...base };
  for (const key of ['found', 'claimed', 'scored', 'noEvidence', 'failed', 'skippedUnchanged']) {
    merged[key] = (base?.[key] || 0) + (extra?.[key] || 0);
  }
  return merged;
}

/**
 * Manually trigger a scoring run (Dev Admin only; the server enforces this
 * independently via hasDevAdminRole, this is not the security boundary).
 *
 * `mode: 'all'` (default) does the full-sweep flow, two steps, both
 * server-side idempotent so a re-click never double-bills an unchanged order:
 * 1. A full sweep (`sweep: true`, same page-by-page walk as the daily cron)
 *    over every source order — picks up anything new/changed, and also
 *    retries `failed` rows up to the 5-attempt cap the claim RPC enforces.
 * 2. Whatever is still `failed` after that (attempts exhausted, or failed
 *    again just now) gets one explicit `force: true` retry, scoped to only
 *    those specific order keys — never a blanket force over the whole table,
 *    so already-correct orders are never re-billed.
 *
 * `mode: 'cases'` scores only the given `{suspicionType, driverId,
 * orderCode}` keys (one order, or a hand-picked list) — no sweep, no
 * force-retry-failed follow-up step.
 *
 * `onProgress` is called with each `progress` SSE event; `signal` is an
 * AbortSignal (e.g. wired to a "Dừng" button) that stops claiming new orders
 * — orders already scored before the stop are kept, not rolled back.
 */
export async function runCodSmsAssessmentBatch({ mode = 'all', cases = [], onProgress, signal } = {}) {
  try {
    if (mode === 'cases') {
      const data = await postCodSmsBatchStream({ cases, force: false }, { onProgress, signal });
      return { success: true, batch: { ...(data?.batch || {}), forceRetried: 0 } };
    }

    const sweepData = await postCodSmsBatchStream({ sweep: true }, { onProgress, signal });
    let totals = sweepData?.batch || {};

    if (totals.aborted) {
      return { success: true, batch: { ...totals, forceRetried: 0 } };
    }

    const summary = await fetchCodSmsAssessmentsSummary({ limit: 500 });
    const stillFailedCases = summary.success
      ? (summary.assessments || [])
          .filter(item => item.status === 'failed')
          .map(item => item.key)
          .filter(Boolean)
          .slice(0, COD_SMS_ASSESSMENT_MAX_LIMIT)
      : [];

    let forceRetried = 0;
    if (stillFailedCases.length > 0 && !signal?.aborted) {
      const forceData = await postCodSmsBatchStream(
        { cases: stillFailedCases, force: true },
        { onProgress, signal }
      );
      totals = sumBatchTotals(totals, forceData?.batch);
      forceRetried = stillFailedCases.length;
    }

    return {
      success: true,
      batch: { ...totals, forceRetried }
    };
  } catch (err) {
    if (signal?.aborted) {
      return { success: false, aborted: true, error: 'STOPPED_BY_USER' };
    }
    console.error('Failed to run COD SMS assessment batch:', err);
    return {
      success: false,
      error: err.message || 'UNKNOWN_ERROR'
    };
  }
}
