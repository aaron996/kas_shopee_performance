import { ChatError } from './errors.js';

export const REQUEST_METRIC_QUERY_TOOL_NAME = 'request_metric_query';

const METRICS = new Set(['p1st', 'opr', 'd1st', 'odr']);
const CLIENTS = new Set(['SPB', 'SPE', 'ALL']);
const DATE_MODES = new Set(['latest', 'trailing_7d', 'custom']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const nullableEnum = values => ({ anyOf: [{ type: 'string', enum: values }, { type: 'null' }] });
const nullableDate = { anyOf: [{ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, { type: 'null' }] };

export const REQUEST_METRIC_QUERY_TOOL = Object.freeze({
  type: 'function',
  name: REQUEST_METRIC_QUERY_TOOL_NAME,
  description: 'Hiển thị thẻ lựa chọn khi câu hỏi KPI pickup/delivery còn thiếu metric, client hoặc thời gian. Không dùng tool database trong cùng lượt gọi tool này.',
  strict: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['metric', 'client', 'date_mode', 'date_from', 'date_to'],
    properties: {
      metric: nullableEnum([...METRICS]),
      client: nullableEnum([...CLIENTS]),
      date_mode: nullableEnum([...DATE_MODES]),
      date_from: nullableDate,
      date_to: nullableDate
    }
  }
});

function invalid(message) {
  throw new ChatError('CHAT_INTERACTION_INVALID', message, 400);
}

function parseArguments(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    invalid('Tham số lựa chọn không phải JSON object hợp lệ.');
  }
}

function optionalEnum(value, values, name) {
  if (value === null) return null;
  if (typeof value !== 'string' || !values.has(value)) invalid(`${name} không được hỗ trợ.`);
  return value;
}

function optionalDate(value, name) {
  if (value === null) return null;
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    invalid(`${name} phải có dạng YYYY-MM-DD.`);
  }
  return value;
}

function dateRangeIsValid(from, to) {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  return days >= 0 && days <= 90;
}

const option = (id, label, value = id) => ({ id, label, value });

export function createMetricQueryInteraction(call) {
  if (call?.name !== REQUEST_METRIC_QUERY_TOOL_NAME) invalid('Loại interaction không được hỗ trợ.');

  const args = parseArguments(call.arguments);
  const query = {
    metric: optionalEnum(args.metric, METRICS, 'metric'),
    client: optionalEnum(args.client, CLIENTS, 'client'),
    dateMode: optionalEnum(args.date_mode, DATE_MODES, 'date_mode'),
    dateFrom: optionalDate(args.date_from, 'date_from'),
    dateTo: optionalDate(args.date_to, 'date_to')
  };

  if (query.dateMode !== 'custom' && (query.dateFrom || query.dateTo)) {
    invalid('date_from/date_to chỉ được dùng với date_mode custom.');
  }
  if (!query.dateMode && (query.dateFrom || query.dateTo)) {
    invalid('Phải có date_mode khi đã có khoảng ngày.');
  }
  if (query.dateFrom && query.dateTo && !dateRangeIsValid(query.dateFrom, query.dateTo)) {
    invalid('Khoảng ngày phải theo thứ tự và không vượt quá 90 ngày.');
  }

  const fields = [];
  if (!query.metric) {
    fields.push({
      id: 'metric', label: 'Chỉ số', type: 'single_select',
      options: ['p1st', 'opr', 'd1st', 'odr'].map(value => option(value, value.toUpperCase()))
    });
  }
  if (!query.client) {
    fields.push({
      id: 'client', label: 'Phạm vi', type: 'single_select',
      options: [option('SPB', 'SPB'), option('SPE', 'SPE'), option('ALL', 'Toàn bộ')]
    });
  }
  if (!query.dateMode) {
    fields.push({
      id: 'dateMode', label: 'Thời gian', type: 'single_select',
      options: [
        option('latest', 'Dữ liệu mới nhất'),
        option('trailing_7d', '7 ngày gần nhất'),
        option('custom', 'Chọn khoảng ngày')
      ]
    });
  }
  if (query.dateMode === 'custom' && (!query.dateFrom || !query.dateTo)) {
    fields.push({ id: 'dateRange', label: 'Khoảng ngày', type: 'date_range' });
  }

  if (!fields.length) invalid('Interaction chỉ được tạo khi còn thiếu tham số bắt buộc.');

  const labels = fields.map(field => field.label.toLocaleLowerCase('vi-VN'));
  const prompt = `Chọn ${labels.join(', ')} để mình tra cứu đúng dữ liệu.`;

  return {
    type: 'query_parameters',
    interactionId: call.call_id,
    prompt,
    query,
    fields
  };
}

