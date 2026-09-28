import { fetchSnapshotRows, packRows } from '../server/snapshot/data.js';
import { readSnapshotConfig, createSnapshotServiceClient, resolveSnapshotRequest } from '../server/snapshot/request.js';
import { embedSnapshotPayload, resolveAppOrigin } from '../server/snapshot/page.js';

// Serves /snapshot (vercel.json rewrite): the app's index.html with the
// report rows embedded. Errors are embedded too, so the page renders them and
// a broken picture is obvious in Telegram. See docs/n8n-snapshot.md.
export const maxDuration = 60;

async function fetchIndexHtml(origin) {
  const res = await fetch(`${origin}/index.html`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`index.html HTTP ${res.status}`);
  return res.text();
}

export function createSnapshotPageHandler(dependencies = {}) {
  const getConfig = dependencies.readConfig ?? readSnapshotConfig;
  const createServiceClient = dependencies.createServiceClient ?? createSnapshotServiceClient;
  const fetchRows = dependencies.fetchRows ?? fetchSnapshotRows;
  const loadIndexHtml = dependencies.loadIndexHtml ?? fetchIndexHtml;
  const now = dependencies.now ?? Date.now;

  return async (req, res) => {
    const send = (status, html) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(html);
    };

    const config = getConfig();
    const request = resolveSnapshotRequest(config, req.url, now());
    const origin = resolveAppOrigin(req.headers['x-forwarded-host'] || req.headers.host);

    let status = 200;
    let payload;
    if (request.error) {
      status = request.error.status;
      payload = { error: request.error.message };
    } else {
      try {
        payload = packRows(await fetchRows(createServiceClient(config), request));
      } catch (error) {
        console.error('Snapshot data read failed:', error);
        status = 503;
        payload = { error: 'Không đọc được dữ liệu báo cáo.' };
      }
    }

    let indexHtml;
    try {
      indexHtml = await loadIndexHtml(origin);
    } catch (error) {
      console.error('Snapshot index.html fetch failed:', error);
      send(503, '<!doctype html><meta charset="utf-8"><p style="color:#a13b2a;font:600 16px sans-serif;padding:16px">Không tạo được ảnh báo cáo: không tải được giao diện.</p>');
      return;
    }
    send(status, embedSnapshotPayload(indexHtml, payload));
  };
}

export default createSnapshotPageHandler();
