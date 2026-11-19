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

export const usesCa1Source = isLaneCa1;
