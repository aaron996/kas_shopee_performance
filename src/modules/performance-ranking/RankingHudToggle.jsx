import { Eye, EyeOff } from 'lucide-react';

// Stay in the toolbar's DOM and layout: focus order and the restore position remain stable.
export default function RankingHudToggle({ buttonRef, sceneOnly, onToggle }) {
  return <button ref={buttonRef} type="button" className="prr-hud-toggle"
      onClick={onToggle} aria-label={sceneOnly ? 'Hiện HUD' : 'Ẩn HUD'} aria-pressed={sceneOnly}
      title={sceneOnly ? 'Hiện giao diện (Esc)' : 'Ẩn giao diện, chỉ xem cảnh'}>
      <EyeOff size={16} aria-hidden="true" className={sceneOnly ? 'is-hidden' : ''} />
      <Eye size={16} aria-hidden="true" className={sceneOnly ? '' : 'is-hidden'} />
    </button>;
}
