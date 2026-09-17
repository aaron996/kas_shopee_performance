import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STRONG_SIGNALS,
  STRONG_SIGNAL_MAP,
  formatCurrencyVND,
  formatDateVN,
  formatDateTimeVN,
  normalizeSuspicionOrder,
  groupOrdersByDriver,
  sortDrivers,
  filterDriverGroups,
  computeSuspicionKPIs
} from './codSuspicionProcessor.js';

const migrationUrl = new URL('../../supabase/migrations/20260917_create_kas_cod_suspicion_module.sql', import.meta.url);
const appsScriptUrl = new URL('../../scripts/apps-script/sync-to-supabase.gs', import.meta.url);

test('KAS-221 migration exposes read-only data to authenticated users and fails closed on bad sync payloads', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.doesNotMatch(migration, /current_user\s+in\s*\('postgres',\s*'supabase_admin'\)/i);
  assert.doesNotMatch(migration, /auth\.role\(\)/i);
  assert.doesNotMatch(migration, /user_module_roles|admin_(list|set)_user_qc_role/i);
  assert.match(migration, /create policy "authenticated_can_read_kas_cod_suspicion_data"[\s\S]*?to authenticated[\s\S]*?using \(true\)/i);
  assert.match(migration, /revoke all on table public\.kas_cod_suspicion_data from anon, authenticated/i);
  assert.match(migration, /grant select on table public\.kas_cod_suspicion_data to authenticated/i);
  assert.match(migration, /if payload is null or jsonb_typeof\(payload\) <> 'array' then/i);
  assert.match(migration, /raise exception 'KAS_SYNC_PAYLOAD_ARRAY_REQUIRED'/);
  assert.match(migration, /raise exception 'KAS_SYNC_REQUIRED_FIELDS_MISSING'/);
  assert.match(migration, /truncate table public\.kas_cod_suspicion_metadata;/i);
  assert.doesNotMatch(migration, /delete from public\.kas_cod_suspicion_metadata;/i);
});

test('KAS-221 Apps Script joins the daily sync only after an explicit source GID is configured', async () => {
  const appsScript = await readFile(appsScriptUrl, 'utf8');

  assert.match(appsScript, /COD_SUSPICION_GID_PROPERTY\s*=\s*'COD_SUSPICION_GID'/);
  assert.match(appsScript, /const codSuspicionGid = getCodSuspicionGid_\(\)/);
  assert.match(appsScript, /syncCodSuspicionOnly\(codSuspicionGid\)/);
  assert.match(appsScript, /snapshot_meta: snapshotMeta/);
});

test('STRONG_SIGNALS contains exactly 5 signals matching DOCX without technical codes', () => {
  assert.equal(STRONG_SIGNALS.length, 5);

  const keys = STRONG_SIGNALS.map(s => s.key);
  assert.deepEqual(keys, [
    'signal_reason_conflict',
    'signal_fake_call',
    'signal_gps_far',
    'signal_gps_duplicate',
    'signal_gps_mocked'
  ]);

  // Ensure labels match DOCX exactly
  assert.equal(STRONG_SIGNAL_MAP.signal_reason_conflict.label, 'Lý do thất bại không khớp thực tế');
  assert.equal(STRONG_SIGNAL_MAP.signal_fake_call.label, 'Cuộc gọi có dấu hiệu giả');
  assert.equal(STRONG_SIGNAL_MAP.signal_gps_far.label, 'Vị trí giao thực tế lệch xa địa chỉ khách');
  assert.equal(STRONG_SIGNAL_MAP.signal_gps_duplicate.label, 'Trùng vị trí bất thường giữa nhiều đơn');
  assert.equal(STRONG_SIGNAL_MAP.signal_gps_mocked.label, 'Thiết bị tự báo vị trí giả');

  // Verify NO technical codes M7, M9, M10, M11, M12 are in labels or descriptions
  STRONG_SIGNALS.forEach(s => {
    assert.match(s.label, /^[A-ZÀ-Ỹ]/i);
    assert.doesNotMatch(s.label, /\bM(7|8|9|10|11|12|13|14)\b/);
    assert.doesNotMatch(s.shortLabel, /\bM(7|8|9|10|11|12|13|14)\b/);
    assert.doesNotMatch(s.description, /\bM(7|8|9|10|11|12|13|14)\b/);
  });
});

test('formatCurrencyVND formats VND correctly and handles null gracefully', () => {
  assert.equal(formatCurrencyVND(null), '-');
  assert.equal(formatCurrencyVND(undefined), '-');
  assert.equal(formatCurrencyVND(''), '-');
  assert.equal(formatCurrencyVND('invalid'), '-');

  const formatted = formatCurrencyVND(1500000);
  assert.ok(formatted.includes('1.500.000'));
  assert.ok(formatted.includes('₫'));
});

test('formatDateVN formats YYYY-MM-DD correctly and handles null', () => {
  assert.equal(formatDateVN(null), '-');
  assert.equal(formatDateVN(''), '-');
  assert.equal(formatDateVN('2026-09-15'), '15/09/2026');
  assert.equal(formatDateVN('2026-09-15T08:30:00Z'), '15/09/2026');
});

test('formatDateTimeVN formats timestamp correctly', () => {
  assert.equal(formatDateTimeVN(null), 'Đang cập nhật');
  assert.equal(formatDateTimeVN('invalid'), 'Đang cập nhật');
  const str = formatDateTimeVN('2026-09-15T08:30:00Z');
  assert.ok(str.length > 5);
});

test('normalizeSuspicionOrder handles both SQL aliases and Supabase schema columns', () => {
  // Test with Supabase column names
  const row1 = {
    id: 1,
    driver_id: 'DRV001',
    driver_name: 'Nguyễn Văn A',
    suspicion_type: 'Gối đầu COD',
    order_code: 'ORD001',
    order_status: 'delivered',
    cod_amount: '1250000',
    warehouse_name: 'Kho Bình Thạnh',
    first_delivered_date: '2026-09-10',
    end_delivery_date: '2026-09-14',
    return_date: null,
    delivery_duration_days: 4.2,
    first_fail_note: 'Người nhận không nghe máy',
    total_score: 18,
    signal_reason_conflict: true,
    signal_fake_call: true,
    signal_gps_far: false,
    signal_gps_duplicate: false,
    signal_gps_mocked: false
  };

  const norm1 = normalizeSuspicionOrder(row1);
  assert.equal(norm1.driverId, 'DRV001');
  assert.equal(norm1.driverName, 'Nguyễn Văn A');
  assert.equal(norm1.orderCode, 'ORD001');
  assert.equal(norm1.codAmount, 1250000);
  assert.equal(norm1.totalScore, 18);
  assert.equal(norm1.signalReasonConflict, true);
  assert.equal(norm1.signalFakeCall, true);
  assert.equal(norm1.signalGpsFar, false);

  // Test with SQL aliases
  const row2 = {
    'ID tài xế': 'DRV002',
    'Tên tài xế': '',
    'Loại nghi ngờ': 'Rút ruột',
    'Mã đơn': 'ORD002',
    'Trạng thái hiện tại': 'return',
    COD: 2500000,
    'Kho giao': 'Kho Tân Bình',
    'Mâu thuẫn lý do vs duration (M7)': false,
    'Call log giả từ lần thử 2 (M9)': false,
    'GPS bất thường lúc thành công (M10)': true,
    'GPS trùng khớp giữa nhiều đơn (M11)': true,
    'GPS mocked lúc thành công (M12)': true,
    'Điểm tổng nghi vấn': 22
  };

  const norm2 = normalizeSuspicionOrder(row2);
  assert.equal(norm2.driverId, 'DRV002');
  assert.equal(norm2.driverName, 'Tài xế DRV002'); // fallback
  assert.equal(norm2.suspicionType, 'Rút ruột');
  assert.equal(norm2.orderCode, 'ORD002');
  assert.equal(norm2.codAmount, 2500000);
  assert.equal(norm2.totalScore, 22);
  assert.equal(norm2.signalGpsFar, true);
  assert.equal(norm2.signalGpsDuplicate, true);
  assert.equal(norm2.signalGpsMocked, true);
});

test('groupOrdersByDriver groups orders under drivers and computes driver max score', () => {
  const orders = [
    { driverId: 'D1', driverName: 'Tài xế 1', suspicionType: 'Gối đầu COD', orderCode: 'O1', totalScore: 12, codAmount: 1000000, warehouseName: 'Kho A', signalReasonConflict: true },
    { driverId: 'D1', driverName: 'Tài xế 1', suspicionType: 'Gối đầu COD', orderCode: 'O2', totalScore: 19, codAmount: 2000000, warehouseName: 'Kho A', signalFakeCall: true },
    { driverId: 'D2', driverName: 'Tài xế 2', suspicionType: 'Rút ruột', orderCode: 'O3', totalScore: 15, codAmount: 3000000, warehouseName: 'Kho B', signalGpsFar: true }
  ];

  const grouped = groupOrdersByDriver(orders);
  assert.equal(grouped.length, 2);

  const d1 = grouped.find(d => d.driverId === 'D1');
  assert.ok(d1);
  assert.equal(d1.orderCount, 2);
  assert.equal(d1.maxScore, 19);
  assert.equal(d1.totalCod, 3000000);
  assert.equal(d1.orders[0].orderCode, 'O2'); // ordered by score desc
  assert.equal(d1.orders[1].orderCode, 'O1');
  assert.equal(d1.signalSummary.signalReasonConflict, true);
  assert.equal(d1.signalSummary.signalFakeCall, true);
  assert.equal(d1.signalSummary.signalGpsFar, false);

  const d2 = grouped.find(d => d.driverId === 'D2');
  assert.ok(d2);
  assert.equal(d2.orderCount, 1);
  assert.equal(d2.maxScore, 15);
  assert.equal(d2.totalCod, 3000000);
});

test('sortDrivers orders by highest score desc, then order count desc, then driverId', () => {
  const drivers = [
    { driverId: 'D1', maxScore: 15, orderCount: 2 },
    { driverId: 'D2', maxScore: 24, orderCount: 1 },
    { driverId: 'D3', maxScore: 15, orderCount: 4 },
    { driverId: 'D4', maxScore: 15, orderCount: 2 }
  ];

  const sorted = sortDrivers(drivers);
  assert.equal(sorted[0].driverId, 'D2'); // 24
  assert.equal(sorted[1].driverId, 'D3'); // 15, count 4
  assert.equal(sorted[2].driverId, 'D1'); // 15, count 2, 'D1' < 'D4'
  assert.equal(sorted[3].driverId, 'D4'); // 15, count 2
});

test('filterDriverGroups filters by suspicion type, warehouse and search query', () => {
  const drivers = [
    {
      driverId: 'D1',
      driverName: 'Nguyễn Văn A',
      suspicionType: 'Gối đầu COD',
      orders: [
        { orderCode: 'O1', suspicionType: 'Gối đầu COD', warehouseName: 'Kho Tân Bình', totalScore: 12, codAmount: 1000 },
        { orderCode: 'O2', suspicionType: 'Gối đầu COD', warehouseName: 'Kho Bình Thạnh', totalScore: 18, codAmount: 2000 }
      ]
    },
    {
      driverId: 'D2',
      driverName: 'Trần Văn B',
      suspicionType: 'Rút ruột',
      orders: [
        { orderCode: 'O3', suspicionType: 'Rút ruột', warehouseName: 'Kho Tân Bình', totalScore: 20, codAmount: 5000 }
      ]
    }
  ];

  // Filter by suspicion type
  const rutRuotOnly = filterDriverGroups(drivers, { suspicionType: 'Rút ruột' });
  assert.equal(rutRuotOnly.length, 1);
  assert.equal(rutRuotOnly[0].driverId, 'D2');

  // Filter by warehouse
  const binhThanhOnly = filterDriverGroups(drivers, { warehouse: 'Kho Bình Thạnh' });
  assert.equal(binhThanhOnly.length, 1);
  assert.equal(binhThanhOnly[0].driverId, 'D1');
  assert.equal(binhThanhOnly[0].orders.length, 1);
  assert.equal(binhThanhOnly[0].orders[0].orderCode, 'O2');

  // Filter by search query on driver name
  const searchA = filterDriverGroups(drivers, { searchQuery: 'Văn A' });
  assert.equal(searchA.length, 1);
  assert.equal(searchA[0].driverId, 'D1');

  // Filter by search query on order code
  const searchO3 = filterDriverGroups(drivers, { searchQuery: 'O3' });
  assert.equal(searchO3.length, 1);
  assert.equal(searchO3[0].driverId, 'D2');
});

test('computeSuspicionKPIs calculates accurate aggregations for triage', () => {
  const drivers = [
    {
      driverId: 'D1',
      suspicionType: 'Gối đầu COD',
      orders: [
        { suspicionType: 'Gối đầu COD', warehouseName: 'Kho A', codAmount: 1000000 },
        { suspicionType: 'Gối đầu COD', warehouseName: 'Kho B', codAmount: 2000000 }
      ]
    },
    {
      driverId: 'D2',
      suspicionType: 'Rút ruột',
      orders: [
        { suspicionType: 'Rút ruột', warehouseName: 'Kho A', codAmount: 3000000 }
      ]
    }
  ];

  const kpis = computeSuspicionKPIs(drivers);
  assert.equal(kpis.totalDrivers, 2);
  assert.equal(kpis.totalOrders, 3);
  assert.equal(kpis.totalCod, 6000000);

  assert.equal(kpis.typeCounts['Gối đầu COD'].drivers, 1);
  assert.equal(kpis.typeCounts['Gối đầu COD'].orders, 2);
  assert.equal(kpis.typeCounts['Rút ruột'].drivers, 1);
  assert.equal(kpis.typeCounts['Rút ruột'].orders, 1);

  // Top warehouses: Kho A has 2 orders (from 2 drivers), Kho B has 1 order
  assert.equal(kpis.topWarehouses.length, 2);
  assert.equal(kpis.topWarehouses[0].warehouse, 'Kho A');
  assert.equal(kpis.topWarehouses[0].orderCount, 2);
  assert.equal(kpis.topWarehouses[0].driverCount, 2);
  assert.equal(kpis.topWarehouses[1].warehouse, 'Kho B');
  assert.equal(kpis.topWarehouses[1].orderCount, 1);
});
