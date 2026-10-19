import { isModuleId } from '../modules/moduleIds.js';

export const USAGE_IDLE_MS = 120000;
export const USAGE_SESSION_GAP_MS = 1800000;
export const usageDay = time => new Date(time + 7 * 3600000).toISOString().slice(0, 10);
const nextMidnight = time => Date.parse(`${usageDay(time)}T00:00:00+07:00`) + 86400000;

// Cumulative snapshots make retries idempotent. Only the focused, visible
// document accrues time, so two browser tabs cannot both count the same time.
export function createUsageTracker({ now = Date.now, uuid = () => crypto.randomUUID(), tab = 'home', focused = false } = {}) {
  let session = uuid(), previous = now(), interaction = previous, visible = focused;
  let current = isModuleId(tab) ? tab : 'home', viewed = false;
  const rows = new Map(), dirty = new Set();
  const rowAt = (time, tabId = current) => {
    const day = usageDay(time), key = `${session}:${day}:${tabId}`;
    if (!rows.has(key)) rows.set(key, { session_id: session, day, tab_id: tabId, started_at: time, last_seen_at: time, active_ms: 0, views: 0, chat_questions: 0, exports: 0 });
    rows.get(key).last_seen_at = Math.max(rows.get(key).last_seen_at, time);
    dirty.add(key);
    return rows.get(key);
  };
  const markView = time => {
    if (visible && !viewed) { rowAt(time).views++; viewed = true; }
  };
  const advance = time => {
    // Sleep/suspend and clock jumps are not engagement.
    if (visible && time >= previous && time - previous <= 45000) {
      const until = Math.min(time, interaction + USAGE_IDLE_MS);
      let from = previous;
      while (from < until) {
        const end = Math.min(until, nextMidnight(from));
        const row = rowAt(from);
        row.active_ms += end - from;
        row.last_seen_at = end;
        from = end;
      }
    }
    previous = time;
  };
  const resume = time => {
    if (time - interaction >= USAGE_SESSION_GAP_MS) { session = uuid(); viewed = false; }
    interaction = time;
    markView(time);
  };
  markView(previous);
  return {
    tick() { advance(now()); },
    interact() { const time = now(); advance(time); resume(time); },
    focus(value) { const time = now(); advance(time); visible = value; if (value) resume(time); },
    tab(value) {
      if (!isModuleId(value) || value === current) return;
      const time = now(); advance(time); current = value; viewed = false;
      // Programmatic navigation while hidden does not wake an idle session.
      if (visible) resume(time);
    },
    action(name, tabId = current) {
      if (!['chat_questions', 'exports'].includes(name)) return;
      const time = now(); advance(time); rowAt(time, isModuleId(tabId) ? tabId : current)[name]++;
    },
    snapshots() {
      advance(now());
      const result = [...dirty].map(key => ({ ...rows.get(key) }));
      dirty.clear();
      // Old snapshots are owned by the delivery queue after draining.
      for (const [key, row] of rows) if (row.session_id !== session || row.day !== usageDay(previous)) rows.delete(key);
      return result;
    }
  };
}

export const usagePayload = row => ({
  p_session_id: row.session_id, p_day: row.day, p_tab_id: row.tab_id,
  p_started_at: new Date(row.started_at).toISOString(),
  p_last_seen_at: new Date(row.last_seen_at).toISOString(),
  p_active_ms: Math.round(row.active_ms), p_views: row.views,
  p_chat_questions: row.chat_questions, p_exports: row.exports
});

export function formatActiveTime(ms = 0) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

// Carries only an allowlisted action name, never message/report contents.
export function emitUsageAction(name, tabId) {
  if (typeof window !== 'undefined' && ['chat_questions', 'exports'].includes(name)) {
    window.dispatchEvent(new CustomEvent('ghn:usage-action', { detail: { name, tabId } }));
  }
}
