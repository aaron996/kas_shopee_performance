import test from 'node:test';
import assert from 'node:assert/strict';
import { backlogDeltaProps, backlogHeatProps, defaultBacklogFormatting, normalizeBacklogFormatting, readBacklogFormatting, saveBacklogFormatting } from './backlogFormatting.js';

const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('mặc định giữ bảng trung tính, không tô màu', () => {
  const rule = defaultBacklogFormatting();
  assert.equal(backlogHeatProps(10, 10, rule).style, undefined);
  assert.equal(backlogDeltaProps(5, 5, rule).style, undefined);
});

test('heat tô theo tỷ lệ so với max cùng cấp, bỏ qua 0/null', () => {
  const rule = { ...defaultBacklogFormatting(), mode: 'heat' };
  assert.equal(backlogHeatProps(10, 10, rule).style['--kpi-cell-bg'], rule.heatHigh);
  assert.ok(backlogHeatProps(5, 10, rule).style);
  assert.equal(backlogHeatProps(0, 10, rule).style, undefined);
  assert.equal(backlogHeatProps(null, 10, rule).style, undefined);
  assert.equal(backlogDeltaProps(5, 5, rule).style, undefined, 'heat không tô cột Δ');
});

test('delta: tăng dùng màu tăng, giảm dùng màu giảm, 0 hoặc thiếu thì trung tính', () => {
  const rule = { ...defaultBacklogFormatting(), mode: 'delta', upColor: '#ff0000', downColor: '#00ff00' };
  assert.equal(backlogDeltaProps(8, 8, rule).style['--kpi-cell-bg'], '#ff0000');
  assert.equal(backlogDeltaProps(-8, 8, rule).style['--kpi-cell-bg'], '#00ff00');
  assert.equal(backlogDeltaProps(0, 8, rule).style, undefined);
  assert.equal(backlogDeltaProps(null, 8, rule).style, undefined);
  assert.equal(backlogHeatProps(10, 10, rule).style, undefined, 'delta không tô mức tồn');
});

test('both tô cả hai; off không tô', () => {
  const both = { ...defaultBacklogFormatting(), mode: 'both' };
  assert.ok(backlogHeatProps(10, 10, both).style && backlogDeltaProps(3, 3, both).style);
  const off = { ...both, mode: 'off' };
  assert.equal(backlogHeatProps(10, 10, off).style, undefined);
});

test('lưu theo tài khoản, chuẩn hóa dữ liệu hỏng', () => {
  const s = store();
  assert.equal(readBacklogFormatting(s, 'a@ghn.vn'), null);
  saveBacklogFormatting(s, 'A@ghn.vn', { mode: 'both', upColor: '#ABCDEF', downColor: 'xyz' });
  const rule = readBacklogFormatting(s, 'a@ghn.vn');
  assert.equal(rule.mode, 'both');
  assert.equal(rule.upColor, '#abcdef');
  assert.equal(rule.downColor, defaultBacklogFormatting().downColor);
  assert.equal(readBacklogFormatting(s, 'b@ghn.vn'), null);
  assert.equal(normalizeBacklogFormatting({ mode: 'lạ' }).mode, 'app');
  assert.throws(() => saveBacklogFormatting(s, '', {}));
});
