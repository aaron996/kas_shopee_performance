import { useEffect, useState } from 'react';
import { IDLE_STORAGE_KEY, observeSceneAbsence } from '../../utils/sceneIdle.js';
import { IDLE_MODE_STORAGE_KEY, readIdleMode, nextIdleMode, isSceneIdleActive } from '../../utils/sceneIdleMode.js';

export default function useSceneIdle(reducedMotion) {
  const [mode, setMode] = useState(() => {
    try { return readIdleMode(localStorage.getItem(IDLE_MODE_STORAGE_KEY), localStorage.getItem(IDLE_STORAGE_KEY)); }
    catch { return 'auto'; }
  });
  const [absent, setAbsent] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(IDLE_MODE_STORAGE_KEY, mode); }
    catch { /* Private browsing still supports the current session toggle. */ }
  }, [mode]);
  useEffect(() => {
    setAbsent(false);
    if (mode !== 'auto' || reducedMotion) return;
    return observeSceneAbsence({ win: window, doc: document, onChange: setAbsent });
  }, [mode, reducedMotion]);
  return { mode, enabled: mode !== 'off', cycle: () => setMode(nextIdleMode),
    active: isSceneIdleActive(mode, absent, reducedMotion) };
}
