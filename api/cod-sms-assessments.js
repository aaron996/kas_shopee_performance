import { authenticateRequest, hasDevAdminRole } from '../server/chat/auth.js';
import { ChatError, toPublicError } from '../server/chat/errors.js';
import { sendJson } from '../server/chat/sse.js';
import { readCodSmsConfig } from '../server/cod-sms/config.js';
import {
  createCodSmsRepository,
  runAssessmentBatch,
  serializeAssessment
} from '../server/cod-sms/service.js';

export const maxDuration = 300;
const MAX_BODY_BYTES = 64 * 1024;
const SUSPICION_TYPES = new Set(['Gối đầu COD', 'Rút ruột']);

async function readBody(req) {
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new ChatError('COD_SMS_BODY_TOO_LARGE', 'Batch SMS vượt quá kích thước cho phép.', 413);
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function readUrl(req) {
  return new URL(req.url || '/api/cod-sms-assessments', 'http://localhost');
}

function parsePositiveInt(value, fallback, max, field, allowZero = false) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  const min = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ChatError('COD_SMS_BAD_REQUEST', `${field} không hợp lệ.`, 400);
  }
  return parsed;
}

function parseCase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChatError('COD_SMS_BAD_REQUEST', 'Mỗi case phải là một object.', 400);
  }
  const suspicionType = typeof value.suspicionType === 'string' ? value.suspicionType.trim() : '';
  const driverId = typeof value.driverId === 'string' ? value.driverId.trim() : '';
  const orderCode = typeof value.orderCode === 'string' ? value.orderCode.trim() : '';
  if (!SUSPICION_TYPES.has(suspicionType) || !driverId || !orderCode) {
    throw new ChatError('COD_SMS_BAD_REQUEST', 'Khóa case SMS không hợp lệ.', 400);
  }
  return { suspicionType, driverId, orderCode };
}

function parseBatchRequest(body, config) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ChatError('COD_SMS_BAD_REQUEST', 'Body batch SMS không hợp lệ.', 400);
  }
  const cases = body.cases === undefined ? [] : body.cases;
  if (!Array.isArray(cases) || cases.length > config.maxBatchLimit) {
    throw new ChatError('COD_SMS_BAD_REQUEST', 'Danh sách case SMS không hợp lệ.', 400);
  }
  if (body.force !== undefined && typeof body.force !== 'boolean') {
    throw new ChatError('COD_SMS_BAD_REQUEST', 'force phải là boolean.', 400);
  }
  const parsedCases = cases.map(parseCase);
  const requestedLimit = parsePositiveInt(
    body.limit,
    parsedCases.length || config.defaultBatchLimit,
    config.maxBatchLimit,
    'limit'
  );
  const limit = Math.max(requestedLimit, parsedCases.length);
  const offset = parsePositiveInt(body.offset, 0, 10000, 'offset', true);
  return { limit, offset, cases: parsedCases, force: body.force === true };
}

function parseGetRequest(req) {
  const url = readUrl(req);
  const suspicionType = url.searchParams.get('suspicion_type')?.trim() || null;
  if (suspicionType && !SUSPICION_TYPES.has(suspicionType)) {
    throw new ChatError('COD_SMS_BAD_REQUEST', 'suspicion_type không hợp lệ.', 400);
  }
  const includeEvidence = url.searchParams.get('include_evidence') === 'true';
  return {
    includeEvidence,
    limit: parsePositiveInt(url.searchParams.get('limit'), 200, 500, 'limit'),
    filters: {
      suspicionType,
      driverId: url.searchParams.get('driver_id')?.trim() || null,
      orderCode: url.searchParams.get('order_code')?.trim() || null
    }
  };
}

export function createCodSmsAssessmentsHandler(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? readCodSmsConfig;
  const authenticate = dependencies.authenticate ?? authenticateRequest;
  const authorizeDev = dependencies.authorizeDev ?? hasDevAdminRole;
  const makeRepository = dependencies.createRepository ?? createCodSmsRepository;
  const runBatch = dependencies.runBatch ?? runAssessmentBatch;

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, {
        error: { code: 'COD_SMS_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ GET và POST.' }
      });
      return;
    }

    try {
      const requireScoring = req.method === 'POST';
      const config = getConfig(process.env, { requireScoring });
      const auth = await authenticate(req.headers.authorization, config);
      const repository = makeRepository(auth.serviceClient);

      if (req.method === 'GET') {
        const request = parseGetRequest(req);
        if (request.includeEvidence && !await authorizeDev(auth.userClient, auth.user)) {
          throw new ChatError(
            'COD_SMS_EVIDENCE_FORBIDDEN',
            'Bạn không có quyền xem bằng chứng SMS nguyên văn.',
            403
          );
        }
        const rows = await repository.list(request);
        sendJson(res, 200, {
          contractVersion: '1',
          assessments: rows.map(row => serializeAssessment(row, request)),
          meta: { count: rows.length, evidenceIncluded: request.includeEvidence }
        });
        return;
      }

      if (!await authorizeDev(auth.userClient, auth.user)) {
        throw new ChatError('COD_SMS_BATCH_FORBIDDEN', 'Chỉ Dev Admin được chạy batch SMS.', 403);
      }
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        if (error instanceof ChatError) throw error;
        throw new ChatError('COD_SMS_BAD_REQUEST', 'JSON batch SMS không hợp lệ.', 400, { cause: error });
      }
      const request = parseBatchRequest(body, config);
      const controller = new AbortController();
      res.on?.('close', () => {
        if (!res.writableEnded) controller.abort(new Error('Client disconnected'));
      });
      const result = await runBatch({
        repository,
        config,
        ...request,
        signal: controller.signal
      }, dependencies);
      sendJson(res, 200, {
        contractVersion: '1',
        batch: { ...result.summary, limit: request.limit, offset: request.offset, force: request.force },
        assessments: result.rows.map(row => serializeAssessment(row, { includeEvidence: true }))
      });
    } catch (error) {
      const failure = toPublicError(error);
      sendJson(res, failure.status, {
        error: { code: failure.code, message: failure.message }
      });
    }
  };
}

export default createCodSmsAssessmentsHandler();

export { parseBatchRequest, parseGetRequest };
