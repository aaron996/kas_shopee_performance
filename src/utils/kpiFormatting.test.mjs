import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFormatting, normalizeFormatting, formattingColor, formattingCellProps, textOnColor, readFormatting, saveFormatting, formattingStorageKey } from './kpiFormatting.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('two-color ranges clamp endpoints and use the displayed KPI value at the threshold', () => {
  const below = { ...defaultFormatting('popr'), lowColor: '#0000ff', highColor: '#ffffff' };
  assert.equal(formattingColor(0, below), '#0000ff');
  assert.equal(formattingColor(87.5, below), '#8080ff');
  assert.equal(formattingColor(89.96, below), '#ffffff');
  assert.equal(formattingColor(100, below), '#ffffff');
  const above = { ...below, mode: 'above', lowColor: '#ffffff', highColor: '#008000' };
  assert.equal(formattingColor(0, above), '#ffffff');
  assert.equal(formattingColor(90, above), '#ffffff');
  assert.equal(formattingColor(92.5, above), '#80c080');
  assert.equal(formattingColor(100, above), '#008000');
});
test('three-color range uses all custom colors and handles 0/100 pivots', () => {
  const rule = { ...defaultFormatting('popr'), mode: 'three', lowColor: '#ff0000', midColor: '#ffffff', highColor: '#0000ff' };
  assert.equal(formattingColor(85, rule), '#ff0000');
  assert.equal(formattingColor(90, rule), '#ffffff');
  assert.equal(formattingColor(95, rule), '#0000ff');
  assert.equal(formattingColor(0, { ...rule, threshold: 0 }), '#ffffff');
  assert.equal(formattingColor(100, { ...rule, threshold: 100 }), '#ffffff');
  assert.equal(formattingColor(0, { ...rule, mode: 'below', threshold: 0 }), '#0000ff');
});
test('FD defaults to highlighting high values; missing values and off stay neutral', () => {
  const fd = defaultFormatting('fd');
  assert.equal(formattingColor(3, fd), '#ffffff');
  assert.equal(formattingColor(8, fd), '#ef9184');
  for (const pct of [null, undefined, NaN, Infinity, '90', '']) assert.equal(formattingColor(pct, fd), null);
  assert.equal(formattingColor(90, { ...fd, mode: 'off' }), null);
  assert.deepEqual(formattingCellProps(90, { ...fd, mode: 'off' }, 'grp-start'), { className: 'grp-start' });
});
test('each account and metric restores independently, retaining other metric choices', () => {
  const store = storage();
  saveFormatting(store, ' User@GHN.VN ', 'popr', { ...defaultFormatting('popr'), lowColor: '#123456' });
  saveFormatting(store, 'user@ghn.vn', 'fd', { ...defaultFormatting('fd'), mode: 'off' });
  saveFormatting(store, 'other@ghn.vn', 'popr', { ...defaultFormatting('popr'), lowColor: '#abcdef' });
  const restored = readFormatting(store, 'USER@ghn.vn');
  assert.equal(restored.popr.lowColor, '#123456');
  assert.equal(restored.fd.mode, 'off');
  assert.equal(restored.p1st, undefined);
  assert.equal(readFormatting(store, 'other@ghn.vn').popr.lowColor, '#abcdef');
  assert.equal(formattingStorageKey(''), null);
  assert.throws(() => saveFormatting(store, '', 'popr', defaultFormatting('popr')));
});
test('malformed/blocked storage falls back safely; save failure is surfaced', () => {
  const broken = { getItem: () => '{', setItem: () => { throw new Error('Quota'); } };
  assert.deepEqual(readFormatting(broken, 'user@ghn.vn'), {});
  assert.throws(() => saveFormatting(broken, 'user@ghn.vn', 'popr', defaultFormatting('popr')), /Quota/);
  const normalized = normalizeFormatting({ mode: 'inject', threshold: Infinity, spread: -1, lowColor: 'url(x)', highColor: '#AABBCC' }, 'p1st');
  assert.equal(normalized.mode, 'below');
  assert.equal(normalized.threshold, 97);
  assert.equal(normalized.spread, 0.1);
  assert.equal(normalized.lowColor, '#ef9184');
  assert.equal(normalized.highColor, '#aabbcc');
});
test('foreground contrast stays at least 4.5:1 across arbitrary user colors', () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const color = `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
    const linear = [r, g, b].map(c => c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const lum = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    const contrast = textOnColor(color) === '#000000' ? (lum + 0.05) / 0.05 : 1.05 / (lum + 0.05);
    assert.ok(contrast >= 4.5, color);
  }
});
