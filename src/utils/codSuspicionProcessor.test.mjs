import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STRONG_SIGNALS,
  STRONG_SIGNAL_MAP,
  ALERT_LEVELS,
  formatCurrencyVND,
  formatDateVN,
  formatDateTimeVN,
  normalizeSuspicionOrder,
  getCodSuspicionCaseKey,
  getCodSuspicionDriverKey,
  groupOrdersByDriver,
  sortDrivers,
  filterDriverGroups,
  filterDriverGroupsByResolutionStatus,
  computeSuspicionKPIs,
  getAlertLevel,
  normalizeDateKey,
  aggregateOrdersByEndDeliveryDate,
  getCodSmsCaseKey,
  getSmsScoreBadge,
  getSmsSimpleVerdict,
  formatSmsConfidence,
  SMS_PATTERN_LABELS
} from './codSuspicionProcessor.js';

const migrationUrl = new URL('../../supabase/migrations/20260917_create_kas_cod_suspicion_module.sql', import.meta.url);
const appsScriptUrl = new URL('../../scripts/apps-script/sync-to-supabase.gs', import.meta.url);
const resolutionMigrationUrl = new URL('../../supabase/migrations/20260921035354_create_cod_suspicion_case_resolutions.sql', import.meta.url);
const driverResolutionMigrationUrl = new URL('../../supabase/migrations/20260921060000_cod_suspicion_driver_workflow.sql', import.meta.url);
const outcomeMigrationUrl = new URL('../../supabase/migrations/20260921063421_cod_suspicion_resolution_outcomes.sql', import.meta.url);
const hideNonViolationMigrationUrl = new URL('../../supabase/migrations/20260921065436_hide_cod_non_violations_from_users.sql', import.meta.url);

test('COD resolution migration persists only workflow metadata behind the two-account Dev allowlist', async () => {
  const migration = await readFile(resolutionMigrationUrl, 'utf8');

  assert.match(migration, /create table if not exists public\.cod_suspicion_case_resolutions/i);
  assert.match(migration, /unique \(order_code, driver_id, suspicion_type\)/i);
  assert.match(migration, /resolved_by uuid not null references auth\.users\(id\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /create table if not exists public\.app_user_roles/i);
  assert.match(migration, /\('vinhlt@ghn\.vn', 'dev'\)/i);
  assert.match(migration, /\('luongthevinh996@gmail\.com', 'dev'\)/i);
  assert.match(migration, /create or replace function public\.is_dev_admin\(\)/i);
  assert.match(migration, /select public\.is_dev_admin\(\)/i);
  assert.match(migration, /revoke all on table public\.cod_suspicion_case_resolutions from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.cod_suspicion_case_resolutions to authenticated/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(migration, /revoke all on function public\.resolve_cod_suspicion_case/i);
  assert.doesNotMatch(migration, /insert into public\.kas_cod_suspicion_data/i);
  assert.doesNotMatch(migration, /update public\.kas_cod_suspicion_data/i);
});

test('driver workflow resolves all of one driver type and protects evidence uploads', async () => {
  const migration = await readFile(driverResolutionMigrationUrl, 'utf8');
  assert.match(migration, /cod_suspicion_driver_resolutions/i);
  assert.match(migration, /unique \(driver_id, suspicion_type\)/i);
  assert.match(migration, /contact_channel text not null/i);
  assert.match(migration, /cod-resolution-evidence/i);
  assert.match(migration, /for insert to authenticated/i);
  assert.match(migration, /is_cod_resolution_operator/i);
  assert.match(migration, /undo_cod_suspicion_driver_resolution/i);
});

test('driver workflow distinguishes a violation stage from a non-violation conclusion', async () => {
  const migration = await readFile(outcomeMigrationUrl, 'utf8');
  assert.match(migration, /finding_outcome.*violation.*non_violation/is);
  assert.match(migration, /enforcement_status.*in_progress.*disciplinary_action/is);
  assert.match(migration, /finding_outcome = 'non_violation' and enforcement_status is null/i);
  assert.match(migration, /drop function if exists public\.upsert_cod_suspicion_driver_resolution/i);
});

test('non-violation cases are visible only to Dev Admin accounts', async () => {
  const migration = await readFile(hideNonViolationMigrationUrl, 'utf8');
  assert.match(migration, /authenticated_can_read_visible_cod_suspicion_data/i);
  assert.match(migration, /finding_outcome = 'non_violation'/i);
  assert.match(migration, /authenticated_can_read_violation_resolutions/i);
  assert.match(migration, /cod_resolution_operators_can_read_all/i);
  assert.match(migration, /is_cod_resolution_operator/i);
});

test('KAS-221 migration exposes read-only data to authenticated users and fails closed on bad sync payloads', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.doesNotMatch(migration, /current_user\s+in\s*\('postgres',\s*'supabase_admin'\)/i);
  assert.doesNotMatch(migration, /auth\.role\(\)/i);
  assert.doesNotMatch(migration, /create\s+table[\s\S]*?user_module_roles/i);
  assert.doesNotMatch(migration, /create\s+(or\s+replace\s+)?function[\s\S]*?admin_(list|set)_user_qc_role/i);
  assert.match(migration, /drop function if exists public\.admin_list_users_qc_roles\(text\)/i);
  assert.match(migration, /drop function if exists public\.admin_set_user_qc_role\(uuid, text, boolean\)/i);
  assert.match(migration, /revoke all on table public\.user_module_roles from public, anon, authenticated/i);
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

test('getAlertLevel maps the KAS-221 reviewed queue to high, medium, and low labels', () => {
  assert.equal(getAlertLevel(18), ALERT_LEVELS.HIGH);
  assert.equal(getAlertLevel(15), ALERT_LEVELS.MEDIUM);
  assert.equal(getAlertLevel(10), ALERT_LEVELS.LOW);
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

test('resolved tab groups violation stages while non-violation remains separate', () => {
  const pendingDriver = {
    driverId: 'D1',
    driverName: 'Tài xế 1',
    orders: [{ orderCode: 'O1' }, { orderCode: 'O2' }],
    resolution: null
  };
  const inProgressDriver = { ...pendingDriver, driverId: 'D2', resolution: { status: 'resolved', finding_outcome: 'violation', enforcement_status: 'in_progress' } };
  const resolvedDriver = { ...pendingDriver, driverId: 'D3', resolution: { status: 'resolved', finding_outcome: 'violation', enforcement_status: 'disciplinary_action' } };
  const nonViolationDriver = { ...pendingDriver, driverId: 'D4', resolution: { status: 'resolved', finding_outcome: 'non_violation', enforcement_status: null } };
  const driverGroups = [pendingDriver, inProgressDriver, resolvedDriver, nonViolationDriver];

  const pending = filterDriverGroupsByResolutionStatus(driverGroups, 'pending');
  const resolved = filterDriverGroupsByResolutionStatus(driverGroups, 'resolved');
  const nonViolation = filterDriverGroupsByResolutionStatus(driverGroups, 'non_violation');

  assert.equal(pending.length, 1);
  assert.equal(pending[0].orders.length, 2);
  assert.equal(pending[0].driverId, 'D1');
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].orders.length, 2);
  assert.deepEqual(resolved.map(driver => driver.driverId), ['D2', 'D3']);
  assert.equal(nonViolation.length, 1);
  assert.equal(nonViolation[0].driverId, 'D4');
  assert.notEqual(
    getCodSuspicionCaseKey({ orderCode: 'O1', driverId: 'D1', suspicionType: 'Gối đầu COD' }),
    getCodSuspicionCaseKey({ orderCode: 'O1', driverId: 'D2', suspicionType: 'Gối đầu COD' })
  );
  assert.equal(
    getCodSuspicionDriverKey({ driverId: 'D1', suspicionType: 'Gối đầu COD' }),
    getCodSuspicionDriverKey({ driverId: 'D1', suspicionType: 'Gối đầu COD' })
  );
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

  const highAlertOnly = filterDriverGroups(drivers, { alertLevel: 'HIGH' });
  assert.equal(highAlertOnly.length, 2);
  assert.equal(highAlertOnly[0].orders[0].orderCode, 'O2');

  // Filter by search query on driver name
  const searchA = filterDriverGroups(drivers, { searchQuery: 'Văn A' });
  assert.equal(searchA.length, 1);
  assert.equal(searchA[0].driverId, 'D1');

  // Filter by search query on order code
  const searchO3 = filterDriverGroups(drivers, { searchQuery: 'O3' });
  assert.equal(searchO3.length, 1);
  assert.equal(searchO3[0].driverId, 'D2');
});

test('filterDriverGroups keeps an orphan driver (resolution with no current source orders) matching only on suspicion type and driver identity', () => {
  const orphan = {
    driverId: 'D9',
    driverName: 'Tài xế D9',
    suspicionType: 'Gối đầu COD',
    isOrphan: true,
    orders: [],
    resolution: { status: 'resolved', finding_outcome: 'violation' }
  };
  const drivers = [
    orphan,
    {
      driverId: 'D2',
      driverName: 'Trần Văn B',
      suspicionType: 'Rút ruột',
      orders: [
        { orderCode: 'O3', suspicionType: 'Rút ruột', warehouseName: 'Kho Tân Bình', totalScore: 20, codAmount: 5000 }
      ]
    }
  ];

  // An orphan has no order-level data, so warehouse/alertLevel filters never exclude it.
  assert.equal(filterDriverGroups(drivers, { warehouse: 'Kho Tân Bình' }).length, 2);
  assert.equal(filterDriverGroups(drivers, { alertLevel: 'HIGH' }).length, 2);

  // Suspicion type still filters it out.
  assert.deepEqual(
    filterDriverGroups(drivers, { suspicionType: 'Rút ruột' }).map(d => d.driverId),
    ['D2']
  );

  // Search matches driver identity, not (nonexistent) order codes.
  assert.deepEqual(
    filterDriverGroups(drivers, { searchQuery: 'D9' }).map(d => d.driverId),
    ['D9']
  );
});

test('computeSuspicionKPIs sorts warehouse bars by order count with a stable name tie-breaker', () => {
  const drivers = [
    {
      driverId: 'D1',
      suspicionType: 'Gối đầu COD',
      orders: [
        { suspicionType: 'Gối đầu COD', warehouseName: 'Kho A', codAmount: 1000000 },
        { suspicionType: 'Gối đầu COD', warehouseName: 'Kho B', codAmount: 2000000 },
        { suspicionType: 'Gối đầu COD', warehouseName: 'Kho Z', codAmount: 100000 }
      ]
    },
    {
      driverId: 'D2',
      suspicionType: 'Rút ruột',
      orders: [
        { suspicionType: 'Rút ruột', warehouseName: 'Kho A', codAmount: 3000000 },
        { suspicionType: 'Rút ruột', warehouseName: 'Kho C', codAmount: 4000000 },
        { suspicionType: 'Rút ruột', warehouseName: 'Kho Z', codAmount: 200000 }
      ]
    },
    {
      driverId: 'D3',
      suspicionType: 'Gối đầu COD',
      orders: [
        { suspicionType: 'Gối đầu COD', warehouseName: 'Kho B', codAmount: 5000000 },
        { suspicionType: 'Gối đầu COD', warehouseName: 'Kho C', codAmount: 6000000 },
        { suspicionType: 'Gối đầu COD', warehouseName: 'Kho Z', codAmount: 300000 }
      ]
    }
  ];

  const kpis = computeSuspicionKPIs(drivers);
  assert.equal(kpis.totalDrivers, 3);
  assert.equal(kpis.totalOrders, 9);
  assert.equal(kpis.totalCod, 21600000);

  assert.equal(kpis.typeCounts['Gối đầu COD'].drivers, 2);
  assert.equal(kpis.typeCounts['Gối đầu COD'].orders, 6);
  assert.equal(kpis.typeCounts['Rút ruột'].drivers, 1);
  assert.equal(kpis.typeCounts['Rút ruột'].orders, 3);

  // Kho Z is highest. A/B/C tie at two orders and use the explicit name
  // tie-breaker, so the chart cannot inherit arbitrary source-row order.
  assert.equal(kpis.topWarehouses.length, 4);
  assert.equal(kpis.topWarehouses[0].warehouse, 'Kho Z');
  assert.equal(kpis.topWarehouses[0].orderCount, 3);
  assert.equal(kpis.topWarehouses[0].driverCount, 3);
  assert.equal(kpis.topWarehouses[1].warehouse, 'Kho A');
  assert.equal(kpis.topWarehouses[1].orderCount, 2);
  assert.equal(kpis.topWarehouses[2].warehouse, 'Kho B');
  assert.equal(kpis.topWarehouses[2].orderCount, 2);
  assert.equal(kpis.topWarehouses[3].warehouse, 'Kho C');
  assert.equal(kpis.topWarehouses[3].orderCount, 2);
});

test('normalizeDateKey parses ISO and formatted date strings, rejecting invalid and non-existent dates', () => {
  assert.equal(normalizeDateKey('2026-09-15'), '2026-09-15');
  assert.equal(normalizeDateKey('2026-09-15T08:30:00Z'), '2026-09-15');
  assert.equal(normalizeDateKey('15/09/2026'), '2026-09-15');
  assert.equal(normalizeDateKey('2026/09/15'), '2026-09-15');

  // Valid boundary dates
  assert.equal(normalizeDateKey('2026-02-28'), '2026-02-28');
  assert.equal(normalizeDateKey('28/02/2026'), '2026-02-28');
  assert.equal(normalizeDateKey('2026-04-30'), '2026-04-30');
  assert.equal(normalizeDateKey('30/04/2026'), '2026-04-30');
  assert.equal(normalizeDateKey('2026-12-31'), '2026-12-31');
  assert.equal(normalizeDateKey('31/12/2026'), '2026-12-31');

  // Calendar non-existent dates (Feb 31, Apr 31)
  assert.equal(normalizeDateKey('2026-02-31'), null);
  assert.equal(normalizeDateKey('31/02/2026'), null);
  assert.equal(normalizeDateKey('2026/02/31'), null);
  assert.equal(normalizeDateKey('2026-04-31'), null);
  assert.equal(normalizeDateKey('31/04/2026'), null);

  // Non-leap year vs leap year February 29th
  assert.equal(normalizeDateKey('2026-02-29'), null);
  assert.equal(normalizeDateKey('29/02/2026'), null);
  assert.equal(normalizeDateKey('2024-02-29'), '2024-02-29'); // Leap year
  assert.equal(normalizeDateKey('29/02/2024'), '2024-02-29'); // Leap year

  // Invalid or empty dates
  assert.equal(normalizeDateKey(null), null);
  assert.equal(normalizeDateKey(undefined), null);
  assert.equal(normalizeDateKey(''), null);
  assert.equal(normalizeDateKey('   '), null);
  assert.equal(normalizeDateKey('invalid-date'), null);
  assert.equal(normalizeDateKey('2026-99-99'), null);
});

test('aggregateOrdersByEndDeliveryDate groups, sorts chronologically, deduplicates orderCode, and ignores invalid dates', () => {
  const drivers = [
    {
      driverId: 'D1',
      orders: [
        { orderCode: 'ORD_01', endDeliveryDate: '2026-09-14T10:00:00Z' },
        { orderCode: 'ORD_02', endDeliveryDate: '2026-09-10' },
        // Duplicate order code with different date or row duplicate - must be deduped
        { orderCode: 'ORD_01', endDeliveryDate: '2026-09-14T10:00:00Z' },
        // Invalid or null date - must be safely skipped
        { orderCode: 'ORD_03', endDeliveryDate: null },
        { orderCode: 'ORD_04', endDeliveryDate: '' },
        { orderCode: 'ORD_05', endDeliveryDate: 'bad-date' }
      ]
    },
    {
      driverId: 'D2',
      orders: [
        { orderCode: 'ORD_06', endDeliveryDate: '2026-09-12' },
        { orderCode: 'ORD_07', endDeliveryDate: '2026-09-14' }, // Same date as ORD_01
        { orderCode: 'ORD_02', endDeliveryDate: '2026-09-10' } // Duplicate across driver - deduped
      ]
    }
  ];

  const aggregated = aggregateOrdersByEndDeliveryDate(drivers);

  // Expect 3 unique dates sorted chronologically ascending: 2026-09-10, 2026-09-12, 2026-09-14
  assert.equal(aggregated.length, 3);

  assert.equal(aggregated[0].date, '2026-09-10');
  assert.equal(aggregated[0].dateLabel, '10/09');
  assert.equal(aggregated[0].fullDateLabel, '10/09/2026');
  assert.equal(aggregated[0].cases, 1); // ORD_02 (deduped)

  assert.equal(aggregated[1].date, '2026-09-12');
  assert.equal(aggregated[1].dateLabel, '12/09');
  assert.equal(aggregated[1].fullDateLabel, '12/09/2026');
  assert.equal(aggregated[1].cases, 1); // ORD_06

  assert.equal(aggregated[2].date, '2026-09-14');
  assert.equal(aggregated[2].dateLabel, '14/09');
  assert.equal(aggregated[2].fullDateLabel, '14/09/2026');
  assert.equal(aggregated[2].cases, 2); // ORD_01, ORD_07
});

test('aggregateOrdersByEndDeliveryDate returns empty array when input is empty or has no valid dates', () => {
  assert.deepEqual(aggregateOrdersByEndDeliveryDate([]), []);
  assert.deepEqual(aggregateOrdersByEndDeliveryDate(null), []);
  assert.deepEqual(aggregateOrdersByEndDeliveryDate(undefined), []);

  const noValidDateDrivers = [
    {
      driverId: 'D1',
      orders: [
        { orderCode: 'O1', endDeliveryDate: null },
        { orderCode: 'O2', endDeliveryDate: '' }
      ]
    }
  ];
  assert.deepEqual(aggregateOrdersByEndDeliveryDate(noValidDateDrivers), []);
});

test('getCodSmsCaseKey joins assessment and order using full 3-part key (suspicionType, driverId, orderCode)', () => {
  const key1 = getCodSmsCaseKey({
    suspicionType: 'Gối đầu COD',
    driverId: '3100818',
    orderCode: 'GY8CFXTR'
  });

  const keyMatching = getCodSmsCaseKey({
    suspicion_type: 'Gối đầu COD',
    driver_id: '3100818',
    order_code: 'GY8CFXTR'
  });

  const keyDifferentType = getCodSmsCaseKey({
    suspicionType: 'Rút ruột',
    driverId: '3100818',
    orderCode: 'GY8CFXTR'
  });

  const keyDifferentDriver = getCodSmsCaseKey({
    suspicionType: 'Gối đầu COD',
    driverId: '9999999',
    orderCode: 'GY8CFXTR'
  });

  const keyWithWhitespace = getCodSmsCaseKey({
    suspicionType: '  Gối đầu COD  ',
    driverId: ' 3100818 ',
    orderCode: ' GY8CFXTR '
  });

  assert.equal(key1, keyMatching);
  assert.equal(key1, keyWithWhitespace);
  assert.notEqual(key1, keyDifferentType, 'Must not collide across different suspicion types');
  assert.notEqual(key1, keyDifferentDriver, 'Must not collide across different drivers with same orderCode');
});

test('getSmsScoreBadge correctly maps all score and confidence states with explicit text labels', () => {
  // 1. Scored with high confidence
  const badgeHigh = getSmsScoreBadge({
    status: 'scored',
    smsScore: 6,
    confidence: 'cao'
  });
  assert.equal(badgeHigh.text, '6 · Cao');
  assert.equal(badgeHigh.level, 'high');
  assert.equal(badgeHigh.label, 'Cao');
  assert.equal(badgeHigh.score, 6);

  // 2. Scored with medium confidence
  const badgeMed = getSmsScoreBadge({
    status: 'scored',
    smsScore: 3,
    confidence: 'trung_binh'
  });
  assert.equal(badgeMed.text, '3 · Trung bình');
  assert.equal(badgeMed.level, 'medium');
  assert.equal(badgeMed.label, 'Trung bình');
  assert.equal(badgeMed.score, 3);

  // 3. Scored with low confidence
  const badgeLow = getSmsScoreBadge({
    status: 'scored',
    smsScore: 1,
    confidence: 'thap'
  });
  assert.equal(badgeLow.text, '1 · Thấp');
  assert.equal(badgeLow.level, 'low');
  assert.equal(badgeLow.label, 'Thấp');
  assert.equal(badgeLow.score, 1);

  // 4. Zero score (no evidence)
  const badgeZero = getSmsScoreBadge({
    status: 'no_evidence',
    smsScore: 0,
    confidence: 'khong_co_bang_chung'
  });
  assert.equal(badgeZero.text, '0 · Không có bằng chứng');
  assert.equal(badgeZero.level, 'no_evidence');
  assert.equal(badgeZero.label, 'Không có bằng chứng');
  assert.equal(badgeZero.score, 0);

  // 5. Pending
  const badgePending = getSmsScoreBadge({
    status: 'pending',
    smsScore: null,
    confidence: null
  });
  assert.equal(badgePending.text, '— · Đang chờ chấm');
  assert.equal(badgePending.level, 'pending');
  assert.equal(badgePending.label, 'Đang chờ chấm');
  assert.equal(badgePending.score, null);

  // 6. Failed (technical error hidden from user)
  const badgeFailed = getSmsScoreBadge({
    status: 'failed',
    smsScore: null,
    confidence: null,
    technicalError: { code: 'COD_SMS_MODEL_TIMEOUT', message: 'Internal timeout' }
  });
  assert.equal(badgeFailed.text, '— · Lỗi chấm điểm');
  assert.equal(badgeFailed.level, 'failed');
  assert.equal(badgeFailed.label, 'Lỗi chấm điểm');
  assert.doesNotMatch(badgeFailed.text, /TIMEOUT|Internal/);

  // 7. Unscored (null / undefined)
  const badgeUnscored = getSmsScoreBadge(null);
  assert.equal(badgeUnscored.text, '— · Chưa chấm');
  assert.equal(badgeUnscored.level, 'unscored');
  assert.equal(badgeUnscored.label, 'Chưa chấm');
  assert.equal(badgeUnscored.score, null);
});

test('SMS AI assessment score does not change SQL totalScore, alert levels, driver sorting or KPIs', () => {
  // Order with SQL total_score = 15 (Medium alert level)
  const rawOrder = {
    driver_id: 'D01',
    driver_name: 'Nguyễn Văn A',
    order_code: 'ORD_01',
    suspicion_type: 'Gối đầu COD',
    order_status: 'delivered',
    cod_amount: 1500000,
    warehouse_name: 'Kho Tân Bình',
    end_delivery_date: '2026-09-15',
    total_score: 15
  };

  const normalized = normalizeSuspicionOrder(rawOrder);
  assert.equal(normalized.totalScore, 15);

  // SQL alert level is Medium
  const initialAlertLevel = getAlertLevel(normalized.totalScore);
  assert.equal(initialAlertLevel.value, 'MEDIUM');
  assert.equal(initialAlertLevel.label, 'Vừa');

  // Attach an SMS assessment with high score (6 points)
  const smsAssessment = {
    key: { suspicionType: 'Gối đầu COD', driverId: 'D01', orderCode: 'ORD_01' },
    status: 'scored',
    smsScore: 6,
    confidence: 'cao'
  };

  // Invariant 1: totalScore must remain 15, NOT 15 + 6 = 21
  assert.equal(normalized.totalScore, 15, 'SMS score must not mutate or add to SQL totalScore');

  // Invariant 2: SQL alert level remains Medium, NOT High
  const alertAfterSms = getAlertLevel(normalized.totalScore);
  assert.equal(alertAfterSms.value, 'MEDIUM');

  // Invariant 3: Driver sorting is strictly determined by SQL maxScore and order count
  const driverA = {
    driverId: 'D01',
    maxScore: 15, // SQL score
    orderCount: 1,
    orders: [normalized]
  };

  const driverB = {
    driverId: 'D02',
    maxScore: 18, // SQL High
    orderCount: 1,
    orders: [{ totalScore: 18, orderCode: 'ORD_02' }]
  };

  // Even if D01 has smsScore = 6 and D02 has smsScore = 0, D02 ranks higher due to SQL score 18 > 15
  const sorted = sortDrivers([driverA, driverB]);
  assert.equal(sorted[0].driverId, 'D02');
  assert.equal(sorted[1].driverId, 'D01');

  // Invariant 4: KPI computations only aggregate SQL scores and COD amounts
  const kpis = computeSuspicionKPIs([driverA, driverB]);
  assert.equal(kpis.totalDrivers, 2);
  assert.equal(kpis.totalOrders, 2);
  assert.equal(kpis.totalCod, 1500000);
});

test('SMS_PATTERN_LABELS provides human-readable Vietnamese labels for all 5 rubric patterns', () => {
  assert.equal(SMS_PATTERN_LABELS.mau_1, 'STK khớp tên tài xế (+5)');
  assert.equal(SMS_PATTERN_LABELS.mau_2, 'Hội thoại hai chiều xác nhận (+1)');
  assert.equal(SMS_PATTERN_LABELS.mau_3, 'Hẹn giao lại tự động trong 24h (+1)');
  assert.equal(SMS_PATTERN_LABELS.mau_4, 'STK chưa khớp tên tài xế (+1)');
  assert.equal(SMS_PATTERN_LABELS.mau_5, 'Trùng STK với đơn khác (+2)');

  assert.equal(formatSmsConfidence('cao'), 'Cao');
  assert.equal(formatSmsConfidence('trung_binh'), 'Trung bình');
  assert.equal(formatSmsConfidence('thap'), 'Thấp');
  assert.equal(formatSmsConfidence('khong_co_bang_chung'), 'Không có bằng chứng');
  assert.equal(formatSmsConfidence(null), '-');
});

test('getSmsSimpleVerdict only ever returns one of the two allowed regular-user strings', () => {
  const suspicious = getSmsSimpleVerdict({ status: 'scored', smsScore: 6, confidence: 'cao' });
  assert.equal(suspicious.text, 'Nghi ngờ SMS bất thường');
  assert.equal(suspicious.level, 'high');

  const zeroScore = getSmsSimpleVerdict({ status: 'scored', smsScore: 0, confidence: null });
  assert.equal(zeroScore.text, 'Không có bất thường SMS');

  const noEvidence = getSmsSimpleVerdict({ status: 'no_evidence', smsScore: 0 });
  assert.equal(noEvidence.text, 'Không có bất thường SMS');

  const pending = getSmsSimpleVerdict({ status: 'pending', smsScore: null });
  assert.equal(pending.text, 'Không có bất thường SMS');

  const failed = getSmsSimpleVerdict({ status: 'failed', smsScore: null, technicalError: { code: 'X', message: 'y' } });
  assert.equal(failed.text, 'Không có bất thường SMS');
  assert.doesNotMatch(failed.text, /lỗi|error|X\b/i);

  const unscored = getSmsSimpleVerdict(null);
  assert.equal(unscored.text, 'Không có bất thường SMS');
});

