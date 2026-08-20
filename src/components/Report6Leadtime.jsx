import React, { useState, useMemo, useRef, useCallback } from 'react';
import * as htmlToImage from 'html-to-image';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import {
  Clock,
  Sliders,
  RotateCcw,
  Copy,
  Download,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X
} from 'lucide-react';
import {
  DEFAULT_THRESHOLD_CONFIG,
  STAGE_KEYS,
  STAGE_CONFIG,
  isUnresolvedLaneRow,
  computeBaseline,
  classifyDeviation,
  weightedAvgByStage,
  stackedHeightByLaneGroup,
  isLowSample,
  getStageValue
} from '../utils/leadtimeCalc';

const LANE_CATEGORIES = ['Intra city', 'Intra region', 'Cross region'];

export default function Report6Leadtime({
  leadtimeRows = [],
  density = 'comfortable',
  isFullscreen = false,
  setIsFullscreen
}) {
  const chartRef = useRef(null);
  const tableRef = useRef(null);

  // Keyboard shortcut to exit fullscreen
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen && setIsFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, setIsFullscreen]);

  // Threshold Configuration State (All 7 parameters controlled from state)
  const [thresholdConfig, setThresholdConfig] = useState(DEFAULT_THRESHOLD_CONFIG);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Filter States
  const allDates = useMemo(() => {
    return [...new Set(leadtimeRows.map(r => r.report_date).filter(Boolean))].sort();
  }, [leadtimeRows]);

  const latestDate = allDates.length > 0 ? allDates[allDates.length - 1] : '';

  const [dateFilter, setDateFilter] = useState({
    type: 'single', // 'single' | 'range'
    date: latestDate || '2026-08-19',
    startDate: allDates.length > 6 ? allDates[allDates.length - 7] : (allDates[0] || ''),
    endDate: latestDate || '2026-08-19'
  });

  // Re-sync default date when rows load/change
  React.useEffect(() => {
    if (latestDate && (!dateFilter.date || !allDates.includes(dateFilter.date))) {
      setDateFilter(prev => ({
        ...prev,
        date: latestDate,
        endDate: latestDate,
        startDate: allDates.length > 6 ? allDates[allDates.length - 7] : (allDates[0] || '')
      }));
    }
  }, [latestDate, allDates, dateFilter.date]);

  // Selected Clients (Default both SPE & SPB)
  const [selectedClients, setSelectedClients] = useState(['SPB', 'SPE']);

  // Lane Drill-down selector (Optional: 'ALL' or specific 'from → to')
  const [selectedLanePair, setSelectedLanePair] = useState('ALL');

  // Available lane pairs for drill-down dropdown
  const availableLanePairs = useMemo(() => {
    const pairs = new Set();
    leadtimeRows.forEach(r => {
      if (!isUnresolvedLaneRow(r) && r.fromprovince_new && r.toprovince_new) {
        pairs.add(`${r.fromprovince_new} → ${r.toprovince_new}`);
      }
    });
    return Array.from(pairs).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [leadtimeRows]);

  // Filtered rows based on current active filters
  const { currentRows, unresolvedRows } = useMemo(() => {
    const isMatchingDate = (date) => {
      if (dateFilter.type === 'single') {
        return date === dateFilter.date;
      }
      return (!dateFilter.startDate || date >= dateFilter.startDate) &&
             (!dateFilter.endDate || date <= dateFilter.endDate);
    };

    const normal = [];
    const unresolved = [];

    leadtimeRows.forEach(r => {
      if (!isMatchingDate(r.report_date)) return;
      if (!selectedClients.includes(r.client_name)) return;

      if (isUnresolvedLaneRow(r)) {
        unresolved.push(r);
      } else {
        if (selectedLanePair !== 'ALL') {
          const pair = `${r.fromprovince_new} → ${r.toprovince_new}`;
          if (pair !== selectedLanePair) return;
        }
        normal.push(r);
      }
    });

    return { currentRows: normal, unresolvedRows: unresolved };
  }, [leadtimeRows, dateFilter, selectedClients, selectedLanePair]);

  // Handlers for threshold configuration changes
  const handleConfigChange = (key, value) => {
    setThresholdConfig(prev => {
      const next = { ...prev, [key]: value };
      // Enforce critical > warning
      if (key === 'warningThresholdPct' && Number(value) >= Number(next.criticalThresholdPct)) {
        next.criticalThresholdPct = Number(value) + 10;
      }
      if (key === 'criticalThresholdPct' && Number(value) <= Number(next.warningThresholdPct)) {
        next.warningThresholdPct = Math.max(5, Number(value) - 10);
      }
      return next;
    });
  };

  const handleResetConfig = () => {
    setThresholdConfig(DEFAULT_THRESHOLD_CONFIG);
  };

  // Toggle Client filter
  const toggleClient = (client) => {
    setSelectedClients(prev => {
      if (prev.includes(client)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter(c => c !== client);
      }
      return [...prev, client];
    });
  };

  // Build Chart Data (Grouped by externallane_new × Clients)
  const chartData = useMemo(() => {
    const categoriesToShow = selectedLanePair === 'ALL'
      ? LANE_CATEGORIES
      : Array.from(new Set(currentRows.map(r => r.externallane_new).filter(Boolean)));

    return categoriesToShow.map(laneCategory => {
      const categoryRows = currentRows.filter(r => r.externallane_new === laneCategory);
      const entry = {
        name: laneCategory,
        category: laneCategory
      };

      selectedClients.forEach(client => {
        const clientRows = categoryRows.filter(r => r.client_name === client);
        const totalMau = clientRows.reduce((acc, r) => acc + (Number(r.mau) || 0), 0);
        const height = stackedHeightByLaneGroup(clientRows);

        STAGE_KEYS.forEach(stageKey => {
          const stageAvg = weightedAvgByStage(clientRows, stageKey);
          entry[`${client}_${stageKey}`] = stageAvg;

          // Compute baseline for this stage in this lane category & client
          const asOf = dateFilter.type === 'single' ? dateFilter.date : dateFilter.endDate;
          const baseline = computeBaseline(leadtimeRows, {
            from: null,
            to: null,
            lane: laneCategory,
            client,
            stageKey,
            asOfDate: asOf
          }, thresholdConfig);

          const classification = classifyDeviation(stageAvg, baseline, thresholdConfig);

          entry[`${client}_${stageKey}_meta`] = {
            stageAvg,
            baseline,
            pctDeviation: classification.pctDeviation,
            level: classification.level,
            totalMau,
            pctContribution: height > 0 && stageAvg !== null ? Number(((stageAvg / height) * 100).toFixed(1)) : 0
          };
        });

        entry[`${client}_totalHeight`] = height;
        entry[`${client}_totalMau`] = totalMau;
      });

      return entry;
    });
  }, [currentRows, selectedClients, selectedLanePair, leadtimeRows, dateFilter, thresholdConfig]);

  // Copy Image to Clipboard Handler
  const handleCopyImage = async (ref, label) => {
    const node = ref?.current;
    if (!node) return;
    try {
      const dataUrl = await htmlToImage.toPng(node, {
        backgroundColor: '#ffffff',
        pixelRatio: 2
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      alert(`✓ Đã copy ảnh ${label} vào Clipboard! Bạn có thể dán (Ctrl+V) vào Zalo / Chat.`);
    } catch (err) {
      console.error('Error copying image:', err);
      alert('Có lỗi xảy ra khi copy ảnh! Vui lòng thử lại.');
    }
  };

  // Export CSV Handler
  const handleExportCSV = useCallback(() => {
    const allExportRows = [...currentRows, ...unresolvedRows];
    if (allExportRows.length === 0) {
      alert('Không có dữ liệu để xuất.');
      return;
    }

    const headers = [
      'Report Date',
      'From Province',
      'To Province',
      'Lane Type',
      'Client Name',
      'MAU',
      'Pre-pickup (h)',
      'First mile (h)',
      'Middle mile (h)',
      'Last mile (h)',
      'E2E (h)'
    ];

    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvContent = [
      headers.join(','),
      ...allExportRows.map(r => [
        escapeCsv(r.report_date),
        escapeCsv(r.fromprovince_new || 'N/A'),
        escapeCsv(r.toprovince_new || 'N/A'),
        escapeCsv(r.externallane_new || 'Không xác định'),
        escapeCsv(r.client_name),
        r.mau ?? '',
        r.avg_lt_prepickup_hour ?? '',
        r.avg_lt_firstmile_hour ?? '',
        r.avg_lt_middlemile_hour ?? '',
        r.avg_lt_lastmile_hour ?? '',
        r.avg_lt_e2e_hour ?? ''
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateLabel = dateFilter.type === 'single'
      ? dateFilter.date
      : `${dateFilter.startDate || 'start'}_${dateFilter.endDate || 'end'}`;
    link.download = `GHN_Shopee_Leadtime_${dateLabel}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [currentRows, unresolvedRows, dateFilter]);

  // Custom Chart Tooltip Component
  const CustomLeadtimeTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div style={{
        background: 'var(--surface-default, #ffffff)',
        border: '1px solid var(--border-strong, #cbd5e1)',
        borderRadius: '10px',
        padding: '12px 16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        fontSize: '0.82rem',
        color: 'var(--text-main, #1e293b)',
        minWidth: '280px',
        maxWidth: '360px'
      }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '8px', borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: '6px' }}>
          📍 {label}
        </div>

        {selectedClients.map(client => {
          const totalHeight = payload[0]?.payload?.[`${client}_totalHeight`];
          const totalMau = payload[0]?.payload?.[`${client}_totalMau`];
          if (totalHeight === undefined) return null;

          return (
            <div key={client} style={{ marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px dashed var(--border, #e2e8f0)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <strong style={{ color: client === 'SPB' ? '#F15A22' : '#0063AA', fontSize: '0.88rem' }}>
                  {client} (Tổng: {totalHeight}h)
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                  Σ MAU: {totalMau?.toLocaleString('vi-VN')}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                {STAGE_KEYS.map(stageKey => {
                  const meta = payload[0]?.payload?.[`${client}_${stageKey}_meta`];
                  if (!meta) return null;
                  const isHighlighted = thresholdConfig.highlightedStage === stageKey;

                  let badgeBg = 'rgba(16, 185, 129, 0.15)';
                  let badgeFg = '#047857';
                  let badgeText = 'Bình thường';

                  if (meta.level === 'critical') {
                    badgeBg = 'rgba(239, 68, 68, 0.18)';
                    badgeFg = '#B91C1C';
                    badgeText = `Lệch +${meta.pctDeviation}% (Nguy cấp)`;
                  } else if (meta.level === 'warning') {
                    badgeBg = 'rgba(245, 158, 11, 0.18)';
                    badgeFg = '#B45309';
                    badgeText = `Lệch +${meta.pctDeviation}% (Cảnh báo)`;
                  } else if (meta.pctDeviation !== null) {
                    badgeText = meta.pctDeviation > 0 ? `+${meta.pctDeviation}%` : `${meta.pctDeviation}%`;
                  }

                  return (
                    <div
                      key={stageKey}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        background: isHighlighted ? 'rgba(241, 90, 34, 0.08)' : 'transparent',
                        borderLeft: isHighlighted ? '3px solid #F15A22' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: STAGE_CONFIG[stageKey].color,
                            display: 'inline-block'
                          }}
                        />
                        <span style={{ fontWeight: isHighlighted ? 700 : 500 }}>
                          {STAGE_CONFIG[stageKey].label}:
                        </span>
                        <span>
                          {meta.stageAvg !== null ? `${meta.stageAvg}h (${meta.pctContribution}%)` : 'NULL (0h)'}
                        </span>
                      </div>

                      {meta.stageAvg !== null && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: badgeBg,
                            color: badgeFg,
                            fontWeight: 600
                          }}
                        >
                          {badgeText}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Group currentRows by externallane_new for detailed drill-down table
  const groupedLaneTableData = useMemo(() => {
    const asOf = dateFilter.type === 'single' ? dateFilter.date : dateFilter.endDate;
    const groups = {};

    LANE_CATEGORIES.forEach(cat => {
      groups[cat] = [];
    });
    groups['Khác'] = [];

    currentRows.forEach(row => {
      const cat = LANE_CATEGORIES.includes(row.externallane_new) ? row.externallane_new : 'Khác';

      // Compute deviations for each of the 4 stages
      const stageDeviations = {};
      let maxLevel = 'normal';

      STAGE_KEYS.forEach(stageKey => {
        const val = getStageValue(row, stageKey);
        const baseline = computeBaseline(leadtimeRows, {
          from: row.fromprovince_new,
          to: row.toprovince_new,
          lane: row.externallane_new,
          client: row.client_name,
          stageKey,
          asOfDate: asOf
        }, thresholdConfig);

        const classification = classifyDeviation(val, baseline, thresholdConfig);
        stageDeviations[stageKey] = {
          val,
          baseline,
          pctDeviation: classification.pctDeviation,
          level: classification.level
        };

        if (classification.level === 'critical') maxLevel = 'critical';
        else if (classification.level === 'warning' && maxLevel !== 'critical') maxLevel = 'warning';
      });

      groups[cat].push({
        ...row,
        stageDeviations,
        maxLevel,
        isLow: isLowSample(row.mau, thresholdConfig)
      });
    });

    // Sort each group descending by avg_lt_e2e_hour
    Object.keys(groups).forEach(cat => {
      groups[cat].sort((a, b) => (Number(b.avg_lt_e2e_hour) || 0) - (Number(a.avg_lt_e2e_hour) || 0));
    });

    return groups;
  }, [currentRows, leadtimeRows, dateFilter, thresholdConfig]);

  return (
    <div className={`report6-leadtime-container ${isFullscreen ? 'fullscreen-mode-active' : ''}`}>
      {/* Floating Exit Fullscreen Button */}
      {isFullscreen && (
        <button
          onClick={() => setIsFullscreen && setIsFullscreen(false)}
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '1.5rem',
            zIndex: 9999,
            background: '#e11d48',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(225, 29, 72, 0.4)'
          }}
          title="Thoát toàn màn hình (Phím Esc)"
        >
          <X size={20} />
        </button>
      )}

      <div className={`density-${density}`}>
        {/* Main Controls & Filter Header */}
        <div
          className="metric-block"
          style={{
            background: 'var(--surface, #ffffff)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ background: 'var(--ghn-orange-light, #fef0eb)', padding: '6px 10px', borderRadius: '8px' }}>
                  <Clock size={20} style={{ color: 'var(--ghn-orange, #f15a22)' }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main, #1e293b)' }}>
                    Báo Cáo Leadtime Từng Chặng
                  </h2>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                    Phân rã Leadtime 4 chặng: Pre-pickup ➔ First mile ➔ Middle mile ➔ Last mile (SPE & SPB)
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn-secondary ${isConfigOpen ? 'active' : ''}`}
                onClick={() => setIsConfigOpen(!isConfigOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.82rem',
                  borderRadius: '8px',
                  background: isConfigOpen ? 'var(--ghn-blue-light, #e6f0fa)' : 'var(--surface-hover, #f8fafc)',
                  borderColor: isConfigOpen ? 'var(--ghn-blue, #0063aa)' : 'var(--border, #cbd5e1)',
                  color: isConfigOpen ? 'var(--ghn-blue, #0063aa)' : 'var(--text-main, #1e293b)',
                  fontWeight: 600
                }}
              >
                <Sliders size={15} />
                <span>Cấu hình Ngưỡng (Threshold)</span>
                {isConfigOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleCopyImage(chartRef, 'Biểu đồ Leadtime')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.8rem', fontSize: '0.82rem', borderRadius: '8px' }}
                title="Copy Biểu đồ thành ảnh vào clipboard"
              >
                <Copy size={14} /> Copy Chart
              </button>

              <button
                type="button"
                className="export-confirm-button"
                onClick={handleExportCSV}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.82rem', borderRadius: '8px' }}
              >
                <Download size={14} /> Tải CSV
              </button>
            </div>
          </div>

          {/* Primary Filters Toolbar */}
          <div
            style={{
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border, #e2e8f0)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1.25rem',
              alignItems: 'center'
            }}
          >
            {/* 1. Date Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>Ngày báo cáo:</span>
              <select
                className="filter-select"
                value={dateFilter.type}
                onChange={(e) => setDateFilter(prev => ({ ...prev, type: e.target.value }))}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
              >
                <option value="single">Một ngày cụ thể</option>
                <option value="range">Khoảng ngày</option>
              </select>

              {dateFilter.type === 'single' ? (
                <input
                  type="date"
                  className="filter-input"
                  value={dateFilter.date}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, date: e.target.value }))}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="date"
                    className="filter-input"
                    value={dateFilter.startDate}
                    onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                  />
                  <span>➔</span>
                  <input
                    type="date"
                    className="filter-input"
                    value={dateFilter.endDate}
                    onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                  />
                </div>
              )}
            </div>

            {/* 2. Client Multi-select Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>Khách hàng:</span>
              <button
                type="button"
                onClick={() => toggleClient('SPB')}
                style={{
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: selectedClients.includes('SPB') ? '1.5px solid #F15A22' : '1px solid var(--border, #cbd5e1)',
                  background: selectedClients.includes('SPB') ? '#F15A22' : 'var(--surface-hover, #f8fafc)',
                  color: selectedClients.includes('SPB') ? '#ffffff' : 'var(--text-main, #1e293b)'
                }}
              >
                SPB
              </button>
              <button
                type="button"
                onClick={() => toggleClient('SPE')}
                style={{
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: selectedClients.includes('SPE') ? '1.5px solid #0063AA' : '1px solid var(--border, #cbd5e1)',
                  background: selectedClients.includes('SPE') ? '#0063AA' : 'var(--surface-hover, #f8fafc)',
                  color: selectedClients.includes('SPE') ? '#ffffff' : 'var(--text-main, #1e293b)'
                }}
              >
                SPE
              </button>
            </div>

            {/* 3. Lane Drill-down Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>Lane drill-down:</span>
              <select
                className="filter-select"
                value={selectedLanePair}
                onChange={(e) => setSelectedLanePair(e.target.value)}
                style={{ fontSize: '0.8rem', minWidth: '200px' }}
              >
                <option value="ALL">Tất cả các lane (Gộp theo 3 nhóm)</option>
                {availableLanePairs.map(pair => (
                  <option key={pair} value={pair}>{pair}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Collapsible Threshold Configuration Panel (7 controls) */}
          {isConfigOpen && (
            <div
              style={{
                marginTop: '1.25rem',
                padding: '1.25rem',
                borderRadius: '10px',
                background: 'var(--surface-subtle, #f8fafc)',
                border: '1px solid var(--border-strong, #cbd5e1)',
                animation: 'fadeIn 0.2s ease-in-out'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  <Sliders size={16} style={{ color: 'var(--ghn-orange)' }} />
                  <span>Bảng Cấu Hình Ngưỡng Cảnh Báo & Baseline (7 thông số)</span>
                </div>
                <button
                  type="button"
                  onClick={handleResetConfig}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--ghn-blue, #0063aa)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <RotateCcw size={13} /> Khôi phục mặc định
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1.2rem'
                }}
              >
                {/* 1. baselineWindowDays */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    1. Cửa sổ Baseline (ngày): <strong>{thresholdConfig.baselineWindowDays} ngày</strong>
                  </label>
                  <input
                    type="range"
                    min="7"
                    max="90"
                    step="1"
                    value={thresholdConfig.baselineWindowDays}
                    onChange={(e) => handleConfigChange('baselineWindowDays', Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>7 ngày</span>
                    <span>90 ngày</span>
                  </div>
                </div>

                {/* 2. baselineMethod */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                    2. Phương pháp Baseline:
                  </label>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="baselineMethod"
                        value="mean"
                        checked={thresholdConfig.baselineMethod === 'mean'}
                        onChange={(e) => handleConfigChange('baselineMethod', e.target.value)}
                      />
                      Trung bình (Mean)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="baselineMethod"
                        value="median"
                        checked={thresholdConfig.baselineMethod === 'median'}
                        onChange={(e) => handleConfigChange('baselineMethod', e.target.value)}
                      />
                      Trung vị (Median)
                    </label>
                  </div>
                </div>

                {/* 3. minDataPoints */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    3. Số điểm dữ liệu tối thiểu:
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="20"
                    className="filter-input"
                    value={thresholdConfig.minDataPoints}
                    onChange={(e) => handleConfigChange('minDataPoints', Math.max(2, Number(e.target.value)))}
                    style={{ width: '100%', fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ít hơn sẽ fallback lên cấp nhóm lane</span>
                </div>

                {/* 4. warningThresholdPct */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#B45309', marginBottom: '4px' }}>
                    4. Ngưỡng Cảnh báo: <strong>+{thresholdConfig.warningThresholdPct}%</strong>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={thresholdConfig.warningThresholdPct}
                    onChange={(e) => handleConfigChange('warningThresholdPct', Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>5%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* 5. criticalThresholdPct */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#B91C1C', marginBottom: '4px' }}>
                    5. Ngưỡng Nguy cấp: <strong>+{thresholdConfig.criticalThresholdPct}%</strong>
                  </label>
                  <input
                    type="range"
                    min={thresholdConfig.warningThresholdPct + 5}
                    max="150"
                    step="5"
                    value={thresholdConfig.criticalThresholdPct}
                    onChange={(e) => handleConfigChange('criticalThresholdPct', Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>&gt; Cảnh báo</span>
                    <span>150%</span>
                  </div>
                </div>

                {/* 6. lowSampleThreshold */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    6. Ngưỡng Mẫu ít (MAU &lt; N):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="filter-input"
                    value={thresholdConfig.lowSampleThreshold}
                    onChange={(e) => handleConfigChange('lowSampleThreshold', Math.max(1, Number(e.target.value)))}
                    style={{ width: '100%', fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Gắn nhãn cảnh báo 'Mẫu ít'</span>
                </div>

                {/* 7. highlightedStage */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    7. Chặng Nổi bật trên Chart:
                  </label>
                  <select
                    className="filter-select"
                    value={thresholdConfig.highlightedStage}
                    onChange={(e) => handleConfigChange('highlightedStage', e.target.value)}
                    style={{ width: '100%', fontSize: '0.8rem' }}
                  >
                    {STAGE_KEYS.map(k => (
                      <option key={k} value={k}>{STAGE_CONFIG[k].label} ({STAGE_CONFIG[k].shortLabel})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 1: Main Grouped + Stacked Bar Chart */}
        <div
          className="metric-block"
          ref={chartRef}
          style={{
            background: 'var(--surface, #ffffff)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            marginBottom: '2rem',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                📊 Phân Tích Leadtime Từng Chặng (Grouped by Lane × Stacked by Stage)
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                Chiều cao cột = Tổng trung bình có trọng số (weighted avg theo MAU) của 4 chặng. Chặng nổi bật: <strong>{STAGE_CONFIG[thresholdConfig.highlightedStage].label}</strong>.
              </div>
            </div>

            {/* Stage Legend */}
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              {STAGE_KEYS.map(k => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '3px',
                      background: STAGE_CONFIG[k].color,
                      border: thresholdConfig.highlightedStage === k ? '2px solid #000000' : 'none'
                    }}
                  />
                  <span style={{ fontWeight: thresholdConfig.highlightedStage === k ? 700 : 500 }}>
                    {STAGE_CONFIG[k].label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* SVG Hatched Pattern Definition for NULL segments */}
          <svg style={{ height: 0, width: 0, position: 'absolute' }}>
            <defs>
              <pattern id="nullHatchPattern" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="1.5" />
              </pattern>
            </defs>
          </svg>

          {/* Recharts Stacked & Grouped Bar Chart */}
          <div style={{ width: '100%', height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                barCategoryGap="25%"
                barGap={4}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border, #e2e8f0)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--text-main, #1e293b)', fontSize: 12, fontWeight: 600 }}
                  axisLine={{ stroke: 'var(--border-strong, #cbd5e1)' }}
                />
                <YAxis
                  unit="h"
                  tick={{ fill: 'var(--text-muted, #64748b)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border-strong, #cbd5e1)' }}
                />
                <Tooltip content={<CustomLeadtimeTooltip />} />

                {/* SPB Stack (if selected) */}
                {selectedClients.includes('SPB') && STAGE_KEYS.map((stageKey) => {
                  const isHighlighted = thresholdConfig.highlightedStage === stageKey;
                  return (
                    <Bar
                      key={`SPB_${stageKey}`}
                      dataKey={`SPB_${stageKey}`}
                      name={`SPB - ${STAGE_CONFIG[stageKey].label}`}
                      stackId="SPB"
                      fill={STAGE_CONFIG[stageKey].color}
                      stroke={isHighlighted ? '#1e293b' : 'none'}
                      strokeWidth={isHighlighted ? 2 : 0}
                      radius={[0, 0, 0, 0]}
                    />
                  );
                })}

                {/* SPE Stack (if selected) */}
                {selectedClients.includes('SPE') && STAGE_KEYS.map((stageKey) => {
                  const isHighlighted = thresholdConfig.highlightedStage === stageKey;
                  return (
                    <Bar
                      key={`SPE_${stageKey}`}
                      dataKey={`SPE_${stageKey}`}
                      name={`SPE - ${STAGE_CONFIG[stageKey].label}`}
                      stackId="SPE"
                      fill={STAGE_CONFIG[stageKey].color}
                      stroke={isHighlighted ? '#1e293b' : 'none'}
                      strokeWidth={isHighlighted ? 2 : 0}
                      radius={[0, 0, 0, 0]}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {selectedClients.includes('SPB') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#F15A22' }} />
                <span>Cột 1: <strong>SPB</strong> (Shopee Express Backlog)</span>
              </div>
            )}
            {selectedClients.includes('SPE') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#0063AA' }} />
                <span>Cột 2: <strong>SPE</strong> (Shopee Express Standard)</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Detailed Drill-down Table */}
        <div
          className="metric-block"
          ref={tableRef}
          style={{
            background: 'var(--surface, #ffffff)',
            borderRadius: '12px',
            marginBottom: '2rem',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border, #e2e8f0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                📋 Bảng Chi Tiết Từng Tuyến (Drill-down Table)
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                So sánh giờ từng chặng với Rolling Baseline ({thresholdConfig.baselineWindowDays} ngày) và gắn cờ cảnh báo
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleCopyImage(tableRef, 'Bảng Chi Tiết Leadtime')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.75rem', fontSize: '0.78rem', borderRadius: '6px' }}
            >
              <Copy size={13} /> Copy Bảng
            </button>
          </div>

          <div className="mtx-wrap" style={{ overflowX: 'auto' }}>
            <table className="mtx-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '130px', textAlign: 'left' }}>Nhóm Lane</th>
                  <th style={{ minWidth: '180px', textAlign: 'left' }}>Tuyến (From ➔ To)</th>
                  <th style={{ width: '70px' }}>Client</th>
                  <th style={{ width: '80px', textAlign: 'right' }}>MAU</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Pre-pickup</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>First mile</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Middle mile</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Last mile</th>
                  <th style={{ width: '90px', textAlign: 'right', background: 'var(--ghn-blue-light, #e6f0fa)', color: 'var(--ghn-blue, #0063aa)', fontWeight: 700 }}>
                    E2E
                  </th>
                  <th style={{ width: '110px', textAlign: 'center' }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedLaneTableData).map(([category, rows]) => {
                  if (rows.length === 0) return null;

                  return (
                    <React.Fragment key={category}>
                      {/* Category Header Row */}
                      <tr style={{ background: 'var(--surface-subtle, #f1f5f9)', borderTop: '2px solid var(--border-strong, #cbd5e1)' }}>
                        <td colSpan="10" style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.85rem', padding: '0.6rem 0.8rem' }}>
                          📂 {category.toUpperCase()} ({rows.length} dòng dữ liệu)
                        </td>
                      </tr>

                      {rows.map((r, idx) => {
                        return (
                          <tr key={`${category}_${r.fromprovince_new}_${r.toprovince_new}_${r.client_name}_${idx}`}>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{r.externallane_new}</td>
                            <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {r.fromprovince_new} ➔ {r.toprovince_new}
                            </td>
                            <td>
                              <span
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: r.client_name === 'SPB' ? 'rgba(241, 90, 34, 0.12)' : 'rgba(0, 99, 170, 0.12)',
                                  color: r.client_name === 'SPB' ? '#F15A22' : '#0063AA'
                                }}
                              >
                                {r.client_name}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                <span>{(Number(r.mau) || 0).toLocaleString('vi-VN')}</span>
                                {r.isLow && (
                                  <span
                                    title={`Mẫu ít (MAU < ${thresholdConfig.lowSampleThreshold})`}
                                    style={{
                                      fontSize: '0.65rem',
                                      padding: '1px 4px',
                                      borderRadius: '3px',
                                      background: 'rgba(245, 158, 11, 0.2)',
                                      color: '#B45309',
                                      fontWeight: 700
                                    }}
                                  >
                                    Mẫu ít
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 4 Stage Columns */}
                            {STAGE_KEYS.map(stageKey => {
                              const st = r.stageDeviations[stageKey];
                              const isHighlighted = thresholdConfig.highlightedStage === stageKey;

                              let devColor = 'var(--text-muted)';
                              let devSign = '';

                              if (st.level === 'critical') {
                                devColor = '#DC2626';
                                devSign = `▲ +${st.pctDeviation}%`;
                              } else if (st.level === 'warning') {
                                devColor = '#D97706';
                                devSign = `▲ +${st.pctDeviation}%`;
                              } else if (st.pctDeviation !== null) {
                                devColor = '#059669';
                                devSign = st.pctDeviation > 0 ? `+${st.pctDeviation}%` : `${st.pctDeviation}%`;
                              }

                              return (
                                <td
                                  key={stageKey}
                                  style={{
                                    textAlign: 'right',
                                    background: isHighlighted ? 'rgba(241, 90, 34, 0.03)' : 'transparent',
                                    fontWeight: isHighlighted ? 600 : 400
                                  }}
                                >
                                  <div>{st.val !== null ? `${st.val}h` : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>NULL</span>}</div>
                                  {st.pctDeviation !== null && (
                                    <div style={{ fontSize: '0.68rem', color: devColor, fontWeight: 600 }}>
                                      {devSign}
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            {/* E2E Column */}
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ghn-blue, #0063aa)' }}>
                              {r.avg_lt_e2e_hour !== null ? `${r.avg_lt_e2e_hour}h` : '–'}
                            </td>

                            {/* Overall Status Badge */}
                            <td style={{ textAlign: 'center' }}>
                              {r.maxLevel === 'critical' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#B91C1C', fontSize: '0.72rem', fontWeight: 700 }}>
                                  <AlertTriangle size={11} /> Nguy cấp
                                </span>
                              ) : r.maxLevel === 'warning' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#B45309', fontSize: '0.72rem', fontWeight: 700 }}>
                                  <AlertTriangle size={11} /> Cảnh báo
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#047857', fontSize: '0.72rem', fontWeight: 600 }}>
                                  <CheckCircle2 size={11} /> Bình thường
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Bucket "Không xác định lane" (Dedicated Section as requested in plan) */}
        {unresolvedRows.length > 0 && (
          <div
            className="metric-block"
            style={{
              background: 'var(--surface, #ffffff)',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              marginBottom: '2rem',
              border: '1px dashed #F59E0B',
              boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <HelpCircle size={18} style={{ color: '#F59E0B' }} />
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Dữ Liệu "Không Xác Định Lane" ({unresolvedRows.length} dòng)
              </h4>
              <span style={{ fontSize: '0.75rem', background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                Cả 3 cột from / to / lane đều NULL
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Các dòng này được tách riêng để không làm sai lệch chỉ số phân tích của 3 nhóm lane chính thống.
            </p>

            <div className="mtx-wrap" style={{ overflowX: 'auto' }}>
              <table className="mtx-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Report Date</th>
                    <th>Client</th>
                    <th style={{ textAlign: 'right' }}>MAU</th>
                    <th style={{ textAlign: 'right' }}>Pre-pickup</th>
                    <th style={{ textAlign: 'right' }}>First mile</th>
                    <th style={{ textAlign: 'right' }}>Middle mile</th>
                    <th style={{ textAlign: 'right' }}>Last mile</th>
                    <th style={{ textAlign: 'right' }}>E2E</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolvedRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.report_date}</td>
                      <td><strong>{r.client_name}</strong></td>
                      <td style={{ textAlign: 'right' }}>{(Number(r.mau) || 0).toLocaleString('vi-VN')}</td>
                      <td style={{ textAlign: 'right' }}>{r.avg_lt_prepickup_hour != null ? `${r.avg_lt_prepickup_hour}h` : '–'}</td>
                      <td style={{ textAlign: 'right' }}>{r.avg_lt_firstmile_hour != null ? `${r.avg_lt_firstmile_hour}h` : '–'}</td>
                      <td style={{ textAlign: 'right' }}>{r.avg_lt_middlemile_hour != null ? `${r.avg_lt_middlemile_hour}h` : '–'}</td>
                      <td style={{ textAlign: 'right' }}>{r.avg_lt_lastmile_hour != null ? `${r.avg_lt_lastmile_hour}h` : '–'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.avg_lt_e2e_hour != null ? `${r.avg_lt_e2e_hour}h` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
