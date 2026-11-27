// Bộ lọc phạm vi (Client / Vùng / Loại Hub) và nút xuất CSV chỉ nằm ở header của app.
// Màn hình nào không áp dụng được một bộ lọc thì khai báo ở đây để header ẩn đi; KHÔNG tự vẽ
// bộ chọn Client/Vùng/Hub riêng trong module (xem DESIGN.md "Scope filters live in the header").

export const LANE_VIEWS = Object.freeze({ deli: 'Deli performance', ca1: '% Ca 1' });

/** Tab Lane có hai subtab; nguồn Ca 1 không chia client nên subtab này không có bộ chọn Client. */
const isLaneCa1 = (activeTab, laneView) => activeTab === 'report5' && laneView === 'ca1';

export const showsClientFilter = (activeTab, laneView) => !isLaneCa1(activeTab, laneView);

/** Xuất CSV của tab Lane chỉ là dữ liệu Ca 1. */
export const supportsExport = (activeTab, laneView) =>
  activeTab === 'home' || activeTab === 'report1' || isLaneCa1(activeTab, laneView);

/** Tab cố định client và không lọc theo Vùng/Loại Hub: header ẩn cả cụm bộ lọc phạm vi. */
export const SCOPE_FILTERLESS_TABS = Object.freeze(['cod-suspicion', 'guide', 'auto-report']);
export const showsScopeFilters = activeTab => !SCOPE_FILTERLESS_TABS.includes(activeTab);

/** Các tab có Client nhưng không áp dụng Vùng/Loại Hub. */
export const hidesRegionHubFilters = activeTab => ['report3', 'report-insight'].includes(activeTab) || !showsScopeFilters(activeTab);

export const usesCa1Source = isLaneCa1;

/** Tỉnh thành và Lane (bảng chi tiết KAS-317) chỉ có ở Chi tiết Vùng/Hub; Lane chỉ cho Deli và FD (xem hasLaneFilter). */
export const showsDetailScope = activeTab => activeTab === 'report1';
