// Báo cáo tự động SPE Reverse (gửi Telegram bằng ảnh chụp của /snapshot, xem docs/reverse-auto-report.md).
// Hai nguồn: kas_reverse_history (LTC, vol theo ngày) và kas_reverse_backlog (ảnh backlog hằng ngày). Logic nằm ở đây,
// thuần hàm, để /snapshot và tab "Báo cáo tự động" dùng chung và test được.
import { MIEN_REGIONS, MIEN_ORDER } from '../data/defaultDataset.js';
import { normalizeDashboardRows, getHubType, canonicalHubType, khlRegionOf, KHL_HUB_TYPE } from './dataProcessor.js';

export const REPORT_DAYS = 7;
export const BACKLOG_TOP = 10;
export const UNKNOWN_REGION = 'Chưa rõ vùng';
export const AHM_HUB_TYPE = 'Ahamove';
export const BCKD_HUB_TYPE = 'BC KD';

const MIEN_FLAT = MIEN_ORDER.flatMap(mien => MIEN_REGIONS[mien]);
const num = value => Number(value) || 0;
const regionOf = row => {
  const region = String(row.region ?? '').trim();
  return !region || region.toUpperCase() === 'N/A' ? '' : region;
};

// LTC = lấy thành công (pud) / đơn mới (mau_pu), cùng định nghĩa PUD của app (src/data/metricGlossary.js). Không chặn 100%:
// pud gồm cả đơn tồn từ ngày trước được lấy trong ngày nên có thể vượt mẫu; mẫu bằng 0 thì không có tỷ lệ (null, hiện "–").
export const ltcOf = (vol, pud) => (vol > 0 ? (pud / vol) * 100 : null);

const emptyCell = () => ({ vol: 0, pud: 0 });
const addTo = (cell, row) => { cell.vol += num(row.mau_pu); cell.pud += num(row.pud); };

/** 7 ngày gần nhất có trong dữ liệu (dữ liệu đã tính đến D-1). */
export function reportDates(historyRows, days = REPORT_DAYS) {
  return [...new Set(historyRows.map(row => row.report_date).filter(Boolean))].sort().slice(-days);
}

/**
 * LTC và vol theo ngày cho AHM, BCKD và từng vùng (sau khi qua cùng bước chuẩn hoá vùng/loại hub của dashboard:
 * KHL, CK, GXT theo miền). AHM và BCKD là hai nhóm theo loại hub nằm TRONG các vùng, nên dòng Tổng cộng theo từng dòng nguồn,
 * không cộng các dòng hiển thị.
 */
export function buildLtcVolTables(historyRows, { days = REPORT_DAYS } = {}) {
  const dates = reportDates(historyRows, days);
  const inWindow = new Set(dates);
  const rows = normalizeDashboardRows(historyRows.filter(row => inWindow.has(row.report_date)));
  const groups = new Map();
  const cellsOf = (key, label, kind) => {
    if (!groups.has(key)) groups.set(key, { key, label, kind, cells: dates.map(emptyCell) });
    return groups.get(key).cells;
  };
  const total = dates.map(emptyCell);
  rows.forEach(row => {
    const index = dates.indexOf(row.report_date);
    addTo(total[index], row);
    const hubType = String(getHubType(row)).trim();
    if (hubType === AHM_HUB_TYPE) addTo(cellsOf('ahm', 'AHM', 'ahm')[index], row);
    if (hubType === BCKD_HUB_TYPE) addTo(cellsOf('bckd', 'BCKD', 'bckd')[index], row);
    const region = regionOf(row) || UNKNOWN_REGION;
    addTo(cellsOf(`region:${region}`, region, 'region')[index], row);
  });

  const volOf = group => group.cells.reduce((acc, cell) => acc + cell.vol, 0);
  const regionOrder = label => {
    const index = MIEN_FLAT.indexOf(label);
    if (label === UNKNOWN_REGION) return Number.MAX_SAFE_INTEGER;
    return index < 0 ? MIEN_FLAT.length : index;
  };
  const regionGroups = [...groups.values()].filter(group => group.kind === 'region' && volOf(group) > 0)
    .sort((a, b) => regionOrder(a.label) - regionOrder(b.label) || a.label.localeCompare(b.label));
  const lead = ['ahm', 'bckd'].map(key => groups.get(key)).filter(Boolean);
  const finish = group => ({ ...group, cells: group.cells.map(cell => ({ ...cell, ltc: ltcOf(cell.vol, cell.pud) })) });
  return {
    dates,
    rows: [...lead, ...regionGroups].map(finish),
    total: finish({ key: 'total', label: 'Tổng', kind: 'total', cells: total })
  };
}

const shortHubName = name => String(name ?? '').trim().replace(/^\(([^)]+)\)\s*/, '$1 ');
const L7_AGES = new Set(['1-3', '4-7']);

// Loại Hub của dòng backlog: kho KHL nhận theo mã kho, còn lại đổi nhãn viết tắt của BI (KD → BC KD, AHM → Ahamove).
const backlogHubType = row => (khlRegionOf({ wh_id: row.wh_id }) ? KHL_HUB_TYPE : canonicalHubType(row.hub_type));

/** wh_id → tên kho, từ lịch sử Reverse (ngày mới nhất thắng). Bảng backlog chỉ có mã kho. */
export function hubNamesByWhId(historyRows) {
  const names = new Map();
  [...historyRows].sort((a, b) => String(a.report_date).localeCompare(String(b.report_date))).forEach(row => {
    const id = String(row.wh_id ?? '').trim();
    if (id && row.hub) names.set(id, row.hub);
  });
  return names;
}

/**
 * Backlog BCKD của snapshot mới nhất: tồn theo số lần gán lấy (0 / 1-2 / 3+) cho đơn tồn ≤ 7 ngày (L7D), và backlog tuyệt đối
 * của cả cửa sổ 14 ngày (L14D). Chọn `top` kho tồn nhiều nhất; dòng Tổng là của mọi kho BCKD.
 */
export function buildBacklogTable(backlogRows, historyRows = [], { top = BACKLOG_TOP } = {}) {
  const snapshotDate = backlogRows.reduce((latest, row) => (String(row.snapshot_date) > latest ? String(row.snapshot_date) : latest), '');
  if (!snapshotDate) return null;
  const names = hubNamesByWhId(historyRows);
  const byHub = new Map();
  const blank = () => ({ g0: 0, g12: 0, g3: 0, l7: 0, l14: 0 });
  const total = blank();
  const bump = (target, row) => {
    const orders = num(row.backlog_orders);
    target.l14 += orders;
    if (L7_AGES.has(row.age_bucket)) {
      target.l7 += orders;
      if (row.assign_bucket === '0') target.g0 += orders;
      else if (row.assign_bucket === '1-2') target.g12 += orders;
      else if (row.assign_bucket === '3+') target.g3 += orders;
    }
  };
  backlogRows.forEach(row => {
    if (String(row.snapshot_date) !== snapshotDate || backlogHubType(row) !== BCKD_HUB_TYPE) return;
    const whId = String(row.wh_id ?? '').trim();
    if (!byHub.has(whId)) byHub.set(whId, blank());
    bump(byHub.get(whId), row);
    bump(total, row);
  });
  const list = [...byHub.entries()].map(([whId, values]) => ({
    whId,
    name: whId ? (names.has(whId) ? shortHubName(names.get(whId)) : `Kho ${whId}`) : 'Chưa rõ kho',
    ...values
  })).sort((a, b) => b.l14 - a.l14 || a.name.localeCompare(b.name, 'vi'));
  return { snapshotDate, rows: list.slice(0, top), hubCount: list.length, total };
}
