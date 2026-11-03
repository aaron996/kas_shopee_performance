import { TARGET_KPIS } from './defaultDataset.js';
import { REVERSE_CLIENT } from '../utils/clientLabels.js';
import { pudCounts } from '../utils/pud.js';

// Source capabilities and client targets are configuration, not component logic.
// Unknown clients get no guessed source or inherited target.
export const OVERVIEW_SOURCES = {
  pick: { dataset: 'pick', transport: 'mtd', metrics: ['p1st', 'popr'] },
  deli: { dataset: 'deli', transport: 'mtd', metrics: ['d1st', 'dodr'] },
  fd: { dataset: 'fd', transport: 'mtd', metrics: ['fd'] },
  reverse: { dataset: 'pick', transport: 'daily', metrics: ['p1st', 'popr', 'pud'] },
};

const standardTargets = { p1st: '1st Pickup', popr: 'OPR', d1st: '1st Deli', dodr: 'ODR' };
export const OVERVIEW_CLIENTS = {
  SPE: { sources: ['pick', 'deli', 'fd'], targets: standardTargets },
  SPB: { sources: ['pick', 'deli', 'fd'], targets: standardTargets },
  [REVERSE_CLIENT]: { sources: ['reverse'], targets: {} },
};

export const OVERVIEW_METRICS = {
  p1st: { title: '1ST PICKUP', dataset: 'pick', total: ['mau_pu'], ontime: ['ontime_pu_1st'], risk: true },
  popr: { title: 'OPR', dataset: 'pick', total: ['mau_pu'], ontime: ['ontime_pu_opr'] },
  pud: { title: 'PUD', dataset: 'pick', counts: pudCounts, subStatLabel: 'PUD' },
  d1st: { title: '1ST DELI', dataset: 'deli', total: ['mau_deli', 'mau_del'], ontime: ['ontime_deli_1st', 'ontime_del_1st'], risk: true },
  dodr: { title: 'ODR', dataset: 'deli', total: ['mau_deli', 'mau_del'], ontime: ['ontime_deli_odr', 'ontime_del_odr'] },
  fd: { title: 'FD', dataset: 'fd', total: ['mau_fd'], ontime: ['fd_hoan_thanh'], subStatLabel: 'hoàn' },
};

export function overviewCounts(row, metricKey) {
  const metric = OVERVIEW_METRICS[metricKey];
  if (metric.counts) return metric.counts(row);
  const value = columns => Number(columns.map(column => row[column]).find(value => value != null)) || 0;
  return { tot: value(metric.total), ont: value(metric.ontime) };
}

export function overviewTarget(client, metricKey) {
  const targetKey = OVERVIEW_CLIENTS[client]?.targets[metricKey];
  return TARGET_KPIS[targetKey] ?? null;
}

// ALL follows the clients actually supplied by the page. It must not silently
// add a separate population that the daily chart doesn't include.
export function getOverviewMetrics(clientFilter, availableClients = []) {
  const clients = clientFilter === 'ALL' ? availableClients : [clientFilter];
  return Object.entries(OVERVIEW_METRICS).flatMap(([id, metric]) => {
    const participants = clients.filter(client => OVERVIEW_CLIENTS[client]?.sources.some(source => OVERVIEW_SOURCES[source].metrics.includes(id)));
    if (!participants.length) return [];
    const sources = [...new Set(participants.flatMap(client => OVERVIEW_CLIENTS[client].sources
      .filter(source => OVERVIEW_SOURCES[source].metrics.includes(id))))];
    const targets = participants.map(client => overviewTarget(client, id));
    const target = targets.every(value => value === targets[0]) ? targets[0] : null;
    return [{ ...metric, id, sources, clients: participants, target }];
  });
}
