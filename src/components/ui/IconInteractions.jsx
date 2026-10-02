import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { beginIconHover, endIconHover } from './iconMotion';

export default function IconInteractions() {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    let active = null;
    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      if (active) {
        endIconHover(active);
        const describedBy = active.getAttribute('aria-describedby')?.split(' ').filter(id => id !== 'motion-tooltip').join(' ');
        if (describedBy) active.setAttribute('aria-describedby', describedBy);
        else active.removeAttribute('aria-describedby');
      }
      active = null; setTip(null);
    };
    const enter = event => {
      if (event.type === 'pointerover' && !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      const target = event.target.closest?.('button, a');
      if (!target || target.disabled || target === active) return;
      dismiss(); active = target; beginIconHover(target);
      if (!target.dataset.tooltip) return;
      timer = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        const side = !!target.closest('.app-sidebar');
        target.setAttribute('aria-describedby', [target.getAttribute('aria-describedby'), 'motion-tooltip'].filter(Boolean).join(' '));
        setTip({ label: target.dataset.tooltip, detail: target.dataset.tooltipDetail, x: side ? rect.right + 12 : Math.min(Math.max(rect.left, 12), window.innerWidth - 272), y: side ? Math.min(rect.top, window.innerHeight - 100) : rect.bottom + 10 });
      }, 140);
    };
    const leave = event => { if (active && !active.contains(event.relatedTarget)) dismiss(); };
    const key = event => { if (event.key === 'Escape') dismiss(); };
    document.addEventListener('pointerover', enter);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', enter);
    document.addEventListener('focusout', leave);
    document.addEventListener('keydown', key);
    document.addEventListener('click', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      dismiss();
      document.removeEventListener('pointerover', enter); document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusin', enter); document.removeEventListener('focusout', leave);
      document.removeEventListener('keydown', key); document.removeEventListener('click', dismiss);
      window.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', dismiss);
    };
  }, []);
  return tip ? createPortal(<div id="motion-tooltip" className="motion-tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}><strong>{tip.label}</strong>{tip.detail && <span>{tip.detail}</span>}</div>, document.body) : null;
}
