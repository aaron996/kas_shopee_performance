import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { buildCodSuspicionExportRows, EXPORT_HEADERS, selectNewLogRows } from './build.js';
import { formatVietnamTimestamp, runCodSuspicionExport, runCodSuspicionExportSafely } from './service.js';
import { fetchAccessToken, parseServiceAccount } from './google-sheets.js';

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

test('the log keeps the first row of an order even when other fields change later', () => {
  const existing = [[GOI, 'O1', 'D1', 'cũ']];
  const rows = [
    [GOI, 'O1', 'D1', 'mới'],
    [RUT, 'O1', 'D1', 'mới'],
    [GOI, 'O2', 'D1', 'mới'],
    [GOI, 'O2', 'D1', 'trùng trong lượt']
  ];
  assert.deepEqual(selectNewLogRows(rows, existing), [rows[1], rows[2]]);
});

test('timestamps are written in Vietnam time', () => {
  assert.equal(formatVietnamTimestamp(new Date('2026-09-29T02:15:07Z')), '2026-09-29 09:15:07');
});

function fakeSheets({ sheets = [], log = [] } = {}) {
  const calls = [];
  let logValues = log;
  return {
    calls,
    async getSheets() { calls.push(['getSheets']); return sheets; },
    async batchUpdate(requests) { calls.push(['batchUpdate', requests]); },
    async getValues(title, a1) { calls.push(['getValues', title, a1]); return logValues; },
    async updateValues(title, a1, values) { calls.push(['updateValues', title, a1, values]); },
    async clearValues(title, a1) { calls.push(['clearValues', title, a1]); },
    async appendValues(title, a1, values) { calls.push(['appendValues', title, a1, values]); logValues = [...logValues, ...values]; }
  };
}

function fakeRepository({ orders = [], assessments = [], nonViolation = [], threshold = 1 } = {}) {
  return () => ({
    loadOrders: async () => orders,
    loadScoredAssessments: async () => assessments,
    loadNonViolationDrivers: async () => nonViolation,
    loadThreshold: async () => threshold
  });
}

const baseConfig = () => ({
  supabaseUrl: 'x', supabaseServiceRoleKey: 'x', serviceAccount: {},
  spreadsheetId: 'sheet', sheetName: 'nghi_ngo_COD', logSheetName: 'nghi_ngo_COD_log'
});

test('export creates missing tabs, overwrites the main tab and seeds the log with a header', async () => {
  const sheets = fakeSheets();
  const result = await runCodSuspicionExport({
    readConfig: baseConfig,
    serviceClient: {},
    createRepository: fakeRepository({ orders: [order({ total_score: 18 }), order({ order_code: 'O2' })] }),
    sheetsClient: sheets,
    now: new Date('2026-09-29T02:15:00Z')
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.exportedOrders, 2);
  assert.equal(result.newLogRows, 2);
  const [, addRequests] = sheets.calls.find(call => call[0] === 'batchUpdate');
  assert.deepEqual(addRequests.map(request => request.addSheet.properties.title), ['nghi_ngo_COD', 'nghi_ngo_COD_log']);
  const update = sheets.calls.find(call => call[0] === 'updateValues');
  assert.equal(update[1], 'nghi_ngo_COD');
  assert.deepEqual(update[3][0], EXPORT_HEADERS);
  assert.equal(update[3].length, 3);
  assert.deepEqual(sheets.calls.find(call => call[0] === 'clearValues').slice(1), ['nghi_ngo_COD', 'A4:K']);
  const append = sheets.calls.find(call => call[0] === 'appendValues');
  assert.equal(append[1], 'nghi_ngo_COD_log');
  assert.deepEqual(append[3][0], EXPORT_HEADERS);
  assert.equal(append[3].length, 3);
});

test('re-running the export appends nothing new to the log', async () => {
  const log = [EXPORT_HEADERS.slice(), [GOI, 'O1', 'D1']];
  const sheets = fakeSheets({
    sheets: [
      { sheetId: 1, title: 'nghi_ngo_COD', gridProperties: { rowCount: 1000 } },
      { sheetId: 2, title: 'nghi_ngo_COD_log', gridProperties: { rowCount: 1000 } }
    ],
    log
  });
  const result = await runCodSuspicionExport({
    readConfig: baseConfig,
    serviceClient: {},
    createRepository: fakeRepository({ orders: [order({ total_score: 18, cod_amount: 999 })] }),
    sheetsClient: sheets
  });
  assert.equal(result.newLogRows, 0);
  assert.equal(sheets.calls.some(call => call[0] === 'appendValues'), false);
  assert.equal(sheets.calls.some(call => call[0] === 'batchUpdate'), false);
});

test('export grows the main tab grid when the table exceeds its rows', async () => {
  const sheets = fakeSheets({
    sheets: [
      { sheetId: 7, title: 'nghi_ngo_COD', gridProperties: { rowCount: 2 } },
      { sheetId: 8, title: 'nghi_ngo_COD_log', gridProperties: { rowCount: 1000 } }
    ]
  });
  await runCodSuspicionExport({
    readConfig: baseConfig,
    serviceClient: {},
    createRepository: fakeRepository({ orders: ['A', 'B', 'C'].map(code => order({ order_code: code, total_score: 18 })) }),
    sheetsClient: sheets
  });
  const [, requests] = sheets.calls.find(call => call[0] === 'batchUpdate');
  assert.deepEqual(requests, [{
    updateSheetProperties: {
      properties: { sheetId: 7, gridProperties: { rowCount: 4 } },
      fields: 'gridProperties.rowCount'
    }
  }]);
});

test('export is skipped without a Google credential and never throws from the safe wrapper', async () => {
  assert.equal((await runCodSuspicionExport({ env: {} })).status, 'skipped');
  const failed = await runCodSuspicionExportSafely({
    readConfig: baseConfig,
    serviceClient: {},
    createRepository: () => ({
      loadOrders: async () => { throw new Error('db down'); },
      loadScoredAssessments: async () => [],
      loadNonViolationDrivers: async () => [],
      loadThreshold: async () => 1
    }),
    sheetsClient: fakeSheets()
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.code, 'COD_EXPORT_INTERNAL_ERROR');
});

test('service account JSON restores escaped newlines and signs a JWT token request', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const account = parseServiceAccount(JSON.stringify({
    client_email: 'bot@example.iam.gserviceaccount.com',
    private_key: pem.replace(/\n/g, '\\n')
  }));
  assert.equal(account.privateKey, pem);

  let request;
  const token = await fetchAccessToken(account, {
    now: 1_700_000_000_000,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    }
  });
  assert.equal(token, 'tok');
  assert.equal(request.url, 'https://oauth2.googleapis.com/token');
  const assertion = new URLSearchParams(request.init.body.toString()).get('assertion');
  const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
  assert.equal(claims.iss, 'bot@example.iam.gserviceaccount.com');
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/spreadsheets');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.throws(() => parseServiceAccount('{}'), /client_email/);
});
