import { loadCodSuspicionExport, readCodExportConfig, verifyExportToken } from '../server/cod-export/service.js';
import { ChatError, toPublicError } from '../server/chat/errors.js';
import { sendJson } from '../server/chat/sse.js';

// Read-only list of Medium/High COD suspicion orders for the nghi_ngo_COD
// sheet. The Apps Script bound to that spreadsheet (runs as a GHN account, so
// the sheet is never shared outside) calls this with
// `Authorization: Bearer <COD_EXPORT_API_TOKEN>` and writes the tabs itself.
export const maxDuration = 60;

export function createCodSuspicionExportHandler(dependencies = {}) {
  const readConfig = dependencies.readConfig ?? (() => readCodExportConfig(process.env));
  const loadExport = dependencies.loadExport ?? loadCodSuspicionExport;

  return async function handler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendJson(res, 405, { error: { code: 'COD_EXPORT_METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ GET.' } });
      return;
    }
    try {
      const config = readConfig();
      verifyExportToken(req.headers.authorization, config.apiToken);
      const result = await loadExport({ config });
      sendJson(res, 200, { contractVersion: '1', ...result });
    } catch (error) {
      if (!(error instanceof ChatError)) console.error('[cod-export] failed', error);
      const failure = error instanceof ChatError
        ? toPublicError(error)
        : { code: 'COD_EXPORT_INTERNAL_ERROR', message: 'Export COD gặp lỗi không xác định.', status: 500 };
      sendJson(res, failure.status, { error: { code: failure.code, message: failure.message } });
    }
  };
}

export default createCodSuspicionExportHandler();
