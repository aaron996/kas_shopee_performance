import { verifyCronSecret } from '../../server/cod-sms/cron.js';
import { runCodSuspicionExportSafely } from '../../server/cod-export/service.js';
import { toPublicError } from '../../server/chat/errors.js';
import { sendJson } from '../../server/chat/sse.js';

// Re-runs only the nghi_ngo_COD sheet export (the daily SMS cron already runs
// it right after scoring). Call with Authorization: Bearer <CRON_SECRET>, e.g.
// from n8n or by hand after a late snapshot sync. Safe to repeat.
export const maxDuration = 60;

export function createCodSuspicionExportHandler(dependencies = {}) {
  const cronSecret = dependencies.cronSecret ?? process.env.CRON_SECRET;
  const runExport = dependencies.runExport ?? runCodSuspicionExportSafely;

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, { error: { code: 'COD_EXPORT_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ GET và POST.' } });
      return;
    }
    try {
      verifyCronSecret(req.headers.authorization, cronSecret);
    } catch (error) {
      const failure = toPublicError(error);
      sendJson(res, failure.status, { error: { code: failure.code, message: failure.message } });
      return;
    }
    const result = await runExport({ env: dependencies.env });
    sendJson(res, result.status === 'failed' ? 502 : 200, { contractVersion: '1', sheetExport: result });
  };
}

export default createCodSuspicionExportHandler();
