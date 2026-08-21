// Danh mục lane dùng chung cho toàn app.
//
// Sheet nguồn viết tên lane không nhất quán ("Intra city" / "Intra City" /
// "Cross metro *" / "Cross Metro*"), nên so sánh bằng === trên chuỗi thô là
// hỏng. Report5LaneCa1 đã từng bị đúng lỗi đó ("every cell showed 0/–") và tự
// fix bằng một hàm normalizeLane riêng; Report6Leadtime thì lặp lại sai sót
// bằng một mảng 3 giá trị hardcode. Gom về một chỗ duy nhất tại đây.
//
// Nguyên tắc: KHÔNG hardcode danh sách lane để lọc dữ liệu. Danh sách hiển thị
// luôn suy ra từ chính data (getLanesFromRows) — lane lạ vẫn xuất hiện, chỉ là
// xếp cuối. Mảng LANE_DISPLAY_ORDER dưới đây chỉ dùng để SẮP THỨ TỰ.

/** Khoá chuẩn hoá: chữ thường, bỏ mọi khoảng trắng. */
export function normalizeLane(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, '');
}

/** Thứ tự trình bày: gần → xa. Lane không có trong danh sách này xếp sau cùng. */
export const LANE_DISPLAY_ORDER = [
  'intracity',
  'intraregion',
  'crossmetro',
  'crossmetro*',
  'crossregion'
];

/** Khoá dành cho dòng không xác định được lane (cả 3 cột from/to/lane rỗng). */
export const UNRESOLVED_LANE_KEY = '__unresolved__';

function orderIndex(key) {
  const i = LANE_DISPLAY_ORDER.indexOf(key);
  return i === -1 ? LANE_DISPLAY_ORDER.length : i;
}

/**
 * Danh mục lane thực tế có trong data, đã sort theo LANE_DISPLAY_ORDER.
 * Nhãn hiển thị lấy theo cách viết ĐẦU TIÊN gặp trong data, để UI vẫn hiện
 * đúng chữ của nguồn thay vì chữ do code bịa ra.
 *
 * @returns {Array<{key: string, label: string}>}
 */
export function getLanesFromRows(rows, field = 'externallane_new') {
  const labels = new Map();
  for (const row of rows) {
    const raw = row?.[field];
    const key = normalizeLane(raw);
    if (!key) continue;
    if (!labels.has(key)) labels.set(key, String(raw).trim());
  }
  return [...labels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => orderIndex(a.key) - orderIndex(b.key) || a.label.localeCompare(b.label, 'vi'));
}

/** Dòng "không xác định lane": cả 3 cột from / to / lane đều rỗng. */
export function isUnresolvedLaneRow(row) {
  if (!row) return false;
  const from = String(row.fromprovince_new ?? '').trim();
  const to = String(row.toprovince_new ?? '').trim();
  const lane = String(row.externallane_new ?? '').trim();
  return !from && !to && !lane;
}
