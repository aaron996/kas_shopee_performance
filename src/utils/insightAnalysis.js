// Engine cho tab "Insight" — tách khỏi ExecutiveSummaryModal (báo cáo D-1 vs
// D-8 dạng text để dán Zalo/Telegram) theo đúng yêu cầu: đây là 1 tính năng
// MỚI, không sửa cái cũ.
//
// 2 việc:
//  1. buildAttentionList  — xếp hạng vùng/hub đáng chú ý nhất theo mức độ
//     nghiêm trọng (khối lượng trễ × % lệch target), không chỉ top 3 như
//     ExecutiveSummaryModal, và không giới hạn 2 metric (1st Pickup/1st Deli)
//     như risk-chip của Report1 — đủ cả 4 metric.
//  2. buildNarrative — câu chuyện có "nguyên nhân khả dĩ": nối lệch KPI D-1 vs
//     D-8 (tab 1) với lệch leadtime từng chặng so với baseline 28 ngày (tab 3,
//     cùng cơ chế resolveBaseline app đã dùng cho tab Leadtime). Đây là TƯƠNG
//     QUAN theo thời gian (cùng client, cùng giai đoạn), KHÔNG PHẢI quan hệ
//     nhân quả đã kiểm chứng ở cấp vùng/hub — luôn có caveat đi kèm, không
//     overclaim.

import { MIEN_REGIONS, TARGET_KPIS } from '../data/defaultDataset';
import { groupDatesByWeek } from './dataProcessor';
import {
  STAGE_KEYS, STAGE_CONFIG, DEFAULT_PRESET, THRESHOLD_PRESETS,
  splitLeadtimeRows, buildLeadtimeIndex, aggregate, resolveBaseline,
  classifyDeviation, scopeAll
} from './leadtimeCalc';
import { resolveClients, getClientLabel } from './clientLabels';

function getRowVal(r, primaryCol, fallbackCol) {
  if (r[primaryCol] !== undefined && r[primaryCol] !== null) return Number(r[primaryCol]) || 0;
  if (fallbackCol && r[fallbackCol] !== undefined && r[fallbackCol] !== null) return Number(r[fallbackCol]) || 0;
  return 0;
}

function findMien(region) {
  return Object.keys(MIEN_REGIONS).find(m => MIEN_REGIONS[m].includes(region)) || 'Miền khác';
}

// Định nghĩa 4 chỉ số dùng chung cho cả attention list lẫn narrative — MỘT
// nguồn duy nhất để không lặp lại tên cột như Report1MienVungHub đã lặp.
const METRICS = [
  { key: 'p1st', label: '1st Pickup', isDeli: false, totCol: 'mau_pu', ontCol: 'ontime_pu_1st', target: TARGET_KPIS['1st Pickup'] ?? 97 },
  { key: 'popr', label: 'OPR', isDeli: false, totCol: 'mau_pu', ontCol: 'ontime_pu_opr', target: TARGET_KPIS['OPR'] ?? 90 },
  { key: 'd1st', label: '1st Deli', isDeli: true, totCol: 'mau_deli', totFallback: 'mau_del', ontCol: 'ontime_deli_1st', ontFallback: 'ontime_del_1st', target: TARGET_KPIS['1st Deli'] ?? 95 },
  { key: 'dodr', label: 'ODR', isDeli: true, totCol: 'mau_deli', totFallback: 'mau_del', ontCol: 'ontime_deli_odr', ontFallback: 'ontime_del_odr', target: TARGET_KPIS['ODR'] ?? 90 }
];

function filterByClient(rows, clientFilter) {
  return clientFilter === 'ALL' || !clientFilter ? rows : rows.filter(r => r.client_name === clientFilter);
}

function aggPct(rows, dateStr, totCol, totFallback, ontCol, ontFallback) {
  let tot = 0, ont = 0;
  rows.filter(r => r.report_date === dateStr).forEach(r => {
    tot += getRowVal(r, totCol, totFallback);
    ont += getRowVal(r, ontCol, ontFallback);
  });
  return { tot, ont, pct: tot > 0 ? (ont / tot) * 100 : null };
}

function d8Of(d1Str, datesArr) {
  if (!d1Str) return null;
  const p = d1Str.split('-');
  const d8Obj = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  d8Obj.setDate(d8Obj.getDate() - 7);
  const toStr = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  let d8Str = toStr(d8Obj);
  if (!datesArr.includes(d8Str)) {
    const unpadded = `${d8Obj.getFullYear()}-${d8Obj.getMonth() + 1}-${d8Obj.getDate()}`;
    if (datesArr.includes(unpadded)) d8Str = unpadded;
  }
  return datesArr.includes(d8Str) ? d8Str : null;
}

/**
 * Xếp hạng vùng/hub đáng chú ý nhất tại D-1, trên cả 4 chỉ số.
 * severity = khối lượng trễ × (1 + %lệch target/100) — vừa tính tới quy mô
 * (hub nhỏ lệch 100% nhưng chỉ 2 đơn không nên đứng đầu danh sách vận hành),
 * vừa tính tới mức độ lệch (không chỉ thuần khối lượng như risk-chip cũ).
 */
export function buildAttentionList(pickRows = [], deliRows = [], clientFilter = 'SPB', { limit = 10 } = {}) {
  const filteredPick = filterByClient(pickRows, clientFilter);
  const filteredDeli = filterByClient(deliRows, clientFilter);
  const pickDates = [...new Set(filteredPick.map(r => r.report_date))].sort();
  const deliDates = [...new Set(filteredDeli.map(r => r.report_date))].sort();
  const { d1Date: pD1 } = groupDatesByWeek(pickDates);
  const { d1Date: dD1 } = groupDatesByWeek(deliDates);

  const items = [];
  METRICS.forEach(m => {
    const rows = m.isDeli ? filteredDeli : filteredPick;
    const d1 = m.isDeli ? dD1 : pD1;
    if (!d1) return;
    rows.filter(r => r.report_date === d1).forEach(r => {
      const tot = getRowVal(r, m.totCol, m.totFallback);
      const ont = getRowVal(r, m.ontCol, m.ontFallback);
      if (!(tot > 0)) return;
      const pct = (ont / tot) * 100;
      if (pct >= m.target) return;
      const late = tot - ont;
      const gap = m.target - pct;
      items.push({
        hub: r.hub,
        region: r.region,
        mien: findMien(r.region),
        metric: m.label,
        metricKey: m.key,
        pct,
        target: m.target,
        tot,
        late,
        gap,
        severity: late * (1 + gap / 100)
      });
    });
  });

  return items.sort((a, b) => b.severity - a.severity).slice(0, limit);
}

/** Lệch KPI D-1 vs D-8 cho cả 4 chỉ số — dùng cho phần narrative. */
export function computeKpiDeltas(pickRows = [], deliRows = [], clientFilter = 'SPB') {
  const filteredPick = filterByClient(pickRows, clientFilter);
  const filteredDeli = filterByClient(deliRows, clientFilter);
  const pickDates = [...new Set(filteredPick.map(r => r.report_date))].sort();
  const deliDates = [...new Set(filteredDeli.map(r => r.report_date))].sort();
  const { d1Date: pD1 } = groupDatesByWeek(pickDates);
  const { d1Date: dD1 } = groupDatesByWeek(deliDates);
  const pD8 = d8Of(pD1, pickDates);
  const dD8 = d8Of(dD1, deliDates);

  return METRICS.map(m => {
    const rows = m.isDeli ? filteredDeli : filteredPick;
    const d1 = m.isDeli ? dD1 : pD1;
    const d8 = m.isDeli ? dD8 : pD8;
    const cur = d1 ? aggPct(rows, d1, m.totCol, m.totFallback, m.ontCol, m.ontFallback) : { pct: null, tot: 0, ont: 0 };
    const prev = d8 ? aggPct(rows, d8, m.totCol, m.totFallback, m.ontCol, m.ontFallback) : { pct: null };
    const delta = (cur.pct !== null && prev.pct !== null) ? cur.pct - prev.pct : null;
    return { ...m, d1, d8, current: cur, previous: prev, delta };
  });
}

/** Chặng/E2E leadtime hiện tại (ngày mới nhất có data) so với baseline 28 ngày. */
export function buildLeadtimeSignal(leadtimeRows = [], clientFilter = 'SPB') {
  const split = splitLeadtimeRows(leadtimeRows);
  const index = buildLeadtimeIndex(split.clean);
  const clients = resolveClients(clientFilter, index.clients);
  const latestDate = index.dates.length ? index.dates[index.dates.length - 1] : null;
  if (!latestDate || !clients.length) return null;

  const scopes = clients.map(scopeAll);
  const current = aggregate(index, scopes, latestDate, latestDate);
  const baseline = resolveBaseline(index, { scopeKeys: scopes, periodStart: latestDate });
  const thresholds = THRESHOLD_PRESETS[DEFAULT_PRESET];

  const stages = STAGE_KEYS.map(key => {
    const cur = current.stages[key].value;
    const base = baseline.stages[key].value;
    return {
      key,
      label: STAGE_CONFIG[key].label,
      current: cur,
      baseline: base,
      baselineDays: baseline.stages[key].dayCount,
      ...classifyDeviation(cur, base, thresholds)
    };
  });

  const e2e = {
    current: current.e2e,
    baseline: baseline.e2e.value,
    baselineDays: baseline.e2e.dayCount,
    ...classifyDeviation(current.e2e, baseline.e2e.value, thresholds)
  };

  return { date: latestDate, stages, e2e, mau: current.mau };
}

/**
 * Câu chuyện "vì sao": với mỗi KPI D-1 vs D-8 xấu đi đáng kể (≥0.5pp), tìm
 * chặng leadtime lệch baseline nhiều nhất theo hướng xấu (tăng giờ) — nếu có,
 * ghép thành 1 câu tương quan. Không có leadtime lệch đáng kể thì chỉ nêu
 * KPI, không gượng ép nguyên nhân.
 */
export function buildNarrative({ pickRows = [], deliRows = [], leadtimeRows = [], clientFilter = 'SPB' }) {
  const deltas = computeKpiDeltas(pickRows, deliRows, clientFilter);
  const leadtimeSignal = buildLeadtimeSignal(leadtimeRows, clientFilter);

  const worstStage = leadtimeSignal
    ? [...leadtimeSignal.stages].filter(s => s.direction === 'up' && s.level !== 'normal')
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0]
    : null;

  const bullets = [];
  deltas.forEach(m => {
    if (m.delta === null) return;
    const worse = m.isDeli ? m.delta < -0.5 : m.delta < -0.5; // giảm = xấu cho cả 4 metric (đều là % ontime)
    if (!worse) return;
    const d1Label = m.d1 ? `${m.d1.slice(8, 10)}/${m.d1.slice(5, 7)}` : '?';
    const d8Label = m.d8 ? `${m.d8.slice(8, 10)}/${m.d8.slice(5, 7)}` : '?';
    let sentence = `${m.label} giảm ${Math.abs(m.delta).toFixed(1)}pp (${d1Label} so với ${d8Label}: ${m.current.pct?.toFixed(1)}% vs ${m.previous.pct?.toFixed(1)}%).`;
    if (worstStage && worstStage.pct !== null) {
      sentence += ` Cùng giai đoạn, chặng ${worstStage.label} đang cao hơn bình thường ${worstStage.pct > 0 ? '+' : ''}${worstStage.pct.toFixed(0)}% so với baseline 28 ngày — có thể là một phần nguyên nhân.`;
    }
    bullets.push(sentence);
  });

  const okAll = deltas.every(m => m.delta === null || m.delta >= -0.5);

  return {
    clientLabel: clientFilter === 'ALL' ? 'SPB + SPE' : getClientLabel(clientFilter),
    bullets,
    okAll,
    leadtimeSignal,
    caveat: 'Đây là tương quan theo thời gian (cùng client, cùng giai đoạn D-1 vs D-8) — chưa phải quan hệ nhân quả đã kiểm chứng ở cấp vùng/hub cụ thể. Dùng để gợi ý hướng điều tra, không phải kết luận cuối.'
  };
}
