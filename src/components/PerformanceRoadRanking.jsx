import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Truck,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  ExternalLink,
  Search,
  X,
  Info,
  MapPin,
  Calendar,
  Building2
} from 'lucide-react';
import {
  calculatePerformanceRanking,
  SUPPORTED_KPIS,
  SMALL_SAMPLE_THRESHOLD,
  getMetricDef
} from '../utils/performanceRanking.js';
import { formatPct, formatVol, formatDiff, formatDateLabel } from '../utils/dataProcessor.js';

// SVG Vector Delivery Truck component
function DeliveryTruckIcon({ rank, isSelected, meetsTarget: _meetsTarget }) {
  const isTop1 = rank === 1;
  const isTop2 = rank === 2;
  const isTop3 = rank === 3;

  const cabColor = isSelected ? '#0ea5c4' : '#ffffff';
  const cargoColor = isSelected ? '#0284c7' : '#1e293b';
  const stripeColor = '#f15a22'; // GHN signature orange
  const wheelColor = '#0f172a';
  const rimColor = '#94a3b8';
  const windowColor = isSelected ? '#bae6fd' : '#94a3b8';

  const badgeBg = isTop1 ? '#f59e0b' : isTop2 ? '#94a3b8' : isTop3 ? '#d97706' : '#334155';
  const badgeBorder = isTop1 ? '#fbbf24' : isTop2 ? '#cbd5e1' : isTop3 ? '#f59e0b' : '#475569';

  return (
    <svg width="78" height="46" viewBox="0 0 78 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="truck-svg">
      <defs>
        <filter id={`truck-shadow-${rank}`} x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.28" />
        </filter>
      </defs>
      <g filter={`url(#truck-shadow-${rank})`}>
        {/* Cargo Body (thùng xe tải) */}
        <rect x="2" y="10" width="46" height="24" rx="3" fill={cargoColor} />
        {/* GHN Orange Brand Stripe */}
        <rect x="2" y="22" width="46" height="4" fill={stripeColor} />
        {/* Cargo Door line */}
        <line x1="14" y1="10" x2="14" y2="34" stroke="#475569" strokeWidth="1" strokeDasharray="1 1" />
        <line x1="34" y1="10" x2="34" y2="34" stroke="#475569" strokeWidth="1" strokeDasharray="1 1" />

        {/* Cabin (đầu xe) */}
        <path d="M48 16H66C68 16 71 18 72 21L75 27C75.5 28 76 29 76 30V34H48V16Z" fill={cabColor} />
        {/* Windshield (kính chắn gió) */}
        <path d="M56 18H65C66.5 18 68 19.5 69 22L71 26H56V18Z" fill={windowColor} />
        {/* Headlight (đèn pha) */}
        <rect x="74" y="29" width="2.5" height="3.5" rx="1" fill="#fef08a" />
        {/* Front bumper */}
        <rect x="73" y="32" width="4" height="2.5" rx="1" fill="#64748b" />

        {/* Wheels (Bánh xe) */}
        {/* Rear Wheel 1 */}
        <circle cx="12" cy="34" r="6" fill={wheelColor} />
        <circle cx="12" cy="34" r="3" fill={rimColor} />
        {/* Rear Wheel 2 */}
        <circle cx="26" cy="34" r="6" fill={wheelColor} />
        <circle cx="26" cy="34" r="3" fill={rimColor} />
        {/* Front Wheel */}
        <circle cx="63" cy="34" r="6" fill={wheelColor} />
        <circle cx="63" cy="34" r="3" fill={rimColor} />

        {/* Rank Crown/Badge on roof */}
        <rect x="18" y="2" width="18" height="9" rx="4.5" fill={badgeBg} stroke={badgeBorder} strokeWidth="1" />
        <text x="27" y="8.5" fill="#ffffff" fontSize="6.5" fontWeight="bold" fontFamily="Outfit, sans-serif" textAnchor="middle">
          #{rank}
        </text>
      </g>
    </svg>
  );
}

export default function PerformanceRoadRanking({
  pickRows = [],
  deliRows = [],
  clientFilter = 'ALL',
  selectedRegions = null,
  selectedHubTypes = null,
  onJumpToReport1,
  density = 'comfortable'
}) {
  const [metricKey, setMetricKey] = useState('p1st');
  const [selectedHubId, setSelectedHubId] = useState(null);
  const [sceneDisplayLimit, setSceneDisplayLimit] = useState('20'); // '10' | '20' | 'ALL'
  const [searchFilter, setSearchFilter] = useState('');

  const roadContainerRef = useRef(null);
  const truckElementsRef = useRef(new Map());
  const tableRowRefs = useRef(new Map());

  // Calculate ranking contract
  const rankingData = useMemo(() => {
    return calculatePerformanceRanking({
      pickRows,
      deliRows,
      metricKey,
      clientFilter,
      selectedRegions,
      selectedHubTypes
    });
  }, [pickRows, deliRows, metricKey, clientFilter, selectedRegions, selectedHubTypes]);

  const {
    metricLabel,
    target,
    d1Date,
    d8Date,
    ranked,
    unranked,
    totalCount,
    rankedCount,
    unrankedCount,
    scopeEmpty
  } = rankingData;

  // Hubs visible on the road scene
  const sceneTrucks = useMemo(() => {
    let baseList = ranked;
    if (sceneDisplayLimit === '10') {
      baseList = ranked.slice(0, 10);
    } else if (sceneDisplayLimit === '20') {
      baseList = ranked.slice(0, 20);
    }
    // If selected hub is outside the slice, append it so it stays visible in the scene
    if (selectedHubId && !baseList.some(h => h.id === selectedHubId)) {
      const extra = ranked.find(h => h.id === selectedHubId);
      if (extra) {
        return [...baseList, extra].sort((a, b) => a.rank - b.rank);
      }
    }
    return baseList;
  }, [ranked, sceneDisplayLimit, selectedHubId]);

  // Selected Hub entity (searches both ranked and unranked)
  const selectedHubItem = useMemo(() => {
    if (!selectedHubId) return null;
    return ranked.find(h => h.id === selectedHubId) || unranked.find(h => h.id === selectedHubId) || null;
  }, [selectedHubId, ranked, unranked]);

  // Filtered list for audit table based on search input
  const filteredTableRanked = useMemo(() => {
    if (!searchFilter.trim()) return ranked;
    const q = searchFilter.trim().toLowerCase();
    return ranked.filter(h =>
      h.hub.toLowerCase().includes(q) ||
      (h.displayName && h.displayName.toLowerCase().includes(q)) ||
      (h.region && h.region.toLowerCase().includes(q)) ||
      (h.hubType && h.hubType.toLowerCase().includes(q))
    );
  }, [ranked, searchFilter]);

  const filteredTableUnranked = useMemo(() => {
    if (!searchFilter.trim()) return unranked;
    const q = searchFilter.trim().toLowerCase();
    return unranked.filter(h =>
      h.hub.toLowerCase().includes(q) ||
      (h.displayName && h.displayName.toLowerCase().includes(q)) ||
      (h.region && h.region.toLowerCase().includes(q)) ||
      (h.hubType && h.hubType.toLowerCase().includes(q))
    );
  }, [unranked, searchFilter]);

  // Select / deselect a Hub by composite ID
  const handleSelectHub = useCallback((hubId) => {
    setSelectedHubId(prev => (prev === hubId ? null : hubId));
  }, []);

  // Keyboard navigation: Escape key deselects
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedHubId) {
        setSelectedHubId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedHubId]);

  // Smooth scroll scene to selected truck
  useEffect(() => {
    if (!selectedHubId || !roadContainerRef.current) return;
    const truckEl = truckElementsRef.current.get(selectedHubId);
    if (truckEl && roadContainerRef.current) {
      const container = roadContainerRef.current;
      const truckLeft = truckEl.offsetLeft;
      const truckWidth = truckEl.offsetWidth;
      const containerWidth = container.clientWidth;
      const targetScrollLeft = truckLeft - (containerWidth / 2) + (truckWidth / 2);

      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    }
  }, [selectedHubId]);

  // Handle drill-down CTA "Mở chi tiết Hub"
  const handleDrillDown = useCallback(() => {
    if (!selectedHubItem) return;
    if (typeof onJumpToReport1 === 'function') {
      onJumpToReport1({
        hubId: selectedHubItem.id,
        hub: selectedHubItem.hub,
        region: selectedHubItem.region,
        hubType: selectedHubItem.hubType,
        metricKey
      });
    } else {
      // Dispatch fallback custom event matching App pattern
      window.dispatchEvent(new CustomEvent('jump-to-region', {
        detail: {
          region: selectedHubItem.region,
          hub: selectedHubItem.hub,
          hubId: selectedHubItem.id,
          hubType: selectedHubItem.hubType,
          metricKey
        }
      }));
    }
  }, [selectedHubItem, metricKey, onJumpToReport1]);

  // Format dates for display
  const d1Formatted = d1Date ? formatDateLabel(d1Date).replace('\n', ' ') : 'Chưa có ngày';
  const d8Formatted = d8Date ? formatDateLabel(d8Date).replace('\n', ' ') : null;

  return (
    <div className={`performance-road-ranking-tab ${density === 'compact' ? 'density-compact' : ''}`}>
      {/* 1. Header & Controls Section */}
      <section className="prr-header-card">
        <div className="prr-header-row">
          <div>
            <div className="prr-badge-pill">
              <Truck size={14} className="text-cyan" />
              <span>Vận hành Tuyến & Trạm GHN</span>
            </div>
            <h1 className="prr-title">BXH Performance</h1>
            <p className="prr-subtitle">
              Vị trí xe thể hiện thứ hạng; số liệu quyết định hiển thị bên dưới.
            </p>
          </div>

          {/* Scope context summary */}
          <div className="prr-scope-summary">
            <div className="prr-scope-chip" title="Client scope">
              <span className="scope-chip-label">Client:</span>
              <strong>{clientFilter === 'ALL' ? 'SPB + SPE' : clientFilter}</strong>
            </div>
            <div className="prr-scope-chip" title="Vùng scope">
              <MapPin size={13} />
              <span>{Array.isArray(selectedRegions) ? `${selectedRegions.length} vùng` : 'Tất cả vùng'}</span>
            </div>
            <div className="prr-scope-chip" title="Loại Hub scope">
              <Building2 size={13} />
              <span>{Array.isArray(selectedHubTypes) ? `${selectedHubTypes.length} loại` : 'Tất cả loại Hub'}</span>
            </div>
            <div className="prr-scope-chip highlight" title="Ngày dữ liệu D-1">
              <Calendar size={13} />
              <span>D-1: {d1Formatted}</span>
              {d8Formatted && <span className="text-muted text-xs">(vs D-8: {d8Formatted})</span>}
            </div>
          </div>
        </div>

        {/* KPI Selector & Legend */}
        <div className="prr-controls-bar">
          <div className="prr-kpi-selector" role="tablist" aria-label="Chọn KPI xếp hạng">
            {SUPPORTED_KPIS.map(kpi => {
              const isActive = metricKey === kpi.id;
              const def = getMetricDef(kpi.id);
              return (
                <button
                  key={kpi.id}
                  role="tab"
                  aria-selected={isActive}
                  className={`prr-kpi-tab ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setMetricKey(kpi.id);
                    setSelectedHubId(null);
                  }}
                >
                  <span className="kpi-tab-label">{kpi.label}</span>
                  <span className="kpi-tab-target">Mục tiêu: {def.target}%</span>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="prr-legend-box">
            <div className="prr-legend-item">
              <span className="legend-dot meets-target" />
              <span>Đạt mục tiêu ({target}%)</span>
            </div>
            <div className="prr-legend-item">
              <span className="legend-dot below-target" />
              <span>Chưa đạt</span>
            </div>
            <div className="prr-legend-item">
              <span className="legend-icon-badge up"><ArrowUp size={11} /></span>
              <span>Thăng hạng</span>
            </div>
            <div className="prr-legend-item">
              <span className="legend-icon-badge down"><ArrowDown size={11} /></span>
              <span>Tụt hạng</span>
            </div>
            <div className="prr-legend-item" title={`Số đơn D-1 dưới ${SMALL_SAMPLE_THRESHOLD} đơn`}>
              <AlertTriangle size={13} className="text-warning" />
              <span>Cảnh báo mẫu &lt;{SMALL_SAMPLE_THRESHOLD}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Visual Delivery Road Scene Section */}
      <section className="prr-scene-card" aria-label="Tuyến đường xếp hạng Hub">
        <div className="prr-scene-toolbar">
          <div className="scene-toolbar-left">
            <span className="scene-toolbar-title">Tuyến đường Vận chuyển ({metricLabel})</span>
            <span className="scene-toolbar-meta">
              Đang hiển thị <strong>{sceneTrucks.length}</strong> / {rankedCount} xe trên đường
            </span>
          </div>

          <div className="scene-toolbar-right">
            <span className="scene-limit-label">Hiển thị trên đường:</span>
            <div className="prr-segmented-limit">
              <button
                type="button"
                className={`seg-btn ${sceneDisplayLimit === '10' ? 'active' : ''}`}
                onClick={() => setSceneDisplayLimit('10')}
              >
                Top 10
              </button>
              <button
                type="button"
                className={`seg-btn ${sceneDisplayLimit === '20' ? 'active' : ''}`}
                onClick={() => setSceneDisplayLimit('20')}
              >
                Top 20
              </button>
              <button
                type="button"
                className={`seg-btn ${sceneDisplayLimit === 'ALL' ? 'active' : ''}`}
                onClick={() => setSceneDisplayLimit('ALL')}
              >
                Tất cả ({rankedCount})
              </button>
            </div>
          </div>
        </div>

        {/* Empty Scope / No data notice */}
        {scopeEmpty || sceneTrucks.length === 0 ? (
          <div className="prr-scene-empty">
            <Truck size={42} className="text-muted mb-2" />
            <h3>Không có Hub nào phù hợp với bộ lọc hiện tại</h3>
            <p className="text-muted">
              {scopeEmpty
                ? 'Bộ lọc Vùng hoặc Loại Hub đang chọn rỗng. Vui lòng chọn ít nhất một Vùng hoặc Loại Hub để xem xếp hạng.'
                : 'Không tìm thấy dữ liệu vận hành nào cho điều kiện lọc đã chọn.'}
            </p>
          </div>
        ) : (
          <div className="prr-road-viewport" ref={roadContainerRef}>
            {/* The Road Surface */}
            <div
              className="prr-road-canvas"
              style={{
                // Scale width smoothly with number of trucks to ensure optimal readability
                minWidth: `${Math.max(1100, sceneTrucks.length * 115)}px`
              }}
            >
              {/* Road scenery: neutral operational checkpoints (no race track/F1 elements) */}
              <div className="prr-road-scenery">
                <div className="scenery-checkpoint start">
                  <span className="checkpoint-marker" />
                  <span>Điểm tiếp nhận &amp; điều phối</span>
                </div>
                <div className="scenery-checkpoint mid">
                  <span className="checkpoint-marker" />
                  <span>Hành lang kiểm soát KPI D-1</span>
                </div>
                <div className="scenery-checkpoint sla">
                  <div className="sla-badge">
                    <span className="sla-label">Mốc chuẩn SLA</span>
                  </div>
                  <div className="sla-baseline-line" />
                </div>
              </div>

              {/* 4 Lanes with dashed markings */}
              <div className="prr-lanes-container">
                <div className="prr-lane lane-1" />
                <div className="prr-lane lane-2" />
                <div className="prr-lane lane-3" />
                <div className="prr-lane lane-4" />
              </div>

              {/* Delivery Trucks */}
              {sceneTrucks.map((item, idx) => {
                const rank = item.rank;
                const isSelected = selectedHubId === item.id;
                const totalVisible = sceneTrucks.length;

                // Calibrated rank-based positioning:
                // idx is the slot index in sceneTrucks (sorted by rank: idx 0 is highest rank).
                // Using idx / (totalVisible - 1) guarantees monotonic progress [0, 1]
                // and keeps coordinates strictly within bounds [5%, 88%] with NO negative coordinates.
                const startPercent = 5;
                const endPercent = 88;
                const rankProgress = totalVisible > 1
                  ? 1 - (idx / (totalVisible - 1))
                  : 0.5;
                const leftPos = startPercent + (rankProgress * (endPercent - startPercent));

                // 4-Lane alternating distribution to prevent vertical collisions
                const laneOrder = [0, 2, 1, 3];
                const laneIdx = laneOrder[idx % 4];
                const topPos = 14 + (laneIdx * 64);

                return (
                  <button
                    type="button"
                    key={item.id}
                    ref={el => {
                      if (el) truckElementsRef.current.set(item.id, el);
                      else truckElementsRef.current.delete(item.id);
                    }}
                    aria-pressed={isSelected}
                    aria-label={`Hub ${item.displayName || item.hub}, Vùng ${item.region}, Hạng ${rank}, KPI ${item.kpiD1.toFixed(1)}%`}
                    className={`prr-truck-node prr-truck-btn ${isSelected ? 'is-selected' : ''}`}
                    style={{
                      left: `${leftPos}%`,
                      top: `${topPos}px`,
                      zIndex: isSelected ? 80 : 20 + laneIdx
                    }}
                    onClick={() => handleSelectHub(item.id)}
                  >
                    {/* Floating Info Tag above truck */}
                    <div className={`prr-truck-tag ${item.meetsTarget ? 'tag-good' : 'tag-below'}`}>
                      <div className="truck-tag-row">
                        <span className="truck-tag-rank">#{rank}</span>
                        <span className="truck-tag-name" title={item.displayName || item.hub}>
                          {item.displayName || item.hub}
                        </span>
                      </div>
                      <div className="truck-tag-metric">
                        <strong className="kpi-value">{item.kpiD1.toFixed(1)}%</strong>
                        {item.hasCommonBaseline === false ? (
                          <span className="truck-tag-delta none" title="Chưa có baseline D-8 trong nhóm đối soát chung">
                            Mới
                          </span>
                        ) : item.deltaRank !== null && item.deltaRank !== 0 ? (
                          <span className={`truck-tag-delta ${item.deltaRank > 0 ? 'up' : 'down'}`}>
                            {item.deltaRank > 0 ? `+${item.deltaRank}` : item.deltaRank}
                          </span>
                        ) : null}
                        {item.isSmallSample && (
                          <span className="truck-tag-warning" title={`Mẫu ít (<${SMALL_SAMPLE_THRESHOLD} đơn, ngưỡng cấu hình tạm tính)`}>
                            !
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Vector Truck SVG */}
                    <DeliveryTruckIcon
                      rank={rank}
                      isSelected={isSelected}
                      meetsTarget={item.meetsTarget}
                    />

                    {/* Selected Spotlight Glow */}
                    {isSelected && <div className="truck-spotlight" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 3. Selected Hub Insight Detail Panel */}
      {selectedHubItem && (
        <section className="prr-insight-panel animate-fade-in" aria-label="Chi tiết Hub được chọn">
          <div className="insight-panel-header">
            <div className="insight-hub-identity">
              <div className="hub-avatar-badge">
                <Truck size={20} className="text-cyan" />
                <span className="hub-avatar-rank">
                  {selectedHubItem.rank ? `#${selectedHubItem.rank}` : '–'}
                </span>
              </div>
              <div>
                <h3 className="insight-hub-title">{selectedHubItem.displayName || selectedHubItem.hub}</h3>
                <div className="insight-hub-tags">
                  <span className="meta-tag"><MapPin size={12} /> {selectedHubItem.region}</span>
                  <span className="meta-tag"><Building2 size={12} /> {selectedHubItem.hubType}</span>
                  <span className={`status-pill ${selectedHubItem.meetsTarget ? 'is-good' : selectedHubItem.hasData ? 'is-bad' : 'is-none'}`}>
                    {selectedHubItem.meetsTarget ? 'Đạt chuẩn KPI' : selectedHubItem.hasData ? 'Dưới mục tiêu' : 'Chưa đủ dữ liệu'}
                  </span>
                  {selectedHubItem.isSmallSample && (
                    <span className="status-pill is-warning" title="Mẫu D-1 nhỏ, cần thận trọng khi đánh giá">
                      <AlertTriangle size={12} /> Mẫu &lt;{SMALL_SAMPLE_THRESHOLD} đơn
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="insight-panel-actions">
              <button
                type="button"
                className="btn-primary-sleek"
                onClick={handleDrillDown}
                title="Mở chi tiết Hub trong Report 1"
              >
                <span>Mở chi tiết Hub</span>
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setSelectedHubId(null)}
                aria-label="Đóng chi tiết Hub (ESC)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Metric Stats Cards in Insight Panel */}
          <div className="insight-stats-grid">
            <div className="insight-stat-card">
              <span className="stat-label">{metricLabel} (D-1)</span>
              <div className="stat-main">
                <strong className={`stat-number ${selectedHubItem.meetsTarget ? 'text-good' : 'text-bad'}`}>
                  {formatPct(selectedHubItem.kpiD1)}
                </strong>
                <span className="stat-target">Mục tiêu: {target}%</span>
              </div>
              <span className="stat-sub">
                Tử số: {formatVol(selectedHubItem.ontimeD1)} / Mẫu: {formatVol(selectedHubItem.sampleD1)} đơn
              </span>
            </div>

            <div className="insight-stat-card">
              <span className="stat-label">So sánh D-8 ({d8Formatted || 'D-8'})</span>
              <div className="stat-main">
                <strong className="stat-number">
                  {selectedHubItem.kpiD8 !== null ? `${selectedHubItem.kpiD8.toFixed(1)}%` : '–'}
                </strong>
                {selectedHubItem.deltaD8 !== null && (
                  <span className={`diff-badge ${selectedHubItem.deltaD8 >= 0 ? 'up' : 'down'}`}>
                    {formatDiff(selectedHubItem.deltaD8)}
                  </span>
                )}
              </div>
              <span className="stat-sub">
                Mẫu D-8: {formatVol(selectedHubItem.sampleD8)} đơn
              </span>
            </div>

            <div className="insight-stat-card">
              <span className="stat-label">Biến động Thứ hạng</span>
              <div className="stat-main">
                <strong className="stat-number">
                  {selectedHubItem.rank ? `#${selectedHubItem.rank}` : '–'}
                </strong>
                {selectedHubItem.hasCommonBaseline === false ? (
                  <span className="text-muted text-xs">Chưa có baseline D-8</span>
                ) : selectedHubItem.deltaRank !== null && selectedHubItem.deltaRank !== 0 ? (
                  <span className={`diff-badge ${selectedHubItem.deltaRank > 0 ? 'up' : 'down'}`}>
                    {selectedHubItem.deltaRank > 0 ? (
                      <><ArrowUp size={12} /> Tăng {selectedHubItem.deltaRank} bậc</>
                    ) : (
                      <><ArrowDown size={12} /> Tụt {Math.abs(selectedHubItem.deltaRank)} bậc</>
                    )}
                  </span>
                ) : (
                  <span className="text-muted text-xs">
                    {selectedHubItem.rankD8 ? 'Thứ hạng không đổi' : 'Không có D-8 để so sánh'}
                  </span>
                )}
              </div>
              <span className="stat-sub">
                {selectedHubItem.hasCommonBaseline === false
                  ? 'Chưa có D-8 trong nhóm đối soát chung'
                  : `Thứ hạng D-8: ${selectedHubItem.rankD8 ? `#${selectedHubItem.rankD8}` : '–'}`}
              </span>
            </div>

            <div className="insight-stat-card">
              <span className="stat-label">Nhận định Vận hành</span>
              <p className="stat-narrative">
                {selectedHubItem.hasData ? (
                  selectedHubItem.meetsTarget ? (
                    `Hub ${selectedHubItem.hub} đạt chuẩn vận hành ${metricLabel} (${selectedHubItem.kpiD1.toFixed(1)}% ≥ ${target}%) trên tổng sản lượng ${formatVol(selectedHubItem.sampleD1)} đơn tại ngày D-1.`
                  ) : (
                    `Hub ${selectedHubItem.hub} chưa đạt mục tiêu ${metricLabel} (${selectedHubItem.kpiD1.toFixed(1)}% < ${target}%), còn thiếu ${(target - selectedHubItem.kpiD1).toFixed(1)}% pp trên ${formatVol(selectedHubItem.sampleD1)} đơn.`
                  )
                ) : (
                  `Chưa ghi nhận sản lượng hợp lệ cho Hub ${selectedHubItem.hub} trong ngày D-1.`
                )}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 4. Full Audit & Verification Table Section */}
      <section className="prr-table-card" aria-label="Bảng đối soát thứ hạng Hub">
        <div className="prr-table-toolbar">
          <div className="table-toolbar-left">
            <h2 className="table-toolbar-title">Bảng Đối Soát Thứ Hạng Vận Hành</h2>
            <span className="table-toolbar-meta">
              Tổng cộng <strong>{totalCount} Hub</strong> ({rankedCount} đã xếp hạng, {unrankedCount} chưa đủ dữ liệu)
            </span>
          </div>

          <div className="table-toolbar-search">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="table-search-input"
              placeholder="Tìm theo tên Hub, Vùng..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              aria-label="Tìm kiếm Hub"
            />
            {searchFilter && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchFilter('')}
                aria-label="Xóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Table Container */}
        <div className="prr-table-responsive">
          <table className="prr-audit-table">
            <thead>
              <tr>
                <th style={{ width: '70px', textAlign: 'center' }}>Hạng</th>
                <th style={{ minWidth: '170px' }}>Hub / Trạm</th>
                <th style={{ width: '90px' }}>Vùng</th>
                <th style={{ width: '105px', textAlign: 'right' }}>KPI D-1</th>
                <th style={{ width: '85px', textAlign: 'right' }}>Mục tiêu</th>
                <th style={{ width: '95px', textAlign: 'right' }}>Δ D-8</th>
                <th style={{ width: '95px', textAlign: 'center' }}>Δ Hạng</th>
                <th style={{ width: '105px', textAlign: 'right' }}>Mẫu (đơn)</th>
                <th style={{ minWidth: '150px' }}>Trạng thái</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredTableRanked.length === 0 && filteredTableUnranked.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-row">
                    Không tìm thấy Hub nào phù hợp với từ khóa "{searchFilter}".
                  </td>
                </tr>
              ) : (
                <>
                  {filteredTableRanked.map(item => {
                    const isSelected = selectedHubId === item.id;
                    return (
                      <tr
                        key={item.id}
                        ref={el => {
                          if (el) tableRowRefs.current.set(item.id, el);
                          else tableRowRefs.current.delete(item.id);
                        }}
                        className={`audit-row ${isSelected ? 'row-selected' : ''}`}
                        onClick={() => handleSelectHub(item.id)}
                      >
                        {/* Hạng */}
                        <td style={{ textAlign: 'center' }}>
                          <span className={`rank-badge ${item.rank <= 3 ? `top-${item.rank}` : ''}`}>
                            #{item.rank}
                          </span>
                        </td>

                        {/* Hub */}
                        <td className="hub-cell">
                          <strong>{item.displayName || item.hub}</strong>
                          <span className="hub-type-tag">{item.hubType}</span>
                        </td>

                        {/* Vùng */}
                        <td>
                          <span className="region-pill">{item.region}</span>
                        </td>

                        {/* KPI D-1 */}
                        <td style={{ textAlign: 'right' }}>
                          <strong className={`kpi-figure ${item.meetsTarget ? 'text-good' : 'text-bad'}`}>
                            {formatPct(item.kpiD1)}
                          </strong>
                        </td>

                        {/* Mục tiêu */}
                        <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {target}%
                        </td>

                        {/* Δ D-8 */}
                        <td style={{ textAlign: 'right' }}>
                          {item.deltaD8 !== null ? (
                            <span className={`diff-badge ${item.deltaD8 >= 0 ? 'up' : 'down'}`}>
                              {formatDiff(item.deltaD8)}
                            </span>
                          ) : (
                            <span className="text-muted">–</span>
                          )}
                        </td>

                        {/* Δ Hạng */}
                        <td style={{ textAlign: 'center' }}>
                          {item.hasCommonBaseline === false ? (
                            <span className="text-muted text-xs" title="Chưa có baseline D-8 trong nhóm đối soát chung">
                              Chưa có baseline
                            </span>
                          ) : item.deltaRank !== null && item.deltaRank !== 0 ? (
                            <span className={`rank-diff-pill ${item.deltaRank > 0 ? 'up' : 'down'}`}>
                              {item.deltaRank > 0 ? (
                                <><ArrowUp size={11} /> +{item.deltaRank}</>
                              ) : (
                                <><ArrowDown size={11} /> {item.deltaRank}</>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted">–</span>
                          )}
                        </td>

                        {/* Mẫu (đơn) */}
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {formatVol(item.sampleD1)}
                        </td>

                        {/* Trạng thái */}
                        <td>
                          <div className="status-badges-group">
                            <span className={`status-pill ${item.meetsTarget ? 'is-good' : 'is-bad'}`}>
                              {item.meetsTarget ? 'Đạt target' : 'Chưa đạt'}
                            </span>
                            {item.isSmallSample && (
                              <span className="status-pill is-warning" title={`Mẫu D-1 nhỏ (<${SMALL_SAMPLE_THRESHOLD} đơn, ngưỡng cấu hình tạm tính)`}>
                                <AlertTriangle size={11} /> Ít mẫu
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Thao tác */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-row-action"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectHub(item.id);
                            }}
                            title="Xem chi tiết Hub trên tuyến đường & bảng"
                          >
                            {isSelected ? 'Đang chọn' : 'Chi tiết'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Unranked section (Chưa đủ dữ liệu) */}
                  {filteredTableUnranked.length > 0 && (
                    <>
                      <tr className="unranked-separator-row">
                        <td colSpan={10}>
                          <div className="unranked-header">
                            <Info size={14} className="text-muted" />
                            <span>Nhóm Chưa Đủ Dữ Liệu ({filteredTableUnranked.length} Hub)</span>
                            <span className="unranked-header-sub">
                              (Mẫu D-1 bằng 0 hoặc chưa có bản ghi vận hành trong ngày D-1)
                            </span>
                          </div>
                        </td>
                      </tr>
                      {filteredTableUnranked.map(item => {
                        const isSelected = selectedHubId === item.id;
                        return (
                          <tr
                            key={item.id}
                            className={`audit-row unranked-row ${isSelected ? 'row-selected' : ''}`}
                            onClick={() => handleSelectHub(item.id)}
                          >
                            <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>–</td>
                            <td className="hub-cell">
                              <span>{item.displayName || item.hub}</span>
                              <span className="hub-type-tag">{item.hubType}</span>
                            </td>
                            <td><span className="region-pill">{item.region}</span></td>
                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>–</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{target}%</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>–</td>
                            <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>–</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>0</td>
                            <td><span className="status-pill is-none">Chưa đủ dữ liệu</span></td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn-row-action"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectHub(item.id);
                                }}
                              >
                                Xem
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
