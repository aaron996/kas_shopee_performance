import { getHubType, matchesRegionScope } from './dataProcessor.js';
import { getOverviewMetrics, overviewCounts } from '../data/overviewMetrics.js';

export function aggregateOverviewMtd(rows, metricKey, to, { clientFilter = 'ALL', selectedRegions = null, selectedHubTypes = null } = {}) {
  const from = to ? `${to.slice(0, 7)}-01` : null;
  let tot = 0, ont = 0, incomplete = false;
  for (const row of rows) {
    if (!to || row.report_date < from || row.report_date > to) continue;
    if (clientFilter !== 'ALL' && row.client_name !== clientFilter) continue;
    if (!matchesRegionScope(row, selectedRegions)) continue;
    if (selectedHubTypes && !selectedHubTypes.includes(getHubType(row))) continue;
    const counts = overviewCounts(row, metricKey);
    if (counts.tot === null || counts.ont === null) { incomplete = true; continue; }
    tot += counts.tot;
    ont += counts.ont;
  }
  return { from, to, tot, ont, pct: !incomplete && tot > 0 ? ont / tot * 100 : null,
    ...(incomplete ? { incomplete: true } : {}) };
}

export function buildOverviewCards(rowSets, clientFilter) {
  const availableClients = [...new Set(Object.values(rowSets).flat().map(row => row.client_name))];
  return getOverviewMetrics(clientFilter, availableClients).map(metric => {
    const rows = (rowSets[metric.dataset] || []).filter(row => metric.clients.includes(row.client_name));
    const dates = [...new Set(rows.map(row => row.report_date))].sort();
    const reportDate = dates.at(-1) || '';
    const sum = date => aggregateOverviewMtd(rows.filter(row => row.report_date === date), metric.id, date);
    const points = dates.slice(-14).map(date => ({ date, ...sum(date) })).filter(point => point.pct !== null);
    return { ...metric, reportDate, d1: sum(reportDate), history: points.map(point => point.pct),
      historyDates: points.map(point => point.date) };
  });
}

export function overviewMtdRanges(cards) {
  const ranges = new Map();
  for (const card of cards) for (const source of card.sources) {
    if (card.reportDate) ranges.set(source, card.reportDate);
  }
  return [...ranges];
}

export function resolveOverviewMtdCard(card, datasets, filters) {
  const results = card.sources.map(source => datasets[source]);
  const ready = results.every(result => Array.isArray(result?.rows));
  const error = results.some(result => result?.error);
  const rows = ready ? results.flatMap(result => result.rows).filter(row => card.clients.includes(row.client_name)) : [];
  return { ...card, mtd: ready ? aggregateOverviewMtd(rows, card.id, card.reportDate, filters) : null,
    mtdRefreshError: results.some(result => result?.refreshError),
    mtdStatus: !card.reportDate ? 'empty' : error ? 'error' : ready ? 'ready' : 'loading' };
}
