import { createClient } from '@supabase/supabase-js';
import { ChatError, toPublicError } from '../chat/errors.js';
import { sendJson } from '../chat/sse.js';
import { readCodSmsConfig, resolveCodSmsModelConfig } from './config.js';
import { createCodSmsRepository, runAssessmentBatch, withLoggedRun } from './service.js';
import { createDispatchRepository, readDispatchId } from './schedule.js';

// Safety cap on how many pages a single cron run will walk through the
// source table. At the default maxBatchLimit (<=500/page) this still covers
// up to 10k source rows in one run; it exists only to bound worst-case
// duration/cost if the table grows far beyond what today's daily run expects.
const MAX_PAGES_PER_RUN = 20;

export function verifyCronSecret(authHeader, expectedSecret) {
  if (!expectedSecret) {
    throw new ChatError('COD_SMS_CRON_CONFIG_MISSING', 'Secret của scheduler SMS chưa được cấu hình.', 503);
  }
  if (authHeader !== `Bearer ${expectedSecret}`) {
    throw new ChatError('COD_SMS_CRON_UNAUTHORIZED', 'Không có quyền gọi cron job SMS.', 401);
  }
}

function createServiceOnlyClient(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

/**
 * Walk the entire kas_cod_suspicion_data source table page by page and claim
 * every row that is new, stale, or previously failed (the claim RPC caps
 * failed-row retries at 5 attempts on its own, see the
 * cod_suspicion_sms_reclaim_failed migration). Rows already scored with an
 * unchanged fingerprint are skipped by repository.claim() without calling
 * the model, so re-running this does not re-bill unchanged orders. Shared by
 * both the daily cron job and the Dev Admin manual-run button so they behave
 * identically.
 */
export async function sweepCodSmsSources({ repository, config, force = false, runBatch = runAssessmentBatch, maxPages = MAX_PAGES_PER_RUN, runId = null, signal, onProgress }) {
  // Reserve enough time to finish the current model request and persist it.
  const stopAt = Date.now() + Math.max(1000, 210000 - (config.modelTimeoutMs ?? 30000));
  const totals = {
    pages: 0,
    requested: 0,
    found: 0,
    claimed: 0,
    scored: 0,
    noEvidence: 0,
    failed: 0,
    skippedUnchanged: 0,
    aborted: false
  };

  let offset = 0;
  const limit = config.maxBatchLimit;

  while (totals.pages < maxPages) {
    if (signal?.aborted) {
      totals.aborted = true;
      break;
    }
    const result = await runBatch({
      repository,
      config,
      limit,
      offset,
      cases: [],
      force,
      runId,
      signal,
      shouldStop: () => Date.now() >= stopAt,
      onProgress: onProgress
        ? update => onProgress({ ...update, page: totals.pages + 1, pages: totals.pages, totals: { ...totals } })
        : undefined
    });
    totals.pages += 1;
    totals.requested += result.summary.requested;
    totals.found += result.summary.found;
    totals.claimed += result.summary.claimed;
    totals.scored += result.summary.scored;
    totals.noEvidence += result.summary.noEvidence;
    totals.failed += result.summary.failed;
    totals.skippedUnchanged += result.summary.skippedUnchanged;

    if (result.summary.aborted) {
      totals.aborted = true;
      break;
    }
    if (result.summary.found < limit) break;
    offset += limit;
  }

  return totals;
}

/** One leased slice of the frozen daily case list. Progress is committed by
 * the run-item trigger, so the next HTTP invocation only sees unfinished keys. */
export async function runCodSmsDispatchChunk(dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const env = dependencies.env ?? process.env;
  let config = (dependencies.readConfig ?? readCodSmsConfig)(env, { requireScoring: true });
  const client = (dependencies.createServiceClient ?? createServiceOnlyClient)(config);
  const repository = (dependencies.createRepository ?? createCodSmsRepository)(client);
  config = { ...config, ...await (dependencies.resolveModelConfig ?? resolveCodSmsModelConfig)(client, env) };
  const { dispatchRepository, dispatchId, leaseToken, signal } = dependencies;
  const prepared = await dispatchRepository.prepare(dispatchId, leaseToken, config);
  config = { ...config, ...prepared.config };
  const shouldStop = () => signal?.aborted || now() - startedAt >= 210000 - config.modelTimeoutMs;
  while (!shouldStop()) {
    const cases = await dispatchRepository.nextCases(dispatchId, leaseToken);
    if (!cases.length) break;
    const result = await (dependencies.runBatch ?? runAssessmentBatch)({
      repository, config, cases, limit: cases.length, force: false,
      runId: prepared.runId, signal, shouldStop, durable: true
    });
    // A snapshot sync can remove a frozen key from the current eligible scope.
    // Acknowledge that key without calling AI or touching source/assessment data.
    const found = new Set(result.rows.map(row => `${row.suspicion_type}\0${row.driver_id}\0${row.order_code}`));
    if (!result.summary.aborted && !result.summary.deferred && result.summary.found < cases.length) {
      await repository.recordRunItems(prepared.runId, cases.filter(item => !found.has(`${item.suspicionType}\0${item.driverId}\0${item.orderCode}`))
        .map(item => ({ outcome: 'skipped_unchanged', assessment: {
          suspicion_type: item.suspicionType, driver_id: item.driverId, order_code: item.orderCode
        } })));
    }
    if (result.summary.aborted || result.summary.deferred) break;
  }
}

export async function runDailyCodSmsBatch(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? readCodSmsConfig;
  const makeServiceClient = dependencies.createServiceClient ?? createServiceOnlyClient;
  const makeRepository = dependencies.createRepository ?? createCodSmsRepository;
  const resolveModelConfig = dependencies.resolveModelConfig ?? resolveCodSmsModelConfig;

  const env = dependencies.env ?? process.env;
  let config = getConfig(env, { requireScoring: true });
  const serviceClient = makeServiceClient(config);
  const repository = makeRepository(serviceClient);
  const modelOverride = await resolveModelConfig(serviceClient, env);
  config = { ...config, ...modelOverride };

  const { result } = await withLoggedRun(repository, {
    trigger: 'cron',
    mode: 'sweep',
    model: config.model,
    rubricVersion: config.rubricVersion,
    force: false
  }, runId => sweepCodSmsSources({
    repository,
    config,
    force: false,
    runBatch: dependencies.runBatch,
    maxPages: dependencies.maxPages,
    runId,
    signal: dependencies.signal
  }));
  return result;
}

export function createCodSmsCronHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const cronSecret = dependencies.cronSecret ?? env.COD_SMS_SCHEDULER_SECRET ?? env.CRON_SECRET;
  const runDailyBatch = dependencies.runDailyBatch ?? runCodSmsDispatchChunk;
  const makeDispatchRepository = dependencies.createDispatchRepository ?? createDispatchRepository;

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, {
        error: { code: 'COD_SMS_CRON_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ GET và POST.' }
      });
      return;
    }

    let dispatchId;
    let dispatchRepository;
    let leaseToken = null;
    try {
      verifyCronSecret(req.headers.authorization, cronSecret);
      dispatchId = readDispatchId(req.body);
      dispatchRepository = makeDispatchRepository(dependencies.env ?? process.env);
      leaseToken = await dispatchRepository.claim(dispatchId);
      if (!leaseToken) {
        sendJson(res, 200, { contractVersion: '1', cron: true, skipped: 'dispatch_already_claimed_or_expired' });
        return;
      }

      const controller = new AbortController();
      res.on?.('close', () => {
        if (!res.writableEnded) controller.abort(new Error('Client disconnected'));
      });

      await runDailyBatch({
        dispatchId,
        leaseToken,
        dispatchRepository,
        signal: controller.signal,
        env: dependencies.env,
        readConfig: dependencies.readConfig,
        createServiceClient: dependencies.createServiceClient,
        createRepository: dependencies.createRepository,
        resolveModelConfig: dependencies.resolveModelConfig,
        runBatch: dependencies.runBatch,
        maxPages: dependencies.maxPages
      });
      const result = await dispatchRepository.finish(dispatchId, leaseToken);
      sendJson(res, 200, { contractVersion: '1', cron: true, ...result });
    } catch (error) {
      const failure = toPublicError(error);
      if (leaseToken) {
        try { await dispatchRepository.finish(dispatchId, leaseToken, failure.code); }
        catch { console.error('COD_SMS_DISPATCH_LOG_FAILED', dispatchId); }
      }
      sendJson(res, failure.status, { error: { code: failure.code, message: failure.message } });
    }
  };
}
