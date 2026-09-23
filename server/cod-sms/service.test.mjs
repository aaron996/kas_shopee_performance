import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runAssessmentBatch, withLoggedRun } from './service.js';
import { computeSourceFingerprint } from './scorer.js';

const config = {
  model: 'gpt-5.6-luna',
  rubricVersion: 'sms-rubric-2026-09-19-v1',
  pendingStaleSeconds: 900
};

function makeSource(messages) {
  return {
    suspicionType: 'Gối đầu COD',
    driverId: 'driver-1',
    orderCode: 'ORDER-1',
    driverName: 'Nguyễn Văn A',
    codAmount: 100000,
    messages,
    otherOrderSequences: []
  };
}

function rowKey(row) {
  return `${row.suspicion_type}\u0000${row.driver_id}\u0000${row.order_code}`;
}

function makeMemoryRepository(source) {
  let current = null;
  let nextId = 1;
  return {
    async loadSources() {
      return [source];
    },
    async loadAssessments() {
      return current ? new Map([[rowKey(current), current]]) : new Map();
    },
    async claim(_source, claim) {
      const unchanged = current
        && current.source_fingerprint === claim.fingerprint
        && current.rubric_version === claim.rubricVersion
        && current.model === claim.model
        && ['scored', 'no_evidence'].includes(current.status)
        && !claim.force;
      if (unchanged) return { claimed: false, assessment: current, run_token: null };
      current = {
        id: `assessment-${nextId++}`,
        suspicion_type: source.suspicionType,
        driver_id: source.driverId,
        order_code: source.orderCode,
        status: 'pending',
        rubric_version: claim.rubricVersion,
        model: claim.model,
        source_fingerprint: claim.fingerprint,
        run_token: 'run-1',
        attempt_count: 1
      };
      return { claimed: true, assessment: current, run_token: 'run-1' };
    },
    async complete(_id, _runToken, values) {
      current = {
        ...current,
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
      return current;
    }
  };
}

test('no-SMS case stores no_evidence without calling the model', async () => {
  const repository = makeMemoryRepository(makeSource([]));
  let modelCalls = 0;
  const result = await runAssessmentBatch({
    repository,
    config,
    limit: 1
  }, {
    scoreSource: async () => {
      modelCalls += 1;
      throw new Error('model must not be called');
    }
  });

  assert.equal(modelCalls, 0);
  assert.equal(result.summary.noEvidence, 1);
  assert.equal(result.rows[0].status, 'no_evidence');
  assert.equal(result.rows[0].model_called, false);
});

test('unchanged source fingerprint skips a second model call', async () => {
  const repository = makeMemoryRepository(makeSource([{
    smsTime: '2026-08-14T03:28:17',
    recipientType: 'NN',
    content: '123456789 Tech Nguyễn Văn A'
  }]));
  let modelCalls = 0;
  const scoreSource = async () => {
    modelCalls += 1;
    return {
      smsScore: 5,
      confidence: 'cao',
      detectedPatterns: ['mau_1'],
      evidence: ['123456789 Tech Nguyễn Văn A'],
      explanation: 'Có tín hiệu tài khoản khớp tên tài xế.'
    };
  };

  const first = await runAssessmentBatch({ repository, config, limit: 1 }, { scoreSource });
  const second = await runAssessmentBatch({ repository, config, limit: 1 }, { scoreSource });

  assert.equal(first.summary.scored, 1);
  assert.equal(second.summary.skippedUnchanged, 1);
  assert.equal(modelCalls, 1);
});

function makeMultiSourceRepository(sources, existing = []) {
  const byOrder = new Map();
  let nextId = 1;
  return {
    claimedOrders: [],
    async loadSources() {
      return sources;
    },
    async loadAssessments() {
      return new Map(existing.map(row => [rowKey(row), row]));
    },
    async claim(source, claim) {
      this.claimedOrders.push(source.orderCode);
      const assessment = {
        id: `assessment-${nextId++}`,
        suspicion_type: source.suspicionType,
        driver_id: source.driverId,
        order_code: source.orderCode,
        status: 'pending',
        rubric_version: claim.rubricVersion,
        model: claim.model,
        source_fingerprint: claim.fingerprint,
        run_token: 'run-1',
        attempt_count: 1
      };
      byOrder.set(source.orderCode, assessment);
      return { claimed: true, assessment, run_token: 'run-1' };
    },
    async complete(id, _runToken, values) {
      const current = [...byOrder.values()].find(a => a.id === id);
      Object.assign(current, {
        status: values.status,
        sms_score: values.smsScore,
        model_called: values.modelCalled,
        scored_at: values.scoredAt
      });
      return current;
    }
  };
}

test('SMS without a bank-account candidate stores no_evidence without calling the model', async () => {
  const repository = makeMemoryRepository(makeSource([
    {
      smsTime: '2026-09-13T13:37:00',
      recipientType: 'NN',
      content: 'Quy khach da hen giao lai don hang GYY4CGUD vao ngay 15-09-2026.'
    },
    { smsTime: '2026-09-13T13:40:00', recipientType: 'NN', content: 'Vietcombank' },
    { smsTime: '2026-09-13T13:41:00', recipientType: 'NN', content: '0181002719005' }
  ]));
  const result = await runAssessmentBatch({ repository, config, limit: 1 }, {
    scoreSource: async () => { throw new Error('model must not be called'); }
  });

  assert.equal(result.summary.noEvidence, 1);
  assert.equal(result.rows[0].status, 'no_evidence');
  assert.equal(result.rows[0].model_called, false);
});

test('bulk-read unchanged orders skip the claim RPC and are logged in one insert', async () => {
  const source = orderCode => ({ ...makeSource([]), orderCode });
  const sources = ['SCORED', 'FRESH-PENDING', 'STALE-PENDING', 'FAILED-RETRY', 'FAILED-CAPPED', 'NEW']
    .map(source);
  const fingerprint = sources.map(item => computeSourceFingerprint(item));
  const existingRow = (index, fields) => ({
    id: `existing-${index}`,
    suspicion_type: 'Gối đầu COD',
    driver_id: 'driver-1',
    order_code: sources[index].orderCode,
    source_fingerprint: fingerprint[index],
    rubric_version: config.rubricVersion,
    model: config.model,
    updated_at: new Date().toISOString(),
    attempt_count: 1,
    ...fields
  });
  const repository = makeMultiSourceRepository(sources, [
    existingRow(0, { status: 'scored', sms_score: 5 }),
    existingRow(1, { status: 'pending' }),
    existingRow(2, { status: 'pending', updated_at: new Date(Date.now() - 3600_000).toISOString() }),
    existingRow(3, { status: 'failed', attempt_count: 4 }),
    existingRow(4, { status: 'failed', attempt_count: 5 })
  ]);
  const inserts = [];
  repository.recordRunItems = async (_runId, items) => {
    inserts.push(items.map(item => [item.assessment.order_code, item.outcome]));
  };

  const result = await runAssessmentBatch({ repository, config, limit: 6, runId: 'run-x' }, {});

  assert.deepEqual(repository.claimedOrders, ['STALE-PENDING', 'FAILED-RETRY', 'NEW']);
  assert.equal(result.summary.skippedUnchanged, 3);
  assert.deepEqual(inserts[0], [
    ['SCORED', 'skipped_unchanged'],
    ['FRESH-PENDING', 'skipped_unchanged'],
    ['FAILED-CAPPED', 'skipped_unchanged']
  ]);
});

test('runAssessmentBatch reports processed/total progress after each order', async () => {
  const sources = [makeSource([]), makeSource([])];
  sources[0].orderCode = 'ORDER-1';
  sources[1].orderCode = 'ORDER-2';
  const repository = makeMultiSourceRepository(sources);
  const progressUpdates = [];

  const result = await runAssessmentBatch({
    repository,
    config,
    limit: 2,
    onProgress: update => progressUpdates.push(update)
  }, {});

  assert.equal(result.summary.noEvidence, 2);
  assert.equal(progressUpdates.length, 2);
  assert.deepEqual(progressUpdates.map(u => u.processed), [1, 2]);
  assert.equal(progressUpdates[0].total, 2);
});

test('runAssessmentBatch stops claiming new orders on abort but keeps already-scored rows (no throw)', async () => {
  const sources = [makeSource([]), makeSource([]), makeSource([])];
  sources[0].orderCode = 'ORDER-1';
  sources[1].orderCode = 'ORDER-2';
  sources[2].orderCode = 'ORDER-3';
  const repository = makeMultiSourceRepository(sources);
  const controller = new AbortController();

  const result = await runAssessmentBatch({
    repository,
    config,
    limit: 3,
    signal: controller.signal,
    onProgress: () => {
      // Abort after the first order finishes, before the second is claimed.
      if (!controller.signal.aborted) controller.abort();
    }
  }, {});

  assert.equal(result.summary.aborted, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.summary.noEvidence, 1);
});

test('migration keeps assessment data server-only and claim RPC security-invoker', async () => {
  const sql = await readFile(
    new URL('../../supabase/migrations/20260922074814_cod_suspicion_sms_assessments.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.cod_suspicion_sms_assessments\s+from public, anon, authenticated/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /COD_SMS_SERVICE_ROLE_REQUIRED/);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant (?:select|all)[^;]*to authenticated/i);
});

test('withLoggedRun records one item per order and closes the run with totals', async () => {
  const repository = makeMemoryRepository(makeSource([{
    smsTime: '2026-08-14T03:28:17',
    recipientType: 'NN',
    content: 'VP bank 249997803 Nguyễn Văn A'
  }]));
  const runs = [];
  const items = [];
  repository.createRun = async meta => {
    runs.push({ id: 'run-a', meta });
    return 'run-a';
  };
  repository.finishRun = async (id, values) => {
    runs.find(run => run.id === id).finished = values;
  };
  repository.recordRunItems = async (runId, batch) => {
    for (const { assessment, outcome } of batch) {
      items.push({ runId, orderCode: assessment.order_code, outcome, error: assessment.error_message });
    }
  };

  const { runId, result } = await withLoggedRun(repository, { trigger: 'manual', mode: 'cases' }, id =>
    runAssessmentBatch({ repository, config, limit: 1, runId: id }, {
      scoreSource: async () => {
        const error = new Error('Model trả về dữ liệu không đúng schema chấm điểm SMS (x).');
        error.code = 'COD_SMS_MODEL_SCHEMA_INVALID';
        throw error;
      }
    }));

  assert.equal(runId, 'run-a');
  assert.equal(result.summary.failed, 1);
  assert.deepEqual(items.map(item => [item.runId, item.orderCode, item.outcome]), [['run-a', 'ORDER-1', 'failed']]);
  assert.match(items[0].error, /\(x\)/);
  assert.equal(runs[0].finished.status, 'completed');
  assert.equal(runs[0].finished.totals.failed, 1);
});

test('run log write failures never break scoring', async () => {
  const repository = makeMemoryRepository(makeSource([]));
  repository.createRun = async () => { throw new Error('db down'); };
  repository.recordRunItems = async () => { throw new Error('must not be called without a run id'); };
  const originalError = console.error;
  console.error = () => {};
  try {
    const { runId, result } = await withLoggedRun(repository, { trigger: 'cron', mode: 'sweep' }, id =>
      runAssessmentBatch({ repository, config, limit: 1, runId: id }));
    assert.equal(runId, null);
    assert.equal(result.summary.noEvidence, 1);
  } finally {
    console.error = originalError;
  }
});

test('withLoggedRun marks the run failed and rethrows when the work throws', async () => {
  let finished = null;
  const repository = {
    createRun: async () => 'run-b',
    finishRun: async (_id, values) => { finished = values; }
  };
  const boom = Object.assign(new Error('Không thể đọc danh sách đơn COD.'), { code: 'COD_SMS_SOURCE_READ_FAILED' });
  await assert.rejects(withLoggedRun(repository, {}, async () => { throw boom; }), boom);
  assert.equal(finished.status, 'failed');
  assert.equal(finished.errorCode, 'COD_SMS_SOURCE_READ_FAILED');
});
