import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useLeadtimeReveal } from './useLeadtimeReveal';

import {
  STAGE_KEYS, THRESHOLD_PRESETS, DEFAULT_PRESET, BASELINE_CONFIG,
  splitLeadtimeRows, buildLeadtimeIndex, aggregate, aggregateByDate,
  resolveBaseline, classifyDeviation, stageImpact, shiftDate,
  scopeAll, scopeLane
} from '../../utils/leadtimeCalc';
import { resolveClients } from '../../utils/clientLabels';

import LeadtimeFilterBar from './LeadtimeFilterBar';
import LeadtimeVerdict from './LeadtimeVerdict';
import LeadtimeStageCards from './LeadtimeStageCards';
import LeadtimeTrendChart from './LeadtimeTrendChart';
import LeadtimeLaneChart from './LeadtimeLaneChart';
import LeadtimeTopLanes from './LeadtimeTopLanes';
import LeadtimeDetailTable from './LeadtimeDetailTable';
import LeadtimeDataQuality from './LeadtimeDataQuality';
import StatusNotice from '../ui/StatusNotice';

const TREND_WINDOW = 28;

/**
 * Tab "Leadtime từng chặng".
 *
 * Bố cục 2 lớp trên cùng một trang (tab dùng cho cả high level và mid level):
 *   Lớp 1 — luôn mở : kết luận + 5 KPI card + trend + cấu trúc theo lane
 *   Lớp 2 — collapse: top tuyến + bảng chi tiết + chất lượng dữ liệu
 * Cùng một bộ filter cho cả 2 lớp nên số không bao giờ lệch nhau.
 */
export default function ReportLeadtime({
  leadtimeRows = [],
  clientFilter = 'ALL',
  density = 'comfortable',
  dataSource = 'mock',
  syncedAt = null
}) {
  // --- chuẩn hoá + index: chỉ chạy lại khi dữ liệu nguồn đổi ---------------
  const split = useMemo(() => splitLeadtimeRows(leadtimeRows), [leadtimeRows]);
  const index = useMemo(() => buildLeadtimeIndex(split.clean), [split.clean]);

  const allDates = index.dates;
  const latestDate = allDates.length ? allDates[allDates.length - 1] : '';
  const earliestDate = allDates.length ? allDates[0] : '';

  const clients = useMemo(
    () => resolveClients(clientFilter, index.clients),
    [clientFilter, index.clients]
  );

  // --- filter state --------------------------------------------------------
  const [period, setPeriod] = useState({ preset: 'd1', from: '', to: '' });
  const [presetKey, setPresetKey] = useState(DEFAULT_PRESET);
  const [laneFilter, setLaneFilter] = useState('ALL');
  const [pairFilter, setPairFilter] = useState('ALL');
  const [openLayer2, setOpenLayer2] = useState(false);

  // Khởi tạo / đồng bộ lại kỳ khi dữ liệu đổi. KHÔNG ép ngày về latestDate mỗi
  // lần render — người dùng chọn ngày nào thì giữ nguyên ngày đó (audit A3).
  useEffect(() => {
    if (!latestDate) return;
    setPeriod(prev => (prev.from && prev.to ? prev : { preset: 'd1', from: latestDate, to: latestDate }));
  }, [latestDate]);

  const thresholds = THRESHOLD_PRESETS[presetKey] || THRESHOLD_PRESETS[DEFAULT_PRESET];
  const from = period.from || latestDate;
  const to = period.to || latestDate;

  const handlePeriodChange = useCallback((next) => {
    setPeriod(next);
  }, []);

  // --- lớp 1: tổng thể ----------------------------------------------------
  const overall = useMemo(() => {
    if (!clients.length || !from) return null;
    const scopes = clients.map(scopeAll);
    const current = aggregate(index, scopes, from, to);
    const baseline = resolveBaseline(index, { scopeKeys: scopes, periodStart: from });
    const stages = {};
    for (const key of STAGE_KEYS) {
      const cur = current.stages[key].value;
      const base = baseline.stages[key].value;
      stages[key] = {
        value: cur,
        mau: current.stages[key].mau,
        baseline: base,
        baselineDays: baseline.stages[key].dayCount,
        baselineLevel: baseline.stages[key].level,
        ...classifyDeviation(cur, base, thresholds)
      };
    }
    const e2e = {
      value: current.e2e,
      baseline: baseline.e2e.value,
      baselineDays: baseline.e2e.dayCount,
      ...classifyDeviation(current.e2e, baseline.e2e.value, thresholds)
    };
    return { current, stages, e2e, mau: current.mau, sumOfStages: current.sumOfStages };
  }, [index, clients, from, to, thresholds]);

  // Trend: luôn lấy TREND_WINDOW ngày tính tới `to`, độc lập với độ dài kỳ đang xem.
  const trend = useMemo(() => {
    if (!clients.length || !to) return [];
    const scopes = clients.map(scopeAll);
    return aggregateByDate(index, scopes, shiftDate(to, -(TREND_WINDOW - 1)), to);
  }, [index, clients, to]);

  // --- lớp 1: theo lane ---------------------------------------------------
  const laneBreakdown = useMemo(() => {
    if (!clients.length || !from) return [];
    return clients.map(client => ({
      client,
      lanes: index.lanes.map(lane => {
        const key = scopeLane(client, lane.key);
        const current = aggregate(index, key, from, to);
        const baseline = resolveBaseline(index, { scopeKeys: key, periodStart: from });
        const stages = {};
        for (const s of STAGE_KEYS) {
          stages[s] = {
            value: current.stages[s].value,
            baseline: baseline.stages[s].value,
            baselineDays: baseline.stages[s].dayCount,
            ...classifyDeviation(current.stages[s].value, baseline.stages[s].value, thresholds)
          };
        }
        return { lane, mau: current.mau, e2e: current.e2e, sumOfStages: current.sumOfStages, stages };
      }).filter(row => row.mau > 0)
    })).filter(group => group.lanes.length > 0);
  }, [index, clients, from, to, thresholds]);

  // --- lớp 2: theo tuyến --------------------------------------------------
  const pairRows = useMemo(() => {
    if (!clients.length || !from) return [];
    const clientSet = new Set(clients);
    const out = [];
    for (const meta of index.pairMeta.values()) {
      if (!clientSet.has(meta.client)) continue;
      if (laneFilter !== 'ALL' && meta.laneKey !== laneFilter) continue;
      const current = aggregate(index, meta.key, from, to);
      if (!(current.mau > 0)) continue;
      const baseline = resolveBaseline(index, {
        scopeKeys: meta.key,
        fallbackScopeKeys: scopeLane(meta.client, meta.laneKey),
        periodStart: from
      });
      const stages = {};
      let worstImpact = 0;
      let worstStage = null;
      let level = 'normal';
      let suspectData = false;
      for (const s of STAGE_KEYS) {
        const cur = current.stages[s].value;
        const base = baseline.stages[s].value;
        const cls = classifyDeviation(cur, base, thresholds);
        const impact = stageImpact(current.stages[s].mau, cur, base);
        stages[s] = {
          value: cur, baseline: base, baselineDays: baseline.stages[s].dayCount,
          baselineLevel: baseline.stages[s].level, impact, ...cls
        };
        if (impact > worstImpact) {
          worstImpact = impact;
          worstStage = s;
        }
        if (cls.level === 'critical') level = 'critical';
        else if (cls.level === 'warning' && level !== 'critical') level = 'warning';
        if (cls.suspectData) suspectData = true;
      }
      const e2eCls = classifyDeviation(current.e2e, baseline.e2e.value, thresholds);
      out.push({
        ...meta,
        mau: current.mau,
        e2e: current.e2e,
        e2eInfo: {
          value: current.e2e, baseline: baseline.e2e.value,
          baselineDays: baseline.e2e.dayCount, baselineLevel: baseline.e2e.level,
          ...e2eCls
        },
        sumOfStages: current.sumOfStages,
        baselineLevel: baseline.level,
        stages, worstStage, worstImpact, level, suspectData,
        lowSample: current.mau < BASELINE_CONFIG.minMau
      });
    }
    return out;
  }, [index, clients, from, to, laneFilter, thresholds]);

  const topLanes = useMemo(
    () => pairRows
      .filter(r => !r.lowSample && r.worstImpact > 0)
      .sort((a, b) => b.worstImpact - a.worstImpact)
      .slice(0, 10),
    [pairRows]
  );

  // Nút thắt toàn mạng: chặng có tổng impact lớn nhất (giờ trễ cộng dồn), không
  // phải chặng có % lệch lớn nhất.
  const bottleneck = useMemo(() => {
    if (!pairRows.length) return null;
    const byStage = new Map(STAGE_KEYS.map(s => [s, { impact: 0, mau: 0 }]));
    for (const row of pairRows) {
      if (row.lowSample) continue;
      for (const s of STAGE_KEYS) {
        const slot = byStage.get(s);
        if (row.stages[s].impact > 0) {
          slot.impact += row.stages[s].impact;
          slot.mau += row.mau;
        }
      }
    }
    let best = null;
    for (const [stage, v] of byStage) {
      if (!best || v.impact > best.impact) best = { stage, ...v };
    }
    if (!best || best.impact <= 0) return null;
    const worstPair = topLanes.find(r => r.worstStage === best.stage) || topLanes[0] || null;
    return { ...best, pair: worstPair };
  }, [pairRows, topLanes]);

  const alertCount = useMemo(
    () => pairRows.filter(r => !r.lowSample && (r.level === 'warning' || r.level === 'critical')).length,
    [pairRows]
  );

  const availablePairs = useMemo(() => {
    const seen = new Map();
    for (const r of pairRows) {
      const label = `${r.from} → ${r.to}`;
      if (!seen.has(label)) seen.set(label, { label, from: r.from, to: r.to });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [pairRows]);

  const visiblePairRows = useMemo(
    () => (pairFilter === 'ALL' ? pairRows : pairRows.filter(r => `${r.from} → ${r.to}` === pairFilter)),
    [pairRows, pairFilter]
  );

  // --- reveal khi cuộn -----------------------------------------------------
  // Phải gọi TRƯỚC các early return bên dưới (rule of hooks). resetKey chỉ đổi
  // khi TẬP KHỐI được render đổi (có dữ liệu ↔ rỗng ↔ không có client) — không
  // gắn vào from/to, nếu không mỗi lần đổi ngày là cả trang fade lại một lượt.
  const ltRootRef = useRef(null);
  const hasContent = !!overall && overall.mau > 0 && clients.length > 0;
  useLeadtimeReveal(ltRootRef, hasContent, openLayer2);

  // --- empty state --------------------------------------------------------
  if (!allDates.length) {
    return (
      <div className="lt-root">
        <StatusNotice tone="warning">
          <strong>Chưa có dữ liệu leadtime.</strong> Không đọc được dòng nào từ nguồn. Nếu vừa
          đổi nguồn, bấm "Tải lại" trên thanh header; nếu vẫn trống thì bảng{' '}
          <code>kas_leadtime_data</code> chưa được đồng bộ.
        </StatusNotice>
      </div>
    );
  }

  const dateHasData = allDates.includes(from) || from !== to;
  const isEmptyPeriod = !overall || !(overall.mau > 0);

  return (
    <div ref={ltRootRef} className={`lt-root density-${density}`}>
      {dataSource === 'mock' && (
        <StatusNotice tone="warning">
          <strong>Đang hiển thị dữ liệu mẫu.</strong> Mẫu cắt từ output thật
          ({allDates.length} ngày, một phần tệp tuyến) — không phải số toàn mạng.
          Chưa đồng bộ được bảng <code>kas_leadtime_data</code>.
        </StatusNotice>
      )}

      <LeadtimeFilterBar
        allDates={allDates}
        earliestDate={earliestDate}
        latestDate={latestDate}
        period={period}
        onPeriodChange={handlePeriodChange}
        presetKey={presetKey}
        onPresetChange={setPresetKey}
        lanes={index.lanes}
        laneFilter={laneFilter}
        onLaneChange={(v) => { setLaneFilter(v); setPairFilter('ALL'); }}
        pairs={availablePairs}
        pairFilter={pairFilter}
        onPairChange={setPairFilter}
        clients={clients}
        clientFilter={clientFilter}
        dataSource={dataSource}
        syncedAt={syncedAt}
        dateHasData={dateHasData}
      />

      {!clients.length ? (
        <StatusNotice tone="info">
          <strong>Không có khách hàng nào để hiển thị.</strong> Bộ lọc Client trên header đang
          chọn một khách hàng không có dữ liệu leadtime.
        </StatusNotice>
      ) : isEmptyPeriod ? (
        <StatusNotice tone="info">
          <strong>Kỳ {from === to ? from : `${from} → ${to}`} không có dữ liệu.</strong>{' '}
          {allDates.includes(from)
            ? 'Bộ lọc lane hoặc tuyến đang loại hết dữ liệu của kỳ này.'
            : `Dữ liệu hiện có từ ${earliestDate} đến ${latestDate}.`}
        </StatusNotice>
      ) : (
        <>
          <LeadtimeVerdict
            from={from}
            to={to}
            clients={clients}
            overall={overall}
            bottleneck={bottleneck}
            alertCount={alertCount}
            thresholds={thresholds}
          />

          <LeadtimeStageCards overall={overall} trend={trend} />

          <LeadtimeTrendChart data={trend} windowDays={TREND_WINDOW} periodFrom={from} periodTo={to} />

          <LeadtimeLaneChart groups={laneBreakdown} />

          <section className="lt-layer2">
            <button
              type="button"
              className="lt-layer2-toggle"
              onClick={() => setOpenLayer2(v => !v)}
              aria-expanded={openLayer2}
            >
              {openLayer2 ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>Đào sâu theo tuyến</span>
              <span className="lt-layer2-hint">
                {visiblePairRows.length.toLocaleString('vi-VN')} tuyến
                {alertCount > 0 ? ` · ${alertCount} vượt ngưỡng` : ''}
              </span>
            </button>

            {openLayer2 && (
              <div className="lt-layer2-body">
                <LeadtimeTopLanes
                  rows={topLanes}
                  onSelect={(row) => setPairFilter(`${row.from} → ${row.to}`)}
                />
                <LeadtimeDetailTable
                  rows={visiblePairRows}
                  lanes={index.lanes}
                  multiDay={from !== to}
                  onClearPairFilter={pairFilter !== 'ALL' ? () => setPairFilter('ALL') : null}
                />
                <LeadtimeDataQuality
                  missingStage={split.missingStage}
                  unresolvedLane={split.unresolvedLane}
                  cleanCount={split.clean.length}
                  pairRows={pairRows}
                  trend={trend}
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
