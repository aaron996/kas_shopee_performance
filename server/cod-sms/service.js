import { ChatError } from '../chat/errors.js';
import {
  computeSourceFingerprint,
  extractLongNumericSequences,
  hasBankingContext,
  normalizeMessages,
  scoreSmsSource
} from './scorer.js';

const ASSESSMENT_COLUMNS = [
  'id',
  'suspicion_type',
  'driver_id',
  'order_code',
  'status',
  'sms_score',
  'confidence',
  'detected_patterns',
  'explanation',
  'rubric_version',
  'model',
  'model_called',
  'source_fingerprint',
  'scored_at',
  'error_code',
  'error_message',
  'attempt_count',
  'updated_at'
];

function databaseError(code, message, error) {
  return new ChatError(code, message, 503, { cause: error });
}

function caseKey(value) {
  return `${value.suspicionType ?? value.suspicion_type}\u0000${value.driverId ?? value.driver_id}\u0000${value.orderCode ?? value.order_code}`;
}

function driverKey(value) {
  return `${value.suspicionType ?? value.suspicion_type}\u0000${value.driverId ?? value.driver_id}`;
}

function normalizeSourceOrder(row) {
  return {
    suspicionType: row.suspicion_type,
    driverId: row.driver_id,
    orderCode: row.order_code,
    driverName: row.driver_name,
    codAmount: row.cod_amount === null ? null : Number(row.cod_amount),
    messages: [],
    otherOrderSequences: []
  };
}

function buildOtherOrderSequences(source, allDriverMessages) {
  const byOrder = new Map();
  for (const message of allDriverMessages) {
    if (message.order_code === source.orderCode || !hasBankingContext(message.content)) continue;
    const sequences = extractLongNumericSequences(message.content);
    if (!sequences.length) continue;
    const current = byOrder.get(message.order_code) ?? new Set();
    sequences.forEach(sequence => current.add(sequence));
    byOrder.set(message.order_code, current);
  }
  return [...byOrder.entries()].map(([orderCode, sequences]) => ({
    orderCode,
    sequences: [...sequences]
  }));
}

export function createCodSmsRepository(serviceClient) {
  if (!serviceClient || typeof serviceClient.from !== 'function' || typeof serviceClient.rpc !== 'function') {
    throw new ChatError('COD_SMS_DATABASE_UNAVAILABLE', 'Kết nối dữ liệu SMS chưa sẵn sàng.', 503);
  }

  return {
    async loadSources({ limit, offset = 0, cases = [] }) {
      let query = serviceClient
        .from('kas_cod_suspicion_data')
        .select('suspicion_type,driver_id,order_code,driver_name,cod_amount');

      if (cases.length) {
        query = query.in('order_code', [...new Set(cases.map(item => item.orderCode))]);
      }
      query = query
        .order('driver_id', { ascending: true })
        .order('order_code', { ascending: true });
      query = cases.length
        ? query.limit(Math.min(Math.max(cases.length * 4, cases.length), 2000))
        : query.range(offset, offset + limit - 1);

      const { data: sourceRows, error: sourceError } = await query;
      if (sourceError) {
        throw databaseError('COD_SMS_SOURCE_READ_FAILED', 'Không thể đọc danh sách đơn COD.', sourceError);
      }

      const requestedKeys = cases.length ? new Set(cases.map(caseKey)) : null;
      const sources = (sourceRows ?? [])
        .map(normalizeSourceOrder)
        .filter(source => !requestedKeys || requestedKeys.has(caseKey(source)))
        .slice(0, limit);
      if (!sources.length) return [];

      const driverIds = [...new Set(sources.map(source => source.driverId))];
      const { data: smsRows, error: smsError } = await serviceClient
        .from('kas_cod_suspicion_sms_messages')
        .select('suspicion_type,driver_id,order_code,sms_time,recipient_type,content')
        .in('driver_id', driverIds)
        .order('sms_time', { ascending: true })
        .limit(5000);
      if (smsError) {
        throw databaseError('COD_SMS_SOURCE_READ_FAILED', 'Không thể đọc SMS nguồn.', smsError);
      }

      const messagesByOrder = new Map();
      const messagesByDriver = new Map();
      for (const row of smsRows ?? []) {
        const orderMessages = messagesByOrder.get(caseKey(row)) ?? [];
        orderMessages.push({
          smsTime: row.sms_time,
          recipientType: row.recipient_type,
          content: row.content
        });
        messagesByOrder.set(caseKey(row), orderMessages);

        const driverMessages = messagesByDriver.get(driverKey(row)) ?? [];
        driverMessages.push(row);
        messagesByDriver.set(driverKey(row), driverMessages);
      }

      return sources.map(source => ({
        ...source,
        messages: normalizeMessages(messagesByOrder.get(caseKey(source)) ?? []),
        otherOrderSequences: buildOtherOrderSequences(
          source,
          messagesByDriver.get(driverKey(source)) ?? []
        )
      }));
    },

    async claim(source, { fingerprint, rubricVersion, model, force, staleAfterSeconds }) {
      const { data, error } = await serviceClient.rpc('claim_cod_suspicion_sms_assessment', {
        p_suspicion_type: source.suspicionType,
        p_driver_id: source.driverId,
        p_order_code: source.orderCode,
        p_source_fingerprint: fingerprint,
        p_rubric_version: rubricVersion,
        p_model: model,
        p_force: force,
        p_stale_after_seconds: staleAfterSeconds
      });
      if (error || !data?.assessment || typeof data.claimed !== 'boolean') {
        throw databaseError('COD_SMS_CLAIM_FAILED', 'Không thể giữ lượt chấm điểm SMS.', error);
      }
      return data;
    },

    async complete(id, runToken, values) {
      const payload = {
        status: values.status,
        sms_score: values.smsScore,
        confidence: values.confidence,
        detected_patterns: values.detectedPatterns,
        evidence: values.evidence,
        explanation: values.explanation,
        model_called: values.modelCalled,
        scored_at: values.scoredAt,
        error_code: values.errorCode,
        error_message: values.errorMessage,
        run_token: null,
        updated_at: values.scoredAt
      };
      const { data, error } = await serviceClient
        .from('cod_suspicion_sms_assessments')
        .update(payload)
        .eq('id', id)
        .eq('run_token', runToken)
        .select('*')
        .single();
      if (error || !data) {
        throw databaseError('COD_SMS_FINALIZE_FAILED', 'Không thể lưu kết quả chấm điểm SMS.', error);
      }
      return data;
    },

    async list({ limit, offset = 0, filters = {}, includeEvidence = false }) {
      const columns = includeEvidence ? [...ASSESSMENT_COLUMNS, 'evidence'].join(',') : ASSESSMENT_COLUMNS.join(',');
      let query = serviceClient
        .from('cod_suspicion_sms_assessments')
        .select(columns, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .order('suspicion_type', { ascending: true })
        .order('driver_id', { ascending: true })
        .order('order_code', { ascending: true })
        .range(offset, offset + limit - 1);
      if (filters.suspicionType) query = query.eq('suspicion_type', filters.suspicionType);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.driverId) query = query.eq('driver_id', filters.driverId);
      if (filters.orderCode) query = query.eq('order_code', filters.orderCode);
      const { data, error, count } = await query;
      if (error) {
        throw databaseError('COD_SMS_ASSESSMENT_READ_FAILED', 'Không thể đọc kết quả chấm điểm SMS.', error);
      }
      return { rows: data ?? [], totalCount: count ?? (data ?? []).length };
    },

    async createRun({ trigger, mode, triggeredBy = null, triggeredByEmail = null, model, rubricVersion, force }) {
      const { data, error } = await serviceClient
        .from('cod_suspicion_sms_runs')
        .insert({
          trigger,
          mode,
          triggered_by: triggeredBy,
          triggered_by_email: triggeredByEmail,
          model,
          rubric_version: rubricVersion,
          force
        })
        .select('id')
        .single();
      if (error || !data?.id) {
        throw databaseError('COD_SMS_RUN_CREATE_FAILED', 'Không thể tạo batch chấm điểm SMS.', error);
      }
      return data.id;
    },

    async finishRun(runId, { status, totals = {}, errorCode = null, errorMessage = null }) {
      const { error } = await serviceClient
        .from('cod_suspicion_sms_runs')
        .update({
          status,
          found: totals.found ?? 0,
          claimed: totals.claimed ?? 0,
          scored: totals.scored ?? 0,
          no_evidence: totals.noEvidence ?? 0,
          failed: totals.failed ?? 0,
          skipped_unchanged: totals.skippedUnchanged ?? 0,
          error_code: errorCode ? String(errorCode).slice(0, 100) : null,
          error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
          finished_at: new Date().toISOString()
        })
        .eq('id', runId);
      if (error) {
        throw databaseError('COD_SMS_RUN_FINALIZE_FAILED', 'Không thể lưu kết quả batch SMS.', error);
      }
    },

    async recordRunItem(runId, assessment, { outcome }) {
      const { error } = await serviceClient
        .from('cod_suspicion_sms_run_items')
        .insert({
          run_id: runId,
          suspicion_type: assessment.suspicion_type,
          driver_id: assessment.driver_id,
          order_code: assessment.order_code,
          outcome,
          sms_score: assessment.sms_score ?? null,
          model_called: outcome !== 'skipped_unchanged' && assessment.model_called === true,
          error_code: outcome === 'failed' ? assessment.error_code : null,
          error_message: outcome === 'failed' ? assessment.error_message : null
        });
      if (error) {
        throw databaseError('COD_SMS_RUN_ITEM_FAILED', 'Không thể ghi log đơn trong batch SMS.', error);
      }
    },

    async listRuns({ limit, offset = 0 }) {
      const { data, error, count } = await serviceClient
        .from('cod_suspicion_sms_runs')
        .select('*', { count: 'exact' })
        .order('started_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        throw databaseError('COD_SMS_RUN_READ_FAILED', 'Không thể đọc lịch sử batch SMS.', error);
      }
      return { rows: data ?? [], totalCount: count ?? (data ?? []).length };
    },

    async listRunItems(runId) {
      const { data, error } = await serviceClient
        .from('cod_suspicion_sms_run_items')
        .select('*')
        .eq('run_id', runId)
        .order('id', { ascending: true })
        .limit(10000);
      if (error) {
        throw databaseError('COD_SMS_RUN_READ_FAILED', 'Không thể đọc chi tiết batch SMS.', error);
      }
      return data ?? [];
    }
  };
}

function technicalFailure(error) {
  const knownCode = typeof error?.code === 'string' && error.code.startsWith('COD_SMS_')
    ? error.code
    : 'COD_SMS_SCORING_FAILED';
  const knownMessage = knownCode === 'COD_SMS_SCORING_FAILED'
    ? 'Chấm điểm SMS thất bại do lỗi kỹ thuật.'
    : String(error.message || 'Chấm điểm SMS thất bại do lỗi kỹ thuật.').slice(0, 500);
  return { errorCode: knownCode.slice(0, 100), errorMessage: knownMessage };
}

function completionValues(result, status, modelCalled, scoredAt) {
  return {
    status,
    smsScore: result.smsScore,
    confidence: result.confidence,
    detectedPatterns: result.detectedPatterns,
    evidence: result.evidence,
    explanation: result.explanation,
    modelCalled,
    scoredAt,
    errorCode: null,
    errorMessage: null
  };
}

export function serializeAssessment(row, options = {}) {
  const includeEvidence = options.includeEvidence === true;
  // Regular (non-Dev-Admin) users must only ever learn the bare suspicion
  // score/status — never the scoring method (raw SMS evidence, AI
  // explanation, model name, rubric version, technical error detail).
  // Defaults to true so internal callers (dev-only batch runs, etc.) keep
  // getting the full payload unless they opt out explicitly.
  const includeDetails = options.includeDetails !== false;
  const evidenceCount = Array.isArray(row.evidence) ? row.evidence.length : 0;
  return {
    key: {
      suspicionType: row.suspicion_type,
      driverId: row.driver_id,
      orderCode: row.order_code
    },
    status: row.status,
    smsScore: row.sms_score,
    confidence: includeDetails ? row.confidence : null,
    detectedPatterns: includeDetails ? (row.detected_patterns ?? []) : [],
    evidence: includeEvidence ? (row.evidence ?? []) : null,
    evidenceRestricted: !includeEvidence && (evidenceCount > 0 || row.status === 'scored'),
    explanation: includeDetails ? row.explanation : null,
    rubricVersion: includeDetails ? row.rubric_version : null,
    model: includeDetails ? row.model : null,
    modelCalled: includeDetails ? row.model_called : null,
    sourceFingerprint: includeDetails ? row.source_fingerprint : null,
    scoredAt: row.scored_at,
    technicalError: includeDetails && row.error_code
      ? { code: row.error_code, message: row.error_message }
      : null,
    attemptCount: row.attempt_count,
    updatedAt: row.updated_at
  };
}

export function serializeRun(row) {
  return {
    id: row.id,
    trigger: row.trigger,
    mode: row.mode,
    status: row.status,
    triggeredByEmail: row.triggered_by_email,
    model: row.model,
    rubricVersion: row.rubric_version,
    force: row.force,
    summary: {
      found: row.found,
      claimed: row.claimed,
      scored: row.scored,
      noEvidence: row.no_evidence,
      failed: row.failed,
      skippedUnchanged: row.skipped_unchanged
    },
    error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

export function serializeRunItem(row) {
  return {
    key: {
      suspicionType: row.suspicion_type,
      driverId: row.driver_id,
      orderCode: row.order_code
    },
    outcome: row.outcome,
    smsScore: row.sms_score,
    modelCalled: row.model_called,
    technicalError: row.error_code ? { code: row.error_code, message: row.error_message } : null,
    createdAt: row.created_at
  };
}

/**
 * Open a run log row, execute `work(runId)`, then close it with the totals
 * `work` returns. The log is diagnostic only: failing to write it must never
 * block or fail scoring, so every log write here is best-effort.
 */
export async function withLoggedRun(repository, meta, work) {
  let runId = null;
  if (typeof repository.createRun === 'function') {
    try {
      runId = await repository.createRun(meta);
    } catch (error) {
      console.error('[cod-sms] could not create run log', { code: error?.code });
    }
  }
  const finish = async values => {
    if (!runId) return;
    try {
      await repository.finishRun(runId, values);
    } catch (error) {
      console.error('[cod-sms] could not finalize run log', { runId, code: error?.code });
    }
  };
  try {
    const result = await work(runId);
    const totals = result?.summary ?? result;
    await finish({ status: totals?.aborted ? 'aborted' : 'completed', totals });
    return { runId, result };
  } catch (error) {
    await finish({
      status: 'failed',
      errorCode: typeof error?.code === 'string' ? error.code : 'COD_SMS_RUN_FAILED',
      errorMessage: error?.message || 'Batch SMS thất bại.'
    });
    throw error;
  }
}

export async function runAssessmentBatch(params, dependencies = {}) {
  const {
    repository,
    config,
    limit,
    offset = 0,
    cases = [],
    force = false,
    runId = null,
    signal,
    onProgress
  } = params;
  const score = dependencies.scoreSource ?? scoreSmsSource;
  const logItem = async (assessment, outcome) => {
    if (!runId || typeof repository.recordRunItem !== 'function') return;
    try {
      await repository.recordRunItem(runId, assessment, { outcome });
    } catch (error) {
      console.error('[cod-sms] could not record run item', {
        runId,
        orderCode: assessment?.order_code,
        code: error?.code
      });
    }
  };
  const sources = await repository.loadSources({ limit, offset, cases });
  const rows = [];
  const summary = {
    requested: cases.length || limit,
    found: sources.length,
    claimed: 0,
    scored: 0,
    noEvidence: 0,
    failed: 0,
    skippedUnchanged: 0,
    aborted: false
  };
  const emitProgress = () => {
    onProgress?.({ processed: rows.length, total: sources.length, summary: { ...summary } });
  };

  for (const source of sources) {
    if (signal?.aborted) {
      // A per-order write (claim/complete) is committed individually, so
      // stopping here loses nothing already scored — it just stops claiming
      // new rows. The response still completes normally (no throw) with
      // whatever was done so far.
      summary.aborted = true;
      break;
    }
    const fingerprint = computeSourceFingerprint(source);
    const claim = await repository.claim(source, {
      fingerprint,
      rubricVersion: config.rubricVersion,
      model: config.model,
      force,
      staleAfterSeconds: config.pendingStaleSeconds
    });
    if (!claim.claimed) {
      summary.skippedUnchanged += 1;
      rows.push(claim.assessment);
      await logItem(claim.assessment, 'skipped_unchanged');
      emitProgress();
      continue;
    }

    summary.claimed += 1;
    const scoredAt = new Date().toISOString();
    if (!source.messages.length) {
      const completed = await repository.complete(claim.assessment.id, claim.run_token, completionValues({
        smsScore: 0,
        confidence: 'khong_co_bang_chung',
        detectedPatterns: [],
        evidence: [],
        explanation: 'Không có SMS trong snapshot; kết quả này không phải kết luận đơn không vi phạm.'
      }, 'no_evidence', false, scoredAt));
      summary.noEvidence += 1;
      rows.push(completed);
      await logItem(completed, 'no_evidence');
      emitProgress();
      continue;
    }

    try {
      const result = await score(source, config, { signal });
      const status = result.smsScore === 0 ? 'no_evidence' : 'scored';
      const completed = await repository.complete(
        claim.assessment.id,
        claim.run_token,
        completionValues(result, status, true, scoredAt)
      );
      summary[status === 'scored' ? 'scored' : 'noEvidence'] += 1;
      rows.push(completed);
      await logItem(completed, status);
    } catch (error) {
      const failure = technicalFailure(error);
      const completed = await repository.complete(claim.assessment.id, claim.run_token, {
        status: 'failed',
        smsScore: null,
        confidence: null,
        detectedPatterns: [],
        evidence: [],
        explanation: null,
        modelCalled: true,
        scoredAt,
        ...failure
      });
      summary.failed += 1;
      rows.push(completed);
      await logItem(completed, 'failed');
    }
    emitProgress();
  }

  return { summary, rows };
}
