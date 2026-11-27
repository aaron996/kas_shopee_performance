import { clamp, mix, textOnColor } from './kpiFormatting.js';

// Tô màu tab Backlog (số đơn tuyệt đối). Chỉ là tùy chọn hiển thị, không đổi số liệu.
// 'app' = giữ bảng trung tính như hiện tại; 'delta' tô cột Δ; 'heat' tô mức tồn theo cấp; 'both' là cả hai.
export const BACKLOG_FORMAT_MODES = [
  { value: 'app', label: 'Mặc định ứng dụng' },
  { value: 'delta', label: 'Chỉ cột Δ vs ngày trước' },
  { value: 'heat', label: 'Chỉ mức tồn (heatmap)' },
  { value: 'both', label: 'Cả Δ và mức tồn' },
  { value: 'off', label: 'Không tô màu' }
];
const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function defaultBacklogFormatting() {
  return { mode: 'app', upColor: '#ef9184', downColor: '#57bb8a', heatLow: '#ffffff', heatHigh: '#f4a68f' };
}

export function normalizeBacklogFormatting(value) {
  const defaults = defaultBacklogFormatting();
  const source = value && typeof value === 'object' ? value : {};
  return {
    mode: BACKLOG_FORMAT_MODES.some(m => m.value === source.mode) ? source.mode : defaults.mode,
    ...Object.fromEntries(['upColor', 'downColor', 'heatLow', 'heatHigh'].map(key => [key, validColor(source[key]) ? source[key].toLowerCase() : defaults[key]]))
  };
}

export function backlogStorageKey(userEmail) {
  const user = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
  return user ? `ghn:backlog-formatting:v1:${encodeURIComponent(user)}` : null;
}

export function readBacklogFormatting(storage, userEmail) {
  try {
    const key = backlogStorageKey(userEmail);
    const parsed = key ? JSON.parse(storage.getItem(key)) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? normalizeBacklogFormatting(parsed) : null;
  } catch { return null; }
}

export function saveBacklogFormatting(storage, userEmail, value) {
  const key = backlogStorageKey(userEmail);
  if (!key) throw new Error('Không xác định được tài khoản để lưu cài đặt.');
  const rule = normalizeBacklogFormatting(value);
  storage.setItem(key, JSON.stringify(rule));
  return rule;
}

const props = (color, classes) => (color
  ? { className: [...classes, 'kpi-custom-color'].join(' '), style: { '--kpi-cell-bg': color, '--kpi-cell-fg': textOnColor(color) } }
  : { className: classes.join(' ') });

// Mức tồn: nhạt → đậm theo tỷ lệ với giá trị lớn nhất cùng cấp và cùng cột. Không tô giá trị rỗng hoặc 0.
export function backlogHeatProps(value, max, rule, ...classes) {
  const on = rule && (rule.mode === 'heat' || rule.mode === 'both');
  if (!on || typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !(max > 0)) return props(null, classes);
  return props(mix(rule.heatLow, rule.heatHigh, clamp(value / max, 0, 1)), classes);
}

// Δ so với ngày trước: tăng (tồn nhiều hơn) dùng upColor, giảm dùng downColor; đậm dần theo |Δ| so với Δ lớn nhất cùng cấp.
export function backlogDeltaProps(delta, maxAbs, rule, ...classes) {
  const on = rule && (rule.mode === 'delta' || rule.mode === 'both');
  if (!on || typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0 || !(maxAbs > 0)) return props(null, classes);
  const strength = 0.35 + 0.65 * clamp(Math.abs(delta) / maxAbs, 0, 1);
  return props(mix('#ffffff', delta > 0 ? rule.upColor : rule.downColor, strength), classes);
}
