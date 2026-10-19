// Tên client — một nguồn duy nhất cho toàn app.
// Bản cũ của tab Leadtime ghi sai ngay trên legend của chart:
// "SPB (Shopee Express Backlog)" và "SPE (Shopee Express Standard)".
// SPB là Shopee Bulky.

export const CLIENT_LABELS = {
  SPB: 'Shopee Bulky',
  SPE: 'Shopee Express',
  'Shopee Reverse': 'Shopee Reverse'
};

export const CLIENT_ORDER = ['SPB', 'SPE', 'Shopee Reverse'];

/** Giá trị hợp lệ của bộ lọc client trên header (kèm 'ALL'). */
export const CLIENT_FILTER_VALUES = [...CLIENT_ORDER, 'ALL'];

/** Khớp không phân biệt hoa/thường (URL ?scope= và message host hay viết hoa); trả về mã chuẩn hoặc null. */
export function normalizeClientFilter(value) {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return CLIENT_FILTER_VALUES.find(v => v.toUpperCase() === key) ?? null;
}

/** Nhãn cho 'ALL': liệt kê các client đang hỗ trợ. */
export const ALL_CLIENTS_LABEL = CLIENT_ORDER.join(' + ');

/** Nhãn đầy đủ; client lạ thì trả về chính mã đó, không bịa tên. */
export function getClientLabel(code) {
  return CLIENT_LABELS[code] || String(code ?? '');
}

/**
 * clientFilter của header là 'SPB' | 'SPE' | 'Shopee Reverse' | 'ALL' → danh sách client cần vẽ.
 * Giao với danh sách client thực có trong data để không vẽ cột rỗng.
 */
export function resolveClients(clientFilter, availableClients) {
  const available = availableClients?.length ? availableClients : CLIENT_ORDER;
  if (clientFilter === 'ALL' || !clientFilter) {
    return CLIENT_ORDER.filter(c => available.includes(c));
  }
  return available.includes(clientFilter) ? [clientFilter] : [];
}
