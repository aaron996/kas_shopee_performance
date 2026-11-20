// Báo cáo tự động SPE Reverse (gửi Telegram bằng ảnh chụp của /snapshot, xem docs/reverse-auto-report.md).
// Hai nguồn: kas_reverse_history (% PUD, vol theo ngày) và kas_reverse_backlog (ảnh backlog hằng ngày). Logic nằm ở đây,
// thuần hàm, để /snapshot và tab "Báo cáo tự động" dùng chung và test được.
import { MIEN_REGIONS, MIEN_ORDER } from '../data/defaultDataset.js';
import { normalizeDashboardRows, getHubType, canonicalHubType, khlRegionOf, KHL_HUB_TYPE } from './dataProcessor.js';

export const REPORT_DAYS = 7;
// Gán lấy theo đội pick: liệt kê đủ mọi kho BC KD (KA không cắt top).
export const BACKLOG_TOP = Infinity;
export const UNKNOWN_REGION = 'Chưa rõ vùng';
export const AHM_HUB_TYPE = 'Ahamove';
export const BCKD_HUB_TYPE = 'BC KD';

// Vùng thường theo thứ tự Miền. Vùng con của loại Hub riêng ("HNO - KHL", "HNO - CK", "GXT - Bắc"…) có " - " và gộp vào "Khác".
const MIEN_FLAT = MIEN_ORDER.flatMap(mien => MIEN_REGIONS[mien]).filter(region => !region.includes(' - '));
const num = value => Number(value) || 0;
const regionOf = row => {
  const region = String(row.region ?? '').trim();
  return !region || region.toUpperCase() === 'N/A' ? '' : region;
};

// % PUD (pickup done) = pud / mau_pu, cùng định nghĩa PUD của app (src/data/metricGlossary.js, #265). Không chặn 100%:
// pud gồm cả đơn tồn từ ngày trước được lấy trong ngày nên có thể vượt mẫu; mẫu bằng 0 thì không có tỷ lệ (null, hiện "–").
export const pudRateOf = (vol, pud) => (vol > 0 ? (pud / vol) * 100 : null);

// Mã tỉnh trong tên kho BC KD, ví dụ "(HNO) KD Cầu Giấy" → Hà Nội. Theo địa giới sau sáp nhập: Bình Dương → TP.HCM,
// Vĩnh Phúc → Phú Thọ. Mã lạ thì hiện nguyên mã để người xem thấy và bổ sung vào đây.
export const PROVINCE_BY_CODE = Object.freeze({
  HCM: 'Hồ Chí Minh', BDU: 'Hồ Chí Minh', HNO: 'Hà Nội', HYE: 'Hưng Yên', NAN: 'Nghệ An',
  THO: 'Thanh Hóa', NBI: 'Ninh Bình', VPH: 'Phú Thọ', PTH: 'Phú Thọ'
});
export const UNKNOWN_PROVINCE = 'Chưa rõ tỉnh';
export const OTHER_REGION = 'Khác';
export const provinceOfHub = hub => {
  const code = /^\(([^)]+)\)/.exec(String(hub ?? '').trim())?.[1]?.trim().toUpperCase();
  return code ? (PROVINCE_BY_CODE[code] ?? code) : UNKNOWN_PROVINCE;
};

const PARTNER_ORDER = ['AHM', 'BC', 'BC KD', 'GXT', KHL_HUB_TYPE];
const partnerLabel = type => (type === AHM_HUB_TYPE ? 'AHM' : type);

const emptyCell = () => ({ vol: 0, pud: 0 });
const addTo = (cell, row) => { cell.vol += num(row.mau_pu); cell.pud += num(row.pud); };

/** 7 ngày gần nhất có trong dữ liệu (dữ liệu đã tính đến D-1). */
export function reportDates(historyRows, days = REPORT_DAYS) {
  return [...new Set(historyRows.map(row => row.report_date).filter(Boolean))].sort().slice(-days);
}

/**
 * % PUD và vol theo ngày, cùng cấu trúc báo cáo KA yêu cầu: (1) theo loại Hub, (2) BC KD theo tỉnh, (3) Nationwide theo vùng.
 * Mỗi mục có dòng Tổng cộng từ chính các dòng nguồn của mục đó. Vùng và loại Hub đi qua bước chuẩn hoá của dashboard
 * (KHL, CK, GXT theo miền); vùng con của KHL/CK/GXT và đơn chưa rõ vùng gộp vào dòng "Khác" của mục vùng để dòng Tổng khớp.
 */
export function buildPudTables(historyRows, { days = REPORT_DAYS } = {}) {
  const dates = reportDates(historyRows, days);
  const inWindow = new Set(dates);
  const rows = normalizeDashboardRows(historyRows.filter(row => inWindow.has(row.report_date)));
  const makeSection = (key, title, rowHeader) => ({ key, title, rowHeader, groups: new Map(), total: dates.map(emptyCell) });
  const sections = {
    partner: makeSection('partner', 'Loại Hub', 'Loại Hub'),
    province: makeSection('province', 'BC KD theo tỉnh', 'Tỉnh'),
    region: makeSection('region', 'Nationwide theo vùng', 'Vùng')
  };
  const add = (section, label, index, row) => {
    if (!section.groups.has(label)) section.groups.set(label, { key: `${section.key}:${label}`, label, cells: dates.map(emptyCell) });
    addTo(section.groups.get(label).cells[index], row);
    addTo(section.total[index], row);
  };
  rows.forEach(row => {
    const index = dates.indexOf(row.report_date);
    const hubType = String(getHubType(row)).trim();
    add(sections.partner, partnerLabel(hubType) || 'Khác', index, row);
    if (hubType === BCKD_HUB_TYPE) add(sections.province, provinceOfHub(row.hub), index, row);
    const region = regionOf(row);
    add(sections.region, MIEN_FLAT.includes(region) ? region : OTHER_REGION, index, row);
  });

  const volOf = group => group.cells.reduce((acc, cell) => acc + cell.vol, 0);
  const finish = group => ({ ...group, cells: group.cells.map(cell => ({ ...cell, rate: pudRateOf(cell.vol, cell.pud) })) });
  const rank = (order, label) => { const i = order.indexOf(label); return i < 0 ? order.length : i; };
  const finishSection = (section, sorter, totalLabel) => ({
    key: section.key,
    title: section.title,
    rowHeader: section.rowHeader,
    rows: [...section.groups.values()].filter(group => volOf(group) > 0).sort(sorter).map(finish),
    total: finish({ key: `${section.key}:total`, label: totalLabel, kind: 'total', cells: section.total })
  });
  const byVolume = (a, b) => volOf(b) - volOf(a) || a.label.localeCompare(b.label, 'vi');
  return {
    dates,
    sections: [
      finishSection(sections.partner, (a, b) => rank(PARTNER_ORDER, a.label) - rank(PARTNER_ORDER, b.label) || a.label.localeCompare(b.label), 'Tổng'),
      finishSection(sections.province, byVolume, 'Tổng BC KD'),
      finishSection(sections.region, (a, b) => rank([...MIEN_FLAT, OTHER_REGION], a.label) - rank([...MIEN_FLAT, OTHER_REGION], b.label), 'Tổng')
    ]
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
 * của cả cửa sổ 14 ngày (L14D). Mặc định liệt kê mọi kho (xếp theo L14D giảm dần); `top` chỉ cắt danh sách hiển thị, dòng Tổng luôn là của mọi kho BCKD.
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
