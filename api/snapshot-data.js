import { createClient } from '@supabase/supabase-js';
import { verifySnapshotToken } from '../server/snapshot/token.js';
import { SNAPSHOT_CLIENTS, SNAPSHOT_TABLES, fetchSnapshotRows, packRows } from '../server/snapshot/data.js';
import { sendJson } from '../server/chat/sse.js';

// Serves the raw report rows to the /snapshot page. That page is opened by an
// external screenshot service with no Supabase login, and the kas_* tables are
// readable by `authenticated` only — so this reads them with the service role,
// gated by a short-lived snapshot token instead of a user session.
export const maxDuration = 60;

function readConfig(env = process.env) {
  return {
    secret: env.SNAPSHOT_SECRET?.trim(),
    supabaseUrl: env.SUPABASE_URL?.trim(),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  };
}

export function createSnapshotDataHandler(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? readConfig;
  const createServiceClient = dependencies.createServiceClient ?? (config => createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  }));
  const fetchRows = dependencies.fetchRows ?? fetchSnapshotRows;
  const now = dependencies.now ?? Date.now;

  return async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendJson(res, 405, { error: { code: 'SNAPSHOT_METHOD', message: 'Chỉ hỗ trợ GET.' } });
      return;
    }
    const config = getConfig();
    if (!config.secret || !config.supabaseUrl || !config.serviceRoleKey) {
      sendJson(res, 503, { error: { code: 'SNAPSHOT_CONFIG_MISSING', message: 'Chưa cấu hình snapshot trên server.' } });
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const report = url.searchParams.get('report');
    const clientName = (url.searchParams.get('client') || 'SPB').toUpperCase();

    if (!verifySnapshotToken(config.secret, token, now())) {
      sendJson(res, 401, { error: { code: 'SNAPSHOT_TOKEN_INVALID', message: 'Token snapshot không hợp lệ hoặc đã hết hạn.' } });
      return;
    }
    if (!Object.hasOwn(SNAPSHOT_TABLES, report || '') || !SNAPSHOT_CLIENTS.includes(clientName)) {
      sendJson(res, 400, { error: { code: 'SNAPSHOT_INVALID_REQUEST', message: 'report hoặc client không hợp lệ.' } });
      return;
    }

    try {
      const rows = await fetchRows(createServiceClient(config), { report, clientName });
      sendJson(res, 200, packRows(rows));
    } catch (error) {
      console.error('Snapshot data read failed:', error);
      sendJson(res, 503, { error: { code: 'SNAPSHOT_READ_FAILED', message: 'Không đọc được dữ liệu báo cáo.' } });
    }
  };
}

export default createSnapshotDataHandler();
