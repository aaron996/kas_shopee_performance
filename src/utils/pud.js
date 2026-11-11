// PUD dùng chung mẫu mau_pu với 1st Pickup / OPR (không còn cột mau_pud).
// Thiếu mẫu hoặc số liệu không hợp lệ là "chưa biết", không phải 0 đơn lấy thành công.
export function pudCounts(row) {
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  if (!numeric(row.mau_pu) || !numeric(row.pud)) return { tot: null, ont: null };
  const tot = Number(row.mau_pu), ont = Number(row.pud);
  return tot >= 0 && ont >= 0 && ont <= tot ? { tot, ont } : { tot: null, ont: null };
}

export const PUD_NOTE = 'PUD = Tổng pud / Tổng mau_pu × 100%. Chưa có target. Dấu – là không có mẫu hoặc chưa đủ dữ liệu PUD.';
