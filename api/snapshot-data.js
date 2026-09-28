import { fetchSnapshotRows, packRows } from '../server/snapshot/data.js';
import { readSnapshotConfig, createSnapshotServiceClient, resolveSnapshotRequest } from '../server/snapshot/request.js';
import { sendJson } from '../server/chat/sse.js';

// Serves the raw report rows to the /snapshot page. That page is opened by an
// external screenshot service with no Supabase login, and the kas_* tables are
// readable by `authenticated` only — so this reads them with the service role,
// gated by a short-lived snapshot token instead of a user session.
//
// In production /snapshot is served by api/snapshot-page.js with these rows
// already embedded; this endpoint is the fallback the page uses when they are
// not (local dev, debugging).
export const maxDuration = 60;

export function createSnapshotDataHandler(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? readSnapshotConfig;
  const createServiceClient = dependencies.createServiceClient ?? createSnapshotServiceClient;
  const fetchRows = dependencies.fetchRows ?? fetchSnapshotRows;
  const now = dependencies.now ?? Date.now;

  return async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendJson(res, 405, { error: { code: 'SNAPSHOT_METHOD', message: 'Chỉ hỗ trợ GET.' } });
      return;
    }
    const config = getConfig();
    const request = resolveSnapshotRequest(config, req.url, now());
    if (request.error) {
      const { status, ...error } = request.error;
      sendJson(res, status, { error });
      return;
    }

    try {
      const rows = await fetchRows(createServiceClient(config), request);
      sendJson(res, 200, packRows(rows));
    } catch (error) {
      console.error('Snapshot data read failed:', error);
      sendJson(res, 503, { error: { code: 'SNAPSHOT_READ_FAILED', message: 'Không đọc được dữ liệu báo cáo.' } });
    }
  };
}

export default createSnapshotDataHandler();
