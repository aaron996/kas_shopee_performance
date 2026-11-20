import test from 'node:test';
import assert from 'node:assert/strict';
import { oprCellProps } from './reverseReportFormatting.js';
import { defaultFormatting } from './kpiFormatting.js';

test('default (no saved rule) paints nothing: SPE Reverse has no OPR target, like Chi tiết Vùng/Hub', () => {
  assert.deepEqual(oprCellProps(40, null, 'rar-num'), { className: 'rar-num' });
  assert.deepEqual(oprCellProps(null, null, 'rar-num'), { className: 'rar-num' });
});

test('a saved personal rule paints the cell; "off" paints nothing', () => {
  const custom = { ...defaultFormatting('popr'), mode: 'below' };
  const props = oprCellProps(60, custom, 'rar-num');
  assert.match(props.className, /kpi-custom-color/);
  assert.ok(props.style['--kpi-cell-bg']);
  assert.deepEqual(oprCellProps(60, { ...custom, mode: 'off' }, 'rar-num'), { className: 'rar-num' });
});
