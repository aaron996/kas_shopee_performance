// Colours of the labels drawn over the 3D scene (a 2D canvas overlay, see labelOverlay.js).
// Pure data + a WCAG contrast helper so the palette can be tested. The scene background is
// dark in both app themes, so labels do not change with the theme.

export const SCENE_BACKGROUND = '#0f172a';

export const LABEL_PALETTE = {
  tagBackground: { color: '#0f172a', alpha: 0.94 },
  tagBorder: 'rgba(255, 255, 255, 0.16)',
  tagGood: '#34d399',
  tagBelow: '#f87171',
  selected: '#38bdf8',
  rank: '#f59e0b',
  name: '#ffffff',
  kpi: '#ffffff',
  deltaUp: { text: '#34d399', background: { color: '#34d399', alpha: 0.2 } },
  deltaDown: { text: '#f87171', background: { color: '#f87171', alpha: 0.2 } },
  deltaNone: { text: '#94a3b8', background: { color: '#94a3b8', alpha: 0.2 } },
  warning: { text: '#854d0e', background: { color: '#fef08a', alpha: 1 } },
  pillBackground: { color: '#0f172a', alpha: 0.85 },
  pillText: '#f8fafc',
  laneBackground: { color: '#334155', alpha: 0.9 },
  laneText: '#e2e8f0'
};

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Composite `fg` (hex + alpha) over an opaque `bg` hex; returns [r, g, b]. */
export function composite(fg, alpha, bg) {
  const f = parseHex(fg);
  const b = parseHex(bg);
  return f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
}

function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG 2.x contrast ratio between two [r, g, b] colours. */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Effective background of a layered fill: `fill` over `under` (itself over the scene). */
export function layered(fill, under) {
  return composite(fill.color, fill.alpha, '#' + under.map((v) => v.toString(16).padStart(2, '0')).join(''));
}
