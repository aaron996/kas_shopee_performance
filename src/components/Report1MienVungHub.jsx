import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useCountUp } from '../utils/useCountUp';
import * as htmlToImage from 'html-to-image';
import { ChevronRight, Layers, ArrowUp, AlertTriangle, Maximize2, Minimize2, Download, Grid, X, Copy, Image } from 'lucide-react';
import { MIEN_REGIONS, MIEN_ORDER, TARGET_KPIS } from '../data/defaultDataset';
import { formatPct, formatVol, formatDiff, formatDateLabel, groupDatesByWeek, getContinuousColorStyle, getWeekNumber } from '../utils/dataProcessor';

function SparklineChart({ card, isGood }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!card.history || card.history.length < 2) {
    return <div style={{ height: '2px', background: isGood ? '#0F6E56' : '#A13B2A', width: '100%', marginTop: '18px' }} />;
  }

  const h = card.history;
  const dates = card.historyDates || [];
  const actualMin = Math.min(...h);
  const actualMax = Math.max(...h);
  const diff = actualMax - actualMin;
  const padding = Math.max(diff * 0.4, 5);
  
  const min = Math.min(actualMin - padding, card.target - 2);
  const max = Math.max(actualMax + padding, card.target + 2);
  const range = max - min || 1;
  
  const coords = h.map((val, idx) => {
    const x = (idx / (h.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return { x, y, val, date: dates[idx] };
  });

  let pathD = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const cx = (p0.x + p1.x) / 2;
    pathD += ` C ${cx},${p0.y} ${cx},${p1.y} ${p1.x},${p1.y}`;
  }

  const areaD = `${pathD} L 100,100 L 0,100 Z`;
  const targetY = 100 - ((card.target - min) / range) * 100;
  const lastPt = coords[coords.length - 1];

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const pctX = (mouseX / rect.width) * 100;
    
    let closestIdx = 0;
    let minDist = Infinity;
    coords.forEach((pt, idx) => {
      const dist = Math.abs(pt.x - pctX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const activePt = hoverIndex !== null ? coords[hoverIndex] : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {activePt && (
        <div style={{
          position: 'absolute',
          top: '-32px',
          left: `${Math.min(Math.max(activePt.x, 18), 82)}%`,
          transform: 'translateX(-50%)',
          background: '#0f172a',
          color: '#fff',
          padding: '3px 8px',
          borderRadius: '6px',
          fontSize: '0.7rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          zIndex: 25,
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {activePt.date ? formatDateLabel(activePt.date).replace('\n', ' ') : ''}: <span style={{ color: isGood ? '#34d399' : '#f87171' }}>{activePt.val.toFixed(1)}%</span>
        </div>
      )}
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        style={{ overflow: 'visible', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={`spark-grad-${card.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isGood ? '#0F6E56' : '#A13B2A'} stopOpacity="0.25" />
            <stop offset="100%" stopColor={isGood ? '#0F6E56' : '#A13B2A'} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {targetY >= 0 && targetY <= 100 && (
          <line x1="0" y1={targetY} x2="100" y2={targetY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" vectorEffect="non-scaling-stroke" style={{ transition: 'y1 0.6s ease, y2 0.6s ease' }} />
        )}
        <path d={areaD} fill={`url(#spark-grad-${card.id})`} style={{ transition: 'd 0.6s cubic-bezier(0.4, 0, 0.2, 1), fill 0.6s ease' }} />
        <path d={pathD} fill="none" stroke={isGood ? '#0F6E56' : '#A13B2A'} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'd 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.6s ease' }} />
        
        <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={isGood ? '#0F6E56' : '#A13B2A'} style={{ transition: 'cx 0.6s ease, cy 0.6s ease, fill 0.6s ease' }} />

        {activePt && (
          <>
            <line x1={activePt.x} y1="0" x2={activePt.x} y2="100" stroke="#64748b" strokeWidth="1" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
            <circle cx={activePt.x} cy={activePt.y} r="4" fill="#38bdf8" stroke="#fff" strokeWidth="1.5" />
          </>
        )}
      </svg>
    </div>
  );
}

const AnimatedNumber = ({ value, format = v => v, className = '' }) => {
  const animatedValue = useCountUp(value, 600);
  return <span className={className}>{format(animatedValue)}</span>;
};

export default function Report1MienVungHub({ pickRows, deliRows, clientFilter, expandAllHubs, selectedRegions = [], density, isFullscreen, setIsFullscreen }) {
  const [alertsParent] = useAutoAnimate();
  const [expandedRegions, setExpandedRegions] = useState({});
  const [showHomeBtn, setShowHomeBtn] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [highlightedSection, setHighlightedSection] = useState(null);
  const [activeTableTab, setActiveTableTab] = useState('p1st');
  const [activeKpiCard, setActiveKpiCard] = useState(0);

  const kpiCarouselRef = useRef(null);
  const refP1st = useRef(null);
  const refPOpr = useRef(null);
  const refD1st = useRef(null);
  const refDOdr = useRef(null);
  const tableBodyRef = useRef(null);
  const previousRowPositions = useRef(new Map());

  const captureTableLayout = useCallback(() => {
    const tableBody = tableBodyRef.current;
    if (!tableBody || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    previousRowPositions.current = new Map(
      [...tableBody.querySelectorAll('tr[data-motion-id]')].map((row) => [
        row.dataset.motionId,
        row.getBoundingClientRect(),
      ]),
    );
  }, []);

  useLayoutEffect(() => {
    const tableBody = tableBodyRef.current;
    if (!tableBody) return;

    const nextPositions = new Map(
      [...tableBody.querySelectorAll('tr[data-motion-id]')].map((row) => [
        row.dataset.motionId,
        { row, rect: row.getBoundingClientRect() },
      ]),
    );
    const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!shouldReduceMotion && previousRowPositions.current.size > 0) {
      nextPositions.forEach(({ row, rect }, id) => {
        const previousRect = previousRowPositions.current.get(id);

        row.getAnimations().forEach((animation) => animation.cancel());

        if (previousRect) {
          const offsetY = previousRect.top - rect.top;
          if (Math.abs(offsetY) > 0.5) {
            row.animate(
              [
                { transform: `translateY(${offsetY}px)` },
                { transform: 'translateY(0)' },
              ],
              { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
            );
          }
        } else if (row.dataset.hubRow === 'true') {
          row.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 120,
            easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          });
        }
      });
    }

    previousRowPositions.current = new Map(
      [...nextPositions.entries()].map(([id, { rect }]) => [id, rect]),
    );
  }, [expandedRegions]);
  const theadRef = useRef(null);
  const allRowRef = useRef(null);
  // Height of the sticky <thead> (2 header rows) and of the pinned TOÀN QUỐC
  // row. Measured live because both change with density (Thoáng/Dày) — the
  // "Miền" rowSpan cell of each region needs this combined offset so it can
  // stick right under them as that region scrolls by. Without it, the region
  // name (rendered on a single spanning cell) simply vanishes once its home
  // row scrolls behind the frozen header.
  const [theadHeight, setTheadHeight] = useState(72);
  const [allRowHeight, setAllRowHeight] = useState(39);

  useEffect(() => {
    const handleScroll = () => {
      setShowHomeBtn(window.scrollY > 300);
      setShowStickyBar(window.scrollY > 450);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const measure = () => setTheadHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [density]);

  useEffect(() => {
    const el = allRowRef.current;
    if (!el) return;
    const measure = () => setAllRowHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [density]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, setIsFullscreen]);

  const handleCopyImage = async (ref, titleText) => {
    if (!ref.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(ref.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      alert(`Đã copy ảnh bảng "${titleText}" vào Clipboard! Bạn có thể dán (Ctrl+V) vào Zalo/Chat.`);
    } catch (err) {
      console.error('Error copying image:', err);
      alert('Có lỗi xảy ra khi copy ảnh! Vui lòng thử lại.');
    }
  };

  const scrollToRef = (ref, sectionId) => {
    if (sectionId) {
      setActiveTableTab(sectionId);
      setHighlightedSection(sectionId);
      setTimeout(() => setHighlightedSection(null), 1800);
    }
    if (ref && ref.current) {
      // Keep the selected section clear of the navbar and the visible KPI bar.
      const stickyOffset = showStickyBar ? 118 : 76;
      const y = ref.current.getBoundingClientRect().top + window.scrollY - stickyOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Mobile KPI carousel <-> pager dots. Derived from scrollLeft rather than
  // tracked as separate state so a swipe, a dot tap and a resize can't drift
  // out of sync. Measures the first card instead of assuming a width, since
  // the card is a percentage of a viewport-dependent container.
  const handleKpiScroll = useCallback((e) => {
    const el = e.currentTarget;
    const first = el.firstElementChild;
    if (!first) return;
    const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || 0);
    if (!step) return;
    const idx = Math.round(el.scrollLeft / step);
    setActiveKpiCard((prev) => (prev === idx ? prev : idx));
  }, []);

  const scrollToKpiCard = useCallback((idx) => {
    const el = kpiCarouselRef.current;
    const target = el?.children?.[idx];
    if (!el || !target) return;
    el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  }, []);

  const toggleRegion = (regKey) => {
    captureTableLayout();
    setExpandedRegions(prev => ({ ...prev, [regKey]: !prev[regKey] }));
  };

  const expandAll = () => {
    captureTableLayout();
    const all = {};
    MIEN_ORDER.forEach(mien => {
      MIEN_REGIONS[mien].forEach(r => { all[r] = true; });
    });
    setExpandedRegions(all);
  };

  const collapseAll = () => {
    captureTableLayout();
    setExpandedRegions({});
  };

  useEffect(() => {
    const handleExportEvent = () => handleExportCSV();
    window.addEventListener('export-csv', handleExportEvent);
    return () => window.removeEventListener('export-csv', handleExportEvent);
  });



  useEffect(() => {
    if (expandAllHubs) {
      expandAll();
    } else {
      collapseAll();
    }
  }, [expandAllHubs]);

  // Filter rows by client
  const filteredPick = useMemo(() => {
    return clientFilter === 'ALL' ? pickRows : pickRows.filter(r => r.client_name === clientFilter);
  }, [pickRows, clientFilter]);

  const filteredDeli = useMemo(() => {
    return clientFilter === 'ALL' ? deliRows : deliRows.filter(r => r.client_name === clientFilter);
  }, [deliRows, clientFilter]);

  // Extract date list
  const pickDates = useMemo(() => [...new Set(filteredPick.map(r => r.report_date))].sort(), [filteredPick]);
  const deliDates = useMemo(() => [...new Set(filteredDeli.map(r => r.report_date))].sort(), [filteredDeli]);

  const { weekPrev: pWPrev, weekCurrent: pWCur, d1Date: pD1 } = useMemo(() => groupDatesByWeek(pickDates), [pickDates]);
  const { weekPrev: dWPrev, weekCurrent: dWCur, d1Date: dD1 } = useMemo(() => groupDatesByWeek(deliDates), [deliDates]);

  // "so với D-8" comparison badge shown in the hero header (mockup: dd/mm vs dd/mm)
  const compareDates = useMemo(() => {
    if (!pD1) return null;
    const shortLabel = (dateStr) => {
      const p = dateStr.split('-');
      return `${String(parseInt(p[2], 10)).padStart(2, '0')}/${String(parseInt(p[1], 10)).padStart(2, '0')}`;
    };
    const p = pD1.split('-');
    const d8Obj = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    d8Obj.setDate(d8Obj.getDate() - 7);
    const toDateStr = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    let d8Str = toDateStr(d8Obj);
    if (!pickDates.includes(d8Str)) {
      const unpadded = `${d8Obj.getFullYear()}-${d8Obj.getMonth() + 1}-${d8Obj.getDate()}`;
      if (pickDates.includes(unpadded)) d8Str = unpadded;
    }
    return { d1: shortLabel(pD1), d8: shortLabel(d8Str) };
  }, [pD1, pickDates]);

  // Helper row value extractor for flexible column names (handling mau_deli vs mau_del)
  const getRowVal = (r, primaryCol, fallbackCol) => {
    if (r[primaryCol] !== undefined && r[primaryCol] !== null) return Number(r[primaryCol]) || 0;
    if (fallbackCol && r[fallbackCol] !== undefined && r[fallbackCol] !== null) return Number(r[fallbackCol]) || 0;
    return 0;
  };

  // Operational Risk Alert Hubs (Scanning D-1 for highest absolute late volume)
  const riskAlertHubs = useMemo(() => {
    if (!pD1 && !dD1) return [];

    const hubLateList = [];

    // Check Pickup D-1
    if (pD1) {
      const pickD1Rows = filteredPick.filter(r => r.report_date === pD1);
      pickD1Rows.forEach(r => {
        const tot = getRowVal(r, 'mau_pu');
        const ont = getRowVal(r, 'ontime_pu_1st');
        const late = tot - ont;
        const pct = tot > 0 ? (ont / tot) * 100 : 100;
        if (late > 0 && pct < 97) {
          hubLateList.push({
            hub: r.hub,
            region: r.region,
            metric: '1st Pickup',
            pct,
            late,
            tot,
            target: 97,
            ref: refP1st,
            sectionId: 'p1st'
          });
        }
      });
    }

    // Check Deli D-1
    if (dD1) {
      const deliD1Rows = filteredDeli.filter(r => r.report_date === dD1);
      deliD1Rows.forEach(r => {
        const tot = getRowVal(r, 'mau_deli', 'mau_del');
        const ont = getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st');
        const late = tot - ont;
        const pct = tot > 0 ? (ont / tot) * 100 : 100;
        if (late > 0 && pct < 95) {
          hubLateList.push({
            hub: r.hub,
            region: r.region,
            metric: '1st Deli',
            pct,
            late,
            tot,
            target: 95,
            ref: refD1st,
            sectionId: 'd1st'
          });
        }
      });
    }

    // Sort by absolute late volume descending and pick top 4
    return hubLateList.sort((a, b) => b.late - a.late).slice(0, 4);
  }, [pD1, dD1, filteredPick, filteredDeli]);

  const handleRiskChipClick = (chip) => {
    // Expand region
    setExpandedRegions(prev => ({ ...prev, [chip.region]: true }));
    // Scroll to metric table section
    scrollToRef(chip.ref, chip.sectionId);
  };

  // Export Matrix Data to CSV
  const handleExportCSV = () => {
    const headers = ['Mền', 'Vùng', 'Hub', 'Report Date', 'Total Vol', 'Ontime Vol', '% Ontime'];
    const csvRows = [headers.join(',')];

    filteredPick.forEach(r => {
      const tot = getRowVal(r, 'mau_pu');
      const ont = getRowVal(r, 'ontime_pu_1st');
      const pct = tot > 0 ? ((ont / tot) * 100).toFixed(2) : '0';
      csvRows.push([`"Pickup"`, `"${r.region}"`, `"${r.hub}"`, `"${r.report_date}"`, tot, ont, `${pct}%`].join(','));
    });

    filteredDeli.forEach(r => {
      const tot = getRowVal(r, 'mau_deli', 'mau_del');
      const ont = getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st');
      const pct = tot > 0 ? ((ont / tot) * 100).toFixed(2) : '0';
      csvRows.push([`"Deli"`, `"${r.region}"`, `"${r.hub}"`, `"${r.report_date}"`, tot, ont, `${pct}%`].join(','));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GHN_Shopee_Performance_Matrix_${pD1 || 'D1'}.csv`;
    link.click();
  };

  // KPI Cards Data Calculation
  const kpiCards = useMemo(() => {
    if (!pD1 && !dD1) return [];

    const getAgg = (rows, dateStr, isDeli, metricKey) => {
      let tot = 0, ont = 0;
      if (!dateStr) return { tot, ont, pct: 0 };
      rows.filter(r => r.report_date === dateStr).forEach(r => {
        const t = isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
        const o = isDeli 
          ? (metricKey === '1st' ? getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st') : getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr'))
          : (metricKey === '1st' ? getRowVal(r, 'ontime_pu_1st') : getRowVal(r, 'ontime_pu_opr'));
        tot += t;
        ont += o;
      });
      return { tot, ont, pct: tot > 0 ? (ont / tot) * 100 : 0 };
    };

    const getD8 = (d1Str, datesArr) => {
      if (!d1Str) return null;
      const p = d1Str.split('-');
      const d8Obj = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
      d8Obj.setDate(d8Obj.getDate() - 7);
      
      const toDateStr = (dt) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      
      let d8Str = toDateStr(d8Obj);
      
      // If the dates array has unpadded dates like '2026-8-7', the above padded string might not match!
      // But wait, the dates in datesArr are exactly what's mapped from report_date.
      // Assuming datesArr contains padded dates (or unpadded), we should find a match.
      // To be safe, just try both or assume datesArr format matches what they gave.
      if (!datesArr.includes(d8Str)) {
        // Try unpadded?
        const unpadded = `${d8Obj.getFullYear()}-${d8Obj.getMonth() + 1}-${d8Obj.getDate()}`;
        if (datesArr.includes(unpadded)) d8Str = unpadded;
      }
      return datesArr.includes(d8Str) ? d8Str : datesArr[0];
    };

    const pickD8 = getD8(pD1, pickDates);
    const deliD8 = getD8(dD1, deliDates);

    const p1stD1 = getAgg(filteredPick, pD1, false, '1st');
    const poprD1 = getAgg(filteredPick, pD1, false, 'OPR');
    const d1stD1 = getAgg(filteredDeli, dD1, true, '1st');
    const dodrD1 = getAgg(filteredDeli, dD1, true, 'ODR');

    const p1stD8 = getAgg(filteredPick, pickD8, false, '1st');
    const poprD8 = getAgg(filteredPick, pickD8, false, 'OPR');
    const d1stD8 = getAgg(filteredDeli, deliD8, true, '1st');
    const dodrD8 = getAgg(filteredDeli, deliD8, true, 'ODR');

    const getHistory = (rows, datesArr, d1Str, isDeli, metricKey) => {
      if (!d1Str || !datesArr.length) return { vals: [], dates: [] };
      const d1Idx = datesArr.indexOf(d1Str);
      const endIdx = d1Idx !== -1 ? d1Idx : datesArr.length - 1;
      const startIdx = Math.max(0, endIdx - 13);
      const histDates = datesArr.slice(startIdx, endIdx + 1);
      return {
        vals: histDates.map(dStr => getAgg(rows, dStr, isDeli, metricKey).pct),
        dates: histDates
      };
    };

    const p1stHist = getHistory(filteredPick, pickDates, pD1, false, '1st');
    const poprHist = getHistory(filteredPick, pickDates, pD1, false, 'OPR');
    const d1stHist = getHistory(filteredDeli, deliDates, dD1, true, '1st');
    const dodrHist = getHistory(filteredDeli, deliDates, dD1, true, 'ODR');

    return [
      { id: 'p1st', title: '1ST PICKUP', target: TARGET_KPIS['Tỷ lệ lấy hàng đúng giờ (1st Pickup)'] || 97, d1: p1stD1, d8: p1stD8, history: p1stHist.vals, historyDates: p1stHist.dates, ref: refP1st },
      { id: 'popr', title: 'OPR', target: TARGET_KPIS['Tỷ lệ lấy hàng tổng thể (OPR)'] || 90, d1: poprD1, d8: poprD8, history: poprHist.vals, historyDates: poprHist.dates, ref: refPOpr },
      { id: 'd1st', title: '1ST DELI', target: TARGET_KPIS['Tỷ lệ giao hàng đúng giờ (1st Deli)'] || 95, d1: d1stD1, d8: d1stD8, history: d1stHist.vals, historyDates: d1stHist.dates, ref: refD1st },
      { id: 'dodr', title: 'ODR', target: TARGET_KPIS['Tỷ lệ giao hàng tổng thể (ODR)'] || 90, d1: dodrD1, d8: dodrD8, history: dodrHist.vals, historyDates: dodrHist.dates, ref: refDOdr }
    ];
  }, [pD1, dD1, filteredPick, filteredDeli, pickDates, deliDates]);

  // Render individual matrix table component
  const renderMetricTable = (title, metricKey, isDeli = false, sectionRef = null, sectionId = null) => {
    // Every title reads "Mục X.Y: <mô tả> (<tên ngắn>)". On mobile the long
    // description restates the active tab pill directly above it and wrapped
    // over three lines, so only the parenthesised short name is shown there —
    // derived here rather than passed in, to keep one source of truth.
    const shortTitle = title.match(/\(([^)]+)\)\s*$/)?.[1] ?? title;
    const rows = isDeli ? filteredDeli : filteredPick;
    const dateList = isDeli ? deliDates : pickDates;
    const weekPrev = isDeli ? dWPrev : pWPrev;
    const weekCur = isDeli ? dWCur : pWCur;
    const d1Date = isDeli ? dD1 : pD1;
    const target = TARGET_KPIS[title.replace(/^Mục \d\.\d: (.*?) \(.*\)$/, '$1')] || (isDeli ? (metricKey === '1st' ? 95.0 : 90.0) : (metricKey === '1st' ? 97.0 : 90.0));

    // Aggregate totals by date & entity
    const dateEntityMap = {}; // key: ${entityType}_${entityId}_${dateStr}
    let tableMinPct = target;

    rows.forEach(r => {
      const d = r.report_date;
      const reg = r.region;
      const hub = r.hub;
      const mien = Object.keys(MIEN_REGIONS).find(m => MIEN_REGIONS[m].includes(reg)) || 'Miền Khác';

      const tot = isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
      const ont = isDeli 
        ? (metricKey === '1st' ? getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st') : getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr'))
        : (metricKey === '1st' ? getRowVal(r, 'ontime_pu_1st') : getRowVal(r, 'ontime_pu_opr'));

      // Hub level
      const hKey = `HUB_${reg}_${hub}_${d}`;
      if (!dateEntityMap[hKey]) dateEntityMap[hKey] = { tot: 0, ont: 0 };
      dateEntityMap[hKey].tot += tot;
      dateEntityMap[hKey].ont += ont;

      // Region level
      const rKey = `REG_${reg}_${d}`;
      if (!dateEntityMap[rKey]) dateEntityMap[rKey] = { tot: 0, ont: 0, bestVol: 0, bestOnt: 0, sameVol: 0, sameOnt: 0 };
      dateEntityMap[rKey].tot += tot;
      dateEntityMap[rKey].ont += ont;

      if (d === d1Date) {
        const bVolKey = metricKey === '1st' ? 'best_l6w_vol_1st' : (isDeli ? 'best_l6w_vol_odr' : 'best_l6w_vol_opr');
        const bOntKey = metricKey === '1st' ? 'best_l6w_ontime_1st' : (isDeli ? 'best_l6w_ontime_odr' : 'best_l6w_ontime_opr');
        const sOntKey = metricKey === '1st' ? 'sameday_lm_ontime_1st' : (isDeli ? 'sameday_lm_ontime_odr' : 'sameday_lm_ontime_opr');

        dateEntityMap[rKey].bestVol += getRowVal(r, bVolKey);
        dateEntityMap[rKey].bestOnt += getRowVal(r, bOntKey);
        dateEntityMap[rKey].sameVol += getRowVal(r, 'sameday_lm_vol');
        dateEntityMap[rKey].sameOnt += getRowVal(r, sOntKey);
      }

      // Mền level
      const mKey = `MIEN_${mien}_${d}`;
      if (!dateEntityMap[mKey]) dateEntityMap[mKey] = { tot: 0, ont: 0 };
      dateEntityMap[mKey].tot += tot;
      dateEntityMap[mKey].ont += ont;

      // Toàn quốc level
      const tKey = `TQ_TQ_${d}`;
      if (!dateEntityMap[tKey]) dateEntityMap[tKey] = { tot: 0, ont: 0 };
      dateEntityMap[tKey].tot += tot;
      dateEntityMap[tKey].ont += ont;
    });

    // Helper to calculate Pct & Vol for an entity across a list of dates
    const calcStats = (keyPrefix, dates) => {
      let tot = 0, ont = 0;
      dates.forEach(d => {
        const item = dateEntityMap[`${keyPrefix}_${d}`];
        if (item) {
          tot += item.tot;
          ont += item.ont;
        }
      });
      const pct = tot > 0 ? (ont / tot) * 100 : null;
      if (pct !== null && pct < tableMinPct) tableMinPct = pct;
      return { tot, ont, pct };
    };

    // Calculate Table Min Pct for continuous color interpolation
    MIEN_ORDER.forEach(mien => {
      MIEN_REGIONS[mien].forEach(reg => {
        dateList.forEach(d => {
          const item = dateEntityMap[`REG_${reg}_${d}`];
          if (item && item.tot > 0) {
            const p = (item.ont / item.tot) * 100;
            if (p < tableMinPct) tableMinPct = p;
          }
        });
      });
    });

    const isHighlighted = highlightedSection === sectionId;

    const prevWeekNum = weekPrev.length > 0 ? getWeekNumber(weekPrev[weekPrev.length - 1]) : '';
    const curWeekNum = weekCur.length > 0 ? getWeekNumber(weekCur[weekCur.length - 1]) : (d1Date ? getWeekNumber(d1Date) : '');

    return (
      <div className={`metric-block metric-block-sticky ${isHighlighted ? 'section-pulse-glow' : ''}`} key={title} ref={sectionRef}>
        {/* Layout comes from .metric-header in CSS (flex / space-between /
            center) — keep it there so the mobile breakpoint can restack it. */}
        <div className="metric-header">
          <div className="metric-title">
            <span className="metric-title-text">{title}</span>
            <span className="metric-title-short">{shortTitle}</span>
            <span className="kpi-badge">Target ≥ {target.toFixed(0)}%</span>
          </div>
          <button 
            onClick={() => handleCopyImage(sectionRef, title)}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--ghn-blue-dark)', border: '1px solid var(--border-strong)', background: 'var(--surface-hover)', borderRadius: '6px' }}
            title="Copy bảng này thành ảnh"
          >
            <Copy size={13} /> Copy Ảnh
          </button>
        </div>

        <div className="mtx-wrap report1-master-table" style={{ '--thead-h': `${theadHeight}px`, '--allrow-h': `${allRowHeight}px` }}>
          <table className="mtx-table">
            <thead ref={theadRef}>
              {/* Row 1: Week Titles */}
              <tr>
                <th rowSpan="2" className="lbl lbl-1 desktop-only">Miền</th>
                <th rowSpan="2" className="lbl lbl-2">Vùng / Hub</th>
                {weekPrev.length > 0 && (
                  <th colSpan={weekPrev.length} style={{ borderRight: '1.5px solid rgba(255,255,255,0.4)' }}>
                    TUẦN W-1 {prevWeekNum ? `(Tuần ${prevWeekNum})` : ''}
                  </th>
                )}
                {/* Week Cur: daily dates up to D-1 (D-1 spans 2 cols) */}
                {weekCur.length > 0 && (
                  <th colSpan={weekCur.length + 1}>
                    TUẦN HIỆN TẠI {curWeekNum ? `(Tuần ${curWeekNum})` : ''}
                  </th>
                )}
                {/* Header merge for WTD (spanning both rows) */}
                <th colSpan="2" rowSpan="2" style={{ background: 'var(--action-primary-deep)', borderLeft: '1.5px solid rgba(255,255,255,0.4)', verticalAlign: 'middle' }}>
                  WTD (CỘNG DỒN)
                </th>
                {/* Best 6W & Sameday */}
                <th rowSpan="2" className="col-summary" style={{ borderLeft: '1.5px solid rgba(255,255,255,0.4)', verticalAlign: 'middle' }}>
                  Tốt nhất<br />6 tuần
                </th>
                <th rowSpan="2" className="col-summary" style={{ verticalAlign: 'middle' }}>
                  Cùng ngày<br />tháng trước
                </th>
              </tr>

              {/* Row 2: Daily Dates */}
              <tr>
                {weekPrev.map((d, idx) => (
                  <th key={d} className={idx === 0 ? 'sep' : ''}>{formatDateLabel(d)}</th>
                ))}
                {weekCur.slice(0, -1).map(d => (
                  <th key={d}>{formatDateLabel(d)}</th>
                ))}
                {/* D-1 header (merged over 2 cols, replacing % Ontime and Vol D-1) */}
                <th colSpan="2" style={{ background: 'var(--action-primary-hover)', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  {formatDateLabel(d1Date)}
                </th>
              </tr>
            </thead>

            <tbody ref={tableBodyRef}>
              {/* 1. TOÀN QUỐC ROW — pinned right below the sticky thead so it
                  never scrolls out of view underneath the header. */}
              <tr className="all-row all-row-sticky" ref={allRowRef} data-motion-id="all">
                <td colSpan="2" className="lbl lbl-1 all-row-label desktop-only">TOÀN QUỐC</td>
                <td colSpan="1" className="lbl lbl-2 all-row-label mobile-only">TOÀN QUỐC</td>
                {weekPrev.map((d, idx) => {
                  const s = calcStats('TQ_TQ', [d]);
                  return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                })}
                {weekCur.slice(0, -1).map(d => {
                  const s = calcStats('TQ_TQ', [d]);
                  return <td key={d} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                })}
                {/* D-1 */}
                {(() => {
                  const d1S = calcStats('TQ_TQ', [d1Date]);
                  const wtdS = calcStats('TQ_TQ', weekCur);
                  return (
                    <>
                      <td className="sep" style={getContinuousColorStyle(d1S.pct, target, tableMinPct)}>{formatPct(d1S.pct)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(d1S.tot)}</td>
                      <td className="sep" style={getContinuousColorStyle(wtdS.pct, target, tableMinPct)}>{formatPct(wtdS.pct)}</td>
                      <td style={{ fontWeight: 'bold' }}>{formatVol(wtdS.tot)}</td>
                      <td>–</td>
                      <td>–</td>
                    </>
                  );
                })()}
              </tr>

              {/* 2. MIỀN & VÙNG ROWS */}
              {MIEN_ORDER.map(mien => {
                const filteredMienRegions = MIEN_REGIONS[mien].filter(r => selectedRegions.length === 0 || selectedRegions.includes(r));
                if (filteredMienRegions.length === 0) return null;

                const mienStats = calcStats(`MIEN_${mien}`, weekCur);
                
                // Sort regions in this Miền by D-1 volume descending
                const sortedRegions = [...filteredMienRegions].sort((a, b) => {
                  const volA = dateEntityMap[`REG_${a}_${d1Date}`]?.tot || 0;
                  const volB = dateEntityMap[`REG_${b}_${d1Date}`]?.tot || 0;
                  return volB - volA;
                });
                
                // Calculate total rowSpan for the Miền column
                // 1 (Miền total row) + number of regions + number of expanded top 10 hubs in this Miền
                let totalRowSpan = 1 + sortedRegions.length;
                sortedRegions.forEach(reg => {
                  if (expandedRegions[reg]) {
                    const hubMap = {};
                    rows.filter(r => r.region === reg).forEach(r => {
                      if (!hubMap[r.hub]) hubMap[r.hub] = 0;
                      if (r.report_date === d1Date) {
                        const tot = isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
                        const ont = isDeli 
                          ? (metricKey === '1st' ? getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st') : getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr'))
                          : (metricKey === '1st' ? getRowVal(r, 'ontime_pu_1st') : getRowVal(r, 'ontime_pu_opr'));
                        hubMap[r.hub] += (tot - ont);
                      }
                    });
                    const top10Hubs = Object.keys(hubMap).sort((a, b) => hubMap[b] - hubMap[a]).slice(0, 10);
                    totalRowSpan += top10Hubs.length;
                  }
                });

                return (
                  <React.Fragment key={mien}>
                    {/* Miền Header Row */}
                    <tr className="grp-row" data-motion-id={`mien:${mien}`} style={{ borderTop: '2.5px solid var(--ghn-blue)' }}>
                      {/* Sticky so the region name stays visible for as long as any of
                          its rows (spanned by rowSpan) are on screen — otherwise it only
                          ever renders on this one row and disappears the moment this row
                          scrolls behind the frozen header, even while its hub rows below
                          are still visible. */}
                      <td rowSpan={totalRowSpan} className="lbl lbl-1 mien-sticky-label desktop-only" style={{ fontWeight: 'bold', verticalAlign: 'top', paddingTop: '0.6rem' }}>{mien}</td>
                      <td className="lbl lbl-2" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Tổng {mien}</td>
                      {weekPrev.map((d, idx) => {
                        const s = calcStats(`MIEN_${mien}`, [d]);
                        return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                      })}
                      {weekCur.slice(0, -1).map(d => {
                        const s = calcStats(`MIEN_${mien}`, [d]);
                        return <td key={d} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                      })}
                      {(() => {
                        const d1S = calcStats(`MIEN_${mien}`, [d1Date]);
                        const wtdS = mienStats;
                        return (
                          <>
                            <td className="sep" style={getContinuousColorStyle(d1S.pct, target, tableMinPct)}>{formatPct(d1S.pct)}</td>
                            <td>{formatVol(d1S.tot)}</td>
                            <td className="sep" style={getContinuousColorStyle(wtdS.pct, target, tableMinPct)}>{formatPct(wtdS.pct)}</td>
                            <td>{formatVol(wtdS.tot)}</td>
                            <td>–</td>
                            <td>–</td>
                          </>
                        );
                      })()}
                    </tr>

                    {/* Vùng Rows inside Miền */}
                    {sortedRegions.map(reg => {
                      const isExpanded = !!expandedRegions[reg];
                      const d1RegData = dateEntityMap[`REG_${reg}_${d1Date}`] || { tot: 0, ont: 0, bestVol: 0, bestOnt: 0, sameVol: 0, sameOnt: 0 };
                      const regD1Pct = d1RegData.tot > 0 ? (d1RegData.ont / d1RegData.tot) * 100 : null;

                      const bestPct = d1RegData.bestVol > 0 ? (d1RegData.bestOnt / d1RegData.bestVol) * 100 : null;
                      const samePct = d1RegData.sameVol > 0 ? (d1RegData.sameOnt / d1RegData.sameVol) * 100 : null;

                      const diffBest = regD1Pct !== null && bestPct !== null ? regD1Pct - bestPct : null;
                      const diffSame = regD1Pct !== null && samePct !== null ? regD1Pct - samePct : null;

                      const regWtd = calcStats(`REG_${reg}`, weekCur);

                      // Get Top 10 Hubs for this region sorted by absolute late volume on D-1
                      const hubMap = {};
                      rows.filter(r => r.region === reg).forEach(r => {
                        if (!hubMap[r.hub]) hubMap[r.hub] = 0;
                        if (r.report_date === d1Date) {
                          const tot = isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
                          const ont = isDeli 
                            ? (metricKey === '1st' ? getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st') : getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr'))
                            : (metricKey === '1st' ? getRowVal(r, 'ontime_pu_1st') : getRowVal(r, 'ontime_pu_opr'));
                          hubMap[r.hub] += (tot - ont);
                        }
                      });

                      const top10Hubs = Object.keys(hubMap)
                        .sort((a, b) => hubMap[b] - hubMap[a])
                        .slice(0, 10);

                      return (
                        <React.Fragment key={reg}>
                          <tr data-motion-id={`region:${reg}`}>
                            <td className="lbl lbl-2">
                              <button
                                className={`toggle-btn hub-disclosure ${isExpanded ? 'is-expanded' : ''}`}
                                onClick={() => toggleRegion(reg)}
                                aria-expanded={isExpanded}
                                aria-label={`${isExpanded ? 'Thu gọn' : 'Mở rộng'} hub của vùng ${reg}`}
                              >
                                <ChevronRight size={14} aria-hidden="true" />
                              </button>
                              <strong>{reg}</strong>
                            </td>
                            {weekPrev.map((d, idx) => {
                              const s = calcStats(`REG_${reg}`, [d]);
                              return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                            })}
                            {weekCur.slice(0, -1).map(d => {
                              const s = calcStats(`REG_${reg}`, [d]);
                              return <td key={d} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                            })}
                            {/* D-1 & WTD */}
                            <td className="sep" style={getContinuousColorStyle(regD1Pct, target, tableMinPct)}>{formatPct(regD1Pct)}</td>
                            <td>{formatVol(d1RegData.tot)}</td>
                            <td className="sep" style={getContinuousColorStyle(regWtd.pct, target, tableMinPct)}>{formatPct(regWtd.pct)}</td>
                            <td>{formatVol(regWtd.tot)}</td>
                            
                            {/* Best 6W Diff */}
                            <td>
                              {diffBest !== null ? (
                                <span className={`diff-badge ${diffBest >= 0 ? 'up' : 'down'}`}>
                                  {formatDiff(diffBest)}
                                </span>
                              ) : '–'}
                            </td>

                            {/* Sameday Diff */}
                            <td>
                              {diffSame !== null ? (
                                <span className={`diff-badge ${diffSame >= 0 ? 'up' : 'down'}`}>
                                  {formatDiff(diffSame)}
                                </span>
                              ) : '–'}
                            </td>
                          </tr>

                          {/* Render Top 10 Hub Sub-rows if expanded */}
                          {isExpanded && top10Hubs.map(hub => {
                            const hubD1 = calcStats(`HUB_${reg}_${hub}`, [d1Date]);
                            const hubWtd = calcStats(`HUB_${reg}_${hub}`, weekCur);
                            return (
                              <tr key={hub} className="sub-row" data-motion-id={`hub:${reg}:${hub}`} data-hub-row="true">
                                <td className="lbl lbl-2" style={{ paddingLeft: '2rem' }}>{hub}</td>
                                {weekPrev.map((d, idx) => {
                                  const s = calcStats(`HUB_${reg}_${hub}`, [d]);
                                  return <td key={d} className={idx === 0 ? 'sep' : ''} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                                })}
                                {weekCur.slice(0, -1).map(d => {
                                  const s = calcStats(`HUB_${reg}_${hub}`, [d]);
                                  return <td key={d} style={getContinuousColorStyle(s.pct, target, tableMinPct)}>{formatPct(s.pct)}</td>;
                                })}
                                <td className="sep" style={getContinuousColorStyle(hubD1.pct, target, tableMinPct)}>{formatPct(hubD1.pct)}</td>
                                <td>{formatVol(hubD1.tot)}</td>
                                <td className="sep" style={getContinuousColorStyle(hubWtd.pct, target, tableMinPct)}>{formatPct(hubWtd.pct)}</td>
                                <td>{formatVol(hubWtd.tot)}</td>
                                <td>–</td>
                                <td>–</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="table-legend">
          <div className="legend-items">
            <span className="legend-title" style={{ fontWeight: 600 }}>Rule màu (Thang liên tục):</span>
            <div className="legend-item">
              <div className="legend-box legend-box-good"></div>
              <span>≥ {target.toFixed(0)}% (Đạt target)</span>
            </div>
            <div className="legend-item">
              <div className="legend-box" style={{ background: '#E8362C' }}></div>
              <span>Thấp nhất thực tế ({tableMinPct.toFixed(1)}%)</span>
            </div>
          </div>
          <div>* Hubs mặc định ẩn, click ▶ để mở top 10 hub trễ tuyệt đối nhiều nhất.</div>
        </div>
      </div>
    );
  };

  return (
    <div className={`${isFullscreen ? 'fullscreen-mode-active' : ''} ${showStickyBar ? 'has-sticky-kpi' : ''}`}>
      {/* Sticky Mini KPI Top Bar */}
      {showStickyBar && (
        <div className="sticky-kpi-bar">
          <div className="sticky-kpi-bar-inner">
            <span className="sticky-title">KPI Nationwide:</span>
            {kpiCards.map(card => {
              const isGood = card.d1.pct >= card.target;
              return (
                <button key={card.id} className="sticky-kpi-item" onClick={() => scrollToRef(card.ref, card.id)}>
                  <span className="name">{card.title}</span>
                  <span className={`pct ${isGood ? 'good' : 'bad'}`}>{card.d1.pct.toFixed(1)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Exit Fullscreen Button */}
      {isFullscreen && (
        <button 
          onClick={() => setIsFullscreen(false)}
          style={{
            position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
            background: '#e11d48', color: 'white', border: 'none',
            borderRadius: '50%', width: '40px', height: '40px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 15px rgba(225, 29, 72, 0.4)'
          }}
          title="Thoát toàn màn hình (Phím Esc)"
        >
          <X size={20} />
        </button>
      )}

      {/* Top Split Dashboard (Layout 2: Card-Based) */}
      <div className="top-split-dashboard">

        {/* Left: KPI Overview */}
        <div className="top-split-left">
          <div className="kpi-cards-header-glass">
            <span className="kpi-header-title">
              <span className="kpi-header-accent"></span>
              TỔNG QUAN D-1 <span className="kpi-header-scope">· Nationwide</span>
            </span>
            {compareDates && (
              <span className="kpi-header-compare">
                so với D-8: <b>{compareDates.d1}</b> vs {compareDates.d8}
              </span>
            )}
          </div>
          <div className="kpi-cards-container" ref={kpiCarouselRef} onScroll={handleKpiScroll}>
            {kpiCards.map(card => {
              const diff = card.d1.pct - card.d8.pct;
              const diffStr = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
              const lateVol = card.d1.tot - card.d1.ont;
              const isGood = card.d1.pct >= card.target;
              
              return (
                <div key={card.id} className="kpi-card" onClick={() => scrollToRef(card.ref, card.id)}>
                  <div className="kpi-card-title">
                    <span>{card.title}</span>
                    <span className={`kpi-card-target ${isGood ? 'good' : 'bad'}`}>≥{card.target}%</span>
                  </div>
                  <div className="kpi-card-main">
                    <AnimatedNumber 
                      value={card.d1.pct} 
                      format={v => `${v.toFixed(1)}%`} 
                      className={`kpi-card-pct ${isGood ? 'good' : ''}`} 
                    />
                    <AnimatedNumber 
                      value={diff} 
                      format={v => v > 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`} 
                      className={`kpi-card-diff ${diff >= 0 ? 'up' : 'down'}`} 
                    />
                  </div>
                  
                  {/* Visual sparkline */}
                  <div className="kpi-card-chart">
                    <SparklineChart card={card} isGood={isGood} />
                  </div>

                  <div className="kpi-card-stats">
                    <AnimatedNumber value={card.d1.tot} format={v => `${formatVol(Math.round(v))} đơn`} />
                    <AnimatedNumber value={lateVol} format={v => `${formatVol(Math.round(v))} trễ`} className="late" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pager dots for the mobile carousel (hidden on desktop, where all
              four cards are visible at once). */}
          {kpiCards.length > 1 && (
            <div className="kpi-carousel-dots">
              {kpiCards.map((card, idx) => (
                <button
                  key={card.id}
                  type="button"
                  className={`kpi-carousel-dot ${idx === activeKpiCard ? 'active' : ''}`}
                  onClick={() => scrollToKpiCard(idx)}
                  aria-label={`Xem ${card.title}`}
                  aria-current={idx === activeKpiCard}
                />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Full-width alert strip (mockup: horizontal scrollable row of hub chips) */}
      <div className="alert-strip-sleek">
        <div className="risk-alert-title-sleek">
          <AlertTriangle size={16} className="risk-alert-icon-sleek" />
          <span>CẦN CAN THIỆP D-1</span>
        </div>

        {riskAlertHubs.length > 0 ? (
          <div className="risk-chips-list-sleek" ref={alertsParent}>
            {riskAlertHubs.map((chip, idx) => (
              <button
                key={`${chip.hub}_${idx}`}
                className="risk-chip-sleek"
                onClick={() => handleRiskChipClick(chip)}
                title={`Nhấp để mở rộng Vùng ${chip.region} và cuộn tới hàng ${chip.hub}`}
              >
                <b className="risk-chip-hub-sleek">{chip.hub}</b>
                <span className="risk-chip-metric-sleek">{chip.metric}</span>
                <b className="risk-chip-pct-sleek">{chip.pct.toFixed(1)}%</b>
                <span className="risk-chip-late-sleek">-{formatVol(chip.late)} đơn trễ</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="risk-chips-empty-sleek">
            ✅ Tất cả các Hub đều đạt chỉ tiêu hoặc trễ không đáng kể.
          </div>
        )}
      </div>


      <div className={`density-${density} kpi-tab-container`}>
        <div className="kpi-table-tabs">
          <button className={`kpi-table-tab ${activeTableTab === 'p1st' ? 'active' : ''}`} onClick={() => setActiveTableTab('p1st')}>
            1.1 - 1st Pickup
          </button>
          <button className={`kpi-table-tab ${activeTableTab === 'popr' ? 'active' : ''}`} onClick={() => setActiveTableTab('popr')}>
            1.2 - OPR
          </button>
          <button className={`kpi-table-tab ${activeTableTab === 'd1st' ? 'active' : ''}`} onClick={() => setActiveTableTab('d1st')}>
            1.3 - 1st Deli
          </button>
          <button className={`kpi-table-tab ${activeTableTab === 'dodr' ? 'active' : ''}`} onClick={() => setActiveTableTab('dodr')}>
            1.4 - ODR
          </button>
        </div>
        <div className="kpi-table-content">
          {activeTableTab === 'p1st' && renderMetricTable('Mục 1.1: Tỷ lệ lấy hàng đúng giờ (1st Pickup)', '1st', false, refP1st, 'p1st')}
          {activeTableTab === 'popr' && renderMetricTable('Mục 1.2: Tỷ lệ lấy hàng tổng thể (OPR)', 'OPR', false, refPOpr, 'popr')}
          {activeTableTab === 'd1st' && renderMetricTable('Mục 1.3: Tỷ lệ giao hàng đúng giờ (1st Deli)', '1st', true, refD1st, 'd1st')}
          {activeTableTab === 'dodr' && renderMetricTable('Mục 1.4: Tỷ lệ giao hàng tổng thể (ODR)', 'ODR', true, refDOdr, 'dodr')}
        </div>
      </div>
      
      {showHomeBtn && (
        <button className="home-fab" onClick={scrollToTop} aria-label="Cuộn lên đầu trang">
          <ArrowUp size={24} />
        </button>
      )}
    </div>
  );
}
