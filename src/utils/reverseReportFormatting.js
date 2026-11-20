import { defaultFormatting, formattingCellProps } from './kpiFormatting.js';

// Tô màu ô % OPR của báo cáo tự động Reverse.
// - Mặc định (chưa chọn cách tô cá nhân): thang màu liên tục theo SỐ THỰC TẾ của từng bảng. Ô thấp nhất của bảng lấy màu thấp
//   (đỏ của bảng chuẩn, #ef9184), ô cao nhất lấy màu cao (trắng), ở giữa nội suy tuyến tính. Không dùng mốc target vì SPE Reverse
//   chưa có target OPR và mốc 90% của khách khác sẽ tô đỏ đậm mọi ô (OPR Reverse chỉ ~30-45%).
// - Đã chọn dải màu / không tô ở nút bảng màu: dùng đúng cài đặt đó (formattingCellProps); khoá `popr` dùng chung với bảng OPR
//   của Chi tiết Vùng/Hub.
const { lowColor: SCALE_LOW, highColor: SCALE_HIGH } = defaultFormatting('popr');

/** Min/max của các ô có tỷ lệ trong một bảng; null khi không đủ hai giá trị khác nhau để dựng thang. */
export function oprScale(rates) {
  const values = rates.filter(value => typeof value === 'number' && Number.isFinite(value));
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max > min ? { min, max } : null;
}

// Thang min -> max biểu diễn bằng quy tắc "2 màu · Dưới KPI có màu" với mốc = max, độ rộng = max - min.
const scaleRule = ({ min, max }) => ({ mode: 'below', threshold: max, spread: max - min, lowColor: SCALE_LOW, midColor: SCALE_HIGH, highColor: SCALE_HIGH });

export function oprCellProps(pct, { rule = null, scale = null } = {}, ...classes) {
  if (rule) return formattingCellProps(pct, rule, ...classes);
  if (scale) return formattingCellProps(pct, scaleRule(scale), ...classes);
  return { className: classes.filter(Boolean).join(' ') };
}

export const OPR_SCALE_COLORS = Object.freeze({ low: SCALE_LOW, high: SCALE_HIGH });
