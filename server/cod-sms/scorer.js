import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { ChatError } from '../chat/errors.js';
import {
  CONFIDENCE_VALUES,
  PATTERN_VALUES,
  SMS_ASSESSMENT_JSON_SCHEMA,
  SMS_SCORING_INSTRUCTIONS
} from './rubric.js';

const OUTPUT_KEYS = new Set([
  'order_code',
  'diem_sms',
  'muc_do_tin_cay',
  'mau_hinh_phat_hien',
  'bang_chung',
  'giai_thich'
]);

const PATTERN_WEIGHTS = Object.freeze({
  mau_1: 5,
  mau_2: 1,
  mau_3: 1,
  mau_4: 1,
  mau_5: 2
});

const BANKING_CONTEXT = /(?:techcombank|vietcombank|\btech\b|\bvcb\b|\bmbbank\b|\bmb\b|\bvib\b|vpbank|\bacb\b|sacombank|\bbidv\b|agribank|tpbank|\bocb\b|seabank|hdbank|\bmsb\b|ngân\s*hàng|ngan\s*hang|chuyển\s*khoản|chuyen\s*khoan|số\s*tài\s*khoản|so\s*tai\s*khoan|\bstk\b|\bck\b)/iu;

export class CodSmsScoringError extends ChatError {
  constructor(code, message, status = 502, options = {}) {
    super(code, message, status, options);
    this.name = 'CodSmsScoringError';
  }
}

function invalidOutput(reason) {
  return new CodSmsScoringError(
    'COD_SMS_MODEL_SCHEMA_INVALID',
    'Model trả về dữ liệu không đúng schema chấm điểm SMS.',
    502,
    { cause: new Error(reason) }
  );
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'vi');
}

export function normalizeMessages(messages = []) {
  const seen = new Set();
  return messages
    .map(message => ({
      smsTime: String(message.smsTime ?? message.sms_time ?? ''),
      recipientType: String(message.recipientType ?? message.recipient_type ?? ''),
      content: String(message.content ?? '')
    }))
    .filter(message => message.smsTime && message.content.trim())
    .sort((a, b) =>
      compareText(a.smsTime, b.smsTime)
      || compareText(a.recipientType, b.recipientType)
      || compareText(a.content, b.content))
    .filter(message => {
      const key = `${message.smsTime}\u0000${message.recipientType}\u0000${message.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function extractLongNumericSequences(content) {
  const matches = String(content ?? '').match(/\d{8,}/g) ?? [];
  return [...new Set(matches)];
}

export function hasBankingContext(content) {
  return BANKING_CONTEXT.test(String(content ?? ''));
}

function normalizeOtherOrderSequences(rows = []) {
  return rows
    .map(row => ({
      orderCode: String(row.orderCode ?? row.order_code ?? ''),
      sequences: [...new Set((row.sequences ?? []).map(String))].sort(compareText)
    }))
    .filter(row => row.orderCode && row.sequences.length > 0)
    .sort((a, b) => compareText(a.orderCode, b.orderCode));
}

export function buildScoringInput(source) {
  const messages = normalizeMessages(source.messages);
  return {
    order_code: String(source.orderCode),
    driver_id: String(source.driverId),
    ten_tai_xe: source.driverName ? String(source.driverName) : null,
    loai_nghi_ngo: String(source.suspicionType),
    cod_amount: source.codAmount === null || source.codAmount === undefined
      ? null
      : Number(source.codAmount),
    sms: messages.map(message => ({
      sms_time: message.smsTime,
      user_type: message.recipientType,
      content: message.content
    })),
    sms_cac_don_khac_cung_tai_xe: normalizeOtherOrderSequences(source.otherOrderSequences)
      .map(row => ({ order_code: row.orderCode, chuoi_so_dai: row.sequences }))
  };
}

export function computeSourceFingerprint(source) {
  const input = buildScoringInput(source);
  return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

function hasQualifyingBankEvidence(evidence, orderCode) {
  const numericOrderCode = /^\d{8,}$/.test(orderCode) ? orderCode : null;
  return evidence.some(content => {
    if (!hasBankingContext(content)) return false;
    return extractLongNumericSequences(content).some(sequence => sequence !== numericOrderCode);
  });
}

function assertStringArray(value, field, options = {}) {
  const { allowedValues = null, maxItems = Infinity, maxItemLength = Infinity } = options;
  if (!Array.isArray(value)) throw invalidOutput(`${field} must be an array`);
  if (value.length > maxItems) throw invalidOutput(`${field} has too many items`);
  if (value.some(item => typeof item !== 'string' || !item || item.length > maxItemLength)) {
    throw invalidOutput(`${field} must contain non-empty strings`);
  }
  if (new Set(value).size !== value.length) throw invalidOutput(`${field} must be unique`);
  if (allowedValues && value.some(item => !allowedValues.includes(item))) {
    throw invalidOutput(`${field} contains an unsupported value`);
  }
}

export function validateModelAssessment(raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalidOutput('output must be an object');
  }
  const keys = Object.keys(raw);
  if (keys.length !== OUTPUT_KEYS.size || keys.some(key => !OUTPUT_KEYS.has(key))) {
    throw invalidOutput('output keys do not match the contract');
  }
  if (raw.order_code !== String(source.orderCode)) throw invalidOutput('order_code mismatch');
  if (!Number.isInteger(raw.diem_sms) || raw.diem_sms < 0 || raw.diem_sms > 9) {
    throw invalidOutput('diem_sms out of range');
  }
  if (!CONFIDENCE_VALUES.includes(raw.muc_do_tin_cay)) {
    throw invalidOutput('invalid confidence');
  }
  assertStringArray(raw.mau_hinh_phat_hien, 'mau_hinh_phat_hien', {
    allowedValues: PATTERN_VALUES,
    maxItems: 5,
    maxItemLength: 20
  });
  assertStringArray(raw.bang_chung, 'bang_chung', { maxItems: 10, maxItemLength: 4000 });
  if (typeof raw.giai_thich !== 'string' || !raw.giai_thich.trim() || raw.giai_thich.length > 4000) {
    throw invalidOutput('invalid explanation');
  }

  const messages = normalizeMessages(source.messages);
  const originalContents = new Set(messages.map(message => message.content));
  if (raw.bang_chung.some(evidence => !originalContents.has(evidence))) {
    throw invalidOutput('evidence is not a verbatim source message');
  }

  const patterns = new Set(raw.mau_hinh_phat_hien);
  const hasMau1 = patterns.has('mau_1');
  const hasMau4 = patterns.has('mau_4');
  const hasBase = hasMau1 || hasMau4;
  if (hasMau1 && hasMau4) throw invalidOutput('mau_1 and mau_4 are mutually exclusive');
  if (!hasBase && [...patterns].some(pattern => pattern !== 'mau_1' && pattern !== 'mau_4')) {
    throw invalidOutput('additional patterns require a base pattern');
  }

  const expectedScore = [...patterns].reduce((sum, pattern) => sum + PATTERN_WEIGHTS[pattern], 0);
  if (raw.diem_sms !== expectedScore) throw invalidOutput('score does not match rubric weights');

  if (raw.diem_sms === 0) {
    if (patterns.size !== 0 || raw.bang_chung.length !== 0
      || raw.muc_do_tin_cay !== 'khong_co_bang_chung') {
      throw invalidOutput('zero score must use no-evidence shape');
    }
  } else {
    if (!hasBase || raw.bang_chung.length === 0
      || raw.muc_do_tin_cay === 'khong_co_bang_chung') {
      throw invalidOutput('positive score must include base pattern and evidence');
    }
    if (!hasQualifyingBankEvidence(raw.bang_chung, String(source.orderCode))) {
      throw invalidOutput('bank-account pattern lacks banking context');
    }
  }

  return {
    orderCode: raw.order_code,
    smsScore: raw.diem_sms,
    confidence: raw.muc_do_tin_cay,
    detectedPatterns: raw.mau_hinh_phat_hien,
    evidence: raw.bang_chung,
    explanation: raw.giai_thich.trim()
  };
}

function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }
  return (response?.output ?? [])
    .flatMap(item => item.content ?? [])
    .filter(part => part.type === 'output_text')
    .map(part => part.text ?? '')
    .join('');
}

export async function scoreSmsSource(source, config, options = {}) {
  const openai = options.openai ?? new OpenAI({
    apiKey: config.openaiApiKey,
    timeout: config.modelTimeoutMs,
    maxRetries: 0
  });

  let response;
  try {
    response = await openai.responses.create({
      model: config.model,
      instructions: SMS_SCORING_INSTRUCTIONS,
      input: [{ role: 'user', content: JSON.stringify(buildScoringInput(source)) }],
      text: {
        format: {
          type: 'json_schema',
          name: 'cod_sms_assessment',
          strict: true,
          schema: SMS_ASSESSMENT_JSON_SCHEMA
        }
      },
      ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
      max_output_tokens: config.maxOutputTokens,
      store: false
    }, { signal: options.signal });
  } catch (error) {
    // The public-facing ChatError intentionally hides this from the UI/API
    // response (badge just shows "Lỗi chấm điểm"), so this is the only place
    // the real OpenAI failure reason survives. Only log OpenAI SDK error
    // metadata (status/code/type/message come from the API response, not
    // from SMS content), never the request body or `error` object itself.
    console.error('[cod-sms] scoreSmsSource: OpenAI request failed', {
      orderCode: source?.orderCode,
      model: config?.model,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      message: error?.message
    });
    throw new CodSmsScoringError(
      options.signal?.aborted ? 'COD_SMS_MODEL_TIMEOUT' : 'COD_SMS_MODEL_UNAVAILABLE',
      options.signal?.aborted
        ? 'Model chấm điểm SMS xử lý quá thời gian.'
        : 'Không thể kết nối model chấm điểm SMS.',
      options.signal?.aborted ? 504 : 502,
      { cause: error }
    );
  }

  if (response?.status && response.status !== 'completed') {
    throw new CodSmsScoringError(
      'COD_SMS_MODEL_INCOMPLETE',
      'Model chưa hoàn tất kết quả chấm điểm SMS.',
      502
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(extractOutputText(response));
  } catch (error) {
    throw invalidOutput(`invalid JSON: ${error.message}`);
  }
  return validateModelAssessment(parsed, source);
}
