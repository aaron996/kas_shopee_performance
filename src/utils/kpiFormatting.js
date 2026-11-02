// Display preferences only: these thresholds never change KPI calculations.
export const FORMATTING_MODES = [
  { value: 'below', label: '2 màu · Dưới KPI có màu' },
  { value: 'above', label: '2 màu · Trên KPI có màu' },
  { value: 'three', label: 'Dải 3 màu' },
  { value: 'off', label: 'Không tô màu' }
];
const THRESHOLDS = { p1st: 97, popr: 90, d1st: 95, dodr: 90, fd: 3 };
const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function defaultFormatting(metricKey) {
  const fd = metricKey === 'fd';
  return { mode: fd ? 'above' : 'below', threshold: THRESHOLDS[metricKey] ?? 90, spread: 5,
    lowColor: fd ? '#ffffff' : '#ef9184', midColor: '#ffffff', highColor: fd ? '#ef9184' : '#ffffff' };
}

export function normalizeFormatting(value, metricKey) {
  const defaults = defaultFormatting(metricKey);
  const source = value && typeof value === 'object' ? value : {};
  return {
    mode: FORMATTING_MODES.some(m => m.value === source.mode) ? source.mode : defaults.mode,
    threshold: typeof source.threshold === 'number' && Number.isFinite(source.threshold) ? clamp(source.threshold, 0, 100) : defaults.threshold,
    spread: typeof source.spread === 'number' && Number.isFinite(source.spread) ? clamp(source.spread, 0.1, 100) : defaults.spread,
    ...Object.fromEntries(['lowColor', 'midColor', 'highColor'].map(key => [key, validColor(source[key]) ? source[key].toLowerCase() : defaults[key]]))
  };
}

export function formattingStorageKey(userEmail) {
  const user = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
  return user ? `ghn:kpi-formatting:v1:${encodeURIComponent(user)}` : null;
}

export function readFormatting(storage, userEmail) {
  try {
    const key = formattingStorageKey(userEmail);
    const parsed = key ? JSON.parse(storage.getItem(key)) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.keys(THRESHOLDS).filter(k => Object.hasOwn(parsed, k)).map(k => [k, normalizeFormatting(parsed[k], k)]));
  } catch { return {}; }
}

export function saveFormatting(storage, userEmail, metricKey, value) {
  const key = formattingStorageKey(userEmail);
  if (!key || !Object.hasOwn(THRESHOLDS, metricKey)) throw new Error('Không xác định được tài khoản để lưu cài đặt.');
  const settings = { ...readFormatting(storage, userEmail), [metricKey]: normalizeFormatting(value, metricKey) };
  storage.setItem(key, JSON.stringify(settings));
  return settings;
}

const channels = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
function mix(a, b, ratio) {
  const end = channels(b);
  return `#${channels(a).map((c, i) => Math.round(c + (end[i] - c) * clamp(ratio, 0, 1)).toString(16).padStart(2, '0')).join('')}`;
}
export function textOnColor(color) {
  const [r, g, b] = channels(color).map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}

export function formattingColor(pct, rule) {
  if (!rule || rule.mode === 'off' || typeof pct !== 'number' || !Number.isFinite(pct)) return null;
  const shown = Math.round(pct * 10) / 10;
  const { threshold: pivot, spread, lowColor, midColor, highColor, mode } = rule;
  if (mode === 'below') return shown >= pivot ? highColor : mix(lowColor, highColor, (shown - Math.max(0, pivot - spread)) / (Math.min(spread, pivot) || 1));
  if (mode === 'above') return mix(lowColor, highColor, (shown - pivot) / (Math.min(spread, 100 - pivot) || 1));
  if (shown === pivot) return midColor;
  return shown < pivot
    ? mix(lowColor, midColor, (shown - Math.max(0, pivot - spread)) / (Math.min(spread, pivot) || 1))
    : mix(midColor, highColor, (shown - pivot) / (Math.min(spread, 100 - pivot) || 1));
}

export function formattingCellProps(pct, rule, ...classes) {
  const color = formattingColor(pct, rule);
  return {
    className: [...classes, color && 'kpi-custom-color'].filter(Boolean).join(' '),
    ...(color ? { style: { '--kpi-cell-bg': color, '--kpi-cell-fg': textOnColor(color) } } : {})
  };
}
