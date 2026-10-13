export function rankingKpiNavigationIndex(key, index, count) {
  if (count <= 0) return null;
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

// Keep absence of data distinct from the configured eligibility gate.
export function rankingEmptyState({ scopeEmpty, excludedCount, unrankedCount, minSample }) {
  if (scopeEmpty) return {
    title: 'Chưa chọn Vùng hoặc Loại Hub',
    message: 'Chọn ít nhất một Vùng và một Loại Hub trên thanh bộ lọc để xem xếp hạng.',
    action: null
  };
  if (excludedCount > 0) return {
    title: 'Không có Hub đủ mẫu để xếp hạng',
    message: `${excludedCount} Hub có dữ liệu nhưng đang bị loại bởi ngưỡng ${minSample} đơn${unrankedCount > 0 ? `; ${unrankedCount} Hub khác chưa có mẫu hợp lệ` : ''}. Giảm ngưỡng mẫu để xem các Hub có dữ liệu.`,
    action: 'sample'
  };
  if (unrankedCount > 0) return {
    title: 'Chưa có mẫu hợp lệ để xếp hạng',
    message: `${unrankedCount} Hub chưa có mẫu hợp lệ ở ngày dữ liệu đang xem. Mở bảng số liệu để đối soát.`,
    action: 'table'
  };
  return {
    title: 'Chưa có dữ liệu trong phạm vi đang chọn',
    message: 'Chưa tìm thấy dữ liệu cho KPI và bộ lọc hiện tại. Thử chọn KPI hoặc mở rộng Client, Vùng và Loại Hub.',
    action: null
  };
}
