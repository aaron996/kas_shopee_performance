import { useEffect, useState } from 'react';
import { IDLE_STORAGE_KEY, observeSceneAbsence } from '../../utils/sceneIdle.js';

export default function useSceneIdle(reducedMotion) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(IDLE_STORAGE_KEY) !== 'false'; }
    catch { return true; }
  });
  const [absent, setAbsent] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(IDLE_STORAGE_KEY, String(enabled)); }
    catch { /* Private browsing still supports the current session toggle. */ }
  }, [enabled]);
  useEffect(() => {
    setAbsent(false);
    if (!enabled || reducedMotion) return;
    return observeSceneAbsence({ win: window, doc: document, onChange: setAbsent });
  }, [enabled, reducedMotion]);
  return { enabled, setEnabled, active: enabled && !reducedMotion && absent };
}
