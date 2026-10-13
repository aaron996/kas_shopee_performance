// Presentation only: keep the source Hub name and composite identity for drill-downs and sorting.
export function formatRankingHubName(name) {
  return String(name ?? '')
    .replace(/Kho\s+Giao\s+Hàng\s+Nặng/giu, 'GXT')
    .replace(/Bưu\s+Cục/giu, 'BC');
}
