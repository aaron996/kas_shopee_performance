import { ChatError } from './errors.js';
import { normalizeDashboardRows, getHubType } from '../../src/utils/dataProcessor.js';
import { REVERSE_CLIENT } from '../../src/utils/chatClients.js';

// Reuse the authenticated history RPCs; never read the service-only table directly.
// Only the aggregated result goes through the chat evidence size limit/to the model.
async function readCompact(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Không thể đọc dữ liệu Shopee Reverse lúc này.', 503, { cause: error });
  if (!Array.isArray(data?.cols) || !Array.isArray(data?.rows)
      || data.rows.some(row => !Array.isArray(row) || row.length !== data.cols.length)) {
    throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Dữ liệu Shopee Reverse không đúng định dạng.', 503);
  }
  return data.rows.map(values => Object.fromEntries(data.cols.map((key, i) => [key, values[i]])));
}
function unsupported() {
  throw new ChatError('CHAT_DATASET_UNSUPPORTED', 'Shopee Reverse hiện chỉ có dữ liệu Pickup (P1ST/OPR), chưa có Delivery hoặc Leadtime.', 422);
}
const emptyCoverage = dataset => ({ data: { dataset, client: REVERSE_CLIENT, dataAsOf: null, dateFrom: null, syncedAt: null, unsupported: true }, error: null });

export async function callReverseRpc(client, name, args) {
  if (name === 'get_ai_chat_coverage') {
    if (args.p_dataset !== 'pick') return emptyCoverage(args.p_dataset);
    // The latest populated week anchors the exact daily read even when sync is stale.
    const weekly = await readCompact(client, 'get_kas_weekly_compact', { dataset: 'reverse', weeks: 1 });
    const week = weekly.map(row => row.report_date).filter(Boolean).sort().at(-1);
    if (!week) return { data: { dataset: 'pick', client: REVERSE_CLIENT, dataAsOf: null, dateFrom: null, syncedAt: null }, error: null };
    const end = new Date(Date.parse(`${week}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10);
    const rows = await readCompact(client, 'get_kas_daily_compact', { dataset: 'reverse', from_date: week, to_date: end });
    const dates = rows.map(row => row.report_date).filter(Boolean).sort();
    // dateFrom is unknown for full history; do not mislabel the latest week as total coverage.
    return { data: { dataset: 'pick', client: REVERSE_CLIENT, dataAsOf: dates.at(-1) ?? null, dateFrom: null, syncedAt: null }, error: null };
  }
  if (name !== 'get_ai_chat_metric' || !['p1st', 'opr'].includes(args.p_metric)) return unsupported();
  const { p_date_from: from, p_date_to: to, p_grain: grain, p_sort: sort, p_limit: limit } = args;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (!Number.isFinite(days) || days < 0 || days > 90 || !['nationwide', 'region', 'hub'].includes(grain)
      || !['worst', 'best', 'volume_desc'].includes(sort) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ChatError('CHAT_TOOL_ARGUMENTS_INVALID', 'Phạm vi tra cứu Shopee Reverse không hợp lệ.', 400);
  }
  const raw = await readCompact(client, 'get_kas_daily_range_compact', { dataset: 'reverse', date_from: from, date_to: to });
  const rows = normalizeDashboardRows(raw).filter(row => row.client_name === REVERSE_CLIENT
    && row.report_date >= from && row.report_date <= to
    && (!args.p_regions?.length || args.p_regions.includes(row.region))
    && (!args.p_hub_types?.length || args.p_hub_types.includes(getHubType(row))));
  const groups = new Map();
  for (const row of rows) {
    const entity = grain === 'nationwide' ? 'Toàn quốc' : (grain === 'region' ? row.region : row.hub) || 'Không rõ';
    const group = groups.get(entity) || { entity, volume: 0, ontime: 0 };
    group.volume += Number(row.mau_pu) || 0;
    group.ontime += Number(row[args.p_metric === 'p1st' ? 'ontime_pu_1st' : 'ontime_pu_opr']) || 0;
    groups.set(entity, group);
  }
  const grouped = [...groups.values()].map(row => ({ ...row, value: row.volume ? Math.round(10000 * row.ontime / row.volume) / 100 : null }));
  grouped.sort((a, b) => {
    if (sort === 'volume_desc') return b.volume - a.volume || a.entity.localeCompare(b.entity);
    if (a.value === null || b.value === null) return (a.value === null) - (b.value === null) || a.entity.localeCompare(b.entity);
    return (sort === 'best' ? b.value - a.value : a.value - b.value) || a.entity.localeCompare(b.entity);
  });
  return { data: { metric: args.p_metric,
    scope: { client: REVERSE_CLIENT, dateFrom: from, dateTo: to, grain },
    dataAsOf: rows.map(row => row.report_date).sort().at(-1) ?? null,
    syncedAt: null, rows: grouped.slice(0, limit) }, error: null };
}
