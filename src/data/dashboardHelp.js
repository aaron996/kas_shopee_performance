export const DASHBOARD_HELP = Object.freeze({
  metrics: {
    title: 'Báo cáo OPS metric',
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
    description: 'Xem leadtime bốn chặng, E2E, baseline và các lane cần chú ý.'
  },
  insight: {
    title: 'Insight vận hành',
    route: 'report-insight',
    description: 'Xem danh sách điểm cần chú ý và diễn giải tương quan giữa KPI với leadtime.'
  },
  data_source: {
    title: 'Nguồn dữ liệu',
    route: null,
    description: 'Dashboard đọc snapshot KAS đã đồng bộ từ Google Sheet vào Supabase. Chatbot hiển thị ngày dữ liệu và thời điểm đồng bộ riêng.'
  }
});

export function getDashboardHelp(topic) {
  return DASHBOARD_HELP[topic] ?? null;
}
