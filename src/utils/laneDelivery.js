// KAS-314: 1st Deli / ODR theo lane. Logic thuần (không React, không mạng) để test được.
// Dựng ma trận cùng hình dạng với buildWeeklyMatrix (weeklyKpi.js) để dùng chung KpiMatrixTable:
// Toàn quốc > Lane > Loại hub, mỗi cột là một ngày hoặc một tuần (thứ Hai - Chủ nhật).
import { getLanesFromRows, normalizeLane } from './laneTaxonomy.js';
import { WEEKLY_METRICS, weekLabel, dayLabel, addDays } from './weeklyKpi.js';

// Cùng khoá chỉ số với Chi tiết Vùng/Hub để dùng chung mốc target và cài đặt tô màu của người dùng.
export const LANE_DELIVERY_METRIC_KEYS = ['d1st', 'dodr'];
export const LANE_DELIVERY_DEFAULT_DAYS = 14;
export const LANE_ROW_HEADER = 'Lane / Loại hub';

const num = value => Number(value) || 0;

export function normalizeLaneDeliveryRows(rows) {
  return (rows || [])
    .filter(r => r && r.report_date && r.lane && r.client_name)
    .map(r => ({ ...r, mau_deli: num(r.mau_deli), ontime_deli_1st: num(r.ontime_deli_1st), ontime_deli_odr: num(r.ontime_deli_odr) }));
}

/** Thứ Hai của tuần chứa ~day~ (khớp date_trunc('week') của các bảng tuần). */
export function mondayOf(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

const periodOf = (day, mode) => (mode === 'week' ? mondayOf(day) : day);

/** Các kỳ (ngày hoặc thứ Hai) có dữ liệu của client, tăng dần. */
export function laneDeliveryPeriods(rows, { client = 'ALL', mode = 'day' } = {}) {
  const set = new Set();
  rows.forEach(r => { if (client === 'ALL' || r.client_name === client) set.add(periodOf(r.report_date, mode)); });
  return [...set].sort();
}

const toStat = ({ tot, ont }) => ({ tot, ont, pct: tot > 0 ? (ont / tot) * 100 : null });

/**
 * Ma trận Toàn quốc > Lane > Loại hub x kỳ. `periods` là danh sách kỳ hiển thị (ngày hoặc thứ Hai).
 * Hình dạng giống buildWeeklyMatrix: `miens` chỉ có một nhóm không tên (KpiMatrixTable bỏ hàng nhóm),
 * mỗi lane là một `region` mở rộng được, loại hub là `hubs`.
 */
export function buildLaneMatrix({ rows, metricKey, client = 'ALL', mode = 'day', periods }) {
  const metric = WEEKLY_METRICS[metricKey];
  if (!metric || !LANE_DELIVERY_METRIC_KEYS.includes(metricKey)) throw new Error(`Unknown lane metric: ${metricKey}`);
  const index = new Map(periods.map((period, i) => [period, i]));
  const blank = () => periods.map(() => ({ tot: 0, ont: 0 }));
  const bucket = (map, key) => { if (!map.has(key)) map.set(key, blank()); return map.get(key); };

  const scoped = rows.filter(r => client === 'ALL' || r.client_name === client);
  const laneList = getLanesFromRows(scoped, 'lane');
  const all = blank();
  const laneStats = new Map();
  const hubStats = new Map();
  const hubNames = new Map();
  const daysInPeriod = periods.map(() => new Set());

  scoped.forEach(r => {
    const i = index.get(periodOf(r.report_date, mode));
    if (i === undefined) return;
    const tot = num(r[metric.total]), ont = num(r[metric.ontime]);
    const laneKey = normalizeLane(r.lane);
    const hub = r.hub_type || 'Chưa rõ';
    daysInPeriod[i].add(r.report_date);
    all[i].tot += tot; all[i].ont += ont;
    const l = bucket(laneStats, laneKey)[i]; l.tot += tot; l.ont += ont;
    const hubKey = `${laneKey}::${hub}`;
    if (!hubNames.has(hubKey)) hubNames.set(hubKey, { id: hubKey, laneKey, name: hub });
    const h = bucket(hubStats, hubKey)[i]; h.tot += tot; h.ont += ont;
  });

  const volume = stats => stats.reduce((sum, s) => sum + s.tot, 0);
  const regions = laneList.filter(({ key }) => laneStats.has(key)).map(({ key, label }) => {
    const hubs = [...hubNames.values()].filter(h => h.laneKey === key)
      .map(h => ({ id: h.id, name: h.name, stats: hubStats.get(h.id).map(toStat), vol: volume(hubStats.get(h.id)) }))
      .sort((a, b) => b.vol - a.vol);
    return { region: label, stats: laneStats.get(key).map(toStat), hubs, hubCount: hubs.length };
  });

  const allStats = all.map(toStat);
  return {
    metric,
    weeks: periods.map((start, i) => ({
      start, days: daysInPeriod[i].size,
      ...(mode === 'week' ? weekLabel(start, daysInPeriod[i].size) : dayLabel(start))
    })),
    all: allStats,
    miens: regions.length ? [{ mien: null, stats: allStats, regions }] : [],
    maxPct: 0,
    empty: allStats.every(s => s.tot === 0)
  };
}

/**
 * Áp bộ lọc Loại Hub của header. `selectedHubTypes` mặc định là hợp các loại hub có trong
 * Pick/Deli/Ca1/FD/Reverse; bảng lane có thể có loại mà các nguồn đó chưa có (hoặc các nguồn đó chưa tải
 * xong -> danh sách rỗng). Vì vậy chỉ lọc khi người dùng thật sự thu hẹp lựa chọn (`isHubTypeFiltered`);
 * mặc định "tất cả" giữ nguyên mọi dòng để tổng lane khớp query nguồn.
 */
export function scopeLaneRowsByHubType(rows, selectedHubTypes, isHubTypeFiltered) {
  if (!isHubTypeFiltered || !Array.isArray(selectedHubTypes)) return rows;
  return rows.filter(r => selectedHubTypes.includes(r.hub_type || 'Unknown'));
}
