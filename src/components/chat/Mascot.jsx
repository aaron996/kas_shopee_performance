import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { MessageSquareText } from 'lucide-react';
import './mascot.css';

// One illustration, one fixed bottom-center pivot. State changes never swap faces.
export default function Mascot({ state = 'idle', active = false }) {
  const imageRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = imageRef.current;
    if (!node || failed) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let context;
    const synchronize = () => {
      context?.revert();
      context = null;
      if (!active || document.hidden || reduced.matches) return;
      context = gsap.context(() => {
        const timeline = gsap.timeline();
        if (state === 'listening') {
          timeline.to(node, { rotation: -5, duration: 0.25, ease: 'power2.out' });
        } else if (state === 'thinking') {
          timeline.to(node, { y: -3, rotation: 2, duration: 0.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        } else if (state === 'speaking') {
          timeline.to(node, { y: -2, rotation: -2, duration: 0.35, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        } else if (state === 'error') {
          timeline.to(node, { rotation: -5, duration: 0.12 })
            .to(node, { rotation: 4, duration: 0.16 })
            .to(node, { rotation: 0, duration: 0.2, ease: 'power2.out' });
        } else {
          timeline.to(node, { scaleY: 1.025, duration: 1.2, repeat: 1, yoyo: true, ease: 'sine.inOut' });
        }
      }, node);
    };
    synchronize();
    document.addEventListener('visibilitychange', synchronize);
    reduced.addEventListener('change', synchronize);
    return () => {
      document.removeEventListener('visibilitychange', synchronize);
      reduced.removeEventListener('change', synchronize);
      context?.revert();
    };
  }, [state, active, failed]);

  return <span className="kas-mascot" data-state={state} aria-hidden="true">
    {failed ? <MessageSquareText size={28} /> : <img ref={imageRef}
      src="/mascot/kas-parcel.png" alt="" width="1280" height="1280"
      draggable="false" onError={() => setFailed(true)} />}
  </span>;
}
