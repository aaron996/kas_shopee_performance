// Backlog tuyệt đối của SPE Reverse: số đơn tồn (cột mau_pud) theo ngày, không tính %.
// Thiếu mau_pud là "chưa biết" (–), không bao giờ là 0; một ô có dòng thiếu mẫu cũng là chưa biết.
import { MIEN_REGIONS, MIEN_ORDER } from '../data/defaultDataset.js';
import { getHubType, matchesRegionScope } from './dataProcessor.js';
import { getHubIdentityKey } from './performanceRanking.js';

export const BACKLOG_DAYS = 14;
export const BACKLOG_NOTE = 'Backlog = số đơn tồn tuyệt đối (mau_pud) của ngày, không phải %. Dấu – là chưa có dữ liệu backlog của ngày đó.';

const backlogValue = row => {
  const v = row.mau_pud;
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0) return null;
  return Number(v);
};

export function buildBacklogMatrix({ rows, dates, selectedRegions = null, selectedHubTypes = null, hubLimit = 10 }) {
  const index = new Map(dates.map((date, i) => [date, i]));
  const blank = () => dates.map(() => ({ value: 0, unknown: false, seen: false }));
  const bucket = (map, key) => { if (!map.has(key)) map.set(key, blank()); return map.get(key); };
  const add = (cells, i, value) => {
    const cell = cells[i];
    cell.seen = true;
    if (value === null) cell.unknown = true; else cell.value += value;
  };
  const all = blank(), miens = new Map(), regions = new Map(), hubs = new Map(), hubInfo = new Map();
  rows.forEach(row => {
    const i = index.get(row.report_date);
    if (i === undefined || !matchesRegionScope(row, selectedRegions)) return;
    if (selectedHubTypes && !selectedHubTypes.includes(getHubType(row))) return;
    const value = backlogValue(row);
    const region = String(row.region || '').trim() || 'Chưa rõ vùng';
    const mien = MIEN_ORDER.find(m => MIEN_REGIONS[m].includes(region)) || 'Miền Khác';
    const hubId = `${region}::${getHubIdentityKey(row)}`;
    if (!hubInfo.has(hubId)) hubInfo.set(hubId, { id: hubId, region, name: row.hub });
    add(all, i, value); add(bucket(miens, mien), i, value);
    add(bucket(regions, region), i, value); add(bucket(hubs, hubId), i, value);
  });
  const finish = cells => cells.map(c => (!c.seen || c.unknown ? null : c.value));
  const last = dates.length - 1;
  const latest = cells => finish(cells)[last] ?? -1;
  const order = [...MIEN_ORDER, ...(miens.has('Miền Khác') ? ['Miền Khác'] : [])];
  const tree = order.filter(m => miens.has(m)).map(mien => {
    const names = (MIEN_REGIONS[mien] || [...regions.keys()].filter(r => !MIEN_ORDER.some(m => MIEN_REGIONS[m].includes(r))))
      .filter(r => regions.has(r));
    return {
      mien, values: finish(miens.get(mien)),
      regions: names.map(region => {
        const list = [...hubInfo.values()].filter(h => h.region === region)
          .map(h => ({ ...h, values: finish(hubs.get(h.id)) }))
          .sort((a, b) => (b.values[last] ?? -1) - (a.values[last] ?? -1));
        return { region, values: finish(regions.get(region)), hubs: list.slice(0, hubLimit), hubCount: list.length };
      }).sort((a, b) => latest(regions.get(b.region)) - latest(regions.get(a.region)))
    };
  });
  return { dates, all: finish(all), miens: tree, empty: all.every(c => !c.seen) };
}
