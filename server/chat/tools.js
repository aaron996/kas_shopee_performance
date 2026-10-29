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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLIENTS = new Set(CHAT_CLIENT_CODES);
const METRICS = new Set(['p1st', 'opr', 'd1st', 'odr']);
const GRAINS = new Set(['nationwide', 'region', 'hub']);
const SORTS = new Set(['worst', 'best', 'volume_desc']);
const DATASETS = new Set(['pick', 'deli', 'ca1', 'leadtime']);
const HELP_TOPICS = new Set(Object.keys(DASHBOARD_HELP));
const METRIC_DATASETS = Object.freeze({ p1st: 'pick', opr: 'pick', d1st: 'deli', odr: 'deli' });

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
    description: 'Đọc KPI P1ST/OPR/D1ST/ODR theo từng ngày để vẽ biểu đồ đường. Tối đa 14 ngày trong một lượt; bắt buộc đủ metric, client và khoảng ngày. Không chia nhỏ nhiều lần để vượt giới hạn. Muốn 7 ngày mới nhất: lấy dataAsOf qua get_data_coverage trước. Ngày không có dữ liệu giữ NULL.',
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
    type: 'function',
    name: 'get_data_coverage',
    description: 'Lấy ngày dữ liệu sớm nhất, mới nhất và thời điểm đồng bộ của một bộ dữ liệu.',
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
    description: 'Đọc KPI pickup/delivery từ database theo client, ngày và cấp tổng hợp. Kết quả trả về totalEntities (tổng số dòng có thật, trước khi cắt theo limit/offset) và offset đã dùng — nếu totalEntities > offset + số dòng trả về, gọi lại với offset tăng thêm limit để lấy hết, giữ nguyên các tham số khác và cùng một sort.',
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
    description: 'Đọc KPI pickup/delivery ở ngày mới nhất hiện có trong database. Chỉ dùng khi người dùng nói rõ hiện tại/hôm nay/mới nhất hoặc đã chọn dateMode=latest; nếu chưa nêu thời gian thì phải yêu cầu lựa chọn. Kết quả trả về totalEntities và offset — nếu totalEntities > offset + số dòng trả về, gọi lại với offset tăng thêm limit để lấy hết.',
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
    description: 'Lấy định nghĩa, công thức và target của một chỉ số dashboard.',
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
        data: { metric: params.p_metric, scope: { client: params.p_client, dateFrom: from, dateTo: to, grain: 'day' }, dataAsOf, syncedAt, rows },
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
