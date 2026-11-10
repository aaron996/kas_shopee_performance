import { ChatError } from './errors.js';
import { normalizeDashboardRows, getHubType } from '../../src/utils/dataProcessor.js';
import { FD_KPI_TARGET } from '../../src/data/fdKpi.js';

// FD (Fail Delivery) = SUM(fd_hoan_thanh) / SUM(mau_fd). Lower is better, KPI <= 3%.
// get_ai_chat_metric / get_ai_chat_coverage reject 'fd' and changing them would need a
// schema migration, so FD is served here from the existing read-only compact RPCs
// (the same ones the dashboard "Theo ngày" view uses), mirroring reverse-data.js.
// Response shape matches get_ai_chat_metric ({entity, volume, ontime, value}); for FD
// `volume` = mau_fd and `ontime` = fd_hoan_thanh (kept under that name for compatibility
// with the trend/driver code), plus explicit direction/KPI fields.
const FD_NO_DATA = 'Chưa có dữ liệu FD trong kỳ này (FD có thể đồng bộ chậm hơn Pickup/Delivery). Không phải 0%.';
const day = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (value, n) => day(Date.parse(`${value}T00:00:00Z`) + n * 86400000);

async function readCompact(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Không thể đọc dữ liệu FD lúc này.', 503, { cause: error });
  if (!Array.isArray(data?.cols) || !Array.isArray(data?.rows)
      || data.rows.some(row => !Array.isArray(row) || row.length !== data.cols.length)) {
    throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Dữ liệu FD không đúng định dạng.', 503);
  }
  return data.rows.map(values => Object.fromEntries(data.cols.map((key, i) => [key, values[i]])));
}

const clientMatches = (row, client) => client === 'ALL' || String(row.client_name || '').toUpperCase() === client;

async function dailyRows(client, from, to) {
  return readCompact(client, 'get_kas_daily_range_compact', { dataset: 'fd', date_from: from, date_to: to });
}

// Best-effort: the compact RPCs carry no synced_at/row count. Only a service-role
// client may read the history table; any other client just gets nulls.
async function syncStats(client) {
  try {
    if (typeof client.from !== 'function') return { syncedAt: null, rowCount: null };
    const latest = await client.from('kas_fd_history').select('synced_at').order('synced_at', { ascending: false }).limit(1);
    const count = await client.from('kas_fd_history').select('*', { count: 'exact', head: true });
    return { syncedAt: latest.error ? null : latest.data?.[0]?.synced_at ?? null, rowCount: count.error ? null : count.count ?? null };
  } catch {
    return { syncedAt: null, rowCount: null };
  }
}

async function coverage(client, args) {
  const base = { dataset: 'fd', client: args.p_client };
  const dates = async (from, to) => (await dailyRows(client, from, to)).filter(row => clientMatches(row, args.p_client)).map(row => row.report_date).filter(Boolean).sort();
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // Asia/Ho_Chi_Minh
  const weekly = await readCompact(client, 'get_kas_weekly_compact', { dataset: 'fd', weeks: 16 });
  const weeks = [...new Set(weekly.map(row => row.report_date).filter(Boolean))].sort();
  // Latest FD date comes from the daily history (the weekly roll-up can lag); the
  // weekly list is only the fallback anchor and the way to find the earliest week.
  let recent = await dates(addDays(today, -13), today);
  if (!recent.length && weeks.length) recent = await dates(weeks.at(-1), addDays(weeks.at(-1), 6));
  const dataAsOf = recent.at(-1) ?? null;
  if (!dataAsOf) return { data: { ...base, dateFrom: null, dataAsOf: null, as_of_date: null, syncedAt: null, rowCount: 0, message: FD_NO_DATA }, error: null };
  const earliest = weeks.length ? await dates(weeks[0], addDays(weeks[0], 6)) : recent;
  const dateFrom = earliest[0] ?? recent[0];
  const { syncedAt, rowCount } = await syncStats(client);
  return { data: { ...base, dateFrom, dataAsOf, as_of_date: dataAsOf, syncedAt, rowCount,
    ...(syncedAt === null || rowCount === null ? { note: 'syncedAt/rowCount chỉ có khi đọc bằng service role.' } : {}) }, error: null };
}

export async function callFdRpc(client, name, args) {
  if (name === 'get_ai_chat_coverage') return coverage(client, args);
  if (name !== 'get_ai_chat_metric') {
    throw new ChatError('CHAT_DATASET_UNSUPPORTED', 'FD chỉ hỗ trợ tra cứu KPI và coverage.', 422);
  }
  const { p_date_from: from, p_date_to: to, p_grain: grain, p_sort: sort, p_limit: limit, p_offset: offset = 0, p_client: clientCode } = args;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (!Number.isFinite(days) || days < 0 || days > 90 || !['nationwide', 'region', 'hub'].includes(grain)
      || !['worst', 'best', 'volume_desc'].includes(sort) || !Number.isInteger(limit) || limit < 1 || limit > 50
      || !Number.isInteger(offset) || offset < 0 || offset > 100000) {
    throw new ChatError('CHAT_TOOL_ARGUMENTS_INVALID', 'Phạm vi tra cứu FD không hợp lệ.', 400);
  }
  const raw = await dailyRows(client, from, to);
  const rows = normalizeDashboardRows(raw).filter(row => clientMatches(row, clientCode)
    && row.report_date >= from && row.report_date <= to
    && (!args.p_regions?.length || args.p_regions.includes(row.region))
    && (!args.p_hub_types?.length || args.p_hub_types.includes(getHubType(row))));
  const groups = new Map();
  for (const row of rows) {
    // "hub" for FD is the delivery warehouse (deliverywh / wh_id).
    const entity = grain === 'nationwide' ? 'Toàn quốc' : (grain === 'region' ? row.region : row.deliverywh) || 'Không rõ';
    const group = groups.get(entity) || { entity, volume: 0, ontime: 0 };
    group.volume += Number(row.mau_fd) || 0;
    group.ontime += Number(row.fd_hoan_thanh) || 0;
    groups.set(entity, group);
  }
  const grouped = [...groups.values()].map(row => {
    const value = row.volume > 0 ? Math.round(10000 * row.ontime / row.volume) / 100 : null;
    return { ...row, value, meetsKpi: value === null ? null : value <= FD_KPI_TARGET };
  });
  // FD: lower is better, so "worst" = highest FD, "best" = lowest.
  grouped.sort((a, b) => {
    if (sort === 'volume_desc') return b.volume - a.volume || a.entity.localeCompare(b.entity);
    if (a.value === null || b.value === null) return (a.value === null) - (b.value === null) || a.entity.localeCompare(b.entity);
    return (sort === 'worst' ? b.value - a.value : a.value - b.value) || a.entity.localeCompare(b.entity);
  });
  const dates = rows.map(row => row.report_date).sort();
  const dataAsOf = dates.at(-1) ?? null, actualFrom = dates[0] ?? null;
  const covered = actualFrom !== null && (actualFrom !== from || dataAsOf !== to);
  return { data: {
    metric: 'fd',
    direction: 'lower_is_better', unit: 'percent', kpiTarget: FD_KPI_TARGET, kpiRule: `Đạt khi FD <= ${FD_KPI_TARGET}%`,
    scope: { client: clientCode, dateFrom: from, dateTo: to, grain,
      ...(actualFrom ? { actualDateFrom: actualFrom, actualDateTo: dataAsOf } : {}) },
    dataAsOf, as_of_date: dataAsOf, syncedAt: null,
    ...(covered ? { periodNote: `Kỳ yêu cầu ${from} – ${to}; kỳ thực tế có dữ liệu FD ${actualFrom} – ${dataAsOf}.` } : {}),
    ...(rows.length ? {} : { noData: true, message: FD_NO_DATA }),
    totalEntities: grouped.length, offset, rows: grouped.slice(offset, offset + limit) }, error: null };
}
