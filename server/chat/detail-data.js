import { ChatError } from './errors.js';
import { normalizeDashboardRows, getHubType } from '../../src/utils/dataProcessor.js';
import { REVERSE_CLIENT } from '../../src/utils/chatClients.js';
import { FD_KPI_TARGET } from '../../src/data/fdKpi.js';

// KAS-317: KPI theo Tỉnh thành / Lane. get_ai_chat_metric chỉ đọc dữ liệu hub-level nên không có hai chiều này;
// khi người gọi (chatbot trong app hoặc MCP) lọc theo provinces / lanes hoặc nhóm theo province / lane, KPI được
// đọc từ bảng chi tiết (kas_*_detail) qua get_kas_detail_summary rồi gộp ở đây, cùng khuôn fd-data.js và reverse-data.js
// (cùng hình dạng kết quả {entity, volume, ontime, value}). Bảng chi tiết không có benchmark.
const SOURCES = Object.freeze({
  p1st: { dataset: 'pick', total: 'mau_pu', ontime: 'ontime_pu_1st' },
  opr: { dataset: 'pick', total: 'mau_pu', ontime: 'ontime_pu_opr' },
  d1st: { dataset: 'deli', total: 'mau_deli', ontime: 'ontime_deli_1st' },
  odr: { dataset: 'deli', total: 'mau_deli', ontime: 'ontime_deli_odr' },
  fd: { dataset: 'fd', total: 'mau_fd', ontime: 'fd_hoan_thanh' }
});
const GRAINS = new Set(['nationwide', 'region', 'hub', 'province', 'lane']);
const SORTS = new Set(['worst', 'best', 'volume_desc']);
const NO_DATA = 'Bảng chi tiết Tỉnh thành/Lane chưa có dữ liệu cho phạm vi này (chỉ có từ khi datajob mới chạy, tối đa 90 ngày). Không phải 0%.';

// p_source = 'detail' ép đọc bảng chi tiết cả khi không lọc (vd. tổng toàn quốc của kỳ phân rã theo tỉnh, để cùng nguồn với các dòng tỉnh).
export const needsDetail = params => Boolean(params?.p_provinces?.length || params?.p_lanes?.length)
  || params?.p_grain === 'province' || params?.p_grain === 'lane' || params?.p_source === 'detail';

const bad = message => new ChatError('CHAT_TOOL_ARGUMENTS_INVALID', message, 400);

export async function callDetailRpc(client, name, args) {
  if (name !== 'get_ai_chat_metric') {
    throw new ChatError('CHAT_DATASET_UNSUPPORTED', 'Lọc theo Tỉnh thành/Lane chỉ hỗ trợ tra cứu KPI.', 422);
  }
  const { p_metric: metric, p_client: clientCode, p_date_from: from, p_date_to: to, p_grain: grain, p_sort: sort,
    p_limit: limit, p_offset: offset = 0 } = args;
  const source = SOURCES[metric];
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (!source || !Number.isFinite(days) || days < 0 || days > 90 || !GRAINS.has(grain) || !SORTS.has(sort)
      || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 100000) {
    throw bad('Phạm vi tra cứu theo Tỉnh thành/Lane không hợp lệ.');
  }
  const isReverse = clientCode === REVERSE_CLIENT;
  if (isReverse && !['p1st', 'opr'].includes(metric)) {
    throw new ChatError('CHAT_DATASET_UNSUPPORTED', 'Shopee Reverse hiện chỉ có dữ liệu Pickup (P1ST/OPR), chưa có Delivery hoặc FD.', 422);
  }
  const dataset = isReverse ? 'reverse' : source.dataset;
  const provinces = args.p_provinces ?? [];
  const lanes = args.p_lanes ?? [];
  if ((lanes.length || grain === 'lane') && !['deli', 'fd'].includes(dataset)) {
    throw bad('Lane chỉ có ở D1ST, ODR và FD (Pickup và Reverse không có lane).');
  }
  const { data, error } = await client.rpc('get_kas_detail_summary', {
    dataset, date_from: from, date_to: to, client: clientCode,
    provinces: provinces.length ? provinces : null, lanes: lanes.length ? lanes : null,
    by_province: grain === 'province', by_lane: grain === 'lane'
  });
  if (error) {
    if (/AI_CHAT_DETAIL_TOO_LARGE/.test(error.message || '')) {
      throw new ChatError('CHAT_DATA_TOO_LARGE', 'Kết quả theo Tỉnh thành/Lane quá lớn; hãy thu hẹp khoảng ngày, thêm bộ lọc vùng/tỉnh hoặc đổi cấp tổng hợp.', 422, { cause: error });
    }
    throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Không thể đọc dữ liệu Tỉnh thành/Lane lúc này.', 503, { cause: error });
  }
  if (!Array.isArray(data?.cols) || !Array.isArray(data?.rows)
      || data.rows.some(row => !Array.isArray(row) || row.length !== data.cols.length)) {
    throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Dữ liệu Tỉnh thành/Lane không đúng định dạng.', 503);
  }
  const raw = data.rows.map(values => Object.fromEntries(data.cols.map((key, i) => [key, values[i]])));
  // Cùng quy ước tên với get_ai_chat_metric: "KA" của người dùng là "KHL" trong dữ liệu.
  const regionFilter = (args.p_regions || []).map(r => (r === 'HCM - KA' ? 'HCM - KHL' : r === 'HNO - KA' ? 'HNO - KHL' : r));
  const hubTypeFilter = (args.p_hub_types || []).map(t => (t === 'KA' ? 'KHL' : t));
  const rows = normalizeDashboardRows(raw).filter(row => (!regionFilter.length || regionFilter.includes(row.region))
    && (!hubTypeFilter.length || hubTypeFilter.includes(getHubType(row))));
  const groups = new Map();
  for (const row of rows) {
    const label = { nationwide: 'Toàn quốc', region: row.region, hub: row.hub ?? row.deliverywh, province: row.province, lane: row.lane }[grain];
    const entity = label || 'Không rõ';
    const group = groups.get(entity) || { entity, volume: 0, ontime: 0 };
    group.volume += Number(row[source.total]) || 0;
    group.ontime += Number(row[source.ontime]) || 0;
    groups.set(entity, group);
  }
  const isFd = metric === 'fd';
  const grouped = [...groups.values()].map(row => {
    const value = row.volume > 0 ? Math.round(10000 * row.ontime / row.volume) / 100 : null;
    return { ...row, value, ...(isFd ? { meetsKpi: value === null ? null : value <= FD_KPI_TARGET } : {}) };
  });
  // FD: càng thấp càng tốt nên "worst" = FD cao nhất.
  const lowerIsWorse = !isFd;
  grouped.sort((a, b) => {
    if (sort === 'volume_desc') return b.volume - a.volume || a.entity.localeCompare(b.entity);
    if (a.value === null || b.value === null) return (a.value === null) - (b.value === null) || a.entity.localeCompare(b.entity);
    const worstFirst = lowerIsWorse ? a.value - b.value : b.value - a.value;
    return (sort === 'worst' ? worstFirst : -worstFirst) || a.entity.localeCompare(b.entity);
  });
  const dataAsOf = rows.length ? data.dataAsOf ?? null : null;
  return { data: {
    metric, source: 'kas_detail', benchmark: 'none',
    ...(isFd ? { direction: 'lower_is_better', unit: 'percent', kpiTarget: FD_KPI_TARGET, kpiRule: `Đạt khi FD <= ${FD_KPI_TARGET}%` } : {}),
    scope: { client: clientCode, dateFrom: from, dateTo: to, grain,
      ...(provinces.length ? { provinces } : {}), ...(lanes.length ? { lanes } : {}) },
    dataAsOf, ...(isFd ? { as_of_date: dataAsOf } : {}), syncedAt: rows.length ? data.syncedAt ?? null : null,
    ...(rows.length ? {} : { noData: true, message: NO_DATA }),
    totalEntities: grouped.length, offset, rows: grouped.slice(offset, offset + limit) }, error: null };
}

// Ngày mới nhất của bảng chi tiết (cho get_latest_metric_summary khi lọc theo Tỉnh thành/Lane).
export async function latestDetailDate(client, metric, clientCode) {
  const source = SOURCES[metric];
  if (!source) throw bad('metric không được hỗ trợ.');
  const dataset = clientCode === REVERSE_CLIENT ? 'reverse' : source.dataset;
  const { data, error } = await client.rpc('get_kas_detail_options', { dataset });
  if (error) throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Không thể đọc dữ liệu Tỉnh thành/Lane lúc này.', 503, { cause: error });
  return data?.max_date ?? null;
}
