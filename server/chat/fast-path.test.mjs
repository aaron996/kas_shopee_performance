import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeFastPath,
  formatDeterministicKpiResponse,
  isFastPathEligible,
  isSafeMetricResult,
  shiftDate
} from './fast-path.js';

test('shiftDate shifts UTC calendar days across month boundaries', () => {
  assert.equal(shiftDate('2026-09-08', -6), '2026-09-02');
  assert.equal(shiftDate('2026-09-01', -1), '2026-08-31');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29'); // Leap year 2024
});

test('isFastPathEligible accepts valid structured KPI queries', () => {
  const request = {
    question: 'Xem ODR, SPB, dữ liệu mới nhất.',
    query: { metric: 'odr', client: 'SPB', dateMode: 'latest', dateFrom: null, dateTo: null }
  };
  assert.equal(isFastPathEligible(request), true);

  const customReq = {
    question: 'Xem P1ST, SPE, 01/09/2026–07/09/2026.',
    query: { metric: 'p1st', client: 'SPE', dateMode: 'custom', dateFrom: '2026-09-01', dateTo: '2026-09-07' }
  };
  assert.equal(isFastPathEligible(customReq), true);
});

test('isFastPathEligible rejects missing, incomplete or non-fastpath queries', () => {
  assert.equal(isFastPathEligible({ question: 'Hôm nay thế nào?', query: null }), false);
  assert.equal(isFastPathEligible({ question: 'Xem ODR', query: { metric: 'odr', client: null } }), false);
  assert.equal(isFastPathEligible({ question: 'Xem ODR', query: { metric: 'odr', client: 'SPB', dateMode: 'custom', dateFrom: null, dateTo: null } }), false);

  // Questions targeting region, hub, lane, ca 1 or leadtime stay in agent pipeline
  assert.equal(isFastPathEligible({
    question: 'So sánh ODR SPB giữa các vùng miền',
    query: { metric: 'odr', client: 'SPB', dateMode: 'latest', dateFrom: null, dateTo: null }
  }), false);

  assert.equal(isFastPathEligible({
    question: 'ODR hub Tân Bình là bao nhiêu?',
    query: { metric: 'odr', client: 'SPB', dateMode: 'latest', dateFrom: null, dateTo: null }
  }), false);

  assert.equal(isFastPathEligible({
    question: 'Tỷ lệ ca 1 hôm nay',
    query: { metric: 'odr', client: 'SPB', dateMode: 'latest', dateFrom: null, dateTo: null }
  }), false);
});

test('isSafeMetricResult validates expected RPC shapes and rejects unknown shapes', () => {
  assert.equal(isSafeMetricResult(null), false);
  assert.equal(isSafeMetricResult({}), false);
  assert.equal(isSafeMetricResult({ data: { rows: 'not an array' } }), false);
  assert.equal(isSafeMetricResult({ data: { rows: [] } }), true);
  assert.equal(isSafeMetricResult({
    data: { rows: [{ entity: 'Toàn quốc', value: 95.2, volume: 1000, ontime: 952 }] }
  }), true);
  assert.equal(isSafeMetricResult({
    data: { rows: [{ unexpected_field: 123 }] }
  }), false);
});

test('formatDeterministicKpiResponse generates structured Vietnamese report', () => {
  const text = formatDeterministicKpiResponse({
    metric: 'odr',
    client: 'SPB',
    dateFrom: '2026-09-01',
    dateTo: '2026-09-07',
    dataAsOf: '2026-09-07',
    syncedAt: '2026-09-08T03:15:00Z',
    evidenceId: 'db_test123',
    row: { entity: 'Toàn quốc', value: 95.42, ontime: 95420, volume: 100000 }
  });

  assert.match(text, /Chỉ số.*ODR/);
  assert.match(text, /Khách hàng.*SPB/);
  assert.match(text, /Thời gian.*01\/09\/2026 – 07\/09\/2026/);
  assert.match(text, /Kết quả.*\*\*95\.42%\*\* \(95\.420 \/ 100\.000 đơn đúng hạn\)/);
  assert.match(text, /Dữ liệu tính đến \(dataAsOf\).*07\/09\/2026/);
  assert.match(text, /Thời điểm đồng bộ.*08\/09\/2026/);
  assert.match(text, /Evidence ID.*`db_test123`/);
});

test('fast path: latest query resolves dataAsOf and queries exactly dataAsOf', async () => {
  const rpcCalls = [];
  const fakeUserClient = {};
  const callRpc = async (_client, rpcName, params) => {
    rpcCalls.push({ rpcName, params });
    if (rpcName === 'get_ai_chat_coverage') {
      return {
        evidenceId: 'db_cov_1',
        data: { dataAsOf: '2026-09-08', syncedAt: '2026-09-08T04:00:00Z', client: 'SPB', dataset: 'deli' }
      };
    }
    return {
      evidenceId: 'db_metric_1',
      data: {
        metric: 'odr',
        dataAsOf: '2026-09-08',
        syncedAt: '2026-09-08T04:00:00Z',
        scope: { client: 'SPB', dateFrom: '2026-09-08', dateTo: '2026-09-08', grain: 'nationwide' },
        rows: [{ entity: 'Toàn quốc', value: 96.5, volume: 1000, ontime: 965 }]
      }
    };
  };

  const deltas = [];
  const sources = [];
  const statuses = [];

  const request = {
    question: 'Xem ODR, SPB, dữ liệu mới nhất.',
    query: { metric: 'odr', client: 'SPB', dateMode: 'latest', dateFrom: null, dateTo: null }
  };

  const result = await executeFastPath({
    request,
    userClient: fakeUserClient,
    onStatus: s => statuses.push(s),
    onText: d => deltas.push(d),
    onSource: src => sources.push(src)
  }, { callRpc });

  assert.equal(rpcCalls.length, 2);
  assert.equal(rpcCalls[0].rpcName, 'get_ai_chat_coverage');
  assert.equal(rpcCalls[0].params.p_dataset, 'deli');
  assert.equal(rpcCalls[0].params.p_client, 'SPB');

  assert.equal(rpcCalls[1].rpcName, 'get_ai_chat_metric');
  assert.equal(rpcCalls[1].params.p_date_from, '2026-09-08');
  assert.equal(rpcCalls[1].params.p_date_to, '2026-09-08');
  assert.equal(rpcCalls[1].params.p_grain, 'nationwide');

  assert.equal(result.actualMicrousd, 0);
  assert.deepEqual(result.usage, []);
  assert.deepEqual(result.toolNames, ['get_data_coverage', 'get_metric_summary']);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].tool, 'get_data_coverage');
  assert.equal(sources[1].tool, 'get_metric_summary');
  assert.match(deltas.join(''), /96\.5%/);
});

test('fast path: trailing_7d query resolves dataAsOf and computes exact 7 days range', async () => {
  const rpcCalls = [];
  const callRpc = async (_client, rpcName, params) => {
    rpcCalls.push({ rpcName, params });
    if (rpcName === 'get_ai_chat_coverage') {
      return {
        evidenceId: 'db_cov_2',
        data: { dataAsOf: '2026-09-08', syncedAt: '2026-09-08T04:00:00Z', client: 'SPE', dataset: 'pick' }
      };
    }
    return {
      evidenceId: 'db_metric_2',
      data: {
        metric: 'p1st',
        dataAsOf: '2026-09-08',
        scope: { client: 'SPE', dateFrom: '2026-09-02', dateTo: '2026-09-08', grain: 'nationwide' },
        rows: [{ entity: 'Toàn quốc', value: 98.1, volume: 5000, ontime: 4905 }]
      }
    };
  };

  const request = {
    question: 'Xem P1ST, SPE, 7 ngày dữ liệu gần nhất.',
    query: { metric: 'p1st', client: 'SPE', dateMode: 'trailing_7d', dateFrom: null, dateTo: null }
  };

  const result = await executeFastPath({
    request,
    userClient: {},
    onStatus: () => {},
    onText: () => {},
    onSource: () => {}
  }, { callRpc });

  assert.equal(rpcCalls.length, 2);
  assert.equal(rpcCalls[1].params.p_date_from, '2026-09-02');
  assert.equal(rpcCalls[1].params.p_date_to, '2026-09-08');
  assert.equal(result.actualMicrousd, 0);
});

test('fast path: custom query preserves exact dateFrom and dateTo chosen by user', async () => {
  const rpcCalls = [];
  const callRpc = async (_client, rpcName, params) => {
    rpcCalls.push({ rpcName, params });
    return {
      evidenceId: 'db_metric_3',
      data: {
        metric: 'opr',
        dataAsOf: '2026-08-15',
        scope: { client: 'ALL', dateFrom: '2026-08-01', dateTo: '2026-08-15', grain: 'nationwide' },
        rows: [{ entity: 'Toàn quốc', value: 92.0, volume: 2000, ontime: 1840 }]
      }
    };
  };

  const request = {
    question: 'Xem OPR, Toàn bộ, 01/08/2026–15/08/2026.',
    query: { metric: 'opr', client: 'ALL', dateMode: 'custom', dateFrom: '2026-08-01', dateTo: '2026-08-15' }
  };

  const result = await executeFastPath({
    request,
    userClient: {},
    onStatus: () => {},
    onText: () => {},
    onSource: () => {}
  }, { callRpc });

  // Custom query does not need get_data_coverage
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].rpcName, 'get_ai_chat_metric');
  assert.equal(rpcCalls[0].params.p_date_from, '2026-08-01');
  assert.equal(rpcCalls[0].params.p_date_to, '2026-08-15');
  assert.deepEqual(result.toolNames, ['get_metric_summary']);
});

test('fast path: returns null to fallback to agent when metric RPC shape is unsafe', async () => {
  const callRpc = async () => ({
    evidenceId: 'db_weird',
    data: { unexpectedStructure: true } // rows is missing!
  });

  const request = {
    question: 'Xem ODR, SPB, 01/09/2026–07/09/2026.',
    query: { metric: 'odr', client: 'SPB', dateMode: 'custom', dateFrom: '2026-09-01', dateTo: '2026-09-07' }
  };

  const result = await executeFastPath({
    request,
    userClient: {},
    onStatus: () => {},
    onText: () => {},
    onSource: () => {}
  }, { callRpc });

  assert.equal(result, null);
});
