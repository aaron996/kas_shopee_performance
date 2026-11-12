// Backlog L14D của SPE Reverse: ảnh chụp theo ngày, chia theo số lần gán x tuổi tồn x vùng.
// Nguồn: RPC get_kas_reverse_backlog (bảng kas_reverse_backlog, nuôi từ tab reverse_backlog của sheet OPS).
// Dòng vắng mặt trong một ảnh nghĩa là 0 đơn của tổ hợp đó; chưa có ảnh nào là "chưa có dữ liệu", không phải 0.
import { matchesRegionScope, getHubType } from './dataProcessor.js';
import { REVERSE_CLIENT } from './clientLabels.js';

export const ASSIGN_SEGMENTS = [
  { key: '0', title: 'Chưa gán lần nào' },
  { key: '1-2', title: 'Gán 1–2 lần' },
  { key: '3+', title: 'Gán ≥ 3 lần' }
];
export const AGE_BUCKETS = [
  { key: '1-3', label: 'Tồn 1–3 ngày' },
  { key: '4-7', label: 'Tồn 4–7 ngày' },
  { key: '8-14', label: 'Tồn 8–14 ngày' }
];
export const UNKNOWN_REGION = 'Chưa rõ vùng';
export const BACKLOG_WINDOW_DAYS = 14;

let cache = null;
export const clearReverseBacklogCache = () => { cache = null; };

const expand = (cols, rows) => rows.map(values => Object.fromEntries(cols.map((col, i) => [col, values[i]])));

export function fetchReverseBacklog(client) {
  if (!cache) {
    const request = (async () => {
      const { data, error } = await client.rpc('get_kas_reverse_backlog', { client: REVERSE_CLIENT, prev_days: 7 });
      if (error) throw error;
      if (!data || !Array.isArray(data.cols) || !Array.isArray(data.rows) || !Array.isArray(data.prev_rows)) throw new Error('INVALID_BACKLOG_PAYLOAD');
      return {
        snapshotDate: data.snapshot_date || null,
        prevDate: data.prev_snapshot_date || null,
        rows: expand(data.cols, data.rows),
        prevRows: expand(data.cols, data.prev_rows)
      };
    })();
    request.catch(() => { if (cache === request) cache = null; });
    cache = request;
  }
  return cache;
}

export const addIsoDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const formatDayMonth = day => (day ? `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}` : '–');
export const formatFullDate = day => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '–');

const regionOf = row => {
  const region = String(row.region ?? '').trim();
  return !region || region.toUpperCase() === 'N/A' ? '' : region;
};

// Lọc theo vùng/loại Hub đang chọn của app. Vùng trống/N/A chỉ vào khi chọn tất cả vùng (cùng quy tắc với các bảng khác).
function scoped(rows, selectedRegions, selectedHubTypes) {
  return rows.filter(row => {
    const region = regionOf(row);
    if (!matchesRegionScope({ region, client_name: REVERSE_CLIENT }, selectedRegions)) return false;
    return !selectedHubTypes || selectedHubTypes.includes(getHubType(row));
  });
}

const sum = (rows, pick = () => true) => rows.reduce((total, row) => total + (pick(row) ? Number(row.backlog_orders) || 0 : 0), 0);

export function buildBacklogModel({ data, selectedRegions = null, selectedHubTypes = null }) {
  const rows = scoped(data.rows, selectedRegions, selectedHubTypes);
  const prevRows = data.prevDate ? scoped(data.prevRows, selectedRegions, selectedHubTypes) : null;
  const regionTotals = new Map();
  rows.forEach(row => {
    const region = regionOf(row) || UNKNOWN_REGION;
    regionTotals.set(region, (regionTotals.get(region) || 0) + (Number(row.backlog_orders) || 0));
  });
  const regions = [...regionTotals.keys()].sort((a, b) => regionTotals.get(b) - regionTotals.get(a) || a.localeCompare(b));
  const total = sum(rows);
  const sections = ASSIGN_SEGMENTS.map(segment => {
    const segmentRows = rows.filter(row => row.assign_bucket === segment.key);
    const list = regions.map(region => {
      const buckets = AGE_BUCKETS.map(age => sum(segmentRows, row => (regionOf(row) || UNKNOWN_REGION) === region && row.age_bucket === age.key));
      return { region, buckets, total: buckets.reduce((a, b) => a + b, 0) };
    });
    const buckets = AGE_BUCKETS.map((age, i) => list.reduce((acc, item) => acc + item.buckets[i], 0));
    return { ...segment, rows: list, buckets, total: buckets.reduce((a, b) => a + b, 0) };
  });
  const prevTotal = prevRows ? sum(prevRows) : null;
  return {
    snapshotDate: data.snapshotDate,
    windowFrom: addIsoDays(data.snapshotDate, -(BACKLOG_WINDOW_DAYS - 1)),
    prevDate: data.prevDate,
    total, prevTotal, delta: prevTotal === null ? null : total - prevTotal,
    sections,
    maxRow: Math.max(0, ...sections.flatMap(section => section.rows.map(item => item.total))),
    empty: rows.length === 0
  };
}
