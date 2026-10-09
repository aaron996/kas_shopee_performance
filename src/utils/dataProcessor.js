// Utility Data Processor & Aggregator for GHN KAS Ontime Reports
import { MIEN_REGIONS, MIEN_ORDER, TARGET_KPIS, GXT_REGION_BY_MIEN } from '../data/defaultDataset.js';
import { mienFromHubName } from '../data/provinceMien.js';

// Format helpers
export function getHubType(row) {
  if (!row) return 'Unknown';
  return row['hub type'] || row['Hub Type'] || row.hub_type || row.Hub_Type || row.hubType || row.HubType || 'Unknown';
}

const HUB_TYPE_KEYS = ['hub type', 'Hub Type', 'hub_type', 'Hub_Type', 'hubType', 'HubType'];

// Key Account warehouses and the standalone vùng each one is reported as
// (same convention as "HCM - GXT"). The raw sheet/Supabase data files their
// rows under whatever region the order came from (HCM, DNB, XBG…), so the vùng
// is decided by the hub itself. "(HNO) LH Long Biên" is the renamed "Key
// Account Warehouse Ha Noi" and still arrives as hub_type = BC.
// Keep in sync with public.get_ai_chat_metric (AI chat backend).
const KA_HUB_REGIONS = {
  'key account warehouse ho chi minh': 'HCM - KA',
  '(hno) lh long biên': 'HNO - KA',
};

// Fallback for a KA hub not listed above: keep it next to its city.
const KA_REGION_BY_REGION = { HCM: 'HCM - KA', HNO: 'HNO - KA' };

const normalizeHubName = (name) => String(name || '').normalize('NFC').trim().toLowerCase();

// "CK" hubs, reported as their own Loại Hub (hub type) and, in HCM / HNO, as
// their own vùng ("HCM - CK" / "HNO - CK", like the KA vùng) — same rule as the
// BI query: warehouse name contains "CK" (case-sensitive, like SQL LIKE) or the
// wh_id is on this list. A CK hub outside HCM / HNO only gets the hub type.
const CK_WAREHOUSE_IDS = new Set([
  23119000, 23133000, 22991000, 23102000, 23063000, 22490000, 23047000,
  22990000, 22878000, 22928000, 20513000, 22888000, 23199000, 22615000,
  22612000, 22985000, 23120000, 22424000, 22966000, 23164000, 22619000,
  23027000, 22974000, 23067000, 22962001, 22750000, 23017000, 22517001,
  22543000, 22913001, 22530000, 22520001, 22437001, 22494000, 22494001,
  23146000, 23088000, 22499000, 22370001, 2533, 21296003, 23118000,
  23011000, 21485000, 22367001, 23109000, 20124000, 22409001, 22586001,
  22498001, 22484000, 22975001, 22604000, 23123000, 23098000, 23152000,
  23155000
]);

export const CK_HUB_TYPE = 'CK';
const CK_REGION_BY_REGION = { HCM: 'HCM - CK', HNO: 'HNO - CK' };

export function isCkHub(row) {
  if (!row) return false;
  const name = String(row.hub ?? row.deliverywh ?? '');
  if (name.includes('CK')) return true;
  const whId = String(row.wh_id ?? '').trim();
  return /^\d+$/.test(whId) && CK_WAREHOUSE_IDS.has(Number(whId));
}

// Tag known KA warehouses as hub type KA and move every KA row into its own
// KA vùng, so every report groups it as an independent vùng. Then tag CK hubs
// with hub type CK and move the HCM / HNO ones into their CK vùng (KA wins: a
// KA warehouse is never re-typed).
export function reassignKaRegion(rows) {
  if (!rows) return rows;
  return rows.map(r => {
    if (!r) return r;
    const kaHubRegion = KA_HUB_REGIONS[normalizeHubName(r.hub ?? r.deliverywh)];
    if (kaHubRegion) {
      const typeKey = HUB_TYPE_KEYS.find(k => r[k]) || 'hub_type';
      return { ...r, [typeKey]: 'KA', region: kaHubRegion };
    }
    const kaRegion = KA_REGION_BY_REGION[r.region];
    if (kaRegion && String(getHubType(r)).trim().toUpperCase() === 'KA') {
      return { ...r, region: kaRegion };
    }
    if (isCkHub(r)) {
      const typeKey = HUB_TYPE_KEYS.find(k => r[k]) || 'hub_type';
      return { ...r, [typeKey]: CK_HUB_TYPE, region: CK_REGION_BY_REGION[r.region] ?? r.region };
    }
    return r;
  });
}

// GXT hubs are reported as one vùng per Miền ("GXT - Bắc" / "GXT - Trung" /
// "GXT - Nam"), not under the vùng of the order — the raw `region` of a GXT row
// is where the order came from (hub "Tân Tạo - HCM" also has rows under DSH, HNO
// and TTB). The Miền comes from the province at the end of the hub name; a hub
// whose province is not recognised falls back to its row's region, and a row
// that resolves to neither is left as it was.
export const GXT_HUB_TYPE = 'GXT';
const LEGACY_GXT_REGION_MIEN = { 'HCM - GXT': 'Miền Nam' };

function mienOfRegion(region) {
  return LEGACY_GXT_REGION_MIEN[region]
    ?? MIEN_ORDER.find(mien => MIEN_REGIONS[mien].includes(region));
}

// Run after reassignKaRegion: a GXT hub that is also a KA / CK hub keeps that
// type and vùng, since only rows still typed GXT are moved.
export function reassignGxtMienRegion(rows) {
  if (!rows) return rows;
  return rows.map(r => {
    if (!r || String(getHubType(r)).trim().toUpperCase() !== GXT_HUB_TYPE) return r;
    const mien = mienFromHubName(r.hub ?? r.deliverywh) ?? mienOfRegion(r.region);
    return mien ? { ...r, region: GXT_REGION_BY_MIEN[mien] } : r;
  });
}

// What every dashboard view runs the raw sheet rows through.
export const normalizeDashboardRows = (rows) => reassignGxtMienRegion(reassignKaRegion(rows));

// The dashboard's Vùng / Loại Hub filter. Ca1 rows carry their vùng in
// `vung_giao` instead of `region`.
export function filterRowsByScope(rows, regions, hubTypes, regionKey = 'region') {
  return rows.filter(r => regions.includes(r[regionKey]) && hubTypes.includes(getHubType(r)));
}

// Every hub type present in the loaded rows — what "Loại Hub: Tất cả" means.
export function collectHubTypes(rowSets) {
  const types = new Set();
  rowSets.forEach(rows => rows.forEach(r => {
    const type = getHubType(r);
    if (type) types.add(type);
  }));
  return Array.from(types).sort();
}

export function formatPct(val) {
  if (val === null || val === undefined || isNaN(val)) return '–';
  return val.toFixed(1) + '%';
}

export function formatVol(val) {
  if (val === null || val === undefined || isNaN(val)) return '–';
  return val.toLocaleString('vi-VN');
}

export function formatDiff(diff) {
  if (diff === null || diff === undefined || isNaN(diff)) return '–';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
}

// Helper to determine day of week string (T2 - CN)
export function getWeekdayName(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const day = d.getDay();
  const map = { 0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7' };
  return map[day] || '';
}

export function formatDateLabel(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) return '–';
  const parts = dateStr.split('-');
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `${day}/${month}\n${getWeekdayName(dateStr)}`;
}

export function formatShortDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) return '';
  const [, month, day] = dateStr.split('-');
  return `${String(Number(day)).padStart(2, '0')}/${String(Number(month)).padStart(2, '0')}`;
}

// D-8/D-15 is a calendar-date comparison. Do not substitute an unrelated
// date when the expected comparison date is absent from the data set.
export function getComparisonDateInfo(d1Str, datesArr = [], offsetDays = 7) {
  if (!d1Str || !Array.isArray(datesArr) || !datesArr.length) return null;
  const parts = d1Str.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

  const comparisonDate = new Date(parts[0], parts[1] - 1, parts[2]);
  comparisonDate.setDate(comparisonDate.getDate() - offsetDays);
  const padded = `${comparisonDate.getFullYear()}-${String(comparisonDate.getMonth() + 1).padStart(2, '0')}-${String(comparisonDate.getDate()).padStart(2, '0')}`;
  const unpadded = `${comparisonDate.getFullYear()}-${comparisonDate.getMonth() + 1}-${comparisonDate.getDate()}`;
  const comparisonDateStr = datesArr.includes(padded) ? padded : (datesArr.includes(unpadded) ? unpadded : null);
  if (!comparisonDateStr) return null;

  return {
    d1: formatShortDate(d1Str),
    dComp: formatShortDate(comparisonDateStr),
    comparisonDateStr
  };
}

// FD is reported after its operational delay. Its matrix must show the full
// D-22 → D-8 window: 15 calendar days ending at the latest available FD day.
// Keep only dates that exist in the supplied dataset; missing source dates are
// never replaced with a neighbouring day.
export function getTrailingDateRange(datesArr = [], days = 15) {
  if (!Array.isArray(datesArr) || !datesArr.length || days < 1) return [];
  const sorted = [...new Set(datesArr)].sort((a, b) => new Date(a) - new Date(b));
  const lastDate = new Date(sorted[sorted.length - 1]);
  if (Number.isNaN(lastDate.getTime())) return [];
  const firstDate = new Date(lastDate);
  firstDate.setDate(lastDate.getDate() - (days - 1));
  return sorted.filter(date => {
    const value = new Date(date);
    return !Number.isNaN(value.getTime()) && value >= firstDate && value <= lastDate;
  });
}

export function getWeekNumber(dateStr) {
  if (!dateStr) return '';
  const p = dateStr.split('-');
  const dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
  const week1 = new Date(dt.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((dt.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return weekNum;
}

// Group dates into Week W-1 and Week WTD
export function groupDatesByWeek(dates) {
  // Sort dates chronologically using proper Date parsing (since unpadded strings sort incorrectly)
  const parseToLocal = (dStr) => {
    const p = dStr.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  };

  const sorted = [...dates].sort((a, b) => parseToLocal(a) - parseToLocal(b));
  if (sorted.length === 0) return { weekPrev: [], weekCurrent: [], d1Date: '' };

  const d1Date = sorted[sorted.length - 1]; // D-1 is the last available date

  const d1 = parseToLocal(d1Date);
  const d1Day = d1.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const d1DayOffset = d1Day === 0 ? 6 : d1Day - 1; // offset from Monday (Mon=0, Tue=1, ..., Sun=6)

  const currentWeekMonday = new Date(d1);
  currentWeekMonday.setDate(d1.getDate() - d1DayOffset);

  const prevWeekMonday = new Date(currentWeekMonday);
  prevWeekMonday.setDate(currentWeekMonday.getDate() - 7);

  const weekCurrent = [];
  const weekPrev = [];

  sorted.forEach(dStr => {
    const dt = parseToLocal(dStr);
    if (dt >= currentWeekMonday && dt <= d1) {
      weekCurrent.push(dStr);
    } else if (dt >= prevWeekMonday && dt < currentWeekMonday) {
      weekPrev.push(dStr);
    }
  });

  return {
    weekPrev,
    weekCurrent,
    d1Date
  };
}

// Color calculations with Dark Mode & Theme inherited background support
export function getContinuousColorStyle(val, target, minVal) {
  if (val === null || val === undefined || isNaN(val) || target === null || target === undefined || isNaN(target)) {
    return {};
  }
  if (val >= target) {
    return {}; // Inherits row background dynamically in both Light & Dark Mode
  }

  const effectiveMin = Math.min(minVal, target - 10);
  const ratio = Math.min(1, Math.max(0, (target - val) / (target - effectiveMin)));

  // Translucent Red overlay (rgba) scales smoothly over light & dark backgrounds
  const alpha = 0.25 + ratio * 0.75;
  const textColor = ratio >= 0.35 ? '#FFFFFF' : 'inherit';

  return {
    backgroundColor: `rgba(225, 45, 35, ${alpha.toFixed(2)})`,
    color: textColor,
    fontWeight: ratio > 0.3 ? '700' : '500'
  };
}

// FD is an exception: a larger completion ratio means more failed-delivery
// orders. Values at or below the fixed 3% operational threshold stay neutral;
// values above it progressively receive a red overlay up to the table maximum.
export function getHigherIsWorseColorStyle(val, threshold, maxVal) {
  if (val === null || val === undefined || isNaN(val) || threshold === null || threshold === undefined || maxVal === null || maxVal === undefined || isNaN(threshold) || isNaN(maxVal) || val <= threshold || maxVal <= threshold) {
    return {};
  }
  const ratio = Math.min(1, Math.max(0, (val - threshold) / (maxVal - threshold)));
  const alpha = 0.25 + ratio * 0.75;
  return {
    backgroundColor: `rgba(225, 45, 35, ${alpha.toFixed(2)})`,
    color: ratio >= 0.35 ? '#FFFFFF' : 'inherit',
    fontWeight: ratio > 0.3 ? '700' : '500'
  };
}

// Stepped heat tier (0 = đạt, 1–3 = càng xa target càng nặng) cho Report 1.
// Bậc cố định theo điểm % dưới target thay vì tương đối với min của bảng, để
// cùng một giá trị luôn ra cùng một màu giữa các ngày. So trên giá trị đã làm
// tròn 1 chữ số — đúng con số người đọc thấy — nên ô hiện "97.0%" không bao
// giờ bị tô như trượt target 97%.
export const HEAT_TIER_STEPS = [2, 5];

export function getHeatTier(val, target) {
  if (val === null || val === undefined || isNaN(val) || target === null || target === undefined || isNaN(target)) {
    return 0;
  }
  const shown = Math.round(val * 10) / 10;
  if (shown >= target) return 0;
  if (shown >= target - HEAT_TIER_STEPS[0]) return 1;
  if (shown >= target - HEAT_TIER_STEPS[1]) return 2;
  return 3;
}

// FD: tỷ lệ càng cao càng tệ, không có target cố định ngoài ngưỡng 3%. Giữ
// thang tương đối theo max của bảng như trước, chỉ lượng tử hoá thành 3 bậc
// để dùng chung bảng màu (và độ tương phản) với các chỉ số khác.
export function getHigherIsWorseTier(val, threshold, maxVal) {
  if (val === null || val === undefined || isNaN(val) || threshold === null || threshold === undefined || maxVal === null || maxVal === undefined || isNaN(threshold) || isNaN(maxVal)) {
    return 0;
  }
  const shown = Math.round(val * 10) / 10;
  if (shown <= threshold || maxVal <= threshold) return 0;
  const ratio = Math.min(1, (shown - threshold) / (maxVal - threshold));
  if (ratio < 1 / 3) return 1;
  if (ratio < 2 / 3) return 2;
  return 3;
}

export function getFixed3TierColorStyle(val, target) {
  if (val === null || val === undefined || isNaN(val)) {
    return {};
  }
  if (val >= target) {
    return {};
  }
  if (val >= target - 2.0) {
    return { backgroundColor: 'rgba(234, 179, 8, 0.25)', color: 'inherit' };
  }
  return { backgroundColor: 'rgba(225, 45, 35, 0.85)', color: '#FFFFFF', fontWeight: '600' };
}

export function getPercentile3ColorStyle(val, p25, p75) {
  if (val === null || val === undefined || isNaN(val)) {
    return {};
  }
  if (val >= p75) {
    return {};
  }
  if (val >= p25) {
    return { backgroundColor: 'rgba(234, 179, 8, 0.25)', color: 'inherit' };
  }
  return { backgroundColor: 'rgba(225, 45, 35, 0.85)', color: '#FFFFFF', fontWeight: '600' };
}
