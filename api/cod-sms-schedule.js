import { readCodSmsConfig } from '../server/cod-sms/config.js';
import { authenticateRequest, hasDevAdminRole } from '../server/chat/auth.js';
import { ChatError, toPublicError } from '../server/chat/errors.js';
import { sendJson } from '../server/chat/sse.js';

export function validateSchedule(body) {
  if (!body || typeof body.enabled !== 'boolean' || typeof body.time !== 'string'
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)
    || Object.keys(body).some(key => !['enabled', 'time'].includes(key))) {
    throw new ChatError('COD_SMS_SCHEDULE_INVALID', 'Chọn giờ hợp lệ (HH:mm) và trạng thái bật/tắt.', 400);
  }
  return body;
}

export function createCodSmsScheduleHandler(dependencies = {}) {
  const readConfig = dependencies.readConfig ?? (() => readCodSmsConfig(process.env, { requireScoring: false }));
  const authenticate = dependencies.authenticate ?? authenticateRequest;
  const authorizeDev = dependencies.authorizeDev ?? hasDevAdminRole;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, { error: { code: 'COD_SMS_SCHEDULE_METHOD', message: 'Chỉ hỗ trợ GET và POST.' } });
      return;
    }
    try {
      const { userClient } = await authenticate(req.headers.authorization, readConfig());
      if (!await authorizeDev(userClient)) throw new ChatError('COD_SMS_SCHEDULE_FORBIDDEN', 'Chỉ Dev được xem và sửa lịch chấm SMS.', 403);
      let result;
      if (req.method === 'POST') {
        let body;
        try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
        catch { throw new ChatError('COD_SMS_SCHEDULE_INVALID', 'JSON không hợp lệ.', 400); }
        const { enabled, time } = validateSchedule(body);
        result = await userClient.rpc('set_cod_sms_schedule', { p_enabled: enabled, p_time: time });
      } else result = await userClient.rpc('get_cod_sms_schedule');
      if (result.error) {
        const { code } = result.error;
        if (code === '42501') throw new ChatError('COD_SMS_SCHEDULE_FORBIDDEN', 'Chỉ Dev được xem và sửa lịch chấm SMS.', 403);
        if (code === '55000') throw new ChatError('COD_SMS_SCHEDULE_NOT_READY', 'Lịch tự động chưa được kết nối. Liên hệ người triển khai để hoàn tất cấu hình backend.', 409);
        if (code === '22023') throw new ChatError('COD_SMS_SCHEDULE_INVALID', 'Giờ chạy không hợp lệ.', 400);
        throw new ChatError('COD_SMS_SCHEDULE_UNAVAILABLE', 'Không thể tải hoặc lưu lịch chấm SMS. Vui lòng thử lại.', 503);
      }
      sendJson(res, 200, result.data);
    } catch (error) {
      const failure = toPublicError(error);
      sendJson(res, failure.status, { error: { code: failure.code, message: failure.message } });
    }
  };
}
export default createCodSmsScheduleHandler();
