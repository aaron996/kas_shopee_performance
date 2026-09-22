import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runAssessmentBatch } from './service.js';

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

function makeMemoryRepository(source) {
  let current = null;
  let nextId = 1;
  return {
    async loadSources() {
      return [source];
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

function makeMultiSourceRepository(sources) {
  const byOrder = new Map();
  let nextId = 1;
  return {
    async loadSources() {
      return sources;
    },
    async claim(source, claim) {
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
