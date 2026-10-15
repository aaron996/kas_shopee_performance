import { useEffect, useId, useRef, useState } from 'react';
import { SunMoon, Sunrise, Sun, Sunset, Moon, ChevronDown, Check } from 'lucide-react';

const PRESETS = [
  ['auto', 'Tự động', SunMoon],
  ['dawn', 'Bình minh', Sunrise],
  ['day', 'Ban ngày', Sun],
  ['dusk', 'Hoàng hôn', Sunset],
  ['night', 'Ban đêm', Moon],
];

export default function SceneTimeControl({ mode, onChange, timeRef }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const focusOnOpen = useRef(false);
  const optionsId = useId();
  const [, label] = PRESETS.find(preset => preset[0] === mode) || PRESETS[0];

  useEffect(() => {
    if (open && focusOnOpen.current) {
      optionRefs.current[Math.max(0, PRESETS.findIndex(preset => preset[0] === mode))]?.focus();
      focusOnOpen.current = false;
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    rootRef.current?.addEventListener('keydown', escape);
    const root = rootRef.current;
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      root?.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div ref={rootRef} className={`prr-lighting-controls${open ? ' is-open' : ''}`} role="group" aria-label="Thời gian trong cảnh"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span className="prr-scene-time" ref={timeRef} title="Giờ mô phỏng · Một vòng ngày đêm trong 6 phút khi đang chạy">09:00</span>
    <button ref={triggerRef} className="prr-lighting-trigger" type="button" aria-label={`Chế độ ánh sáng: ${label}`} title={`Chế độ ánh sáng: ${label}`}
      aria-expanded={open} aria-controls={optionsId} onClick={() => setOpen(value => !value)}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault(); event.stopPropagation();
        if (open) optionRefs.current[Math.max(0, PRESETS.findIndex(preset => preset[0] === mode))]?.focus();
        else { focusOnOpen.current = true; setOpen(true); }
      }}>
      <span className="prr-lighting-icon" aria-hidden="true">{PRESETS.map(([value, , PresetIcon]) =>
        <PresetIcon key={value} size={18} className={mode === value ? 'is-current' : ''} />)}</span>
      <ChevronDown className="prr-lighting-chevron" size={12} aria-hidden="true" />
    </button>
    <div id={optionsId} className="prr-lighting-options" role="group" aria-label="Chọn chế độ ánh sáng" inert={!open} aria-hidden={!open}
      onKeyDown={event => {
        const index = optionRefs.current.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? PRESETS.length - 1
          : event.key === 'ArrowDown' ? (index + 1) % PRESETS.length : event.key === 'ArrowUp' ? (index - 1 + PRESETS.length) % PRESETS.length : null;
        if (next === null) return;
        event.preventDefault(); event.stopPropagation(); optionRefs.current[next]?.focus();
      }}>
      {PRESETS.map(([value, name, PresetIcon], index) => <button ref={element => { optionRefs.current[index] = element; }} key={value} type="button" aria-label={name} title={name}
        aria-pressed={mode === value} onClick={() => { onChange(value); setOpen(false); triggerRef.current?.focus(); }}>
        <PresetIcon size={18} aria-hidden="true" />
        <span>{name}</span>
        <Check className="prr-lighting-check" size={15} aria-hidden="true" />
      </button>)}
    </div>
  </div>;
}
