import { useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient.js';
import { createUsageTracker, usagePayload } from '../utils/appUsageTracker.js';

export default function useAppUsage(user, activeTab, enabled = true) {
  const trackerRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const userId = user?.supabaseUser?.id;
  const localPreview = user?.localPreview;
  useEffect(() => {
    if (!userId || localPreview) return undefined;
    const epoch = Date.now(), monotonicStart = performance.now();
    const tracker = createUsageTracker({ now: () => epoch + performance.now() - monotonicStart, tab: activeTabRef.current, focused: false });
    let disposed = false, sending = false, token = null, disabled = false, started = false;
    const queue = new Map();
    const key = row => `${row.session_id}:${row.day}:${row.tab_id}`;
    const collect = () => {
      for (const row of tracker.snapshots()) queue.set(key(row), row);
      // Bound memory even while offline or when the backend is not activated.
      while (queue.size > 64) queue.delete(queue.keys().next().value);
    };
    const send = async () => {
      collect();
      if (sending || disabled || disposed || !token) return;
      sending = true;
      try {
        for (const [id, row] of [...queue]) {
          if (disposed) break;
          if (!token) break;
          // Bind this queue to its own authenticated identity even if another
          // account signs in while the request is being dispatched.
          const { error } = await supabase.rpc('record_app_usage', usagePayload(row)).setHeader('Authorization', `Bearer ${token}`);
          if (error) {
            // Expired offline rows or an invalid client clock must not block
            // newer valid snapshots indefinitely.
            if (['22023', '23514'].includes(error.code)) {
              if (queue.get(id) === row) queue.delete(id);
              continue;
            }
            // A missing migration or revoked identity must not generate endless requests.
            if (['PGRST202', '42501', '42883'].includes(error.code)) disabled = true;
            break;
          }
          if (queue.get(id) === row) queue.delete(id);
        }
      } catch { /* Best effort; retry cumulative snapshots on the next interval. */ }
      finally { sending = false; }
    };
    const focus = () => tracker.focus(enabledRef.current && document.visibilityState === 'visible' && document.hasFocus());
    const interact = () => { if (enabledRef.current && document.visibilityState === 'visible' && document.hasFocus()) tracker.interact(); };
    const leave = () => {
      if (!started) return;
      tracker.focus(false); collect();
      if (!token || disabled) return;
      // keepalive retains the final small request during page close. The RPC's
      // cumulative upsert also makes overlap with an in-flight flush harmless.
      for (const row of [...queue.values()].slice(-16)) {
        void fetch(`${supabase.supabaseUrl}/rest/v1/rpc/record_app_usage`, {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', apikey: supabase.supabaseKey, Authorization: `Bearer ${token}` },
          body: JSON.stringify(usagePayload(row))
        }).catch(() => {});
      }
    };
    const visibility = () => { focus(); void send(); };
    const action = event => { if (started && enabledRef.current) tracker.action(event.detail?.name, event.detail?.tabId); };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      token = session?.user?.id === userId ? session.access_token : null;
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!disposed) token = data.session?.user?.id === userId ? data.session.access_token : null;
    }).catch(() => {});
    // React StrictMode's setup/cleanup probe must not persist a phantom session.
    const start = window.setTimeout(() => {
      if (disposed) return;
      started = true; trackerRef.current = tracker;
      tracker.tab(activeTabRef.current); focus(); void send();
    }, 0);
    const tick = window.setInterval(() => tracker.tick(), 15000);
    const flush = window.setInterval(() => { void send(); }, 30000);
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(name => window.addEventListener(name, interact, { passive: true }));
    window.addEventListener('focus', focus);
    window.addEventListener('blur', visibility);
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', visibility);
    window.addEventListener('online', visibility);
    window.addEventListener('ghn:usage-action', action);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      leave(); disposed = true; trackerRef.current = null;
      subscription.unsubscribe(); clearTimeout(start); clearInterval(tick); clearInterval(flush);
      events.forEach(name => window.removeEventListener(name, interact));
      window.removeEventListener('focus', focus); window.removeEventListener('blur', visibility);
      window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', visibility);
      window.removeEventListener('online', visibility); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('ghn:usage-action', action);
    };
  }, [userId, localPreview]);
  useEffect(() => {
    trackerRef.current?.focus(enabled && document.visibilityState === 'visible' && document.hasFocus());
  }, [enabled]);
  useEffect(() => { trackerRef.current?.tab(activeTab); }, [activeTab]);
}
