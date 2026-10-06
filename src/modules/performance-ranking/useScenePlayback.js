import { useEffect, useState } from 'react';
import { DEFAULT_DRIVE_RATE } from '../../utils/sceneDriving.js';

// One playback preference survives 2D/3D switches. Visibility pauses time rather
// than skipping ahead when the reader returns from the table or another tab.
export default function useScenePlayback(hostRef) {
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(DEFAULT_DRIVE_RATE);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(() => !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = () => setReducedMotion(query.matches);
    const onVisibility = () => setForeground(!document.hidden);
    query.addEventListener('change', onPreference);
    document.addEventListener('visibilitychange', onVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (hostRef.current) observer.observe(hostRef.current);
    return () => {
      query.removeEventListener('change', onPreference);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [hostRef]);

  return { paused, setPaused, rate, setRate, reducedMotion, running: visible && foreground && !paused && !reducedMotion };
}
