import React, { useState, useMemo, useRef, useEffect, useCallback, useId, lazy, Suspense } from 'react';
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
  Building2,
  Pause,
  Play,
  ArrowLeft,
  Table2
} from 'lucide-react';
import {
  calculatePerformanceRanking,
  SUPPORTED_KPIS,
  SMALL_SAMPLE_THRESHOLD,
  getMetricDef,
  selectSceneHubs,
  SCENE_TOP_LIMITS
} from '../../utils/performanceRanking.js';
import { formatPct, formatVol, formatDiff, formatDateLabel } from '../../utils/dataProcessor.js';
import {
  SCENE_MODE_STORAGE_KEY,
  detectWebGL2,
  isSceneMode,
  pickDefaultSceneMode
} from '../../utils/sceneCapability.js';
import './rankingStage.css';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import RoadScene2D from './RoadScene2D.jsx';
import SceneErrorBoundary from './SceneErrorBoundary.jsx';
import useScenePlayback from './useScenePlayback.js';
import { MIN_DRIVE_RATE, MAX_DRIVE_RATE } from '../../utils/sceneDriving.js';
import { useToast } from '../../components/ui/Toast.jsx';

// three.js lives in this lazy chunk; the 2D path never loads it.
const RoadScene3D = lazy(() => import('./RoadScene3D.jsx'));

const WEBGL2_UNAVAILABLE_HINT = 'Trình duyệt hoặc thiết bị này không hỗ trợ WebGL2 nên không xem được dạng 3D.';
const EMPTY_ROWS = [];

function readSavedSceneMode() {
  try {
    const v = window.localStorage.getItem(SCENE_MODE_STORAGE_KEY);
    return isSceneMode(v) ? v : null;
  } catch {
    return null;
  }
}

function detectWebGL2InBrowser() {
  return detectWebGL2(() => document.createElement('canvas'));
}

function getInitialSceneMode(webgl2) {
  return pickDefaultSceneMode({
    webgl2,
    cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saved: readSavedSceneMode()
  });
}


export default function PerformanceRoadRanking({
  pickRows = EMPTY_ROWS,
  deliRows = EMPTY_ROWS,
  clientFilter = 'ALL',
  selectedRegions = null,
  selectedHubTypes = null,
  onJumpToReport1,
  onExit,
  density = 'comfortable'
}) {
  const [metricKey, setMetricKey] = useState('p1st');
  const [selectedHubId, setSelectedHubId] = useState(null);
  const [sceneDisplayLimit, setSceneDisplayLimit] = useState(20);
  const [tableOpen, setTableOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [webgl2] = useState(detectWebGL2InBrowser);
  const [sceneMode, setSceneMode] = useState(() => getInitialSceneMode(webgl2));
  const showToast = useToast();

  const tableRowRefs = useRef(new Map());
  const insightPanelRef = useRef(null);
  const tableCardRef = useRef(null);
  const sceneHostRef = useRef(null);
  const playback = useScenePlayback(sceneHostRef);
  const speedControlId = useId();
  const speedLabel = `${playback.rate.toLocaleString('vi-VN')}×`;

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
    return selectSceneHubs(ranked, sceneDisplayLimit);
  }, [ranked, sceneDisplayLimit]);

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
    setTableOpen(false);
    setSelectedHubId(prev => (prev === hubId ? null : hubId));
  }, []);

  // 3D failed (chunk did not load, render error, WebGL context lost): show 2D for this visit only.
  // The saved preference is left alone so a transient failure does not pin the user to 2D.
  const handleSceneFailure = useCallback((reason) => {
    setSceneMode('2d');
    showToast(
      reason === 'context-lost'
        ? 'Trình duyệt đã dừng đồ hoạ 3D nên cảnh được chuyển sang 2D. Chọn 3D để thử lại.'
        : 'Không hiển thị được cảnh 3D nên cảnh được chuyển sang 2D. Tải lại trang để thử 3D lần nữa.',
      { tone: 'warning', duration: 7000 }
    );
  }, [showToast]);

  const handleViewTable = useCallback(() => {
    setTableOpen(true);
  }, []);

  useEffect(() => {
    if (tableOpen) tableCardRef.current?.focus({ preventScroll: true });
  }, [tableOpen]);

  // Enter on the 3D scene: bring the selected Hub's detail panel into view and focus it.
  const handleOpenDetail = useCallback(() => {
    const panel = insightPanelRef.current;
    if (!panel) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    panel.focus({ preventScroll: true });
  }, []);

  const handleSceneModeChange = useCallback((mode) => {
    if (mode === '3d' && !webgl2) return;
    setSceneMode(mode);
    try {
      window.localStorage.setItem(SCENE_MODE_STORAGE_KEY, mode);
    } catch {
      // storage blocked: choice just isn't remembered
    }
  }, [webgl2]);

  // Keyboard navigation: Escape key deselects
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedHubId) setSelectedHubId(null);
        else if (tableOpen) setTableOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedHubId, tableOpen]);

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
      <header className="prr-stage-header">
        <div className="prr-stage-heading">
          {onExit && <button type="button" className="prr-stage-back" onClick={onExit} aria-label="Quay về Tổng quan" title="Tổng quan"><ArrowLeft size={18} /></button>}
          <h1>BXH Performance</h1>
          <span className="prr-stage-scope">{clientFilter === 'ALL' ? 'SPB + SPE' : clientFilter} · D-1 {d1Formatted}</span>
          <span className="prr-stage-count">{sceneTrucks.length} / {rankedCount} Hub</span>
        </div>
        <div className="prr-stage-toolbar">
          <div className="prr-kpi-selector" role="tablist" aria-label="Chọn KPI xếp hạng">
            {SUPPORTED_KPIS.map(kpi => (
              <button key={kpi.id} type="button" role="tab" aria-selected={metricKey === kpi.id}
                className={`prr-kpi-tab ${metricKey === kpi.id ? 'is-active' : ''}`}
                onClick={() => { setMetricKey(kpi.id); setSelectedHubId(null); }}>
                <span className="kpi-tab-label">{kpi.label}</span>
                <span className="kpi-tab-target">{getMetricDef(kpi.id).target}%</span>
              </button>
            ))}
          </div>
          <div className="prr-stage-actions">
            <div className="prr-segmented-limit" role="group" aria-label="Số Hub trên đường">
              {SCENE_TOP_LIMITS.map(limit => <button key={limit} type="button" className={`seg-btn ${sceneDisplayLimit === limit ? 'active' : ''}`}
                aria-pressed={sceneDisplayLimit === limit} onClick={() => setSceneDisplayLimit(limit)}>Top {limit}</button>)}
            </div>
            <button type="button" className="prr-replay-btn prr-playback-btn"
              disabled={playback.reducedMotion || sceneTrucks.length === 0} aria-pressed={playback.paused}
              aria-label={playback.paused ? 'Tiếp tục chuyển động xe' : 'Tạm dừng chuyển động xe'}
              title={playback.reducedMotion ? 'Thiết bị đang bật chế độ giảm chuyển động' : undefined}
              onClick={() => playback.setPaused(value => !value)}>
              {playback.paused || playback.reducedMotion ? <Play size={15} /> : <Pause size={15} />}
              <span>{playback.reducedMotion ? 'Giảm chuyển động' : playback.paused ? 'Tiếp tục' : 'Tạm dừng'}</span>
            </button>
            <details className="prr-stage-settings">
              <summary>Tùy chỉnh</summary>
              <div className="prr-stage-settings-panel">
                <div className="prr-speed-control">
                  <label htmlFor={speedControlId}>Tốc độ</label>
                  <input id={speedControlId} type="range" min={MIN_DRIVE_RATE} max={MAX_DRIVE_RATE} step="0.25" value={playback.rate}
                    aria-label="Tốc độ chạy xe" aria-valuetext={`${playback.rate.toLocaleString('vi-VN')} lần`}
                    disabled={playback.reducedMotion || sceneTrucks.length === 0} onChange={event => playback.setRate(Number(event.target.value))} />
                  <output htmlFor={speedControlId}>{speedLabel}</output>
                </div>
                <div className="prr-segmented-limit" role="group" aria-label="Chế độ hiển thị cảnh">
                  <button type="button" className={`seg-btn ${sceneMode === '2d' ? 'active' : ''}`} aria-pressed={sceneMode === '2d'} onClick={() => handleSceneModeChange('2d')}>2D</button>
                  <button type="button" className={`seg-btn ${sceneMode === '3d' ? 'active' : ''}`} aria-pressed={sceneMode === '3d'} disabled={!webgl2}
                    title={webgl2 ? undefined : WEBGL2_UNAVAILABLE_HINT} onClick={() => handleSceneModeChange('3d')}>3D</button>
                </div>
                <p>{Array.isArray(selectedRegions) ? `${selectedRegions.length} vùng` : 'Tất cả vùng'} · {Array.isArray(selectedHubTypes) ? `${selectedHubTypes.length} loại Hub` : 'Tất cả loại Hub'}</p>
                <p><span className="legend-dot meets-target" /> Đạt mục tiêu {target}% · <span className="legend-dot below-target" /> Chưa đạt</p>
                <p><AlertTriangle size={12} /> Mẫu dưới {SMALL_SAMPLE_THRESHOLD} đơn</p>
              </div>
            </details>
            <button type="button" className="prr-replay-btn" aria-label="Bảng số liệu" title="Bảng số liệu" aria-expanded={tableOpen} onClick={() => setTableOpen(value => !value)}><Table2 size={15} /><span>Bảng số liệu</span></button>
          </div>
        </div>
      </header>
      <section ref={sceneHostRef} className="prr-scene-card" aria-label="Tuyến đường xếp hạng Hub">
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
          sceneMode === '3d' ? (
            <SceneErrorBoundary onError={() => handleSceneFailure('load')}>
            <Suspense fallback={<LoadingScreen variant="block" />}>
              <RoadScene3D
                sceneTrucks={sceneTrucks}
                selectedHubId={selectedHubId}
                onSelectHub={handleSelectHub}
                onOpenDetail={handleOpenDetail}
                onViewTable={handleViewTable}
                onContextLost={() => handleSceneFailure('context-lost')}
                metricLabel={metricLabel}
                target={target}
                d1Label={d1Formatted}
                d8Label={d8Formatted || ''}
                running={playback.running}
                playbackRate={playback.rate}
                reducedMotion={playback.reducedMotion}
              />
            </Suspense>
            </SceneErrorBoundary>
          ) : (
            <RoadScene2D
              sceneTrucks={sceneTrucks}
              selectedHubId={selectedHubId}
              onSelectHub={handleSelectHub}
              running={playback.running}
              playbackRate={playback.rate}
            />
          )
        )}
      </section>

      {/* 3. Selected Hub Insight Detail Panel */}
      {selectedHubItem && (
        <section
          ref={insightPanelRef}
          tabIndex={-1}
          className="prr-insight-panel animate-fade-in"
          aria-label="Chi tiết Hub được chọn"
        >
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
          {!sceneTrucks.some(hub => hub.id === selectedHubId) && <p className="prr-offscene-note">Hub này nằm ngoài Top {sceneDisplayLimit}; xem số liệu tại đây hoặc mở báo cáo chi tiết.</p>}
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
      {tableOpen && <section ref={tableCardRef} tabIndex={-1} className="prr-table-card" aria-label="Bảng đối soát thứ hạng Hub">
        <div className="prr-table-toolbar">
          <div className="table-toolbar-left">
            <h2 className="table-toolbar-title">Bảng Đối Soát Thứ Hạng Vận Hành</h2>
            <span className="table-toolbar-meta">
              Tổng cộng <strong>{totalCount} Hub</strong> ({rankedCount} đã xếp hạng, {unrankedCount} chưa đủ dữ liệu)
            </span>
          </div>

          <button type="button" className="prr-panel-close" aria-label="Đóng bảng số liệu" onClick={() => setTableOpen(false)}><X size={18} /></button>
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
      </section>}
    </div>
  );
}
