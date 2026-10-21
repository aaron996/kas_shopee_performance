export const IDLE_MODE_STORAGE_KEY = 'ghn-ranking-idle-mode';
export const IDLE_MODES = ['off', 'auto', 'locked'];

export function readIdleMode(savedMode, legacyEnabled) {
  return IDLE_MODES.includes(savedMode) ? savedMode : legacyEnabled === 'false' ? 'off' : 'auto';
}

export function nextIdleMode(mode) {
  return IDLE_MODES[(IDLE_MODES.indexOf(mode) + 1) % IDLE_MODES.length];
}

export function isSceneIdleActive(mode, absent, reducedMotion) {
  return !reducedMotion && (mode === 'locked' || (mode === 'auto' && absent));
}

export function idleModeControl(mode) {
  if (mode === 'locked') return { label: 'Idle: Khóa · Bấm để tắt', title: 'Khóa idle · Luôn mô phỏng giao thông, di chuột không ngắt. Bấm để tắt.' };
  if (mode === 'off') return { label: 'Idle: Tắt · Bấm để bật tự động', title: 'Idle đang tắt · Bấm để tự động mô phỏng giao thông khi rời trình duyệt 10 giây.' };
  return { label: 'Idle: Tự động · Bấm để khóa', title: 'Idle tự động · Rời trình duyệt 10 giây để chạy, quay lại để về BXH. Bấm để khóa idle ngay.' };
}
