import test from 'node:test';
import assert from 'node:assert/strict';
import { canRetry, formatDataScope, formatDateVi, formatDateTimeVi } from './chatRetry.js';

test('canRetry allows retry when quota has remaining turns', () => {
  const failedRequest = {
    question: 'ODR SPB hôm nay?',
    query: null,
    displayQuestion: 'ODR SPB hôm nay?',
    isQuotaExceeded: false
  };

  assert.deepEqual(canRetry(failedRequest, { remainingTurns: 5, isUnlimited: false }), {
    allowed: true,
    reason: ''
  });

  assert.deepEqual(canRetry(failedRequest, { remainingTurns: 0, isUnlimited: true }), {
    allowed: true,
    reason: ''
  });
});

test('canRetry blocks retry when quota is exhausted', () => {
  const failedRequest = {
    question: 'ODR SPB hôm nay?',
    query: null,
    displayQuestion: 'ODR SPB hôm nay?',
    isQuotaExceeded: false
  };

  assert.deepEqual(canRetry(failedRequest, { remainingTurns: 0, isUnlimited: false }), {
    allowed: false,
    reason: 'Đã hết lượt truy vấn hôm nay.'
  });

  const quotaFailedRequest = {
    ...failedRequest,
    isQuotaExceeded: true
  };

  assert.deepEqual(canRetry(quotaFailedRequest, { remainingTurns: 10, isUnlimited: false }), {
    allowed: false,
    reason: 'Đã hết lượt truy vấn hôm nay.'
  });

  assert.deepEqual(canRetry(null, null), {
    allowed: false,
    reason: ''
  });
});

test('formatDateVi formats YYYY-MM-DD to DD/MM/YYYY', () => {
  assert.equal(formatDateVi('2026-09-08'), '08/09/2026');
  assert.equal(formatDateVi('invalid'), 'invalid');
  assert.equal(formatDateVi(''), '');
  assert.equal(formatDateVi(null), '');
});

test('formatDateTimeVi formats ISO timestamps gracefully', () => {
  const formatted = formatDateTimeVi('2026-09-08T03:15:00.000Z');
  assert.match(formatted, /\d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
  assert.equal(formatDateTimeVi(''), '');
  assert.equal(formatDateTimeVi(null), '');
});

test('formatDataScope extracts human-friendly data scope from source', () => {
  const source = {
    evidenceId: 'db_xyz123',
    tool: 'get_metric_summary',
    dataAsOf: '2026-09-07',
    syncedAt: '2026-09-08T03:15:00Z',
    scope: {
      client: 'SPB',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-07',
      grain: 'nationwide'
    }
  };

  const formatted = formatDataScope(source);
  assert.equal(formatted.evidenceId, 'db_xyz123');
  assert.equal(formatted.scopeDesc, 'SPB · Toàn quốc');
  assert.equal(formatted.dateRangeText, '01/09/2026 – 07/09/2026');
  assert.equal(formatted.dataAsOfText, '07/09/2026');
  assert.ok(formatted.syncedAtText);

  // Single day date range
  const singleDaySource = {
    ...source,
    scope: { ...source.scope, dateFrom: '2026-09-08', dateTo: '2026-09-08' }
  };
  assert.equal(formatDataScope(singleDaySource).dateRangeText, '08/09/2026');
});
