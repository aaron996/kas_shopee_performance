// PUD has its own population. A missing sample is unknown, never zero pickup.
export function pudCounts(row) {
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  if (!numeric(row.mau_pud) || !numeric(row.pud)) return { tot: null, ont: null };
  const tot = Number(row.mau_pud), ont = Number(row.pud);
  return tot >= 0 && ont >= 0 && ont <= tot ? { tot, ont } : { tot: null, ont: null };
}

export const PUD_NOTE = 'PUD = Tổng pud / Tổng mau_pud × 100%. Chưa có target. Dấu – là không có mẫu hoặc chưa đủ dữ liệu PUD.';
