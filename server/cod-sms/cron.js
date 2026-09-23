import { createClient } from '@supabase/supabase-js';
import { ChatError, toPublicError } from '../chat/errors.js';
import { sendJson } from '../chat/sse.js';
import { readCodSmsConfig, resolveCodSmsModelConfig } from './config.js';
import { createCodSmsRepository, runAssessmentBatch, withLoggedRun } from './service.js';

// Safety cap on how many pages a single cron run will walk through the
// source table. At the default maxBatchLimit (<=500/page) this still covers
// up to 10k source rows in one run; it exists only to bound worst-case
// duration/cost if the table grows far beyond what today's daily run expects.
const MAX_PAGES_PER_RUN = 20;

export function verifyCronSecret(authHeader, expectedSecret) {
  if (!expectedSecret) {
    throw new ChatError('COD_SMS_CRON_CONFIG_MISSING', 'CRON_SECRET chưa được cấu hình.', 503);
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
  const cronSecret = dependencies.cronSecret ?? process.env.CRON_SECRET;
  const runDailyBatch = dependencies.runDailyBatch ?? runDailyCodSmsBatch;

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, {
        error: { code: 'COD_SMS_CRON_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ GET và POST.' }
      });
      return;
    }

    try {
      verifyCronSecret(req.headers.authorization, cronSecret);

      const controller = new AbortController();
      res.on?.('close', () => {
        if (!res.writableEnded) controller.abort(new Error('Client disconnected'));
      });

      const totals = await runDailyBatch({
        signal: controller.signal,
        env: dependencies.env,
        readConfig: dependencies.readConfig,
        createServiceClient: dependencies.createServiceClient,
        createRepository: dependencies.createRepository,
        runBatch: dependencies.runBatch,
        maxPages: dependencies.maxPages
      });

      sendJson(res, 200, { contractVersion: '1', cron: true, totals });
    } catch (error) {
      const failure = toPublicError(error);
      sendJson(res, failure.status, { error: { code: failure.code, message: failure.message } });
    }
  };
}
