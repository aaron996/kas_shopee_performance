export const DASHBOARD_HELP = Object.freeze({
  overview: {
    title: 'Tổng quan', route: 'home',
    description: 'Theo dõi KPI, hub cần ưu tiên và xu hướng vận hành. Các bộ lọc đang chọn xác định phạm vi số liệu hiển thị.'
  },
  filters: {
    title: 'Bộ lọc', route: null,
    description: 'Chọn client, vùng và loại hub để thu hẹp phạm vi báo cáo. Câu hỏi chatbot dùng bộ lọc đang chọn khi bạn không nêu phạm vi khác. Không chọn vùng/loại hub nào nghĩa là không có đối tượng khớp, không phải tất cả.'
  },
  export: {
    title: 'Xuất báo cáo', route: null,
    description: 'Dùng chức năng xuất trên báo cáo đang xem và kiểm tra bộ lọc, kỳ dữ liệu trước khi tải. Khả năng và định dạng xuất tùy báo cáo; chatbot không tự tải hay gửi file thay người dùng.'
  },
  cod: {
    title: 'Đơn nghi vấn COD', route: 'cod-suspicion',
    description: 'Danh sách tài xế và đơn hàng cần rà soát liên quan đến nghi ngờ giữ/ôm COD. Đây là tín hiệu cần đối soát, không phải kết luận chiếm dụng hay sai phạm. Người dùng xem danh sách, tìm tài xế, lọc địa bàn và theo dõi trạng thái xử lý theo quyền được cấp. Chatbot chỉ giải thích cách dùng và khái niệm chung, hiện không có tool truy vấn chi tiết đơn/tài xế COD.'
  },
  metrics: {
    title: 'Chi tiết Vùng/Hub',
    route: 'report1',
    description: 'Xem 1st Pickup, OPR, 1st Delivery, ODR và FD theo miền, vùng và tuyến/hub.'
  },
  ca1: {
    title: 'Báo cáo % Ca 1',
    route: 'report5',
    description: 'Xem tỷ lệ đơn về ca 1 theo lane và vùng giao.'
  },
  leadtime: {
    title: 'Leadtime từng chặng',
    route: 'report3',
    description: 'Leadtime bốn chặng và E2E; tab đang phát triển. Không khẳng định dashboard đã hoàn tất kết nối/kiểm thử dữ liệu.'
  },
  insight: {
    title: 'Insight vận hành',
    route: 'report-insight',
    description: 'Phân tích điểm cần chú ý và tương quan vận hành; tab đang phát triển. Không coi tương quan là nguyên nhân đã xác minh.'
  },
  data_source: {
    title: 'Nguồn dữ liệu',
    route: null,
    description: 'Dashboard dùng dữ liệu KAS đã đồng bộ. Ngày dữ liệu và thời điểm đồng bộ là hai mốc khác nhau; chatbot hiển thị riêng khi tra cứu. Không suy ra số liệu hôm nay chỉ từ thời điểm đồng bộ.'
  }
});

export function getDashboardHelp(topic) {
  return DASHBOARD_HELP[topic] ?? null;
}
