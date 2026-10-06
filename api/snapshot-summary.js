import { fetchSnapshotRows } from '../server/snapshot/data.js';
import { readSnapshotConfig, createSnapshotServiceClient, resolveSnapshotRequest } from '../server/snapshot/request.js';
import { sendJson } from '../server/chat/sse.js';
import { scopeSnapshotRows, scopeHnoReportRows, SNAPSHOT_VIEWS } from '../src/utils/snapshotView.js';
import { buildExecutiveSummary, formatExecutiveSummary, formatExecutiveSummaryMarkdown } from '../src/utils/executiveSummary.js';

// "Nhận xét D-1" for the n8n daily Telegram report: the same text as the
// dashboard's ExecutiveSummaryModal, built from the same rows (KA vùng,
// every vùng and hub type — the dashboard's default scope).
// `?view=hno-rows&report=pick|deli` instead returns the rows of the HNO Telegram
// report, scoped like the dashboard (see scopeHnoReportRows). It lives here to
// stay under Vercel Hobby's 12-function cap.
export const maxDuration = 60;

const HNO_ROW_REPORTS = ['pick', 'deli'];

export function createSnapshotSummaryHandler(dependencies = {}) {
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
    const request = resolveSnapshotRequest(config, req.url, now(), { requireReport: false });
    if (request.error) {
      const { status, ...error } = request.error;
      sendJson(res, status, { error });
      return;
    }

    if (new URL(req.url, 'http://localhost').searchParams.get('view') === 'hno-rows') {
      if (!HNO_ROW_REPORTS.includes(request.report)) {
        sendJson(res, 400, { error: { code: 'SNAPSHOT_INVALID_REQUEST', message: 'report phải là pick hoặc deli.' } });
        return;
      }
      try {
        const rows = await fetchRows(createServiceClient(config), request);
        sendJson(res, 200, { rows: scopeHnoReportRows(rows) });
      } catch (error) {
        console.error('Snapshot HNO rows failed:', error);
        sendJson(res, 503, { error: { code: 'SNAPSHOT_READ_FAILED', message: 'Không đọc được dữ liệu báo cáo.' } });
      }
      return;
    }

    try {
      const client = createServiceClient(config);
      const { clientName } = request;
      const [pickRows, deliRows] = await Promise.all([
        fetchRows(client, { report: 'pick', clientName }),
        fetchRows(client, { report: 'deli', clientName })
      ]);
      const summary = buildExecutiveSummary(
        scopeSnapshotRows(pickRows, SNAPSHOT_VIEWS['pick:1st']).rows,
        scopeSnapshotRows(deliRows, SNAPSHOT_VIEWS['deli:1st']).rows,
        clientName
      );
      sendJson(res, 200, {
        text: formatExecutiveSummary(summary),
        markdown: formatExecutiveSummaryMarkdown(summary),
        sections: (summary?.sections || []).map(s => ({ title: s.metrics.title, d1: s.d1, prev: s.prev }))
      });
    } catch (error) {
      console.error('Snapshot summary failed:', error);
      sendJson(res, 503, { error: { code: 'SNAPSHOT_READ_FAILED', message: 'Không đọc được dữ liệu báo cáo.' } });
    }
  };
}

export default createSnapshotSummaryHandler();
