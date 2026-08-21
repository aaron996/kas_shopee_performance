// Tên client — một nguồn duy nhất cho toàn app.
// Bản cũ của tab Leadtime ghi sai ngay trên legend của chart:
// "SPB (Shopee Express Backlog)" và "SPE (Shopee Express Standard)".
// SPB là Shopee Bulky.

export const CLIENT_LABELS = {
  SPB: 'Shopee Bulky',
  SPE: 'Shopee Express'
};

export const CLIENT_ORDER = ['SPB', 'SPE'];

/** Nhãn đầy đủ; client lạ thì trả về chính mã đó, không bịa tên. */
export function getClientLabel(code) {
  return CLIENT_LABELS[code] || String(code ?? '');
}

/**
 * clientFilter của header là 'SPB' | 'SPE' | 'ALL' → danh sách client cần vẽ.
 * Giao với danh sách client thực có trong data để không vẽ cột rỗng.
 */
export function resolveClients(clientFilter, availableClients) {
  const available = availableClients?.length ? availableClients : CLIENT_ORDER;
  if (clientFilter === 'ALL' || !clientFilter) {
    return CLIENT_ORDER.filter(c => available.includes(c));
  }
  return available.includes(clientFilter) ? [clientFilter] : [];
}
