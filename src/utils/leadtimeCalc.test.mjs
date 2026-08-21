// node --test src/utils/*.test.mjs
//
// Fixture là mẫu cắt từ output THẬT (src/data/leadtime-sample.csv), không phải
// số sinh bằng Math.sin — nên các con số kỳ vọng dưới đây đối chiếu được với
// query nguồn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  STAGE_KEYS, THRESHOLD_PRESETS, BASELINE_CONFIG,
  splitLeadtimeRows, buildLeadtimeIndex, aggregate, aggregateByDate,
  resolveBaseline, classifyDeviation, stageImpact, shiftDate,
  scopeAll, scopeLane, scopePair, formatHours, formatDeviation
} from './leadtimeCalc.js';
import { normalizeLane, getLanesFromRows, isUnresolvedLaneRow, LANE_DISPLAY_ORDER } from './laneTaxonomy.js';
import { resolveClients, getClientLabel } from './clientLabels.js';

// --- nạp fixture ------------------------------------------------------------
const NUMERIC = new Set(['mau', 'avg_lt_prepickup_hour', 'avg_lt_firstmile_hour',
  'avg_lt_middlemile_hour', 'avg_lt_lastmile_hour', 'avg_lt_e2e_hour']);

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      const raw = cells[i];
      row[h] = (raw === undefined || raw === '') ? null : (NUMERIC.has(h) ? Number(raw) : raw);
    });
    return row;
  });
}

const RAW = parseCsv(readFileSync(new URL('../data/leadtime-sample.csv', import.meta.url), 'utf8'));
const SPLIT = splitLeadtimeRows(RAW);
const INDEX = buildLeadtimeIndex(SPLIT.clean);
const LAST = INDEX.dates[INDEX.dates.length - 1];

// --- laneTaxonomy -----------------------------------------------------------

test('normalizeLane gộp mọi cách viết của cùng một lane', () => {
  const variants = ['Intra city', 'Intra City', 'INTRA CITY', ' intra  city '];
  const keys = new Set(variants.map(normalizeLane));
  assert.equal(keys.size, 1, 'phải cùng 1 khoá');
  assert.equal(normalizeLane('Cross metro *'), 'crossmetro*');
  assert.equal(normalizeLane(null), '');
});

test('getLanesFromRows lấy động từ data và không bỏ lane lạ', () => {
  const rows = [
    { externallane_new: 'Cross region' },
    { externallane_new: 'INTRA CITY' },
    { externallane_new: 'Cross metro *' },
    { externallane_new: 'Lane hoàn toàn mới' }
  ];
  const lanes = getLanesFromRows(rows);
  assert.equal(lanes.length, 4, 'lane lạ vẫn phải có mặt');
  // sort theo LANE_DISPLAY_ORDER: intracity trước crossmetro* trước crossregion
  assert.deepEqual(lanes.map(l => l.key).slice(0, 3), ['intracity', 'crossmetro*', 'crossregion']);
  assert.equal(lanes[3].key, 'lanehoàntoànmới', 'lane lạ xếp cuối');
  // nhãn giữ đúng chữ của nguồn, không viết lại
  assert.equal(lanes.find(l => l.key === 'intracity').label, 'INTRA CITY');
});

test('fixture thật có đủ 5 lane — đây là ca bản cũ làm mất Cross metro', () => {
  const lanes = INDEX.lanes.map(l => l.key);
  for (const expected of LANE_DISPLAY_ORDER) {
    assert.ok(lanes.includes(expected), `thiếu lane ${expected}`);
  }
});

test('isUnresolvedLaneRow chỉ đúng khi cả 3 cột rỗng', () => {
  assert.equal(isUnresolvedLaneRow({ fromprovince_new: null, toprovince_new: null, externallane_new: null }), true);
  assert.equal(isUnresolvedLaneRow({ fromprovince_new: 'Hà Nội', toprovince_new: null, externallane_new: null }), false);
  assert.equal(isUnresolvedLaneRow({ fromprovince_new: 'Hà Nội', toprovince_new: 'Hà Nội', externallane_new: null }), false);
});

// --- splitLeadtimeRows ------------------------------------------------------

test('tách đúng 3 nhóm, không mất dòng nào', () => {
  assert.equal(SPLIT.clean.length + SPLIT.missingStage.length + SPLIT.unresolvedLane.length, RAW.length);
  assert.ok(SPLIT.unresolvedLane.length > 0, 'fixture phải có dòng lane rỗng');
  assert.ok(SPLIT.missingStage.length > 0, 'fixture phải có dòng thiếu chặng');
});

test('dòng đã clean không còn chặng NULL nào', () => {
  for (const row of SPLIT.clean) {
    assert.ok(row.stages.every(v => v !== null));
    assert.ok(row.mau > 0);
  }
});

test('dòng lane rỗng không lọt vào nhóm clean', () => {
  assert.ok(SPLIT.clean.every(r => r.laneKey !== ''));
});

// --- weighted average -------------------------------------------------------

test('weighted theo mau, không phải trung bình đơn giản', () => {
  const rows = [
    { report_date: '2026-08-01', client_name: 'SPB', fromprovince_new: 'A', toprovince_new: 'A', externallane_new: 'Intra city',
      mau: 1000, avg_lt_prepickup_hour: 10, avg_lt_firstmile_hour: 1, avg_lt_middlemile_hour: 1, avg_lt_lastmile_hour: 1, avg_lt_e2e_hour: 13 },
    { report_date: '2026-08-01', client_name: 'SPB', fromprovince_new: 'B', toprovince_new: 'B', externallane_new: 'Intra city',
      mau: 1, avg_lt_prepickup_hour: 1000, avg_lt_firstmile_hour: 1, avg_lt_middlemile_hour: 1, avg_lt_lastmile_hour: 1, avg_lt_e2e_hour: 1003 }
  ];
  const idx = buildLeadtimeIndex(splitLeadtimeRows(rows).clean);
  const got = aggregate(idx, scopeLane('SPB', 'intracity'), '2026-08-01', '2026-08-01');
  const expected = (10 * 1000 + 1000 * 1) / 1001;
  assert.ok(Math.abs(got.stages.prepickup.value - expected) < 1e-9);
  // trung bình đơn giản sẽ ra 505 — phải KHÔNG bằng
  assert.ok(Math.abs(got.stages.prepickup.value - 505) > 400);
  assert.equal(got.mau, 1001);
});

test('aggregate khớp với tính tay trên fixture (1 lane × 1 client × toàn kỳ)', () => {
  const key = scopeLane('SPB', 'crossregion');
  const got = aggregate(INDEX, key, INDEX.dates[0], LAST);
  let prod = 0, mau = 0, totalMau = 0;
  for (const r of SPLIT.clean) {
    if (r.client !== 'SPB' || r.laneKey !== 'crossregion') continue;
    totalMau += r.mau;
    prod += r.stages[2] * r.mau;   // middlemile
    mau += r.mau;
  }
  assert.equal(got.mau, totalMau);
  assert.ok(Math.abs(got.stages.middlemile.value - prod / mau) < 1e-9);
});

test('gộp nhiều client = gộp scope, không phải trung bình của 2 trung bình', () => {
  const both = aggregate(INDEX, [scopeAll('SPB'), scopeAll('SPE')], INDEX.dates[0], LAST);
  const spb = aggregate(INDEX, scopeAll('SPB'), INDEX.dates[0], LAST);
  const spe = aggregate(INDEX, scopeAll('SPE'), INDEX.dates[0], LAST);
  assert.equal(both.mau, spb.mau + spe.mau);
  const manual = (spb.stages.lastmile.value * spb.stages.lastmile.mau + spe.stages.lastmile.value * spe.stages.lastmile.mau)
    / (spb.stages.lastmile.mau + spe.stages.lastmile.mau);
  assert.ok(Math.abs(both.stages.lastmile.value - manual) < 1e-9);
});

test('aggregateByDate trả đúng số điểm và tổng khớp aggregate', () => {
  const from = shiftDate(LAST, -6);
  const series = aggregateByDate(INDEX, scopeAll('SPE'), from, LAST);
  const total = aggregate(INDEX, scopeAll('SPE'), from, LAST);
  assert.equal(series.length, 7);
  assert.equal(series.reduce((s, d) => s + d.mau, 0), total.mau);
});

// --- baseline ---------------------------------------------------------------

test('baseline KHÔNG chứa ngày nào trong kỳ đang xem (đóng B1)', () => {
  // Dựng data 40 ngày: 30 ngày đầu = 10h, 10 ngày cuối = 100h.
  // Xem kỳ = 10 ngày cuối -> baseline phải đúng 10h, không bị 100h kéo lên.
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const date = shiftDate('2026-07-01', i);
    const v = i < 30 ? 10 : 100;
    rows.push({
      report_date: date, client_name: 'SPB', fromprovince_new: 'A', toprovince_new: 'B',
      externallane_new: 'Cross region', mau: 100,
      avg_lt_prepickup_hour: v, avg_lt_firstmile_hour: v, avg_lt_middlemile_hour: v,
      avg_lt_lastmile_hour: v, avg_lt_e2e_hour: v * 4
    });
  }
  const idx = buildLeadtimeIndex(splitLeadtimeRows(rows).clean);
  const periodStart = shiftDate('2026-07-01', 30);
  const bl = resolveBaseline(idx, {
    scopeKeys: scopePair('SPB', 'crossregion', 'A', 'B'),
    periodStart,
    config: { ...BASELINE_CONFIG, windowDays: 28 }
  });
  assert.equal(bl.stages.middlemile.value, 10, 'baseline bị nhiễm dữ liệu kỳ đang xem');
  assert.equal(bl.stages.middlemile.dayCount, 28);
});

test('baseline fallback lên cấp lane và BÁO RÕ level (đóng B3)', () => {
  const rows = [];
  // tuyến A->B chỉ có 3 ngày -> dưới minDataPoints 5
  for (let i = 0; i < 3; i++) {
    rows.push({ report_date: shiftDate('2026-07-01', i), client_name: 'SPB', fromprovince_new: 'A', toprovince_new: 'B',
      externallane_new: 'Cross region', mau: 10, avg_lt_prepickup_hour: 5, avg_lt_firstmile_hour: 5,
      avg_lt_middlemile_hour: 5, avg_lt_lastmile_hour: 5, avg_lt_e2e_hour: 20 });
  }
  // tuyến khác cùng lane có 20 ngày
  for (let i = 0; i < 20; i++) {
    rows.push({ report_date: shiftDate('2026-07-01', i), client_name: 'SPB', fromprovince_new: 'C', toprovince_new: 'D',
      externallane_new: 'Cross region', mau: 100, avg_lt_prepickup_hour: 9, avg_lt_firstmile_hour: 9,
      avg_lt_middlemile_hour: 9, avg_lt_lastmile_hour: 9, avg_lt_e2e_hour: 36 });
  }
  const idx = buildLeadtimeIndex(splitLeadtimeRows(rows).clean);
  const periodStart = shiftDate('2026-07-01', 25);
  const bl = resolveBaseline(idx, {
    scopeKeys: scopePair('SPB', 'crossregion', 'A', 'B'),
    fallbackScopeKeys: scopeLane('SPB', 'crossregion'),
    periodStart
  });
  assert.equal(bl.stages.middlemile.level, 'fallback', 'phải báo là baseline cấp nhóm');
  assert.equal(bl.level, 'fallback');
  assert.notEqual(bl.stages.middlemile.value, 5, 'không được lấy baseline của chính tuyến thiếu data');
});

test('không có lịch sử thì baseline = null, không phải 0', () => {
  const bl = resolveBaseline(INDEX, {
    scopeKeys: scopeAll('SPB'),
    periodStart: INDEX.dates[0]
  });
  assert.equal(bl.stages.prepickup.value, null);
  assert.equal(bl.level, 'none');
});

// --- classifyDeviation ------------------------------------------------------

test('+9% là leadtime XẤU ĐI: level normal nhưng direction up, không phải "tốt" (đóng B5)', () => {
  const r = classifyDeviation(109, 100);
  assert.equal(r.pct, 9);
  assert.equal(r.level, 'normal');
  assert.equal(r.direction, 'up');
  assert.equal(r.suspectData, false);
});

test('ngưỡng warning / critical theo preset', () => {
  assert.equal(classifyDeviation(125, 100, THRESHOLD_PRESETS.normal).level, 'warning');
  assert.equal(classifyDeviation(155, 100, THRESHOLD_PRESETS.normal).level, 'critical');
  // preset chặt thì cùng con số đó nặng hơn
  assert.equal(classifyDeviation(112, 100, THRESHOLD_PRESETS.strict).level, 'warning');
  assert.equal(classifyDeviation(130, 100, THRESHOLD_PRESETS.strict).level, 'critical');
  assert.equal(classifyDeviation(112, 100, THRESHOLD_PRESETS.loose).level, 'normal');
});

test('giảm sâu bất thường bị gắn cờ nghi lỗi data, không tính là thành tích', () => {
  const r = classifyDeviation(45, 100);
  assert.equal(r.level, 'critical');
  assert.equal(r.direction, 'down');
  assert.equal(r.suspectData, true);
});

test('giảm nhẹ là tốt thật', () => {
  const r = classifyDeviation(92, 100);
  assert.equal(r.direction, 'down');
  assert.equal(r.level, 'normal');
  assert.equal(r.suspectData, false);
});

test('baseline null / 0 thì không chia 0', () => {
  assert.equal(classifyDeviation(10, null).pct, null);
  assert.equal(classifyDeviation(10, 0).pct, null);
  assert.equal(classifyDeviation(null, 10).pct, null);
});

// --- impact -----------------------------------------------------------------

test('impact xếp tuyến sản lượng lớn lên trên tuyến mẫu ít lệch to (đóng E6)', () => {
  const tiny = stageImpact(1, 30, 10);          // mau=1, +200%
  const big = stageImpact(35513, 45.2, 40);     // sản lượng lớn, +13%
  assert.ok(big > tiny, 'tuyến 35.513 đơn phải xếp trên tuyến 1 đơn');
});

test('impact = 0 khi thiếu baseline hoặc mẫu', () => {
  assert.equal(stageImpact(0, 10, 5), 0);
  assert.equal(stageImpact(100, 10, null), 0);
  assert.equal(stageImpact(100, null, 5), 0);
});

// --- format / ngày ----------------------------------------------------------

test('format không bao giờ ra "undefinedh" (đóng B8)', () => {
  assert.equal(formatHours(undefined), '–');
  assert.equal(formatHours(null), '–');
  assert.equal(formatHours(''), '–');
  assert.equal(formatHours(12.345), '12.3h');
  assert.equal(formatDeviation(undefined), '–');
  assert.equal(formatDeviation(5), '+5.0%');
  assert.equal(formatDeviation(-5), '-5.0%');
});

test('shiftDate theo ngày lịch, qua được mốc đầu tháng', () => {
  assert.equal(shiftDate('2026-08-01', -1), '2026-07-31');
  assert.equal(shiftDate('2026-08-19', -6), '2026-08-13');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

// --- clientLabels -----------------------------------------------------------

test('SPB là Shopee Bulky, không phải Shopee Express Backlog (đóng C2)', () => {
  assert.equal(getClientLabel('SPB'), 'Shopee Bulky');
  assert.equal(getClientLabel('SPE'), 'Shopee Express');
  assert.equal(getClientLabel('XYZ'), 'XYZ', 'client lạ thì không bịa tên');
});

test('resolveClients theo filter của header', () => {
  assert.deepEqual(resolveClients('ALL', ['SPB', 'SPE']), ['SPB', 'SPE']);
  assert.deepEqual(resolveClients('SPE', ['SPB', 'SPE']), ['SPE']);
  assert.deepEqual(resolveClients('SPB', ['SPE']), [], 'không vẽ client không có data');
});

// --- hiệu năng --------------------------------------------------------------

test('index + tổng hợp toàn bộ fixture dưới 150ms', () => {
  const t0 = performance.now();
  const idx = buildLeadtimeIndex(splitLeadtimeRows(RAW).clean);
  const from = shiftDate(idx.dates[idx.dates.length - 1], -6);
  const to = idx.dates[idx.dates.length - 1];
  for (const pair of idx.pairMeta.values()) {
    aggregate(idx, pair.key, from, to);
    resolveBaseline(idx, {
      scopeKeys: pair.key,
      fallbackScopeKeys: scopeLane(pair.client, pair.laneKey),
      periodStart: from
    });
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 150, `mất ${ms.toFixed(0)}ms — bản cũ mất ~13 phút ở quy mô thật`);
});

test('STAGE_KEYS đúng thứ tự hành trình', () => {
  assert.deepEqual(STAGE_KEYS, ['prepickup', 'firstmile', 'middlemile', 'lastmile']);
});
