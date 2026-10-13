// Chế độ "Theo tuần" của Chi tiết Vùng/Hub. Số liệu lấy từ các bảng lịch sử
// (kas_*_history) qua RPC get_kas_weekly_rows, đã cộng sẵn theo hub-tuần. Mỗi dòng
// mang đúng tên cột của dòng hàng ngày (report_date là thứ Hai của tuần) nên chạy lại
// được normalizeDashboardRows (KA, CK, GXT) rồi cộng tuần như bình thường.
import { MIEN_REGIONS, MIEN_ORDER } from '../data/defaultDataset.js';
import { normalizeDashboardRows, getHubType, getWeekNumber, formatShortDate } from './dataProcessor.js';
import { getHubIdentityKey } from './performanceRanking.js';

export const WEEKLY_WEEKS = 9; // tuần hiện tại + 8 tuần nguyên trước đó

// Mỗi chỉ số: bảng nguồn, cột mẫu, cột đúng giờ, mốc target (null = FD, càng cao càng tệ).
export const WEEKLY_METRICS = {
  p1st: { dataset: 'pick', title: '1ST PICKUP', total: 'mau_pu', ontime: 'ontime_pu_1st', target: 97 },
  popr: { dataset: 'pick', title: 'OPR', total: 'mau_pu', ontime: 'ontime_pu_opr', target: 90 },
  d1st: { dataset: 'deli', title: '1ST DELI', total: 'mau_deli', ontime: 'ontime_deli_1st', target: 95 },
  dodr: { dataset: 'deli', title: 'ODR', total: 'mau_deli', ontime: 'ontime_deli_odr', target: 90 },
  fd: { dataset: 'fd', title: 'FD', total: 'mau_fd', ontime: 'fd_hoan_thanh', target: null, isFd: true }
};

const cache = new Map(); // dataset -> Promise<{ weeks, rows }>

// RPC gọn trả mỗi dòng là một mảng theo thứ tự `cols` (nhỏ hơn ~60% so với đối tượng lặp tên cột).
export function expandCompactRows(cols, rows) {
  return rows.map(values => {
    const row = {};
    for (let i = 0; i < cols.length; i++) row[cols[i]] = values[i];
    return row;
  });
}

// Gọi RPC và chuẩn hoá vùng/loại Hub. Kết quả được nhớ theo bảng nguồn để chuyển tab
// 1st Pickup <-> OPR không gọi lại; lỗi thì bỏ khỏi cache để lần sau thử lại.
export function fetchWeeklyRows(client, dataset, weeks = WEEKLY_WEEKS) {
  const key = `${dataset}:${weeks}`;
  if (!cache.has(key)) {
    const request = (async () => {
      const { data, error } = await client.rpc('get_kas_weekly_compact', { dataset, weeks });
      if (error) throw error;
      if (!data || !Array.isArray(data.weeks) || !Array.isArray(data.cols) || !Array.isArray(data.rows)) throw new Error('INVALID_WEEKLY_PAYLOAD');
      return { weeks: data.weeks, rows: normalizeDashboardRows(expandCompactRows(data.cols, data.rows)) };
    })();
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key);
}

// Dòng hub-ngày từ bảng lịch sử cho Xuất CSV "Theo ngày" với khoảng dài hơn dữ liệu trong trang.
// Chia khoảng thành lát 10 ngày (RPC cho tối đa 14) và tải lần lượt, không bắn song song.
export const DAILY_EXPORT_DAYS = 90; // khớp retention của prune_kas_history
export const DAILY_SLICE_DAYS = 10; // ~1,7 MB/lát; 31 ngày ≈ 5,4 MB dễ nghẽn tầng API
export async function fetchDailyRows(client, dataset, from, to) {
  const rows = [];
  for (let start = from; start <= to; start = addDays(start, DAILY_SLICE_DAYS)) {
    const end = addDays(start, DAILY_SLICE_DAYS - 1) < to ? addDays(start, DAILY_SLICE_DAYS - 1) : to;
    const { data, error } = await client.rpc('get_kas_daily_compact', { dataset, from_date: start, to_date: end });
    if (error) throw error;
    if (!data || !Array.isArray(data.cols) || !Array.isArray(data.rows)) throw new Error('INVALID_DAILY_PAYLOAD');
    rows.push(...expandCompactRows(data.cols, data.rows));
  }
  return normalizeDashboardRows(rows);
}

export function clearWeeklyCache() {
  cache.clear();
}

const num = value => Number(value) || 0;

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "Tuần 41" + khoảng ngày; tuần cuối chưa đủ 7 ngày ghi rõ số ngày đã có.
export function weekLabel(start, days) {
  const partial = days > 0 && days < 7;
  return {
    title: `Tuần ${getWeekNumber(start)}`,
    range: `${formatShortDate(start)}–${formatShortDate(addDays(start, 6))}`,
    note: partial ? `${days} ngày` : ''
  };
}

const toStat = ({ tot, ont }) => ({ tot, ont, pct: tot > 0 ? (ont / tot) * 100 : null });

// Dựng ma trận Toàn quốc > Miền > Vùng > Hub x tuần.
export function buildWeeklyMatrix({
  rows, weeks, metricKey, clientFilter = 'ALL', selectedRegions = null, selectedHubTypes = null, hubLimit = 10
}) {
  const metric = WEEKLY_METRICS[metricKey];
  if (!metric) throw new Error(`Unknown weekly metric: ${metricKey}`);
  const weekIndex = new Map(weeks.map((week, index) => [week, index]));
  const blank = () => weeks.map(() => ({ tot: 0, ont: 0 }));
  const bucket = (map, key) => { if (!map.has(key)) map.set(key, blank()); return map.get(key); };

  const all = blank();
  const mienStats = new Map();
  const regionStats = new Map();
  const hubInfo = new Map();
  const hubStats = new Map();
  const weekDays = weeks.map(() => 0);

  rows.forEach(r => {
    const index = weekIndex.get(r.report_date);
    if (index === undefined) return;
    if (clientFilter !== 'ALL' && r.client_name !== clientFilter) return;
    if (selectedRegions && !selectedRegions.includes(r.region)) return;
    if (selectedHubTypes && !selectedHubTypes.includes(getHubType(r))) return;

    const tot = num(r[metric.total]);
    const ont = num(r[metric.ontime]);
    const region = r.region;
    const mien = MIEN_ORDER.find(m => MIEN_REGIONS[m].includes(region)) || 'Miền Khác';
    weekDays[index] = Math.max(weekDays[index], num(r.days));

    all[index].tot += tot; all[index].ont += ont;
    const m = bucket(mienStats, mien)[index]; m.tot += tot; m.ont += ont;
    const g = bucket(regionStats, region)[index]; g.tot += tot; g.ont += ont;

    const hubName = metric.isFd ? (r.deliverywh || 'Khác') : r.hub;
    const hubId = metric.isFd ? `${region}::${hubName}` : getHubIdentityKey(r);
    if (!hubInfo.has(hubId)) hubInfo.set(hubId, { id: hubId, region, hub: hubName, hubType: metric.isFd ? '' : getHubType(r) });
    const h = bucket(hubStats, hubId)[index]; h.tot += tot; h.ont += ont;
  });

  const last = weeks.length - 1;
  const lateVol = stats => (last >= 0 ? stats[last].tot - stats[last].ont : 0);

  // Tên hub trùng trong một vùng thì thêm (loại Hub), giống bảng theo ngày.
  const hubsByRegion = new Map();
  hubInfo.forEach(info => {
    if (!hubsByRegion.has(info.region)) hubsByRegion.set(info.region, []);
    hubsByRegion.get(info.region).push(info);
  });

  const miens = [];
  MIEN_ORDER.concat(mienStats.has('Miền Khác') ? ['Miền Khác'] : []).forEach(mien => {
    const names = (MIEN_REGIONS[mien] || [...regionStats.keys()].filter(reg => !MIEN_ORDER.some(m => MIEN_REGIONS[m].includes(reg))))
      .filter(reg => regionStats.has(reg));
    if (!names.length) return;
    const regions = names.map(reg => {
      const infos = hubsByRegion.get(reg) || [];
      const typesByName = new Map();
      infos.forEach(info => {
        if (!typesByName.has(info.hub)) typesByName.set(info.hub, new Set());
        if (info.hubType) typesByName.get(info.hub).add(info.hubType);
      });
      const hubs = infos
        .map(info => ({
          ...info,
          name: (typesByName.get(info.hub)?.size || 0) > 1 && info.hubType ? `${info.hub} (${info.hubType})` : info.hub,
          stats: hubStats.get(info.id).map(toStat),
          late: lateVol(hubStats.get(info.id))
        }))
        .sort((a, b) => b.late - a.late);
      return {
        region: reg,
        stats: regionStats.get(reg).map(toStat),
        late: lateVol(regionStats.get(reg)),
        hubs: hubs.slice(0, hubLimit),
        hubCount: hubs.length
      };
    }).sort((a, b) => (b.stats[last]?.tot || 0) - (a.stats[last]?.tot || 0));
    miens.push({ mien, stats: mienStats.get(mien).map(toStat), regions });
  });

  const allStats = all.map(toStat);
  let maxPct = 0;
  miens.forEach(m => m.regions.forEach(reg => reg.stats.forEach(s => { if (s.pct !== null && s.pct > maxPct) maxPct = s.pct; })));

  return {
    metric,
    weeks: weeks.map((start, index) => ({ start, days: weekDays[index], ...weekLabel(start, weekDays[index]) })),
    all: allStats,
    miens,
    maxPct,
    empty: allStats.every(s => s.tot === 0)
  };
}
