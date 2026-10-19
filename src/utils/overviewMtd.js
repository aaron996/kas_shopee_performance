import { getHubType } from './dataProcessor.js';

const metrics = {
  p1st: ['mau_pu', 'ontime_pu_1st'],
  popr: ['mau_pu', 'ontime_pu_opr'],
  d1st: ['mau_deli', 'ontime_deli_1st', 'mau_del', 'ontime_del_1st'],
  dodr: ['mau_deli', 'ontime_deli_odr', 'mau_del', 'ontime_del_odr'],
  fd: ['mau_fd', 'fd_hoan_thanh'],
};

export function aggregateOverviewMtd(rows, metricKey, to, { clientFilter = 'ALL', selectedRegions = null, selectedHubTypes = null } = {}) {
  const from = to ? `${to.slice(0, 7)}-01` : null;
  let tot = 0, ont = 0;
  const [total, ontime, totalFallback, ontimeFallback] = metrics[metricKey];
  for (const row of rows) {
    if (!to || row.report_date < from || row.report_date > to) continue;
    if (clientFilter !== 'ALL' && row.client_name !== clientFilter) continue;
    if (selectedRegions && !selectedRegions.includes(row.region)) continue;
    if (selectedHubTypes && !selectedHubTypes.includes(getHubType(row))) continue;
    tot += Number(row[total] ?? row[totalFallback]) || 0;
    ont += Number(row[ontime] ?? row[ontimeFallback]) || 0;
  }
  return { from, to, tot, ont, pct: tot > 0 ? ont / tot * 100 : null };
}
