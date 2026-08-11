import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import { ChevronRight, ChevronDown, Layers, ArrowUp, AlertTriangle, Maximize2, Minimize2, Download, Grid, X, Copy, Image } from 'lucide-react';
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
          <line x1="0" y1={targetY} x2="100" y2={targetY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" vectorEffect="non-scaling-stroke" />
        )}
        <path d={areaD} fill={`url(#spark-grad-${card.id})`} />
        <path d={pathD} fill="none" stroke={isGood ? '#0F6E56' : '#A13B2A'} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        
        <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={isGood ? '#0F6E56' : '#A13B2A'} />

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

export default function Report1MienVungHub({ pickRows, deliRows, clientFilter, expandAllHubs, selectedRegions = [], density, isFullscreen, setIsFullscreen }) {
  const [expandedRegions, setExpandedRegions] = useState({});
  const [showHomeBtn, setShowHomeBtn] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [highlightedSection, setHighlightedSection] = useState(null);

  const refP1st = useRef(null);
  const refPOpr = useRef(null);
  const refD1st = useRef(null);
  const refDOdr = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setShowHomeBtn(window.scrollY > 300);
      setShowStickyBar(window.scrollY > 450);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      setHighlightedSection(sectionId);
      setTimeout(() => setHighlightedSection(null), 1800);
    }
    if (ref && ref.current) {
      const y = ref.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleRegion = (regKey) => {
    setExpandedRegions(prev => ({ ...prev, [regKey]: !prev[regKey] }));
  };

  const expandAll = () => {
    const all = {};
    MIEN_ORDER.forEach(mien => {
      MIEN_REGIONS[mien].forEach(r => { all[r] = true; });
    });
    setExpandedRegions(all);
  };

  const collapseAll = () => {
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
      <div className={`metric-block ${isHighlighted ? 'section-pulse-glow' : ''}`} key={title} ref={sectionRef}>
        <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="metric-title">
            <span>{title}</span>
            <span className="kpi-badge">Target ≥ {target.toFixed(0)}%</span>
          </div>
          <button 
            onClick={() => handleCopyImage(sectionRef, title)}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--ghn-blue-dark)', border: '1px solid #cbd5e1', background: '#f1f5f9', borderRadius: '6px' }}
            title="Copy bảng này thành ảnh"
          >
            <Copy size={13} /> Copy Ảnh
          </button>
        </div>

        <div className="mtx-wrap">
          <table className="mtx-table">
            <thead>
              {/* Row 1: Week Titles */}
              <tr>
                <th rowSpan="2" className="lbl lbl-1">Miền</th>
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
                <th colSpan="2" rowSpan="2" style={{ background: '#00365e', borderLeft: '1.5px solid rgba(255,255,255,0.4)', verticalAlign: 'middle' }}>
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
                <th colSpan="2" style={{ background: '#004b82', borderLeft: '1.5px solid rgba(255,255,255,0.4)' }}>
                  {formatDateLabel(d1Date)}
                </th>
              </tr>
            </thead>

            <tbody>
              {/* 1. TOÀN QUỐC ROW */}
              <tr className="all-row">
                <td colSpan="2" className="lbl lbl-1" style={{ position: 'sticky', left: 0, zIndex: 10 }}>TOÀN QUỐC</td>
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
                    <tr className="grp-row" style={{ borderTop: '2.5px solid var(--ghn-blue)' }}>
                      <td rowSpan={totalRowSpan} className="lbl lbl-1" style={{ fontWeight: 'bold', verticalAlign: 'top', paddingTop: '0.6rem' }}>{mien}</td>
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
                          <tr>
                            <td className="lbl lbl-2">
                              <button className="toggle-btn" onClick={() => toggleRegion(reg)}>
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
                              <tr key={hub} className="sub-row">
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
    <div className={isFullscreen ? 'fullscreen-mode-active' : ''}>
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
            TỔNG QUAN D-1
          </div>
          <div className="kpi-cards-container">
            {kpiCards.map(card => {
              const diff = card.d1.pct - card.d8.pct;
              const diffStr = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
              const lateVol = card.d1.tot - card.d1.ont;
              const isGood = card.d1.pct >= card.target;
              
              return (
                <div key={card.id} className="kpi-card" onClick={() => scrollToRef(card.ref, card.id)}>
                  <div className="kpi-card-title">
                    <span>{card.title}</span>
                    <span className="kpi-card-target">≥{card.target}%</span>
                  </div>
                  <div className="kpi-card-main">
                    <span className={`kpi-card-pct ${isGood ? 'good' : ''}`}>
                      {card.d1.pct.toFixed(1)}%
                    </span>
                    <span className={`kpi-card-diff ${diff >= 0 ? 'up' : 'down'}`}>
                      {diffStr}
                    </span>
                  </div>
                  
                  {/* Visual sparkline */}
                  <div className="kpi-card-chart">
                    <SparklineChart card={card} isGood={isGood} />
                  </div>

                  <div className="kpi-card-stats">
                    <span>{formatVol(card.d1.tot)} đơn</span>
                    <span className="late">{formatVol(lateVol)} trễ</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Needs Intervention (Alerts) */}
        <div className="top-split-right">
          <div className="risk-alert-title-sleek">
            <AlertTriangle size={16} className="risk-alert-icon-sleek" />
            <span>CẦN CAN THIỆP D-1</span>
          </div>
          
          {riskAlertHubs.length > 0 ? (
            <div className="risk-chips-list-sleek">
              {riskAlertHubs.map((chip, idx) => (
                <button 
                  key={`${chip.hub}_${idx}`} 
                  className="risk-chip-sleek"
                  onClick={() => handleRiskChipClick(chip)}
                  title={`Nhấp để mở rộng Vùng ${chip.region} và cuộn tới hàng ${chip.hub}`}
                >
                  <div className="risk-chip-header">
                    <AlertTriangle size={12} /> {chip.hub}
                  </div>
                  <div className="risk-chip-details">
                    <span className="risk-chip-metric-sleek">{chip.metric}</span>
                    <span className="risk-chip-pct-sleek">{chip.pct.toFixed(1)}%</span>
                  </div>
                  <div className="risk-chip-late-sleek">-{formatVol(chip.late)} đơn trễ</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>✅</div>
              Tất cả các Hub đều đạt chỉ tiêu hoặc trễ không đáng kể.
            </div>
          )}
        </div>

      </div>


      <div className={`density-${density}`}>
        {renderMetricTable('Mục 1.1: Tỷ lệ lấy hàng đúng giờ (1st Pickup)', '1st', false, refP1st, 'p1st')}
        {renderMetricTable('Mục 1.2: Tỷ lệ lấy hàng tổng thể (OPR)', 'OPR', false, refPOpr, 'popr')}
        {renderMetricTable('Mục 1.3: Tỷ lệ giao hàng đúng giờ (1st Deli)', '1st', true, refD1st, 'd1st')}
        {renderMetricTable('Mục 1.4: Tỷ lệ giao hàng tổng thể (ODR)', 'ODR', true, refDOdr, 'dodr')}
      </div>
      
      {showHomeBtn && (
        <button className="home-fab" onClick={scrollToTop} aria-label="Cuộn lên đầu trang">
          <ArrowUp size={24} />
        </button>
      )}
    </div>
  );
}
