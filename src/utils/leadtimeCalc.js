// Engine tính toán cho tab "Leadtime từng chặng".
//
// Vì sao viết lại từ đầu (bản cũ: docs/leadtime-tab-audit.md A5, B1, B2, B3, B5):
//  - Bản cũ có computeBaseline() quét TOÀN BỘ dataset + gọi new Date() cho từng
//    dòng, mỗi lần gọi; component gọi nó (số dòng bảng × 4 chặng) lần mỗi render.
//    Đo ở quy mô thật (88.480 dòng): ~1,8 phút cho 1 ngày, ~13 phút cho 7 ngày.
//  - Bản này index MỘT LẦN theo (scope × ngày), sau đó mọi phép tổng hợp và
//    baseline chỉ còn O(số ngày trong cửa sổ). Không dùng Date object trong vòng
//    lặp nóng — report_date dạng 'YYYY-MM-DD' so sánh chuỗi là đủ và đúng.
//
// Quy ước bắt buộc:
//  - Trung bình LUÔN weighted theo `mau`. Không bao giờ trung bình đơn giản.
//  - Loại NULL riêng cho từng chặng: NULL không vào cả tử lẫn mẫu của chặng đó.
//  - Baseline của kỳ [from, to] chỉ dùng dữ liệu TRƯỚC `from` — không bao giờ
//    chứa ngày đang xem (bản cũ tính tới endDate nên kỳ tự so với chính nó, làm
//    cảnh báo gần như không bao giờ bật).

import { normalizeLane, getLanesFromRows, isUnresolvedLaneRow } from './laneTaxonomy.js';

export const STAGE_KEYS = ['prepickup', 'firstmile', 'middlemile', 'lastmile'];

export const STAGE_CONFIG = {
  prepickup: { key: 'prepickup', col: 'avg_lt_prepickup_hour', label: 'Pre-pickup', short: 'Pre-PU', cssVar: '--stage-prepickup' },
  firstmile: { key: 'firstmile', col: 'avg_lt_firstmile_hour', label: 'First mile', short: 'FM', cssVar: '--stage-firstmile' },
  middlemile: { key: 'middlemile', col: 'avg_lt_middlemile_hour', label: 'Middle mile', short: 'MM', cssVar: '--stage-middlemile' },
  lastmile: { key: 'lastmile', col: 'avg_lt_lastmile_hour', label: 'Last mile', short: 'LM', cssVar: '--stage-lastmile' }
};

export const E2E_COL = 'avg_lt_e2e_hour';

// 3 preset thay cho panel 7 slider của bản cũ. Người vận hành không cần biết
// baselineMethod là mean hay median.
export const THRESHOLD_PRESETS = {
  strict: { key: 'strict', label: 'Chặt', warningPct: 10, criticalPct: 25 },
  normal: { key: 'normal', label: 'Thường', warningPct: 20, criticalPct: 50 },
  loose: { key: 'loose', label: 'Lỏng', warningPct: 30, criticalPct: 75 }
};
export const DEFAULT_PRESET = 'normal';

export const BASELINE_CONFIG = {
  windowDays: 28,
  method: 'mean',        // 'mean' | 'median'
  minDataPoints: 5,      // ít hơn thì baseline cấp tuyến rơi xuống cấp lane
  minMau: 5,             // lọc tuyến mẫu ít (27,3% dòng nhưng chỉ 0,4% sản lượng)
  anomalyDropPct: 40     // giảm quá mức này -> nghi lỗi data, không phải thành tích
};

// ---------------------------------------------------------------------------
// Chuẩn hoá dữ liệu thô
// ---------------------------------------------------------------------------

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tách dữ liệu thô thành phần dùng được và phần loại ra, kèm lý do.
 * Phần loại ra KHÔNG bị xoá — panel chất lượng dữ liệu hiển thị lại đầy đủ để
 * không ai nghĩ có số bị ém.
 *
 * Quy tắc loại (đã đối chiếu dữ liệu thật, xem plan mục 2.3 / 2.4):
 *  - Thiếu bất kỳ chặng nào trong 4 chặng: 0,55% dòng / 0,006% đơn -> ad hoc.
 *  - Cả 3 cột from/to/lane rỗng: 0,013% đơn -> không quy được về lane nào.
 */
export function splitLeadtimeRows(rawRows = []) {
  const clean = [];
  const missingStage = [];
  const unresolvedLane = [];

  for (const raw of rawRows) {
    if (!raw || !raw.report_date || !raw.client_name) continue;

    const row = {
      report_date: String(raw.report_date).slice(0, 10),
      from: String(raw.fromprovince_new ?? '').trim(),
      to: String(raw.toprovince_new ?? '').trim(),
      laneLabel: String(raw.externallane_new ?? '').trim(),
      laneKey: normalizeLane(raw.externallane_new),
      client: String(raw.client_name).trim(),
      mau: toNumber(raw.mau) ?? 0,
      e2e: toNumber(raw[E2E_COL]),
      stages: STAGE_KEYS.map(k => toNumber(raw[STAGE_CONFIG[k].col]))
    };

    if (isUnresolvedLaneRow(raw)) {
      unresolvedLane.push(row);
    } else if (row.stages.some(v => v === null) || !(row.mau > 0)) {
      // mau <= 0 thì không weighted được -> cùng nhóm dòng lỗi
      missingStage.push(row);
    } else {
      clean.push(row);
    }
  }

  return { clean, missingStage, unresolvedLane };
}

// ---------------------------------------------------------------------------
// Index: một lần duy nhất, sau đó mọi thứ chỉ còn O(số ngày)
// ---------------------------------------------------------------------------

// Mỗi (scope, ngày) là 11 ô liên tiếp trong 1 Float64Array:
//   0        : mau
//   1..8     : (sumProd, sumMau) của 4 chặng theo đúng thứ tự STAGE_KEYS
//   9, 10    : (sumProd, sumMau) của e2e
const SLOTS = 11;

export function scopeAll(client) {
  return `A|${client}`;
}
export function scopeLane(client, laneKey) {
  return `L|${client}|${laneKey}`;
}
export function scopePair(client, laneKey, from, to) {
  return `P|${client}|${laneKey}|${from}»${to}`;
}

/** @param {Array} cleanRows kết quả .clean của splitLeadtimeRows */
export function buildLeadtimeIndex(cleanRows = []) {
  const dates = [...new Set(cleanRows.map(r => r.report_date))].sort();
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const clients = [...new Set(cleanRows.map(r => r.client))].sort();
  const lanes = getLanesFromRows(
    cleanRows.map(r => ({ externallane_new: r.laneLabel })).filter(r => r.externallane_new)
  );

  const series = new Map();
  const pairMeta = new Map();
  const width = dates.length * SLOTS;

  const bump = (key, dateIdx, row) => {
    let arr = series.get(key);
    if (!arr) {
      arr = new Float64Array(width);
      series.set(key, arr);
    }
    const base = dateIdx * SLOTS;
    arr[base] += row.mau;
    for (let s = 0; s < STAGE_KEYS.length; s++) {
      const v = row.stages[s];
      if (v === null) continue;
      arr[base + 1 + s * 2] += v * row.mau;
      arr[base + 2 + s * 2] += row.mau;
    }
    if (row.e2e !== null) {
      arr[base + 9] += row.e2e * row.mau;
      arr[base + 10] += row.mau;
    }
  };

  for (const row of cleanRows) {
    const di = dateIndex.get(row.report_date);
    if (di === undefined) continue;
    bump(scopeAll(row.client), di, row);
    bump(scopeLane(row.client, row.laneKey), di, row);
    const pk = scopePair(row.client, row.laneKey, row.from, row.to);
    bump(pk, di, row);
    if (!pairMeta.has(pk)) {
      pairMeta.set(pk, {
        key: pk, client: row.client, laneKey: row.laneKey,
        laneLabel: row.laneLabel, from: row.from, to: row.to
      });
    }
  }

  return { dates, dateIndex, clients, lanes, series, pairMeta };
}

function dateBounds(dates, dateFrom, dateTo) {
  let iFrom = 0;
  let iTo = dates.length - 1;
  while (iFrom < dates.length && dates[iFrom] < dateFrom) iFrom++;
  while (iTo >= 0 && dates[iTo] > dateTo) iTo--;
  return [iFrom, iTo];
}

/** Gộp nhiều scope (ví dụ nhiều client) trong khoảng ngày [from, to] bao gồm 2 đầu. */
export function aggregate(index, scopeKeys, dateFrom, dateTo) {
  const acc = new Float64Array(SLOTS);
  const keys = Array.isArray(scopeKeys) ? scopeKeys : [scopeKeys];
  const [iFrom, iTo] = dateBounds(index.dates, dateFrom, dateTo);

  for (const key of keys) {
    const arr = index.series.get(key);
    if (!arr) continue;
    for (let i = iFrom; i <= iTo; i++) {
      const base = i * SLOTS;
      for (let s = 0; s < SLOTS; s++) acc[s] += arr[base + s];
    }
  }
  return unpack(acc);
}

/** Chuỗi theo ngày cho trend chart: 1 điểm / ngày trong khoảng. */
export function aggregateByDate(index, scopeKeys, dateFrom, dateTo) {
  const keys = Array.isArray(scopeKeys) ? scopeKeys : [scopeKeys];
  const [iFrom, iTo] = dateBounds(index.dates, dateFrom, dateTo);
  const out = [];
  for (let i = iFrom; i <= iTo; i++) {
    const acc = new Float64Array(SLOTS);
    for (const key of keys) {
      const arr = index.series.get(key);
      if (!arr) continue;
      const base = i * SLOTS;
      for (let s = 0; s < SLOTS; s++) acc[s] += arr[base + s];
    }
    out.push({ date: index.dates[i], ...unpack(acc) });
  }
  return out;
}

function unpack(acc) {
  const stages = {};
  let sumOfStages = 0;
  let anyStage = false;
  for (let s = 0; s < STAGE_KEYS.length; s++) {
    const prod = acc[1 + s * 2];
    const mau = acc[2 + s * 2];
    const value = mau > 0 ? prod / mau : null;
    stages[STAGE_KEYS[s]] = { value, mau };
    if (value !== null) {
      sumOfStages += value;
      anyStage = true;
    }
  }
  return {
    mau: acc[0],
    stages,
    e2e: acc[10] > 0 ? acc[9] / acc[10] : null,
    sumOfStages: anyStage ? sumOfStages : null
  };
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

function mean(values) {
  if (!values.length) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function median(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function dailyValues(index, keys, iFrom, iTo, slotProd, slotMau) {
  const out = [];
  for (let i = iFrom; i <= iTo; i++) {
    let prod = 0;
    let mau = 0;
    for (const key of keys) {
      const arr = index.series.get(key);
      if (!arr) continue;
      const base = i * SLOTS;
      prod += arr[base + slotProd];
      mau += arr[base + slotMau];
    }
    if (mau > 0) out.push(prod / mau);
  }
  return out;
}

/**
 * Baseline = trung bình (hoặc trung vị) của các TRUNG BÌNH NGÀY có trọng số,
 * trên cửa sổ [periodStart - windowDays, periodStart) — loại trừ toàn bộ kỳ
 * đang xem.
 *
 * Nếu số ngày có dữ liệu ở scope chi tiết < minDataPoints thì rơi xuống
 * fallbackScopeKeys và trả `level` để UI NÓI RÕ baseline ở cấp nào — bản cũ
 * fallback im lặng nên người xem tưởng đang so tuyến với chính tuyến đó.
 */
export function resolveBaseline(index, {
  scopeKeys,
  fallbackScopeKeys = null,
  periodStart,
  config = BASELINE_CONFIG
}) {
  const windowDays = config.windowDays ?? BASELINE_CONFIG.windowDays;
  const minPoints = config.minDataPoints ?? BASELINE_CONFIG.minDataPoints;
  const agg = (config.method ?? BASELINE_CONFIG.method) === 'median' ? median : mean;
  const keys = Array.isArray(scopeKeys) ? scopeKeys : [scopeKeys];
  const fbKeys = fallbackScopeKeys
    ? (Array.isArray(fallbackScopeKeys) ? fallbackScopeKeys : [fallbackScopeKeys])
    : null;

  // Cửa sổ tính theo NGÀY LỊCH rồi mới quy về chỉ số, để data khuyết ngày không
  // làm cửa sổ trượt dài ra.
  const startBound = shiftDate(periodStart, -windowDays);
  const { dates } = index;
  let iFrom = 0;
  let iTo = dates.length - 1;
  while (iFrom < dates.length && dates[iFrom] < startBound) iFrom++;
  while (iTo >= 0 && dates[iTo] >= periodStart) iTo--;
  if (iTo < iFrom) return emptyBaseline();

  const pick = (slotProd, slotMau) => {
    const own = dailyValues(index, keys, iFrom, iTo, slotProd, slotMau);
    if (own.length >= minPoints) {
      return { value: agg(own), dayCount: own.length, level: 'own' };
    }
    if (fbKeys) {
      const fb = dailyValues(index, fbKeys, iFrom, iTo, slotProd, slotMau);
      if (fb.length) return { value: agg(fb), dayCount: fb.length, level: 'fallback' };
    }
    return {
      value: own.length ? agg(own) : null,
      dayCount: own.length,
      level: own.length ? 'own' : 'none'
    };
  };

  const stages = {};
  let worst = 'own';
  for (let s = 0; s < STAGE_KEYS.length; s++) {
    const r = pick(1 + s * 2, 2 + s * 2);
    stages[STAGE_KEYS[s]] = r;
    if (r.level === 'fallback') worst = 'fallback';
    else if (r.level === 'none' && worst !== 'fallback') worst = 'none';
  }
  return { stages, e2e: pick(9, 10), level: worst };
}

function emptyBaseline() {
  const stages = {};
  for (const k of STAGE_KEYS) stages[k] = { value: null, dayCount: 0, level: 'none' };
  return { stages, e2e: { value: null, dayCount: 0, level: 'none' }, level: 'none' };
}

/** Dịch 'YYYY-MM-DD' đi n ngày. Dùng UTC để không lệ thuộc timezone máy. */
export function shiftDate(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Phân loại lệch
// ---------------------------------------------------------------------------

/**
 * Phân loại 2 chiều. Khác bản cũ ở 2 điểm:
 *  - Tăng dưới ngưỡng KHÔNG còn tô xanh "tốt" (bản cũ tô #059669 cho cả +9,1%,
 *    tức leadtime xấu đi 9% mà vẫn xanh) -> direction 'up', UI dùng màu trung tính.
 *  - Giảm quá anomalyDropPct thì gắn cờ nghi lỗi data, không phải thành tích.
 */
export function classifyDeviation(
  current,
  baseline,
  thresholds = THRESHOLD_PRESETS[DEFAULT_PRESET],
  config = BASELINE_CONFIG
) {
  if (current === null || current === undefined || baseline === null || baseline === undefined || !(baseline > 0)) {
    return { pct: null, level: 'normal', direction: 'flat', suspectData: false };
  }
  const pct = Math.round(((current - baseline) / baseline) * 1000) / 10;
  const drop = config.anomalyDropPct ?? BASELINE_CONFIG.anomalyDropPct;

  if (pct <= -drop) {
    return { pct, level: 'critical', direction: 'down', suspectData: true };
  }
  let level = 'normal';
  if (pct >= thresholds.criticalPct) level = 'critical';
  else if (pct >= thresholds.warningPct) level = 'warning';

  const direction = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
  return { pct, level, direction, suspectData: false };
}

/**
 * impact = số đơn × số giờ lệch so baseline, đơn vị "giờ × đơn" = tổng giờ trễ
 * cộng dồn của tuyến trong kỳ.
 *
 * Vì sao không sort theo % lệch hay theo e2e:
 *  - Theo % lệch: 27,3% dòng có mau < 5, một tuyến mau=1 lệch +200% sẽ luôn
 *    đứng đầu mà không ai cần xử lý.
 *  - Theo e2e giảm dần: Cross region luôn cao nhất về bản chất địa lý nên danh
 *    sách không bao giờ đổi và không mang thông tin.
 */
export function stageImpact(mau, current, baseline) {
  if (!(mau > 0) || current === null || baseline === null) return 0;
  return mau * (current - baseline);
}

// Number('') === 0 nên phải loại chuỗi rỗng TRƯỚC khi ép số, không thì ô CSV
// trống sẽ hiện "0.0h" — tức "chặng này nhanh 0 giờ" thay vì "không có số".
function isBlank(value) {
  return value === null || value === undefined || value === '' ||
    (typeof value === 'string' && value.trim() === '');
}

export function formatHours(value, digits = 1) {
  if (isBlank(value) || !Number.isFinite(Number(value))) return '–';
  return `${Number(value).toFixed(digits)}h`;
}

export function formatDeviation(value, digits = 1) {
  if (isBlank(value) || !Number.isFinite(Number(value))) return '–';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function formatOrders(value) {
  if (isBlank(value) || !Number.isFinite(Number(value))) return '–';
  return Math.round(Number(value)).toLocaleString('vi-VN');
}
