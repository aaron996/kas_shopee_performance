// Utility Data Processor & Aggregator for GHN KAS Ontime Reports
import { MIEN_REGIONS, MIEN_ORDER, TARGET_KPIS } from '../data/defaultDataset';

// Format helpers
export function getHubType(row) {
  if (!row) return 'Unknown';
  return row['hub type'] || row['Hub Type'] || row.hub_type || row.Hub_Type || row.hubType || row.HubType || 'Unknown';
}

// Hub "Key Account Warehouse Ho Chi Minh" (hub_type = KA) sits inside HCM in
// the raw sheet/Supabase data, but it should be reported under its own
// "HCM - KA" vùng (same convention as "HCM - GXT"). Reassign region for any
// HCM row whose hub type is KA so every report groups it correctly.
export function reassignKaRegion(rows) {
  if (!rows) return rows;
  return rows.map(r => {
    if (!r || r.region !== 'HCM') return r;
    const type = String(getHubType(r)).trim().toUpperCase();
    if (type === 'KA') {
      return { ...r, region: 'HCM - KA' };
    }
    return r;
  });
}

export function formatPct(val) {
  if (val === null || val === undefined || isNaN(val)) return '–';
  return val.toFixed(1) + '%';
}

export function formatVol(val) {
  if (val === null || val === undefined || isNaN(val)) return '–';
  return val.toLocaleString('vi-VN');
}

export function formatDiff(diff) {
  if (diff === null || diff === undefined || isNaN(diff)) return '–';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
}

// Helper to determine day of week string (T2 - CN)
export function getWeekdayName(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const day = d.getDay();
  const map = { 0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7' };
  return map[day] || '';
}

export function formatDateLabel(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) return '–';
  const parts = dateStr.split('-');
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `${day}/${month}\n${getWeekdayName(dateStr)}`;
}

export function getWeekNumber(dateStr) {
  if (!dateStr) return '';
  const p = dateStr.split('-');
  const dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
  const week1 = new Date(dt.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((dt.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return weekNum;
}

// Group dates into Week W-1 and Week WTD
export function groupDatesByWeek(dates) {
  // Sort dates chronologically using proper Date parsing (since unpadded strings sort incorrectly)
  const parseToLocal = (dStr) => {
    const p = dStr.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  };
  
  const sorted = [...dates].sort((a, b) => parseToLocal(a) - parseToLocal(b));
  if (sorted.length === 0) return { weekPrev: [], weekCurrent: [], d1Date: '' };

  const d1Date = sorted[sorted.length - 1]; // D-1 is the last available date

  const d1 = parseToLocal(d1Date);
  const d1Day = d1.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const d1DayOffset = d1Day === 0 ? 6 : d1Day - 1; // offset from Monday (Mon=0, Tue=1, ..., Sun=6)

  const currentWeekMonday = new Date(d1);
  currentWeekMonday.setDate(d1.getDate() - d1DayOffset);

  const prevWeekMonday = new Date(currentWeekMonday);
  prevWeekMonday.setDate(currentWeekMonday.getDate() - 7);

  const weekCurrent = [];
  const weekPrev = [];

  sorted.forEach(dStr => {
    const dt = parseToLocal(dStr);
    if (dt >= currentWeekMonday && dt <= d1) {
      weekCurrent.push(dStr);
    } else if (dt >= prevWeekMonday && dt < currentWeekMonday) {
      weekPrev.push(dStr);
    }
  });

  return {
    weekPrev,
    weekCurrent,
    d1Date
  };
}

// Color calculations with Dark Mode & Theme inherited background support
export function getContinuousColorStyle(val, target, minVal) {
  if (val === null || val === undefined || isNaN(val)) {
    return {};
  }
  if (val >= target) {
    return {}; // Inherits row background dynamically in both Light & Dark Mode
  }
  
  const effectiveMin = Math.min(minVal, target - 10);
  const ratio = Math.min(1, Math.max(0, (target - val) / (target - effectiveMin)));
  
  // Translucent Red overlay (rgba) scales smoothly over light & dark backgrounds
  const alpha = 0.25 + ratio * 0.75;
  const textColor = ratio >= 0.35 ? '#FFFFFF' : 'inherit';

  return {
    backgroundColor: `rgba(225, 45, 35, ${alpha.toFixed(2)})`,
    color: textColor,
    fontWeight: ratio > 0.3 ? '700' : '500'
  };
}

export function getFixed3TierColorStyle(val, target) {
  if (val === null || val === undefined || isNaN(val)) {
    return {};
  }
  if (val >= target) {
    return {};
  }
  if (val >= target - 2.0) {
    return { backgroundColor: 'rgba(234, 179, 8, 0.25)', color: 'inherit' };
  }
  return { backgroundColor: 'rgba(225, 45, 35, 0.85)', color: '#FFFFFF', fontWeight: '600' };
}

export function getPercentile3ColorStyle(val, p25, p75) {
  if (val === null || val === undefined || isNaN(val)) {
    return {};
  }
  if (val >= p75) {
    return {};
  }
  if (val >= p25) {
    return { backgroundColor: 'rgba(234, 179, 8, 0.25)', color: 'inherit' };
  }
  return { backgroundColor: 'rgba(225, 45, 35, 0.85)', color: '#FFFFFF', fontWeight: '600' };
}

// Generate D-1 vs D-8 Executive Summary Text for Telegram
export function generateExecutiveSummary(pickRows, deliRows, clientFilter = 'SPB') {
  if (!pickRows || pickRows.length === 0) return 'Chưa có dữ liệu để tổng hợp.';

  const filteredPick = clientFilter === 'ALL' ? pickRows : pickRows.filter(r => r.client_name === clientFilter);
  const filteredDeli = clientFilter === 'ALL' ? deliRows : deliRows.filter(r => r.client_name === clientFilter);

  const dates = [...new Set(filteredPick.map(r => r.report_date))].sort();
  if (dates.length < 2) return 'Cần ít nhất dữ liệu của 2 ngày để so sánh.';

  const d1Date = dates[dates.length - 1];
  
  const parseToLocal = (dStr) => {
    const p = dStr.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  };

  const d1Obj = parseToLocal(d1Date);
  const d8Obj = new Date(d1Obj);
  d8Obj.setDate(d8Obj.getDate() - 7);

  const toDateStr = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  let d8DateStr = toDateStr(d8Obj);
  if (!dates.includes(d8DateStr)) {
    const unpadded = `${d8Obj.getFullYear()}-${d8Obj.getMonth() + 1}-${d8Obj.getDate()}`;
    if (dates.includes(unpadded)) d8DateStr = unpadded;
  }
  const d8Date = dates.includes(d8DateStr) ? d8DateStr : dates[0];

  const aggMetrics = (rowsP, rowsD, dStr) => {
    let totP = 0, ont1stP = 0, ontOprP = 0;
    let totD = 0, ont1stD = 0, ontOdrD = 0;

    rowsP.filter(r => r.report_date === dStr).forEach(r => {
      totP += (r.mau_pu || 0);
      ont1stP += (r.ontime_pu_1st || 0);
      ontOprP += (r.ontime_pu_opr || 0);
    });

    rowsD.filter(r => r.report_date === dStr).forEach(r => {
      const mauD = r.mau_deli !== undefined ? r.mau_deli : (r.mau_del || 0);
      const ont1st = r.ontime_deli_1st !== undefined ? r.ontime_deli_1st : (r.ontime_del_1st || 0);
      const ontOdr = r.ontime_deli_odr !== undefined ? r.ontime_deli_odr : (r.ontime_del_odr || 0);

      totD += Number(mauD) || 0;
      ont1stD += Number(ont1st) || 0;
      ontOdrD += Number(ontOdr) || 0;
    });

    return {
      p1st: totP > 0 ? (ont1stP / totP) * 100 : 0,
      popr: totP > 0 ? (ontOprP / totP) * 100 : 0,
      d1st: totD > 0 ? (ont1stD / totD) * 100 : 0,
      dodr: totD > 0 ? (ontOdrD / totD) * 100 : 0,
    };
  };

  const d1M = aggMetrics(filteredPick, filteredDeli, d1Date);
  const d8M = aggMetrics(filteredPick, filteredDeli, d8Date);

  const regionPickMap = {};
  filteredPick.filter(r => r.report_date === d1Date).forEach(r => {
    if (!regionPickMap[r.region]) regionPickMap[r.region] = { tot: 0, ont1st: 0, ontOpr: 0 };
    regionPickMap[r.region].tot += (r.mau_pu || 0);
    regionPickMap[r.region].ont1st += (r.ontime_pu_1st || 0);
    regionPickMap[r.region].ontOpr += (r.ontime_pu_opr || 0);
  });

  const lowestPickRegions = Object.keys(regionPickMap).map(reg => {
    const data = regionPickMap[reg];
    return {
      region: reg,
      p1st: data.tot > 0 ? (data.ont1st / data.tot) * 100 : 0,
      popr: data.tot > 0 ? (data.ontOpr / data.tot) * 100 : 0
    };
  }).sort((a, b) => a.p1st - b.p1st).slice(0, 3);

  const regionDeliMap = {};
  filteredDeli.filter(r => r.report_date === d1Date).forEach(r => {
    if (!regionDeliMap[r.region]) regionDeliMap[r.region] = { tot: 0, ont1st: 0, ontOdr: 0 };
    const mauD = r.mau_deli !== undefined ? r.mau_deli : (r.mau_del || 0);
    const ont1st = r.ontime_deli_1st !== undefined ? r.ontime_deli_1st : (r.ontime_del_1st || 0);
    const ontOdr = r.ontime_deli_odr !== undefined ? r.ontime_deli_odr : (r.ontime_del_odr || 0);

    regionDeliMap[r.region].tot += Number(mauD) || 0;
    regionDeliMap[r.region].ont1st += Number(ont1st) || 0;
    regionDeliMap[r.region].ontOdr += Number(ontOdr) || 0;
  });

  const lowestDeliRegions = Object.keys(regionDeliMap).map(reg => {
    const data = regionDeliMap[reg];
    return {
      region: reg,
      d1st: data.tot > 0 ? (data.ont1st / data.tot) * 100 : 0,
      dodr: data.tot > 0 ? (data.ontOdr / data.tot) * 100 : 0
    };
  }).sort((a, b) => a.d1st - b.d1st).slice(0, 3);

  const p1stDiff = d1M.p1st - d8M.p1st;
  const poprDiff = d1M.popr - d8M.popr;
  const d1stDiff = d1M.d1st - d8M.d1st;
  const dodrDiff = d1M.dodr - d8M.dodr;

  const p1stWord = p1stDiff >= 0 ? `tăng ${p1stDiff.toFixed(1)}%` : `giảm ${Math.abs(p1stDiff).toFixed(1)}%`;
  const poprWord = poprDiff >= 0 ? `tăng ${poprDiff.toFixed(1)}%` : `giảm ${Math.abs(poprDiff).toFixed(1)}%`;
  const d1stWord = d1stDiff >= 0 ? `tăng ${d1stDiff.toFixed(1)}%` : `giảm ${Math.abs(d1stDiff).toFixed(1)}%`;
  const dodrWord = dodrDiff >= 0 ? `tăng ${dodrDiff.toFixed(1)}%` : `giảm ${Math.abs(dodrDiff).toFixed(1)}%`;

  const d1Label = formatDateLabel(d1Date);
  const d8Label = formatDateLabel(d8Date);

  let text = `Nhận xét D-1 (${d1Label}) so với cùng thứ tuần trước (${d8Label}):\n\n`;
  text += `Lấy hàng\n`;
  text += `1st Pickup: ${d1M.p1st.toFixed(1)}% so ${d8M.p1st.toFixed(1)}% → ${p1stWord}\n`;
  text += `OPR: ${d1M.popr.toFixed(1)}% so ${d8M.popr.toFixed(1)}% → ${poprWord}\n`;
  text += `Top vùng 1st Pickup thấp nhất (D-1):\n`;
  lowestPickRegions.forEach(r => {
    text += `${r.region}: 1st ${r.p1st.toFixed(1)}% | OPR ${r.popr.toFixed(1)}%\n`;
  });

  text += `\nGiao hàng\n`;
  text += `1st Deli: ${d1M.d1st.toFixed(1)}% so ${d8M.d1st.toFixed(1)}% → ${d1stWord}\n`;
  text += `ODR: ${d1M.dodr.toFixed(1)}% so ${d8M.dodr.toFixed(1)}% → ${dodrWord}\n`;
  text += `Top vùng 1st Deli thấp nhất (D-1):\n`;
  lowestDeliRegions.forEach(r => {
    text += `${r.region}: 1st ${r.d1st.toFixed(1)}% | ODR ${r.dodr.toFixed(1)}%\n`;
  });

  return text;
}
