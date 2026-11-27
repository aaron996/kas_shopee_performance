import { CHAT_CLIENT_CODES } from '../../src/utils/chatClients.js';
import { DASHBOARD_HELP, getDashboardHelp } from '../../src/data/dashboardHelp.js';
import { getMetricDefinition } from '../../src/data/metricGlossary.js';
import { callDashboardRpc, DASHBOARD_RPCS } from './db.js';
import { ChatError } from './errors.js';
import { REQUEST_METRIC_QUERY_TOOL } from './interactions.js';
import { resolveEffectiveScope, normalizeToolScope } from './scope.js';
import { MAX_SCOPE_ITEMS } from './protocol.js';
import { PUBLIC_SEARCH_TOOL } from './public-search.js';
import { createHash } from 'node:crypto';
import { computeDrivers, evidenceIdFor } from './drivers.js';
import { FD_KPI_TARGET } from '../../src/data/fdKpi.js';

const DRIVER_GRAINS = new Set(['region', 'hub']);
const DRIVER_MAX_PAGES = 4;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLIENTS = new Set(CHAT_CLIENT_CODES);
const METRICS = new Set(['p1st', 'opr', 'd1st', 'odr', 'fd']);
const GRAINS = new Set(['nationwide', 'region', 'hub']);
const SORTS = new Set(['worst', 'best', 'volume_desc']);
const DATASETS = new Set(['pick', 'deli', 'ca1', 'leadtime', 'fd']);
const HELP_TOPICS = new Set(Object.keys(DASHBOARD_HELP));
const METRIC_DATASETS = Object.freeze({ p1st: 'pick', opr: 'pick', d1st: 'deli', odr: 'deli', fd: 'fd' });

function invalid(message) {
  throw new ChatError('CHAT_TOOL_ARGUMENTS_INVALID', message, 400);
}

function date(value, name, nullable = false) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    invalid(`${name} phải có dạng YYYY-MM-DD.`);
  }
  return value;
}

function dateRange(from, to) {
  const start = date(from, 'date_from');
  const end = date(to, 'date_to');
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  if (days < 0) invalid('date_from phải trước hoặc bằng date_to.');
  if (days > 90) invalid('Mỗi truy vấn chỉ được lấy tối đa 90 ngày.');
  return [start, end];
}

function enumValue(value, allowed, name) {
  if (!allowed.has(value)) invalid(`${name} không được hỗ trợ.`);
  return value;
}

function optionalText(value, name, max = 120) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${name} không hợp lệ.`);
  return value.trim();
}

function textList(value, name) {
  if (!Array.isArray(value) || value.length > MAX_SCOPE_ITEMS || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 80)) {
    invalid(`${name} không hợp lệ.`);
  }
  return [...new Set(value.map(item => item.trim()))];
}

function limit(value) {
  if (!Number.isInteger(value) || value < 1 || value > 50) invalid('limit phải từ 1 đến 50.');
  return value;
}

function offset(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100000) invalid('offset phải từ 0 đến 100000.');
  return value;
}

function parseArguments(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    invalid('Tool arguments không phải JSON object hợp lệ.');
  }
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

export const CHAT_TOOLS = Object.freeze([
  {
    type: 'function', name: 'get_metric_trend', strict: true,
    description: 'Đọc KPI P1ST/OPR/D1ST/ODR/FD theo từng ngày để vẽ biểu đồ đường. Tối đa 14 ngày trong một lượt; bắt buộc đủ metric, client và khoảng ngày. Không chia nhỏ nhiều lần để vượt giới hạn. Muốn 7 ngày mới nhất: lấy dataAsOf qua get_data_coverage trước. Ngày không có dữ liệu giữ NULL.',
    parameters: {
      type: 'object', additionalProperties: false,
      required: ['metric', 'client', 'date_from', 'date_to', 'regions', 'hub_types'],
      properties: {
        metric: { type: 'string', enum: [...METRICS] },
        client: { type: 'string', enum: [...CLIENTS] },
        date_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        date_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        regions: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
        hub_types: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
      },
    },
  },
  {
    type: 'function', name: 'get_metric_change_drivers', strict: true,
    description: 'Dùng cho câu hỏi "vì sao KPI tăng/giảm". So sánh hai kỳ (kỳ hiện tại và kỳ trước) của P1ST/OPR/D1ST/ODR/FD và trả về tổng thay đổi (điểm %) cùng danh sách vùng/hub đóng góp nhiều nhất vào thay đổi đó, tách hiệu ứng tỷ lệ (chính nó tốt/xấu đi) và hiệu ứng cơ cấu (tỷ trọng sản lượng dịch chuyển). Với FD (càng thấp càng tốt) contributionPp dương = FD tăng = xấu; xem trường effect/overall. Kết quả đã tính sẵn, không cần gọi thêm summary/trend; chart không tự vẽ cho tool này.',
    parameters: {
      type: 'object', additionalProperties: false,
      required: ['metric', 'client', 'current_from', 'current_to', 'previous_from', 'previous_to', 'grain', 'regions', 'hub_types'],
      properties: {
        metric: { type: 'string', enum: [...METRICS] },
        client: { type: 'string', enum: [...CLIENTS] },
        current_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        current_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        previous_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        previous_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        grain: { type: 'string', enum: [...DRIVER_GRAINS], description: 'region để tìm vùng kéo tụt; hub để xuống từng kho.' },
        regions: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
        hub_types: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
      },
    },
  },
  {
    type: 'function',
    name: 'get_data_coverage',
    description: 'Lấy ngày dữ liệu sớm nhất, mới nhất và thời điểm đồng bộ của một bộ dữ liệu (pick, deli, ca1, leadtime, fd). FD có thể lùi ngày hơn pick/deli.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false, required: ['dataset', 'client'],
      properties: {
        dataset: { type: 'string', enum: [...DATASETS] },
        client: { type: 'string', enum: [...CLIENTS] }
      }
    }
  },
  {
    type: 'function',
    name: 'get_metric_summary',
    description: 'Đọc KPI pickup/delivery/FD (metric p1st, opr, d1st, odr, fd) từ database theo client, ngày và cấp tổng hợp. FD = SUM(fd_hoan_thanh)/SUM(mau_fd), càng thấp càng tốt, đạt khi <= 3%; với FD hub là kho giao (deliverywh), sort worst = FD cao nhất; nếu kỳ vượt phạm vi dữ liệu FD thì trả periodNote nêu kỳ thực tế, kỳ không có dữ liệu trả noData (không phải 0%). Kết quả trả về totalEntities (tổng số dòng có thật, trước khi cắt theo limit/offset) và offset đã dùng — nếu totalEntities > offset + số dòng trả về, gọi lại với offset tăng thêm limit để lấy hết, giữ nguyên các tham số khác và cùng một sort.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      required: ['metric', 'client', 'date_from', 'date_to', 'grain', 'regions', 'hub_types', 'limit', 'offset', 'sort'],
      properties: {
        metric: { type: 'string', enum: [...METRICS] },
        client: { type: 'string', enum: [...CLIENTS] },
        date_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        date_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        grain: { type: 'string', enum: [...GRAINS] },
        regions: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
        hub_types: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0, maximum: 100000, description: 'Bỏ qua bấy nhiêu dòng đầu (theo cùng thứ tự sort) trước khi lấy limit dòng tiếp theo. 0 cho lần gọi đầu tiên.' },
        sort: { type: 'string', enum: [...SORTS] }
      }
    }
  },
  {
    type: 'function',
    name: 'get_latest_metric_summary',
    description: 'Đọc KPI pickup/delivery/FD ở ngày mới nhất hiện có trong database (FD dùng ngày mới nhất của chính FD, nêu rõ ở as_of_date). Chỉ dùng khi người dùng nói rõ hiện tại/hôm nay/mới nhất hoặc đã chọn dateMode=latest; nếu chưa nêu thời gian thì phải yêu cầu lựa chọn. Kết quả trả về totalEntities và offset — nếu totalEntities > offset + số dòng trả về, gọi lại với offset tăng thêm limit để lấy hết.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      required: ['metric', 'client', 'grain', 'regions', 'hub_types', 'limit', 'offset', 'sort'],
      properties: {
        metric: { type: 'string', enum: [...METRICS] },
        client: { type: 'string', enum: [...CLIENTS] },
        grain: { type: 'string', enum: [...GRAINS] },
        regions: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
        hub_types: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0, maximum: 100000, description: 'Bỏ qua bấy nhiêu dòng đầu (theo cùng thứ tự sort) trước khi lấy limit dòng tiếp theo. 0 cho lần gọi đầu tiên.' },
        sort: { type: 'string', enum: [...SORTS] }
      }
    }
  },
  {
    type: 'function',
    name: 'get_ca1_summary',
    description: 'Đọc tỷ lệ đơn về ca 1 theo lane/vùng. Nguồn ca 1 hiện không có chiều client.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      required: ['date_from', 'date_to', 'lane', 'regions', 'limit'],
      properties: {
        date_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        date_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        lane: nullableString,
        regions: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCOPE_ITEMS },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      }
    }
  },
  {
    type: 'function',
    name: 'get_leadtime_summary',
    description: 'Đọc leadtime trung bình có trọng số theo client, ngày, lane hoặc cặp tỉnh.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      required: ['client', 'date_from', 'date_to', 'lane', 'from_province', 'to_province', 'limit'],
      properties: {
        client: { type: 'string', enum: [...CLIENTS] },
        date_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        date_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        lane: nullableString,
        from_province: nullableString,
        to_province: nullableString,
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      }
    }
  },
  {
    type: 'function',
    name: 'get_metric_definition',
    description: 'Lấy định nghĩa, công thức và target của một chỉ số dashboard (FD: càng thấp càng tốt, KPI <= 3%).',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false, required: ['metric'],
      properties: { metric: { type: 'string', enum: ['p1st', 'opr', 'd1st', 'odr', 'ca1', 'fd', 'leadtime'] } }
    }
  },
  {
    type: 'function',
    name: 'get_dashboard_help',
    description: 'Giải thích chức năng và vị trí một khu vực của dashboard.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false, required: ['topic'],
      properties: { topic: { type: 'string', enum: [...HELP_TOPICS] } }
    }
  },
  REQUEST_METRIC_QUERY_TOOL,
  PUBLIC_SEARCH_TOOL
]);

export async function executeChatTool(call, context = {}) {
  const rawArgs = parseArguments(call.arguments);
  const { userClient } = context;

  const effectiveScope = context.effectiveScope ?? resolveEffectiveScope({
    question: context.question,
    query: context.query,
    screenContext: context.screenContext
  });

  const args = normalizeToolScope(call.name, rawArgs, effectiveScope);

  switch (call.name) {
    case 'get_metric_trend': {
      const [from, to] = dateRange(args.date_from, args.date_to);
      const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
      if (new Date(Date.parse(from)).toISOString().slice(0, 10) !== from || new Date(Date.parse(to)).toISOString().slice(0, 10) !== to) invalid('Khoảng ngày không hợp lệ.');
      if (count > 14) invalid('Biểu đồ theo ngày hỗ trợ tối đa 14 ngày mỗi lượt. Hãy chọn khoảng ngắn hơn.');
      const params = {
        p_metric: enumValue(args.metric, METRICS, 'metric'),
        p_client: enumValue(args.client, CLIENTS, 'client'),
        p_regions: textList(args.rpcRegions, 'regions'),
        p_hub_types: textList(args.rpcHubTypes, 'hub_types'),
        p_grain: 'nationwide', p_limit: 1, p_sort: 'worst',
      };
      const budget = context.trendBudget ?? { remaining: 14 };
      if (count > budget.remaining) invalid('Lượt hỏi đã đạt giới hạn 14 điểm dữ liệu theo ngày.');
      budget.remaining -= count;
      const rows = [], evidenceIds = [];
      let syncedAt = null, dataAsOf = null;
      // Existing permission-checked aggregate RPC, sequential and bounded. No raw
      // history download, new SQL, schema change, or invented daily interpolation.
      for (let i = 0; i < count; i += 1) {
        if (context.signal?.aborted) throw new ChatError('CHAT_TIMEOUT', 'Đã dừng tra cứu biểu đồ.', 504);
        const day = new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10);
        const scopedClient = { rpc(name, rpcParams) {
          const request = userClient.rpc(name, rpcParams);
          return context.signal && typeof request.abortSignal === 'function' ? request.abortSignal(context.signal) : request;
        } };
        const result = await callDashboardRpc(scopedClient, DASHBOARD_RPCS.metric, { ...params, p_date_from: day, p_date_to: day });
        if (context.signal?.aborted) throw new ChatError('CHAT_TIMEOUT', 'Đã dừng tra cứu biểu đồ.', 504);
        if (!Array.isArray(result.data?.rows) || result.data.rows.length > 1) throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Dữ liệu theo ngày chưa đúng định dạng.', 503);
        const row = result.data.rows[0];
        rows.push({ date: day, value: row?.value ?? null, volume: row?.volume ?? null, ontime: row?.ontime ?? null });
        evidenceIds.push(result.evidenceId);
        if (result.data.dataAsOf && (!dataAsOf || result.data.dataAsOf > dataAsOf)) dataAsOf = result.data.dataAsOf;
        if (result.data.syncedAt && (!syncedAt || result.data.syncedAt > syncedAt)) syncedAt = result.data.syncedAt;
      }
      return {
        evidenceId: `db_${createHash('sha256').update(JSON.stringify(evidenceIds)).digest('hex').slice(0, 16)}`,
        params: { ...params, p_date_from: from, p_date_to: to, p_grain: 'day' },
        data: { metric: params.p_metric, scope: { client: params.p_client, dateFrom: from, dateTo: to, grain: 'day' }, dataAsOf, syncedAt, rows,
          ...(params.p_metric === 'fd' ? { as_of_date: dataAsOf, direction: 'lower_is_better', kpiTarget: FD_KPI_TARGET, kpiRule: `Đạt khi FD <= ${FD_KPI_TARGET}%` } : {}) },
      };
    }
    case 'get_metric_change_drivers': {
      const metric = enumValue(args.metric, METRICS, 'metric');
      const client = enumValue(args.client, CLIENTS, 'client');
      const grain = enumValue(args.grain, DRIVER_GRAINS, 'grain');
      const [curFrom, curTo] = dateRange(args.current_from, args.current_to);
      const [prevFrom, prevTo] = dateRange(args.previous_from, args.previous_to);
      if (prevTo >= curFrom) invalid('Kỳ trước phải kết thúc trước khi kỳ hiện tại bắt đầu.');
      const base = { p_metric: metric, p_client: client,
        p_regions: textList(args.rpcRegions, 'regions'), p_hub_types: textList(args.rpcHubTypes, 'hub_types') };
      const scopedClient = { rpc(name, rpcParams) {
        const request = userClient.rpc(name, rpcParams);
        return context.signal && typeof request.abortSignal === 'function' ? request.abortSignal(context.signal) : request;
      } };
      const evidenceIds = [];
      let dataAsOf = null, syncedAt = null;
      const read = async params => {
        if (context.signal?.aborted) throw new ChatError('CHAT_TIMEOUT', 'Đã dừng tra cứu.', 504);
        const result = await callDashboardRpc(scopedClient, DASHBOARD_RPCS.metric, params);
        evidenceIds.push(result.evidenceId);
        if (result.data?.dataAsOf && (!dataAsOf || result.data.dataAsOf > dataAsOf)) dataAsOf = result.data.dataAsOf;
        if (result.data?.syncedAt && (!syncedAt || result.data.syncedAt > syncedAt)) syncedAt = result.data.syncedAt;
        if (!Array.isArray(result.data?.rows)) throw new ChatError('CHAT_DATA_UNAVAILABLE', 'Dữ liệu phân rã chưa đúng định dạng.', 503);
        return result.data;
      };
      const period = async (from, to) => {
        const total = await read({ ...base, p_date_from: from, p_date_to: to, p_grain: 'nationwide', p_limit: 1, p_offset: 0, p_sort: 'volume_desc' });
        const rows = [];
        let complete = true;
        for (let page = 0; page < DRIVER_MAX_PAGES; page += 1) {
          const data = await read({ ...base, p_date_from: from, p_date_to: to, p_grain: grain, p_limit: 50, p_offset: page * 50, p_sort: 'volume_desc' });
          rows.push(...data.rows);
          if (rows.length >= (data.totalEntities ?? rows.length) || !data.rows.length) break;
          if (page === DRIVER_MAX_PAGES - 1) complete = false;
        }
        return { total: total.rows[0] ?? null, rows, complete };
      };
      const previous = await period(prevFrom, prevTo);
      const current = await period(curFrom, curTo);
      const analysis = previous.total && current.total
        ? computeDrivers({ previous: previous.total, current: current.total, previousRows: previous.rows, currentRows: current.rows, lowerIsBetter: metric === 'fd' })
        : null;
      return {
        evidenceId: evidenceIdFor(evidenceIds),
        queriedAt: new Date().toISOString(),
        params: { ...base, p_grain: grain, p_date_from: curFrom, p_date_to: curTo, p_previous_from: prevFrom, p_previous_to: prevTo },
        data: {
          metric, dataAsOf, syncedAt,
          scope: { client, dateFrom: curFrom, dateTo: curTo, previousFrom: prevFrom, previousTo: prevTo, grain,
            ...(analysis?.drivers[0] ? { topDriver: analysis.drivers[0].entity, changePp: analysis.changePp } : {}) },
          partial: !(previous.complete && current.complete),
          ...(metric === 'fd' ? { as_of_date: dataAsOf, direction: 'lower_is_better', kpiTarget: FD_KPI_TARGET,
            ...(analysis ? {} : { noData: true, message: 'Một trong hai kỳ chưa có dữ liệu FD nên không so sánh được (không phải 0%).' }) } : {}),
          analysis
        }
      };
    }
    case 'get_data_coverage': {
      const dataset = enumValue(args.dataset, DATASETS, 'dataset');
      const client = enumValue(args.client, CLIENTS, 'client');
      return callDashboardRpc(userClient, DASHBOARD_RPCS.coverage, { p_dataset: dataset, p_client: client });
    }
    case 'get_metric_summary': {
      const [from, to] = dateRange(args.date_from, args.date_to);
      const metric = enumValue(args.metric, METRICS, 'metric');
      return callDashboardRpc(userClient, DASHBOARD_RPCS.metric, {
        p_metric: metric,
        p_client: enumValue(args.client, CLIENTS, 'client'),
        p_date_from: from,
        p_date_to: to,
        p_grain: enumValue(args.grain, GRAINS, 'grain'),
        p_regions: textList(args.rpcRegions, 'regions'),
        p_hub_types: textList(args.rpcHubTypes, 'hub_types'),
        p_limit: limit(args.limit),
        p_offset: offset(args.offset),
        p_sort: enumValue(args.sort, SORTS, 'sort')
      });
    }
    case 'get_latest_metric_summary': {
      const metric = enumValue(args.metric, METRICS, 'metric');
      const client = enumValue(args.client, CLIENTS, 'client');
      const coverage = await callDashboardRpc(userClient, DASHBOARD_RPCS.coverage, {
        p_dataset: METRIC_DATASETS[metric],
        p_client: client
      });
      const dataAsOf = coverage.data?.dataAsOf;
      if (!dataAsOf) {
        throw new ChatError('CHAT_DATA_EMPTY', 'Database chưa có ngày dữ liệu phù hợp với phạm vi này.', 422);
      }
      const latestDate = date(dataAsOf, 'dataAsOf');
      return callDashboardRpc(userClient, DASHBOARD_RPCS.metric, {
        p_metric: metric,
        p_client: client,
        p_date_from: latestDate,
        p_date_to: latestDate,
        p_grain: enumValue(args.grain, GRAINS, 'grain'),
        p_regions: textList(args.rpcRegions, 'regions'),
        p_hub_types: textList(args.rpcHubTypes, 'hub_types'),
        p_limit: limit(args.limit),
        p_offset: offset(args.offset),
        p_sort: enumValue(args.sort, SORTS, 'sort')
      });
    }
    case 'get_ca1_summary': {
      const [from, to] = dateRange(args.date_from, args.date_to);
      return callDashboardRpc(userClient, DASHBOARD_RPCS.ca1, {
        p_date_from: from,
        p_date_to: to,
        p_lane: optionalText(args.lane, 'lane'),
        p_regions: textList(args.rpcRegions, 'regions'),
        p_limit: limit(args.limit)
      });
    }
    case 'get_leadtime_summary': {
      const [from, to] = dateRange(args.date_from, args.date_to);
      return callDashboardRpc(userClient, DASHBOARD_RPCS.leadtime, {
        p_client: enumValue(args.client, CLIENTS, 'client'),
        p_date_from: from,
        p_date_to: to,
        p_lane: optionalText(args.lane, 'lane'),
        p_from_province: optionalText(args.from_province, 'from_province'),
        p_to_province: optionalText(args.to_province, 'to_province'),
        p_limit: limit(args.limit)
      });
    }
    case 'get_metric_definition': {
      const definition = getMetricDefinition(args.metric);
      if (!definition) invalid('metric không được hỗ trợ.');
      return { evidenceId: `glossary_${definition.key}`, data: definition };
    }
    case 'get_dashboard_help': {
      const topic = enumValue(args.topic, HELP_TOPICS, 'topic');
      return { evidenceId: `help_${topic}`, data: getDashboardHelp(topic) };
    }
    default:
      throw new ChatError('CHAT_TOOL_NOT_ALLOWED', 'Tool không được phép.', 400);
  }
}
