export const VIEW_KEY = 'ghn_dashboard_view_v1';
export const REPORTS = ['report1', 'report5', 'report3', 'report-insight'];

export function readDashboardView(storage, search = '') {
  let saved = {};
  try { saved = JSON.parse(storage.getItem(VIEW_KEY)) || {}; } catch { /* private mode / invalid JSON */ }
  const queryClient = new URLSearchParams(search).get('scope')?.trim().toUpperCase();
  const validClient = value => ['SPB', 'SPE', 'ALL'].includes(value);
  return {
    client: validClient(queryClient) ? queryClient : validClient(saved.client) ? saved.client : 'SPB',
    hasPickedClient: validClient(queryClient) || validClient(saved.client),
    tab: REPORTS.includes(saved.tab) ? saved.tab : 'report1',
    regions: Array.isArray(saved.regions) ? saved.regions.filter(v => typeof v === 'string') : null,
    hubTypes: Array.isArray(saved.hubTypes) ? saved.hubTypes.filter(v => typeof v === 'string') : null,
    density: saved.density === 'compact' ? 'compact' : 'comfortable',
  };
}

export function saveDashboardView(storage, view) {
  try { storage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* storage can be unavailable */ }
}

export function dataCoverage(rows, dateKey = 'report_date') {
  const dates = [...new Set(rows.map(row => row[dateKey]).filter(Boolean))].sort();
  return dates.length ? `${dates[0]} → ${dates.at(-1)} (${dates.length} ngày có dữ liệu)` : 'Chưa có dữ liệu';
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function appendCsvContext(lines, context = {}) {
  const fields = Object.keys(context);
  return lines.map((line, index) => `${line},${fields.map(key => csvCell(index === 0 ? key : context[key])).join(',')}`).join('\r\n');
}
