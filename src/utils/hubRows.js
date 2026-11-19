// Dòng hub/lane không có số trong phạm vi đang xem thì ẩn khỏi bảng KPI Vùng/Hub.
// `entityStats` là map `${statKey}_${ngày}` -> { tot, ont, incomplete } (cùng map mà bảng dùng để vẽ ô).
// Có số = có ít nhất một ngày trong `dates` với mẫu > 0; ngày chưa đủ dữ liệu (incomplete, chỉ PUD) vẫn coi là có số để không giấu nhầm.
export function hasVolumeInDates(entityStats, statKey, dates) {
  return dates.some(day => {
    const item = entityStats[`${statKey}_${day}`];
    return Boolean(item) && ((Number(item.tot) || 0) > 0 || item.incomplete === true);
  });
}
