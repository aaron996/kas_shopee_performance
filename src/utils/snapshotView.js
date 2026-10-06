// URL contract of the /snapshot page — the page n8n screenshots for the
// daily Telegram report. `report` + `table` keep the names the n8n workflow
// already used for its own render webhook, so switching it over only changes
// the base URL.
import { MIEN_REGIONS } from '../data/defaultDataset.js';
import { reassignKaRegion, filterRowsByScope, collectHubTypes, getHubType } from './dataProcessor.js';

export const SNAPSHOT_VIEWS = {
  'pick:1st': { data: 'pick', module: 'report1', metric: 'p1st' },
  'pick:opr': { data: 'pick', module: 'report1', metric: 'popr' },
  'deli:1st': { data: 'deli', module: 'report1', metric: 'd1st' },
  'deli:odr': { data: 'deli', module: 'report1', metric: 'dodr' },
  'fd:fd': { data: 'fd', module: 'report1', metric: 'fd' },
  'ca1:intra_city': { data: 'ca1', module: 'report5', lane: 'Intra City' },
  'ca1:intra_region': { data: 'ca1', module: 'report5', lane: 'Intra Region' },
  'ca1:cross_region': { data: 'ca1', module: 'report5', lane: 'Cross Region' },
  'ca1:cross_metro': { data: 'ca1', module: 'report5', lane: 'Cross Metro' },
  'ca1:cross_metro_star': { data: 'ca1', module: 'report5', lane: 'Cross Metro*' }
};

export const SNAPSHOT_CLIENT_LABELS = { SPB: 'Shopee Bulky', SPE: 'Shopee Express' };

export function parseSnapshotParams(search) {
  const params = new URLSearchParams(search);
  const report = (params.get('report') || '').trim().toLowerCase();
  const table = (params.get('table') || (report === 'fd' ? 'fd' : '')).trim().toLowerCase();
  const view = SNAPSHOT_VIEWS[`${report}:${table}`];
  const client = (params.get('client') || 'SPB').trim().toUpperCase();
  const token = params.get('token') || '';

  if (!view) return { error: `Không có bảng report=${report || '∅'}, table=${table || '∅'}.` };
  if (!SNAPSHOT_CLIENT_LABELS[client]) return { error: `Client ${client} không hợp lệ.` };
  if (!token) return { error: 'Thiếu token snapshot.' };

  // Same effect as unticking those types in the dashboard's "Loại Hub" filter.
  const excludeHubTypes = (params.get('excludeHubTypes') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Opposite of excludeHubTypes: keep ONLY these types (e.g. hubTypes=CK for the
  // CK-only pictures). Takes precedence over excludeHubTypes when both are set.
  const onlyHubTypes = (params.get('hubTypes') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return { view, report, table, client, token, excludeHubTypes, onlyHubTypes };
}

export function unpackRows(payload) {
  const columns = payload?.columns || [];
  return (payload?.rows || []).map(values => {
    const row = {};
    columns.forEach((key, i) => { row[key] = values[i]; });
    return row;
  });
}

// Runs the rows through the same normalisation and Vùng / Loại Hub filter the
// dashboard applies (App.jsx), with every vùng selected.
export function scopeSnapshotRows(rows, view, excludeHubTypes = [], onlyHubTypes = []) {
  const normalized = reassignKaRegion(rows);
  const allHubTypes = collectHubTypes([normalized]);
  const excluded = new Set(excludeHubTypes.map(t => t.toLowerCase()));
  const only = new Set(onlyHubTypes.map(t => t.toLowerCase()));
  const hubTypes = allHubTypes.filter(t => (only.size > 0
    ? only.has(String(t).toLowerCase())
    : !excluded.has(String(t).toLowerCase())));
  const regions = Object.values(MIEN_REGIONS).flat();
  return {
    rows: filterRowsByScope(normalized, regions, hubTypes, view.data === 'ca1' ? 'vung_giao' : 'region'),
    regions,
    isHubTypeFiltered: hubTypes.length < allHubTypes.length
  };
}

// Scope of the HNO Telegram report (n8n `[KAS] ... Daily Report - HNO`): vùng HNO
// plus its CK vùng (CK hubs are reported inside HNO, not as a separate view), hub
// types GXT, BC and CK, after the same reassignKaRegion the dashboard runs. Only
// HNO - KA is left out.
export const HNO_REPORT_REGIONS = ['HNO', 'HNO - CK'];
export const HNO_REPORT_HUB_TYPES = ['GXT', 'BC', 'CK'];

export function scopeHnoReportRows(rows) {
  const regions = new Set(HNO_REPORT_REGIONS);
  const hubTypes = new Set(HNO_REPORT_HUB_TYPES);
  return reassignKaRegion(rows).filter(r =>
    regions.has(r.region) && hubTypes.has(String(getHubType(r)).trim().toUpperCase())
  );
}
