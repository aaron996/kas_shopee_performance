// KAS-314: 1st Deli / ODR theo lane. Logic thuần (không React, không mạng) để test được.
import { getLanesFromRows, normalizeLane } from './laneTaxonomy.js';

export const LANE_DELIVERY_CLIENTS = ['SPB', 'SPE'];
export const LANE_DELIVERY_DAYS = 7;
// Mốc điều hành (xem GHN_KAS_knowledge_base.md mục chỉ số): 1st Deli 95%, ODR 90%.
export const LANE_DELIVERY_METRICS = [
  { key: 'first', label: '1st Deli', col: 'ontime_deli_1st', target: 95 },
  { key: 'odr', label: 'ODR', col: 'ontime_deli_odr', target: 90 }
];

const num = value => Number(value) || 0;

export function normalizeLaneDeliveryRows(rows) {
  return (rows || [])
    .filter(r => r && r.report_date && r.lane && r.client_name)
    .map(r => ({ ...r, mau_deli: num(r.mau_deli), ontime_deli_1st: num(r.ontime_deli_1st), ontime_deli_odr: num(r.ontime_deli_odr) }));
}

function pct(rows, col) {
  let total = 0, ontime = 0;
  for (const r of rows) { total += num(r.mau_deli); ontime += num(r[col]); }
  return { total, ontime, pct: total > 0 ? (ontime / total) * 100 : null };
}

/**
 * Bảng lane x ngày cho một client và một chỉ số.
 * Dòng "Toàn quốc" gộp mọi lane; cột "Kỳ" là tổng cộng dồn của các ngày đang hiển thị.
 * Ô không có mẫu số trả pct = null (hiển thị "–"), không bao giờ là 0.
 */
export function buildLaneDeliveryTable(rows, { client, metric, days = LANE_DELIVERY_DAYS }) {
  const scoped = rows.filter(r => r.client_name === client);
  const dates = [...new Set(scoped.map(r => r.report_date))].sort().slice(-days);
  const inRange = scoped.filter(r => dates.includes(r.report_date));
  const cell = subset => pct(subset, metric.col);

  const lanes = getLanesFromRows(inRange, 'lane').map(({ key, label }) => {
    const laneRows = inRange.filter(r => normalizeLane(r.lane) === key);
    return {
      key, label,
      byDate: Object.fromEntries(dates.map(d => [d, cell(laneRows.filter(r => r.report_date === d))])),
      period: cell(laneRows)
    };
  });
  const all = {
    key: '__all__', label: 'Toàn quốc',
    byDate: Object.fromEntries(dates.map(d => [d, cell(inRange.filter(r => r.report_date === d))])),
    period: cell(inRange)
  };
  return { dates, lanes, all };
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
