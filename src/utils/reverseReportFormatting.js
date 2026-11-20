import { formattingCellProps } from './kpiFormatting.js';

// Tô màu ô % OPR của báo cáo tự động Reverse, cùng quy tắc với bảng OPR của Chi tiết Vùng/Hub khi chọn SPE Reverse:
// - chưa chọn cách tô cá nhân (rule = null): "Mặc định ứng dụng". SPE Reverse chưa có target OPR (overviewMetrics.js) nên
//   Chi tiết Vùng/Hub không tô bậc nào, báo cáo này cũng vậy. (Mốc 90% của khách khác sẽ tô đỏ đậm mọi ô vì OPR Reverse chỉ ~30–45%.)
// - đã chọn dải màu / không tô: formattingCellProps. Cài đặt dùng chung khoá `popr` với bảng OPR của Chi tiết Vùng/Hub.
export function oprCellProps(pct, rule, ...classes) {
  if (rule) return formattingCellProps(pct, rule, ...classes);
  return { className: classes.filter(Boolean).join(' ') };
}
