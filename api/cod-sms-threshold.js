import { readCodSmsConfig } from '../server/cod-sms/config.js';
import { authenticateRequest, hasDevAdminRole } from '../server/chat/auth.js';
import { ChatError, toPublicError } from '../server/chat/errors.js';
import { sendJson } from '../server/chat/sse.js';

export function validateThreshold(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 9) {
    throw new ChatError('COD_SMS_THRESHOLD_INVALID', 'Mốc điểm SMS phải là số nguyên từ 1 đến 9.', 400);
  }
  return value;
}

export function createCodSmsThresholdHandler(dependencies = {}) {
  const readConfig = dependencies.readConfig ?? (() => readCodSmsConfig(process.env, { requireScoring: false }));
  const authenticate = dependencies.authenticate ?? authenticateRequest;
  const authorizeDev = dependencies.authorizeDev ?? hasDevAdminRole;

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, { error: { code: 'COD_SMS_THRESHOLD_METHOD', message: 'Chỉ hỗ trợ GET và POST.' } });
      return;
    }
    try {
      const { userClient, serviceClient } = await authenticate(req.headers.authorization, readConfig());
      if (req.method === 'GET') {
        const { data, error } = await serviceClient.from('cod_sms_escalation_config')
          .select('threshold, updated_at, updated_by').eq('id', true).single();
        if (error || !data) throw new ChatError('COD_SMS_THRESHOLD_READ_FAILED', 'Không thể tải mốc điểm SMS.', 503);
        const isDev = await authorizeDev(userClient);
        sendJson(res, 200, isDev
          ? { threshold: data.threshold, updatedAt: data.updated_at, updatedBy: data.updated_by }
          : { threshold: data.threshold });
        return;
      }

      if (!await authorizeDev(userClient)) {
        throw new ChatError('COD_SMS_THRESHOLD_FORBIDDEN', 'Chỉ Dev Admin được sửa mốc điểm SMS.', 403);
      }
      let body;
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch {
        throw new ChatError('COD_SMS_THRESHOLD_INVALID', 'JSON không hợp lệ.', 400);
      }
      const threshold = validateThreshold(body?.threshold);
      const { data, error } = await userClient.rpc('set_cod_sms_escalation_threshold', { p_threshold: threshold });
      if (error) {
        if (error.code === '42501') throw new ChatError('COD_SMS_THRESHOLD_FORBIDDEN', 'Chỉ Dev Admin được sửa mốc điểm SMS.', 403);
        if (error.code === '22023') throw new ChatError('COD_SMS_THRESHOLD_INVALID', 'Mốc điểm SMS phải là số nguyên từ 1 đến 9.', 400);
        throw new ChatError('COD_SMS_THRESHOLD_SAVE_FAILED', 'Không thể lưu mốc điểm SMS.', 503);
      }
      sendJson(res, 200, { threshold: data.threshold, updatedAt: data.updated_at, updatedBy: data.updated_by });
    } catch (error) {
      const publicError = toPublicError(error);
      sendJson(res, publicError.status, { error: { code: publicError.code, message: publicError.message } });
    }
  };
}

export default createCodSmsThresholdHandler();
