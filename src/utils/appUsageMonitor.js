import { usageDay } from './appUsageTracker.js';

export const MONITOR_MAX_DAYS = 90;
export const monitorToday = (now = Date.now()) => usageDay(now);
export const shiftMonitorDay = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
export const formatMonitorDay = day => day ? day.split('-').reverse().join('/') : '';
export function monitorRange(preset, today = monitorToday()) {
  if (preset === 'yesterday') return { from: shiftMonitorDay(today, -1), to: shiftMonitorDay(today, -1) };
  return { from: shiftMonitorDay(today, preset === 'today' ? 0 : preset === '30' ? -29 : -6), to: today };
}
export function monitorRangeError({ from, to }, today = monitorToday()) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  if (!valid(from) || !valid(to)) return 'Chọn đủ ngày bắt đầu và kết thúc.';
  if (from > to) return 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
  if (to > today) return 'Chỉ xem được dữ liệu đến hôm nay theo giờ Việt Nam.';
  if ((Date.parse(to) - Date.parse(from)) / 86400000 >= MONITOR_MAX_DAYS) return 'Chọn khoảng tối đa 90 ngày.';
  return '';
}
export const monitorParams = filters => ({
  p_from: filters.from, p_to: filters.to,
  p_email: (filters.email || '').trim().toLowerCase(), p_tab: filters.tab || '', p_day: filters.day || null
});
export const monitorScopeKey = filters => JSON.stringify(monitorParams(filters));
export function sortMonitorUsers(users, query = '', sort = 'recent') {
  const needle = query.trim().toLowerCase();
  return users.filter(user => user.email.toLowerCase().includes(needle)).sort((a,b) => {
    const difference = sort === 'active' ? b.active_ms-a.active_ms : sort === 'sessions' ? b.sessions-a.sessions : Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at);
    return difference || a.email.localeCompare(b.email);
  });
}
export function buildMonitorCsv(users, filters, tabLabel = value => value) {
  const cell = value => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"','""')}"`;
  const time = value => value ? new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'medium'}).format(new Date(value)) : '';
  const rows = users.map(user => [
    filters.from,filters.to,filters.day || '',filters.tab ? tabLabel(filters.tab) : '',
    user.email,user.sessions,Math.round(user.active_ms/1000),user.views,
    time(user.first_seen_at),time(user.last_seen_at),user.tabs.map(tabLabel).join(', '),user.chat_questions,user.exports
  ]);
  return '\uFEFF' + [[
    'Từ ngày (VN)','Đến ngày (VN)','Ngày đang chọn','Tab đang lọc','Email','Số phiên',
    'Hoạt động (giây)','Lượt xem tab','Lần đầu trong phạm vi','Gần nhất trong phạm vi','Tab đã xem','Câu hỏi chatbot','Tải CSV báo cáo'
  ],...rows].map(row=>row.map(cell).join(',')).join('\r\n');
}
