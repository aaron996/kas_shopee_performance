import test from 'node:test';
import assert from 'node:assert/strict';
import { oprCellProps, oprScale, OPR_SCALE_COLORS } from './reverseReportFormatting.js';
import { defaultFormatting } from './kpiFormatting.js';

test('scale min/max come from the numbers actually in the table; fewer than two distinct values gives no scale', () => {
  assert.deepEqual(oprScale([40, null, 25.5, 70, undefined, NaN]), { min: 25.5, max: 70 });
  assert.equal(oprScale([40]), null);
  assert.equal(oprScale([40, 40, null]), null);
  assert.equal(oprScale([]), null);
});

test('default colouring is a min→max scale: lowest cell red, highest cell white, middle in between', () => {
  const scale = { min: 20, max: 60 };
  const bg = pct => oprCellProps(pct, { scale }, 'rar-num').style['--kpi-cell-bg'];
  assert.equal(bg(20), OPR_SCALE_COLORS.low);
  assert.equal(bg(60), OPR_SCALE_COLORS.high);
  const mid = bg(40);
  assert.notEqual(mid, OPR_SCALE_COLORS.low);
  assert.notEqual(mid, OPR_SCALE_COLORS.high);
  assert.match(oprCellProps(20, { scale }, 'rar-num').className, /rar-num kpi-custom-color/);
});

test('cells without a rate, or a table without a scale, stay uncoloured', () => {
  assert.deepEqual(oprCellProps(null, { scale: { min: 1, max: 2 } }, 'rar-num'), { className: 'rar-num' });
  assert.deepEqual(oprCellProps(40, { scale: null }, 'rar-num'), { className: 'rar-num' });
  assert.deepEqual(oprCellProps(40, {}, 'rar-num'), { className: 'rar-num' });
});

test('a saved personal rule wins over the scale; "off" paints nothing', () => {
  const rule = { ...defaultFormatting('popr'), mode: 'below' };
  const painted = oprCellProps(60, { rule, scale: { min: 1, max: 99 } }, 'rar-num');
  assert.ok(painted.style['--kpi-cell-bg']);
  assert.deepEqual(oprCellProps(60, { rule: { ...rule, mode: 'off' }, scale: { min: 1, max: 99 } }, 'rar-num'), { className: 'rar-num' });
});
