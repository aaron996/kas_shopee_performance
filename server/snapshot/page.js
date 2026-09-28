// The /snapshot HTML with the report rows embedded, so the page can render the
// moment its scripts run. The screenshot service captures once the network
// has been quiet for a moment; a data fetch issued after load lost that race
// for the multi-MB Pick/Deli tables and produced blank pictures.
export const SNAPSHOT_DATA_ELEMENT_ID = 'snapshot-data';

// A JSON data block is not executed, so it passes the page's `script-src
// 'self'` CSP. Escaping "<" keeps any "</script>" inside the data inert.
export function embedSnapshotPayload(indexHtml, payload) {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const tag = `<script type="application/json" id="${SNAPSHOT_DATA_ELEMENT_ID}">${json}</script>`;
  return indexHtml.includes('</head>') ? indexHtml.replace('</head>', `${tag}\n</head>`) : `${tag}${indexHtml}`;
}

// The built index.html lives in the static output, not in the function
// bundle; fetch it from the deployment serving this request. Only our own
// Vercel hosts are trusted, anything else falls back to production.
const PRODUCTION_ORIGIN = 'https://kas-shopee-performance.vercel.app';

export function resolveAppOrigin(host) {
  const clean = String(host || '').trim().toLowerCase();
  if (/^kas-shopee-performance[a-z0-9-]*\.vercel\.app$/.test(clean)) return `https://${clean}`;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) return `http://${clean}`;
  return PRODUCTION_ORIGIN;
}
