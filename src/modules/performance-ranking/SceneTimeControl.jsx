import { useEffect, useId, useRef, useState } from 'react';
import { SunMoon, Sunrise, Sun, Sunset, Moon } from 'lucide-react';

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
  const optionsId = useId();
  const [, label, Icon] = PRESETS.find(preset => preset[0] === mode) || PRESETS[0];

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

  return <div ref={rootRef} className="prr-lighting-controls" role="group" aria-label="Thời gian trong cảnh"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span className="prr-scene-time" ref={timeRef} title="Giờ mô phỏng · Một vòng ngày đêm trong 6 phút khi đang chạy">09:00</span>
    <button ref={triggerRef} type="button" aria-label={`Chế độ ánh sáng: ${label}`} title={`Chế độ ánh sáng: ${label}`}
      aria-expanded={open} aria-controls={optionsId} onClick={() => setOpen(value => !value)}>
      <Icon size={18} aria-hidden="true" />
    </button>
    <div id={optionsId} className="prr-lighting-options" role="group" aria-label="Chọn chế độ ánh sáng" hidden={!open}>
      {PRESETS.map(([value, name, PresetIcon]) => <button key={value} type="button" aria-label={name} title={name}
        aria-pressed={mode === value} onClick={() => { onChange(value); setOpen(false); triggerRef.current?.focus(); }}>
        <PresetIcon size={18} aria-hidden="true" />
      </button>)}
    </div>
  </div>;
}
