import {
  ALERT_LEVELS,
  DEFAULT_SMS_ESCALATION_THRESHOLD,
  getEffectiveAlertLevel
} from '../../src/utils/codSuspicionProcessor.js';

export const EXPORT_HEADERS = Object.freeze([
  'Loại nghi ngờ',
  'Mã đơn',
  'ID tài xế',
  'Tên tài xế',
  'Tỉnh giao',
  'Mã bưu cục',
  'Tên bưu cục',
  'Giá trị COD',
  'Ngày kết thúc giao',
  'Mức nghi ngờ tài xế',
  'Thời gian đồng bộ'
]);

const EXPORTED_LEVELS = new Set([ALERT_LEVELS.HIGH.value, ALERT_LEVELS.MEDIUM.value]);
const LEVEL_RANK = { [ALERT_LEVELS.HIGH.value]: 0, [ALERT_LEVELS.MEDIUM.value]: 1 };

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function driverKey(row) {
  return `${text(row.suspicion_type)}\u0000${text(row.driver_id)}`;
}

function caseKey(row) {
  return `${driverKey(row)}\u0000${text(row.order_code)}`;
}

/** Order-level identity used by both sheet tabs: one row per (type, order). */
export function exportOrderKey(suspicionType, orderCode) {
  return `${text(suspicionType)}\u0000${text(orderCode)}`;
}

function validSmsScore(value) {
  const score = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 9 ? score : null;
}

/**
 * Pick the orders to push to the COD suspicion sheet.
 *
 * A driver case is (suspicion type, driver). Its level is the app's effective
 * level: SQL level of the highest-scoring order, raised one step when any of
 * its orders has a scored SMS assessment at or above the threshold. Orders not
 * scored yet simply contribute no SMS score, so their driver keeps the SQL
 * level. Every snapshot order of a Medium/High driver is exported, except
 * drivers a Dev concluded as non-violation.
 */
export function buildCodSuspicionExportRows({
  orders = [],
  assessments = [],
  nonViolationDrivers = [],
  threshold = DEFAULT_SMS_ESCALATION_THRESHOLD,
  syncedAt = ''
} = {}) {
  const smsScoreByCase = new Map();
  for (const assessment of assessments) {
    if (assessment?.status !== 'scored') continue;
    const score = validSmsScore(assessment.sms_score);
    if (score === null) continue;
    const key = caseKey(assessment);
    smsScoreByCase.set(key, Math.max(score, smsScoreByCase.get(key) ?? 0));
  }

  const excludedDrivers = new Set(nonViolationDrivers.map(driverKey));
  const drivers = new Map();
  for (const order of orders) {
    if (!text(order.order_code) || !text(order.driver_id)) continue;
    const key = driverKey(order);
    if (excludedDrivers.has(key)) continue;
    let driver = drivers.get(key);
    if (!driver) {
      driver = { orders: [], maxScore: 0, maxSmsScore: null };
      drivers.set(key, driver);
    }
    driver.orders.push(order);
    driver.maxScore = Math.max(driver.maxScore, Number(order.total_score) || 0);
    const smsScore = smsScoreByCase.get(caseKey(order));
    if (smsScore !== undefined && (driver.maxSmsScore === null || smsScore > driver.maxSmsScore)) {
      driver.maxSmsScore = smsScore;
    }
  }

  const candidates = [];
  for (const driver of drivers.values()) {
    const level = getEffectiveAlertLevel(driver.maxScore, driver.maxSmsScore, threshold);
    if (!EXPORTED_LEVELS.has(level.value)) continue;
    for (const order of driver.orders) candidates.push({ order, level });
  }

  candidates.sort((a, b) => (
    LEVEL_RANK[a.level.value] - LEVEL_RANK[b.level.value] ||
    text(a.order.suspicion_type).localeCompare(text(b.order.suspicion_type)) ||
    text(a.order.driver_id).localeCompare(text(b.order.driver_id)) ||
    text(a.order.order_code).localeCompare(text(b.order.order_code))
  ));

  // The snapshot is unique per (type, driver, order); the same order code
  // under two drivers keeps the row of the higher-level driver (sorted first).
  const seen = new Set();
  const rows = [];
  for (const { order, level } of candidates) {
    const key = exportOrderKey(order.suspicion_type, order.order_code);
    if (seen.has(key)) continue;
    seen.add(key);
    const cod = order.cod_amount === null || order.cod_amount === undefined || order.cod_amount === ''
      ? ''
      : Number(order.cod_amount);
    rows.push([
      text(order.suspicion_type),
      text(order.order_code),
      text(order.driver_id),
      text(order.driver_name),
      text(order.to_province),
      text(order.warehouse_id),
      text(order.warehouse_name),
      Number.isFinite(cod) ? cod : '',
      text(order.end_delivery_date),
      level.label,
      syncedAt
    ]);
  }
  return rows;
}

/** Keep only rows whose (type, order) is not already in the log tab. */
export function selectNewLogRows(rows, existingLogValues = []) {
  const logged = new Set(
    existingLogValues
      .filter(row => Array.isArray(row) && text(row[1]))
      .map(row => exportOrderKey(row[0], row[1]))
  );
  return rows.filter(row => {
    const key = exportOrderKey(row[0], row[1]);
    if (logged.has(key)) return false;
    logged.add(key);
    return true;
  });
}
