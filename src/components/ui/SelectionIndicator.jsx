import { useLayoutEffect, useRef } from 'react';

export default function SelectionIndicator({ value, collapsed, selector = '[aria-current="page"]' }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const indicator = ref.current;
    const parent = indicator.parentElement;
    const update = () => {
      const target = parent.querySelector(selector);
      if (!target) { indicator.style.opacity = '0'; return; }
      const rect = target.getBoundingClientRect();
      const origin = parent.getBoundingClientRect();
      indicator.style.opacity = '1';
      indicator.style.width = `${rect.width}px`;
      indicator.style.height = `${rect.height}px`;
      indicator.style.transform = `translate(${rect.left - origin.left + parent.scrollLeft}px, ${rect.top - origin.top + parent.scrollTop}px)`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [value, collapsed, selector]);
  return <span ref={ref} className="selection-indicator" aria-hidden="true" />;
}
