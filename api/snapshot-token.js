import { issueSnapshotToken, isSnapshotSecret } from '../server/snapshot/token.js';
import { sendJson } from '../server/chat/sse.js';

// n8n (daily Telegram report) calls this with `Authorization: Bearer
// <SNAPSHOT_SECRET>` and gets back a short-lived token for the /snapshot
// page URLs it hands to the screenshot service.
export function createSnapshotTokenHandler(dependencies = {}) {
  const readSecret = dependencies.readSecret ?? (() => process.env.SNAPSHOT_SECRET?.trim());
  const now = dependencies.now ?? Date.now;

  return (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: { code: 'SNAPSHOT_METHOD', message: 'Chỉ hỗ trợ POST.' } });
      return;
    }
    const secret = readSecret();
    if (!secret) {
      sendJson(res, 503, { error: { code: 'SNAPSHOT_CONFIG_MISSING', message: 'Chưa cấu hình SNAPSHOT_SECRET.' } });
      return;
    }
    if (!isSnapshotSecret(secret, req.headers.authorization)) {
      sendJson(res, 401, { error: { code: 'SNAPSHOT_UNAUTHORIZED', message: 'Sai mã bí mật snapshot.' } });
      return;
    }
    sendJson(res, 200, issueSnapshotToken(secret, now()));
  };
}

export default createSnapshotTokenHandler();
