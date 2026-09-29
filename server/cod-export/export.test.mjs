import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodSuspicionExportRows, EXPORT_HEADERS } from './build.js';
import { formatVietnamTimestamp, loadCodSuspicionExport, readCodExportConfig, verifyExportToken } from './service.js';
import { createCodSuspicionExportHandler } from '../../api/cod-suspicion-export.js';

const GOI = 'Gối đầu COD';
const RUT = 'Rút ruột';

function order(overrides) {
  return {
    suspicion_type: GOI,
    driver_id: 'D1',
    driver_name: 'Tài xế 1',
    order_code: 'O1',
    to_province: 'Hưng Yên',
    warehouse_id: '22671000',
    warehouse_name: '(TBI) Phụ Dực',
    cod_amount: '3772230',
    end_delivery_date: '2026-09-29',
    total_score: 10,
    ...overrides
  };
}

function scored(driverId, orderCode, smsScore, suspicionType = GOI) {
  return { suspicion_type: suspicionType, driver_id: driverId, order_code: orderCode, status: 'scored', sms_score: smsScore };
}

const codes = rows => rows.map(row => row[1]);

test('export rows follow the header layout with numeric COD and the driver level', () => {
  const rows = buildCodSuspicionExportRows({
    orders: [order({ total_score: 18 })],
    syncedAt: '2026-09-29 09:15:00'
  });
  assert.equal(rows[0].length, EXPORT_HEADERS.length);
  assert.deepEqual(rows[0], [
    GOI, 'O1', 'D1', 'Tài xế 1', 'Hưng Yên', '22671000', '(TBI) Phụ Dực',
    3772230, '2026-09-29', 'Cao', '2026-09-29 09:15:00'
  ]);
});

test('a Medium/High driver exports every snapshot order, including SQL Low ones', () => {
  const rows = buildCodSuspicionExportRows({
    orders: [
      order({ order_code: 'HIGH', total_score: 18 }),
      order({ order_code: 'LOW', total_score: 10 }),
      order({ driver_id: 'D2', order_code: 'ONLY_LOW', total_score: 14 })
    ]
  });
  assert.deepEqual(codes(rows).sort(), ['HIGH', 'LOW']);
});

test('any scored SMS order at the threshold lifts a Low driver to Medium; zero or unscored does not', () => {
  const orders = [
    order({ driver_id: 'D1', order_code: 'A', total_score: 10 }),
    order({ driver_id: 'D1', order_code: 'B', total_score: 12 }),
    order({ driver_id: 'D2', order_code: 'C', total_score: 12 }),
    order({ driver_id: 'D3', order_code: 'D', total_score: 12 })
  ];
  const rows = buildCodSuspicionExportRows({
    orders,
    assessments: [
      scored('D1', 'A', 1),
      scored('D2', 'C', 0),
      { suspicion_type: GOI, driver_id: 'D3', order_code: 'D', status: 'pending', sms_score: null }
    ],
    threshold: 1
  });
  assert.deepEqual(codes(rows).sort(), ['A', 'B']);
  assert.ok(rows.every(row => row[9] === 'Vừa'));
});

test('the configured threshold decides escalation and Medium becomes High', () => {
  const orders = [order({ order_code: 'M', total_score: 15 })];
  const below = buildCodSuspicionExportRows({ orders, assessments: [scored('D1', 'M', 2)], threshold: 3 });
  const at = buildCodSuspicionExportRows({ orders, assessments: [scored('D1', 'M', 3)], threshold: 3 });
  assert.equal(below[0][9], 'Vừa');
  assert.equal(at[0][9], 'Cao');
});

test('SMS scores only match the exact (type, driver, order) case', () => {
  const rows = buildCodSuspicionExportRows({
    orders: [order({ order_code: 'X', total_score: 10 })],
    assessments: [scored('D1', 'X', 9, RUT), scored('D9', 'X', 9)]
  });
  assert.equal(rows.length, 0);
});

test('non-violation conclusions remove the driver case of that type only', () => {
  const rows = buildCodSuspicionExportRows({
    orders: [
      order({ order_code: 'G', total_score: 18 }),
      order({ suspicion_type: RUT, order_code: 'R', total_score: 18 })
    ],
    nonViolationDrivers: [{ suspicion_type: GOI, driver_id: 'D1' }]
  });
  assert.deepEqual(rows.map(row => [row[0], row[1]]), [[RUT, 'R']]);
});

test('rows are unique per (type, order) and the higher-level driver wins', () => {
  const rows = buildCodSuspicionExportRows({
    orders: [
      order({ driver_id: 'D1', order_code: 'SAME', total_score: 15 }),
      order({ driver_id: 'D2', order_code: 'SAME', total_score: 18 }),
      order({ suspicion_type: RUT, driver_id: 'D1', order_code: 'SAME', total_score: 18 })
    ]
  });
  assert.equal(rows.length, 2);
  const goi = rows.find(row => row[0] === GOI);
  assert.equal(goi[2], 'D2');
  assert.equal(goi[9], 'Cao');
});

test('timestamps are written in Vietnam time', () => {
  assert.equal(formatVietnamTimestamp(new Date('2026-09-29T02:15:07Z')), '2026-09-29 09:15:07');
});

function fakeRepository({ orders = [], assessments = [], nonViolation = [], threshold = 1 } = {}) {
  return () => ({
    loadOrders: async () => orders,
    loadScoredAssessments: async () => assessments,
    loadNonViolationDrivers: async () => nonViolation,
    loadThreshold: async () => threshold,
    loadFreshness: async () => ({
      snapshotSyncedAt: '2026-09-29T01:45:00Z',
      lastSmsRun: { status: 'completed', startedAt: '2026-09-29T02:00:00Z', finishedAt: '2026-09-29T02:03:00Z' }
    })
  });
}

const config = { supabaseUrl: 'x', supabaseServiceRoleKey: 'x', apiToken: 'tok' };

test('loadCodSuspicionExport returns headers, rows and freshness for the Apps Script', async () => {
  const result = await loadCodSuspicionExport({
    config,
    serviceClient: {},
    createRepository: fakeRepository({
      orders: [order({ total_score: 18 }), order({ order_code: 'O2' }), order({ driver_id: 'D2', order_code: 'O3' })],
      threshold: 2
    }),
    now: new Date('2026-09-29T03:15:00Z')
  });
  assert.deepEqual(result.headers, EXPORT_HEADERS);
  assert.deepEqual(codes(result.rows), ['O1', 'O2']);
  assert.equal(result.exportedDrivers, 1);
  assert.equal(result.sourceOrders, 3);
  assert.equal(result.threshold, 2);
  assert.equal(result.generatedAt, '2026-09-29 10:15:00');
  assert.equal(result.lastSmsRun.status, 'completed');
  assert.ok(result.rows.every(row => row[10] === '2026-09-29 10:15:00'));
});

test('export config requires the API token and Supabase service credentials', () => {
  assert.throws(() => readCodExportConfig({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }), /COD_EXPORT_API_TOKEN/);
  assert.equal(readCodExportConfig({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', COD_EXPORT_API_TOKEN: ' t ' }).apiToken, 't');
});

test('export token must match the Bearer header exactly', () => {
  assert.doesNotThrow(() => verifyExportToken('Bearer tok', 'tok'));
  for (const header of [undefined, '', 'Bearer to', 'Bearer tokk', 'tok']) {
    assert.throws(() => verifyExportToken(header, 'tok'), error => error.code === 'COD_EXPORT_UNAUTHORIZED');
  }
});

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { this.headers[name] = value; },
    end(payload) { this.body = payload; this.writableEnded = true; }
  };
}

test('export endpoint rejects a wrong token before loading data', async () => {
  let loaded = false;
  const handler = createCodSuspicionExportHandler({
    readConfig: () => config,
    loadExport: async () => { loaded = true; return {}; }
  });
  const res = makeRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer nope' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(loaded, false);
});

test('export endpoint returns the contract for an authorized GET and hides internal errors', async () => {
  const ok = createCodSuspicionExportHandler({
    readConfig: () => config,
    loadExport: async () => ({ headers: ['a'], rows: [['1']] })
  });
  const res = makeRes();
  await ok({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { contractVersion: '1', headers: ['a'], rows: [['1']] });

  const broken = createCodSuspicionExportHandler({
    readConfig: () => config,
    loadExport: async () => { throw new Error('db password in message'); }
  });
  const failed = makeRes();
  const originalError = console.error;
  console.error = () => {};
  try {
    await broken({ method: 'GET', headers: { authorization: 'Bearer tok' } }, failed);
  } finally {
    console.error = originalError;
  }
  assert.equal(failed.statusCode, 500);
  assert.equal(JSON.parse(failed.body).error.code, 'COD_EXPORT_INTERNAL_ERROR');
  assert.doesNotMatch(failed.body, /password/);

  const post = makeRes();
  await ok({ method: 'POST', headers: {} }, post);
  assert.equal(post.statusCode, 405);
});
