import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricQuestion, initialMetricQuery, summarizeMetricQuery, validateMetricQuery } from './chatQuery.js';

test('initialMetricQuery keeps resolved slots and leaves missing slots empty', () => {
  assert.deepEqual(initialMetricQuery({ query: { metric: 'opr', client: null, dateMode: null } }), {
    metric: 'opr', client: null, dateMode: null, dateFrom: null, dateTo: null
  });
});

test('validateMetricQuery requires metric, client and an explicit date choice', () => {
  assert.equal(validateMetricQuery({ metric: 'opr', client: null, dateMode: null }), 'Chọn phạm vi.');
  assert.equal(validateMetricQuery({ metric: 'opr', client: 'SPE', dateMode: null }), 'Chọn thời gian.');
  assert.equal(validateMetricQuery({ metric: 'opr', client: 'SPE', dateMode: 'latest' }), null);
});

test('custom ranges are validated and summarized for the visible history', () => {
  const query = { metric: 'odr', client: 'ALL', dateMode: 'custom', dateFrom: '2026-09-01', dateTo: '2026-09-07' };
  assert.equal(validateMetricQuery(query), null);
  assert.equal(summarizeMetricQuery(query), 'ODR · Toàn bộ · 01/09/2026–07/09/2026');
  assert.equal(buildMetricQuestion(query).question, 'Xem ODR, Toàn bộ, 01/09/2026–07/09/2026.');
});

test('custom range rejects reversed and overly long ranges', () => {
  assert.equal(validateMetricQuery({ metric: 'p1st', client: 'SPB', dateMode: 'custom', dateFrom: '2026-09-08', dateTo: '2026-09-01' }), 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  assert.equal(validateMetricQuery({ metric: 'p1st', client: 'SPB', dateMode: 'custom', dateFrom: '2026-01-01', dateTo: '2026-09-01' }), 'Mỗi lần chỉ xem tối đa 90 ngày.');
});

