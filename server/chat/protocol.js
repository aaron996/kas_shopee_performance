import { createHash } from 'node:crypto';
import { ChatError } from './errors.js';

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_QUESTION_CHARS = 4000;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_HISTORY_CHARS = 24000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = new Set(['question', 'history', 'requestId', 'model', 'reasoningEffort', 'query', 'screenContext']);
const QUERY_KEYS = new Set(['metric', 'client', 'dateMode', 'dateFrom', 'dateTo']);
const SCREEN_CONTEXT_KEYS = new Set(['activeTab', 'client', 'regions', 'hubTypes', 'section']);
const METRICS = new Set(['p1st', 'opr', 'd1st', 'odr']);
const CLIENTS = new Set(['SPB', 'SPE', 'ALL']);
const DATE_MODES = new Set(['latest', 'trailing_7d', 'custom']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ALLOWED_TABS = Object.freeze(new Set(['report1', 'report5', 'report3', 'report-insight']));

function badRequest(message) {
  throw new ChatError('CHAT_BAD_REQUEST', message, 400);
}

function parseQuery(rawQuery) {
  if (rawQuery === undefined || rawQuery === null) return null;
  if (typeof rawQuery !== 'object' || Array.isArray(rawQuery)) badRequest('query không hợp lệ.');
  if (Object.keys(rawQuery).some(key => !QUERY_KEYS.has(key))) badRequest('query có field không được hỗ trợ.');

  const { metric, client, dateMode, dateFrom = null, dateTo = null } = rawQuery;
  if (!METRICS.has(metric)) badRequest('query.metric không được hỗ trợ.');
  if (!CLIENTS.has(client)) badRequest('query.client không được hỗ trợ.');
  if (!DATE_MODES.has(dateMode)) badRequest('query.dateMode không được hỗ trợ.');

  if (dateMode === 'custom') {
    if (![dateFrom, dateTo].every(value => typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
      badRequest('Khoảng ngày custom phải có dateFrom và dateTo dạng YYYY-MM-DD.');
    }
    const days = (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86400000;
    if (days < 0 || days > 90) badRequest('Khoảng ngày phải theo thứ tự và không vượt quá 90 ngày.');
  } else if (dateFrom !== null || dateTo !== null) {
    badRequest('dateFrom/dateTo chỉ được dùng với dateMode custom.');
  }

  return { metric, client, dateMode, dateFrom, dateTo };
}

export function parseScreenContext(rawContext) {
  if (rawContext === undefined || rawContext === null) return null;
  if (typeof rawContext !== 'object' || Array.isArray(rawContext)) badRequest('screenContext không hợp lệ.');
  for (const key of Object.keys(rawContext)) {
    if (!SCREEN_CONTEXT_KEYS.has(key)) badRequest(`screenContext có field không được hỗ trợ: ${key}.`);
  }

  const { activeTab = null, client = null, regions = null, hubTypes = null, section = null } = rawContext;

  if (activeTab !== null) {
    if (typeof activeTab !== 'string' || !ALLOWED_TABS.has(activeTab)) {
      badRequest('screenContext.activeTab không được hỗ trợ.');
    }
  }

  if (client !== null) {
    if (typeof client !== 'string' || !CLIENTS.has(client)) {
      badRequest('screenContext.client không được hỗ trợ.');
    }
  }

  let normalizedRegions = null;
  if (regions !== null) {
    if (!Array.isArray(regions) || regions.length > 20 || regions.some(r => typeof r !== 'string' || !r.trim() || r.length > 80 || /<[^>]+>/.test(r))) {
      badRequest('screenContext.regions không hợp lệ.');
    }
    normalizedRegions = [...new Set(regions.map(r => r.trim()))];
  }

  let normalizedHubTypes = null;
  if (hubTypes !== null) {
    if (!Array.isArray(hubTypes) || hubTypes.length > 20 || hubTypes.some(h => typeof h !== 'string' || !h.trim() || h.length > 80 || /<[^>]+>/.test(h))) {
      badRequest('screenContext.hubTypes không hợp lệ.');
    }
    normalizedHubTypes = [...new Set(hubTypes.map(h => h.trim()))];
  }

  let normalizedSection = null;
  if (section !== null) {
    if (typeof section !== 'string' || !section.trim() || section.length > 50 || /<[^>]+>/.test(section)) {
      badRequest('screenContext.section không hợp lệ.');
    }
    normalizedSection = section.trim();
  }

  return {
    activeTab,
    client,
    regions: normalizedRegions,
    hubTypes: normalizedHubTypes,
    section: normalizedSection
  };
}

export function parseRequestBody(rawBody, contentLength) {
  if (Number(contentLength) > MAX_BODY_BYTES) {
    throw new ChatError('CHAT_BODY_TOO_LARGE', 'Nội dung câu hỏi quá lớn.', 413);
  }

  let body = rawBody;
  if (typeof rawBody === 'string' || rawBody instanceof Uint8Array) {
    const text = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8');
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      throw new ChatError('CHAT_BODY_TOO_LARGE', 'Nội dung câu hỏi quá lớn.', 413);
    }
    try {
      body = JSON.parse(text);
    } catch {
      badRequest('JSON không hợp lệ.');
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) badRequest('Body không hợp lệ.');
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) badRequest(`Field không được hỗ trợ: ${key}.`);
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) badRequest('Câu hỏi không được để trống.');
  if (question.length > MAX_QUESTION_CHARS) badRequest('Câu hỏi dài quá 4.000 ký tự.');
  if (!UUID_RE.test(body.requestId ?? '')) badRequest('requestId phải là UUID hợp lệ.');

  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > MAX_HISTORY_MESSAGES) {
    badRequest('Lịch sử hội thoại không hợp lệ hoặc quá dài.');
  }

  let historyChars = 0;
  const normalizedHistory = history.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      badRequest(`History item ${index + 1} không hợp lệ.`);
    }
    const keys = Object.keys(message);
    if (keys.some(key => key !== 'role' && key !== 'content')) {
      badRequest(`History item ${index + 1} có field không được hỗ trợ.`);
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      badRequest(`History item ${index + 1} có role không hợp lệ.`);
    }
    if (typeof message.content !== 'string' || !message.content.trim()) {
      badRequest(`History item ${index + 1} thiếu nội dung.`);
    }
    const content = message.content.trim();
    historyChars += content.length;
    return { role: message.role, content };
  });

  if (historyChars > MAX_HISTORY_CHARS) badRequest('Lịch sử hội thoại quá dài.');
  for (let index = 1; index < normalizedHistory.length; index += 1) {
    if (normalizedHistory[index].role === normalizedHistory[index - 1].role) {
      badRequest('Lịch sử hội thoại phải xen kẽ user và assistant.');
    }
  }
  if (normalizedHistory.at(-1)?.role === 'user') {
    badRequest('Lịch sử phải kết thúc bằng câu trả lời assistant trước câu hỏi mới.');
  }

  const query = parseQuery(body.query);
  const screenContext = parseScreenContext(body.screenContext);

  // Legacy keys (model, reasoningEffort) are accepted for rolling deploy safety but discarded here.
  return {
    question,
    history: normalizedHistory,
    requestId: body.requestId.toLowerCase(),
    query,
    screenContext
  };
}

export function requestPayloadHash(request) {
  return createHash('sha256')
    .update(JSON.stringify({
      question: request.question,
      history: request.history,
      query: request.query ?? null,
      screenContext: request.screenContext ?? null
    }))
    .digest('hex');
}
