import { useState, useEffect } from 'react';

export function useCountUp(end, duration = 800) {
  const [value, setValue] = useState(end); // start at end for first render if we don't want to animate from 0 initially, or start at 0. Let's start at 0.
  const [isFirstRender, setIsFirstRender] = useState(true);

  useEffect(() => {
    if (isFirstRender) {
      setValue(end);
      setIsFirstRender(false);
      return;
    }

    let startTime = null;
    const startValue = value;
    const change = end - startValue;

    if (change === 0) return;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // easeOutExpo for a snappy but smooth finish
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      setValue(startValue + change * ease);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setValue(end);
      }
    };
    
    const raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);

  return value;
}
