import { getDashboardHelp } from '../../src/data/dashboardHelp.js';
import { getMetricDefinition } from '../../src/data/metricGlossary.js';
import { callDashboardRpc, DASHBOARD_RPCS } from './db.js';
import { ChatError } from './errors.js';
import { REQUEST_METRIC_QUERY_TOOL } from './interactions.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLIENTS = new Set(['SPB', 'SPE', 'ALL']);
const METRICS = new Set(['p1st', 'opr', 'd1st', 'odr']);
const GRAINS = new Set(['nationwide', 'region', 'hub']);
const SORTS = new Set(['worst', 'best', 'volume_desc']);
const DATASETS = new Set(['pick', 'deli', 'ca1', 'leadtime']);
const HELP_TOPICS = new Set(['metrics', 'ca1', 'leadtime', 'insight', 'data_source']);
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
  if (!Array.isArray(value) || value.length > 20 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 80)) {
    invalid(`${name} không hợp lệ.`);
  }
  return [...new Set(value.map(item => item.trim()))];
}

function limit(value) {
  if (!Number.isInteger(value) || value < 1 || value > 50) invalid('limit phải từ 1 đến 50.');
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
    description: 'Đọc KPI pickup/delivery từ database theo client, ngày và cấp tổng hợp.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      required: ['metric', 'client', 'date_from', 'date_to', 'grain', 'regions', 'hub_types', 'limit', 'sort'],
      properties: {
        metric: { type: 'string', enum: [...METRICS] },
        client: { type: 'string', enum: [...CLIENTS] },
        date_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        date_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        grain: { type: 'string', enum: [...GRAINS] },
        regions: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        hub_types: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        sort: { type: 'string', enum: [...SORTS] }
      }
    }
  },
  {
    type: 'function',
    name: 'get_latest_metric_summary',
    description: 'Đọc KPI pickup/delivery ở ngày mới nhất hiện có trong database. Chỉ dùng khi người dùng nói rõ hiện tại/hôm nay/mới nhất hoặc đã chọn dateMode=latest; nếu chưa nêu thời gian thì phải yêu cầu lựa chọn.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      required: ['metric', 'client', 'grain', 'regions', 'hub_types', 'limit', 'sort'],
      properties: {
        metric: { type: 'string', enum: [...METRICS] },
        client: { type: 'string', enum: [...CLIENTS] },
        grain: { type: 'string', enum: [...GRAINS] },
        regions: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        hub_types: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
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
        regions: { type: 'array', items: { type: 'string' }, maxItems: 20 },
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
      properties: { metric: { type: 'string', enum: ['p1st', 'opr', 'd1st', 'odr', 'ca1', 'leadtime'] } }
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
  REQUEST_METRIC_QUERY_TOOL
]);

export async function executeChatTool(call, context) {
  const args = parseArguments(call.arguments);
  const { userClient } = context;

  switch (call.name) {
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
        p_regions: textList(args.regions, 'regions'),
        p_hub_types: textList(args.hub_types, 'hub_types'),
        p_limit: limit(args.limit),
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
        p_regions: textList(args.regions, 'regions'),
        p_hub_types: textList(args.hub_types, 'hub_types'),
        p_limit: limit(args.limit),
        p_sort: enumValue(args.sort, SORTS, 'sort')
      });
    }
    case 'get_ca1_summary': {
      const [from, to] = dateRange(args.date_from, args.date_to);
      return callDashboardRpc(userClient, DASHBOARD_RPCS.ca1, {
        p_date_from: from,
        p_date_to: to,
        p_lane: optionalText(args.lane, 'lane'),
        p_regions: textList(args.regions, 'regions'),
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
