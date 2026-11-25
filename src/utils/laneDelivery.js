// KAS-314: 1st Deli / ODR theo lane. Logic thuần (không React, không mạng) để test được.
// Dựng ma trận cùng hình dạng với buildWeeklyMatrix (weeklyKpi.js) để dùng chung KpiMatrixTable:
// Toàn quốc > Lane > Loại hub, mỗi cột là một ngày hoặc một tuần (thứ Hai - Chủ nhật).
import { getLanesFromRows, normalizeLane } from './laneTaxonomy.js';
import { WEEKLY_METRICS, weekLabel, dayLabel, addDays } from './weeklyKpi.js';
import { getReportWeekLabel } from './dataProcessor.js';

// Cùng khoá chỉ số với Chi tiết Vùng/Hub để dùng chung mốc target và cài đặt tô màu của người dùng.
export const LANE_DELIVERY_METRIC_KEYS = ['d1st', 'dodr'];
export const LANE_DELIVERY_DEFAULT_DAYS = 14;
export const LANE_ROW_HEADER = 'Lane / Loại hub / Vùng giao';
export const LANE_NO_VUNG_LABEL = 'Chưa rõ vùng';

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

/** Cùng ngày (hoặc ngày cuối tháng nếu tháng trước ngắn hơn) của tháng trước. */
export function sameDayLastMonth(day) {
  const [y, m, d] = day.split('-').map(Number);
  const lastOfPrev = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 2, Math.min(d, lastOfPrev))).toISOString().slice(0, 10);
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
export function buildLaneMatrix({ rows, metricKey, client = 'ALL', mode = 'day', periods, benchmark = false }) {
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
  const vungStats = new Map();
  const vungNames = new Map();
  const daysInPeriod = periods.map(() => new Set());
  // Chuỗi theo ngày của từng dòng (kể cả ngày ngoài `periods`) để tính WTD / Tốt nhất 6 tuần / Cùng ngày tháng trước.
  const useBench = benchmark && mode === 'day' && periods.length > 0;
  const series = new Map();
  const addDay = (key, date, tot, ont) => {
    if (!series.has(key)) series.set(key, new Map());
    const m = series.get(key);
    const cur = m.get(date) || { tot: 0, ont: 0 };
    cur.tot += tot; cur.ont += ont; m.set(date, cur);
  };

  scoped.forEach(r => {
    const tot = num(r[metric.total]), ont = num(r[metric.ontime]);
    const laneKey = normalizeLane(r.lane);
    const hub = r.hub_type || 'Chưa rõ';
    const vung = String(r.vung_giao || '').trim() || LANE_NO_VUNG_LABEL;
    if (useBench) { addDay('all', r.report_date, tot, ont); addDay(`l:${laneKey}`, r.report_date, tot, ont); addDay(`h:${laneKey}::${hub}`, r.report_date, tot, ont); addDay(`v:${laneKey}::${hub}::${vung}`, r.report_date, tot, ont); }
    const i = index.get(periodOf(r.report_date, mode));
    if (i === undefined) return;
    daysInPeriod[i].add(r.report_date);
    all[i].tot += tot; all[i].ont += ont;
    const l = bucket(laneStats, laneKey)[i]; l.tot += tot; l.ont += ont;
    const hubKey = `${laneKey}::${hub}`;
    if (!hubNames.has(hubKey)) hubNames.set(hubKey, { id: hubKey, laneKey, name: hub });
    const h = bucket(hubStats, hubKey)[i]; h.tot += tot; h.ont += ont;
    const vungKey = `${hubKey}::${vung}`;
    if (!vungNames.has(vungKey)) vungNames.set(vungKey, { id: vungKey, hubKey, name: vung });
    const v = bucket(vungStats, vungKey)[i]; v.tot += tot; v.ont += ont;
  });

  const volume = stats => stats.reduce((sum, s) => sum + s.tot, 0);
  const regions = laneList.filter(({ key }) => laneStats.has(key)).map(({ key, label }) => {
    const hubs = [...hubNames.values()].filter(h => h.laneKey === key)
      .map(h => {
        // Tầng vùng giao dưới loại hub; chỉ mở được khi có ít nhất một vùng thật (không chỉ "Chưa rõ vùng").
        const vungs = [...vungNames.values()].filter(v => v.hubKey === h.id)
          .map(v => ({ id: v.id, name: v.name, stats: vungStats.get(v.id).map(toStat), vol: volume(vungStats.get(v.id)) }))
          .sort((a, b) => (a.name === LANE_NO_VUNG_LABEL) - (b.name === LANE_NO_VUNG_LABEL) || b.vol - a.vol);
        return { id: h.id, name: h.name, stats: hubStats.get(h.id).map(toStat), vol: volume(hubStats.get(h.id)),
          vungs: vungs.some(v => v.name !== LANE_NO_VUNG_LABEL) ? vungs : [] };
      })
      .sort((a, b) => b.vol - a.vol);
    return { region: label, laneKey: key, stats: laneStats.get(key).map(toStat), hubs, hubCount: hubs.length };
  });

  const allStats = all.map(toStat);

  // So sánh của ngày mới nhất: WTD (thứ Hai -> ngày mới nhất), chênh so với ngày tốt nhất trong 6 tuần trước
  // (cùng thứ) và so với cùng ngày tháng trước. Thiếu mẫu số thì null, không coi là 0.
  const latest = periods[periods.length - 1];
  const bench = key => {
    const m = series.get(key) || new Map();
    const pctOn = day => { const v = m.get(day); return v && v.tot > 0 ? (v.ont / v.tot) * 100 : null; };
    const wtd = { tot: 0, ont: 0 };
    for (let d = mondayOf(latest); d <= latest; d = addDays(d, 1)) { const v = m.get(d); if (v) { wtd.tot += v.tot; wtd.ont += v.ont; } }
    const cur = pctOn(latest);
    const prior = [1, 2, 3, 4, 5, 6].map(k => pctOn(addDays(latest, -7 * k))).filter(v => v !== null);
    const best = prior.length ? Math.max(...prior) : null;
    const same = pctOn(sameDayLastMonth(latest));
    return { wtd: toStat(wtd), diffBest: cur !== null && best !== null ? cur - best : null, diffSame: cur !== null && same !== null ? cur - same : null };
  };
  if (useBench) {
    regions.forEach(reg => {
      reg.bench = bench(`l:${reg.laneKey}`);
      reg.hubs.forEach(h => { h.bench = bench(`h:${h.id}`); h.vungs.forEach(v => { v.bench = bench(`v:${v.id}`); }); });
    });
  }
  const groups = [];
  if (useBench) {
    periods.forEach(p => {
      const monday = mondayOf(p);
      const last = groups[groups.length - 1];
      if (last && last.key === monday) last.span += 1;
      else groups.push({ key: monday, span: 1, title: getReportWeekLabel(monday) });
    });
  }
  return {
    metric,
    weeks: periods.map((start, i) => ({
      start, days: daysInPeriod[i].size,
      ...(mode === 'week' ? weekLabel(start, daysInPeriod[i].size) : dayLabel(start))
    })),
    all: allStats,
    miens: regions.length ? [{ mien: null, stats: allStats, regions }] : [],
    ...(useBench ? { groups, allBench: bench('all') } : {}),
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
