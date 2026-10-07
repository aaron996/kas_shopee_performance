export const ACCESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ACCESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export const accessDay = value => dayFormatter.format(new Date(value));
export const formatAccessTime = value => new Intl.DateTimeFormat('vi-VN', { timeZone: ACCESS_TIME_ZONE, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));

export function summarizeAccess(logs, now = new Date()) {
  const days = Array.from({ length: 7 }, (_, index) => accessDay(new Date(now.getTime() - (6 - index) * 86400000)));
  const counts = new Map(days.map(day => [day, 0]));
  const users = new Map();
  for (const log of logs) {
    const timestamp = new Date(log.accessed_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const day = accessDay(timestamp);
    if (counts.has(day)) counts.set(day, counts.get(day) + 1);
    const user = users.get(log.email) || { email: log.email, visits: 0, firstSeen: timestamp, lastSeen: timestamp };
    user.visits++;
    user.firstSeen = Math.min(user.firstSeen, timestamp);
    user.lastSeen = Math.max(user.lastSeen, timestamp);
    users.set(log.email, user);
  }
  return { days: [...counts].map(([day, count]) => ({ day, count })), users: [...users.values()].sort((a, b) => b.lastSeen - a.lastSeen) };
}
