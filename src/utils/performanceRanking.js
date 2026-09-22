// Pure utility & ranking contracts for GHN Performance Road Ranking
import { TARGET_KPIS } from '../data/defaultDataset.js';
import { getComparisonDateInfo, getHubType } from './dataProcessor.js';

export const SUPPORTED_KPIS = [
  { id: 'p1st', label: '1st Pickup', shortLabel: '1st Pick', isDeli: false, defaultTarget: 97.0 },
  { id: 'popr', label: 'OPR', shortLabel: 'OPR', isDeli: false, defaultTarget: 90.0 },
  { id: 'd1st', label: '1st Deli', shortLabel: '1st Deli', isDeli: true, defaultTarget: 95.0 },
  { id: 'dodr', label: 'ODR', shortLabel: 'ODR', isDeli: true, defaultTarget: 90.0 }
];

// Ngưỡng cảnh báo mẫu nhỏ cấu hình tạm thời (30 đơn) để nhận diện trạm có lượng đơn thấp;
// cần bộ phận nghiệp vụ/vận hành xác nhận ngưỡng chính thức theo từng loại Hub.
export const SMALL_SAMPLE_THRESHOLD = 30;

export function getMetricDef(kpiKey) {
  const def = SUPPORTED_KPIS.find(k => k.id === kpiKey) || SUPPORTED_KPIS[0];
  const target = TARGET_KPIS[def.label] ?? def.defaultTarget;
  return { ...def, target };
}

/**
 * Tạo composite identity key cho Hub vật lý.
 * Kết hợp Region + Hub + hubType để tránh gộp 2 trạm cùng tên ở khác vùng hoặc khác loại trạm.
 */
export function getHubIdentityKey(rowOrMeta) {
  if (!rowOrMeta) return '';
  const hub = String(rowOrMeta.hub || rowOrMeta.hubName || '').trim();
  const region = String(rowOrMeta.region || '').trim();
  const hubType = String(getHubType(rowOrMeta) || rowOrMeta.hubType || 'Unknown').trim();
  return `${region}::${hub}::${hubType}`;
}

export function getRowVal(r, primaryCol, fallbackCol) {
  if (!r) return 0;
  if (r[primaryCol] !== undefined && r[primaryCol] !== null) {
    const val = Number(r[primaryCol]);
    return Number.isFinite(val) ? val : 0;
  }
  if (fallbackCol && r[fallbackCol] !== undefined && r[fallbackCol] !== null) {
    const val = Number(r[fallbackCol]);
    return Number.isFinite(val) ? val : 0;
  }
  return 0;
}

export function parseDateLocal(dStr) {
  if (typeof dStr !== 'string') return new Date(NaN);
  const parts = dStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date(NaN);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function extractSortedDates(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const distinct = [...new Set(rows.map(r => r?.report_date).filter(Boolean))];
  return distinct.sort((a, b) => {
    const tA = parseDateLocal(a).getTime();
    const tB = parseDateLocal(b).getTime();
    return tA - tB;
  });
}

/**
 * Calculates hub performance ranking for a chosen KPI.
 * - Grain identity: composite key (region::hub::hubType).
 * - Deterministic tie-break:
 *   1. KPI D-1 descending
 *   2. Sample size D-1 descending
 *   3. Hub name ascending (Vietnamese locale)
 *   4. Hub ID ascending (deterministic fallback)
 * - Delta rank: calculated strictly on the common cohort (Hubs present with valid samples in both D-1 and D-8).
 */
export function calculatePerformanceRanking({
  pickRows = [],
  deliRows = [],
  metricKey = 'p1st',
  clientFilter = 'ALL',
  selectedRegions = null,
  selectedHubTypes = null
} = {}) {
  const metricDef = getMetricDef(metricKey);
  const { isDeli, label: metricLabel, target } = metricDef;

  // Check explicit empty array semantics: [] means no-match
  const isRegionsEmpty = Array.isArray(selectedRegions) && selectedRegions.length === 0;
  const isHubTypesEmpty = Array.isArray(selectedHubTypes) && selectedHubTypes.length === 0;

  if (isRegionsEmpty || isHubTypesEmpty) {
    return {
      metricKey,
      metricLabel,
      target,
      d1Date: null,
      d8Date: null,
      ranked: [],
      unranked: [],
      totalCount: 0,
      rankedCount: 0,
      unrankedCount: 0,
      scopeEmpty: true,
      smallSampleThreshold: SMALL_SAMPLE_THRESHOLD
    };
  }

  // Choose the isolated operational dataset (Pick ONLY or Deli ONLY)
  const sourceRows = isDeli ? deliRows : pickRows;

  // Filter rows by scope
  const scopedRows = sourceRows.filter(r => {
    if (!r || !r.hub) return false;
    const clientVal = r.client_name || r.client;
    if (clientFilter !== 'ALL' && clientVal && clientVal !== clientFilter) return false;
    if (Array.isArray(selectedRegions) && !selectedRegions.includes(r.region)) return false;
    if (Array.isArray(selectedHubTypes) && !selectedHubTypes.includes(getHubType(r))) return false;
    return true;
  });

  if (scopedRows.length === 0) {
    return {
      metricKey,
      metricLabel,
      target,
      d1Date: null,
      d8Date: null,
      ranked: [],
      unranked: [],
      totalCount: 0,
      rankedCount: 0,
      unrankedCount: 0,
      scopeEmpty: false,
      smallSampleThreshold: SMALL_SAMPLE_THRESHOLD
    };
  }

  const sortedDates = extractSortedDates(scopedRows);
  if (sortedDates.length === 0) {
    return {
      metricKey,
      metricLabel,
      target,
      d1Date: null,
      d8Date: null,
      ranked: [],
      unranked: [],
      totalCount: 0,
      rankedCount: 0,
      unrankedCount: 0,
      scopeEmpty: false,
      smallSampleThreshold: SMALL_SAMPLE_THRESHOLD
    };
  }

  const d1Date = sortedDates[sortedDates.length - 1];
  const compInfo = getComparisonDateInfo(d1Date, sortedDates, 7);
  const d8Date = compInfo?.comparisonDateStr || null;

  // Metric extractor helpers
  const getSample = (r) => isDeli ? getRowVal(r, 'mau_deli', 'mau_del') : getRowVal(r, 'mau_pu');
  const getOntime = (r) => {
    if (metricKey === 'p1st') return getRowVal(r, 'ontime_pu_1st');
    if (metricKey === 'popr') return getRowVal(r, 'ontime_pu_opr');
    if (metricKey === 'd1st') return getRowVal(r, 'ontime_deli_1st', 'ontime_del_1st');
    return getRowVal(r, 'ontime_deli_odr', 'ontime_del_odr');
  };

  // Find all distinct physical hubs in the scoped dataset using composite key
  const hubMetaMap = new Map();
  const hubNameFrequency = new Map();

  scopedRows.forEach(r => {
    const hubId = getHubIdentityKey(r);
    if (!hubMetaMap.has(hubId)) {
      const hubName = r.hub;
      const region = r.region || '';
      const hubType = getHubType(r);
      hubMetaMap.set(hubId, {
        id: hubId,
        hub: hubName,
        region,
        hubType
      });
      hubNameFrequency.set(hubName, (hubNameFrequency.get(hubName) || 0) + 1);
    }
  });

  // Assign user-friendly display names with disambiguation if multiple Hubs share the same hub name
  hubMetaMap.forEach((meta) => {
    const isDuplicateName = (hubNameFrequency.get(meta.hub) || 0) > 1;
    meta.displayName = isDuplicateName ? `${meta.hub} (${meta.region} · ${meta.hubType})` : meta.hub;
    meta.isDisambiguated = isDuplicateName;
  });

  // Aggregate D-1 and D-8 for each hub using composite ID
  const hubD1Agg = new Map();
  const hubD8Agg = new Map();

  scopedRows.forEach(r => {
    const hubId = getHubIdentityKey(r);
    const date = r.report_date;
    const sample = getSample(r);
    const ontime = getOntime(r);

    if (date === d1Date) {
      const cur = hubD1Agg.get(hubId) || { sample: 0, ontime: 0 };
      cur.sample += sample;
      cur.ontime += ontime;
      hubD1Agg.set(hubId, cur);
    } else if (d8Date && date === d8Date) {
      const cur = hubD8Agg.get(hubId) || { sample: 0, ontime: 0 };
      cur.sample += sample;
      cur.ontime += ontime;
      hubD8Agg.set(hubId, cur);
    }
  });

  // Build Common Cohort for fair Delta Rank calculation
  // Common cohort consists ONLY of Hubs that have valid data on BOTH D-1 and D-8
  const commonCohortD1 = [];
  const commonCohortD8 = [];

  hubMetaMap.forEach((meta, hubId) => {
    const d1 = hubD1Agg.get(hubId);
    const d8 = hubD8Agg.get(hubId);
    if (d1 && d1.sample > 0 && d8 && d8.sample > 0) {
      const kpiD1 = (d1.ontime / d1.sample) * 100;
      const kpiD8 = (d8.ontime / d8.sample) * 100;
      commonCohortD1.push({ hubId, kpi: kpiD1, sample: d1.sample, hub: meta.hub });
      commonCohortD8.push({ hubId, kpi: kpiD8, sample: d8.sample, hub: meta.hub });
    }
  });

  // Sort cohort on D-1 deterministically
  commonCohortD1.sort((a, b) => {
    if (b.kpi !== a.kpi) return b.kpi - a.kpi;
    if (b.sample !== a.sample) return b.sample - a.sample;
    const nameCmp = a.hub.localeCompare(b.hub, 'vi', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.hubId.localeCompare(b.hubId, 'vi', { sensitivity: 'base' });
  });
  const cohortRankD1Map = new Map();
  commonCohortD1.forEach((item, idx) => cohortRankD1Map.set(item.hubId, idx + 1));

  // Sort cohort on D-8 deterministically
  commonCohortD8.sort((a, b) => {
    if (b.kpi !== a.kpi) return b.kpi - a.kpi;
    if (b.sample !== a.sample) return b.sample - a.sample;
    const nameCmp = a.hub.localeCompare(b.hub, 'vi', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.hubId.localeCompare(b.hubId, 'vi', { sensitivity: 'base' });
  });
  const cohortRankD8Map = new Map();
  commonCohortD8.forEach((item, idx) => cohortRankD8Map.set(item.hubId, idx + 1));

  const rankedCandidates = [];
  const unranked = [];

  hubMetaMap.forEach((meta, hubId) => {
    const d1 = hubD1Agg.get(hubId);
    const d8 = hubD8Agg.get(hubId);

    const hasD1Data = d1 && d1.sample > 0;
    const kpiD8 = (d8 && d8.sample > 0) ? (d8.ontime / d8.sample) * 100 : null;
    const sampleD8 = d8 ? d8.sample : 0;

    const hasCommonBaseline = cohortRankD1Map.has(hubId) && cohortRankD8Map.has(hubId);
    const cohortRankD1 = hasCommonBaseline ? cohortRankD1Map.get(hubId) : null;
    const cohortRankD8 = hasCommonBaseline ? cohortRankD8Map.get(hubId) : null;
    const deltaRank = hasCommonBaseline ? (cohortRankD8 - cohortRankD1) : null;

    if (hasD1Data) {
      const kpiD1 = (d1.ontime / d1.sample) * 100;
      const sampleD1 = d1.sample;
      const ontimeD1 = d1.ontime;
      const deltaD8 = (kpiD8 !== null) ? (kpiD1 - kpiD8) : null;
      const isSmallSample = sampleD1 < SMALL_SAMPLE_THRESHOLD;
      const meetsTarget = (target !== null && target !== undefined) ? (kpiD1 >= target) : null;

      rankedCandidates.push({
        id: hubId,
        hub: meta.hub,
        displayName: meta.displayName,
        isDisambiguated: meta.isDisambiguated,
        region: meta.region,
        hubType: meta.hubType,
        kpiD1,
        sampleD1,
        ontimeD1,
        kpiD8,
        sampleD8,
        deltaD8,
        hasCommonBaseline,
        cohortRankD1,
        cohortRankD8,
        deltaRank,
        isSmallSample,
        meetsTarget,
        hasData: true
      });
    } else {
      unranked.push({
        id: hubId,
        hub: meta.hub,
        displayName: meta.displayName,
        isDisambiguated: meta.isDisambiguated,
        region: meta.region,
        hubType: meta.hubType,
        kpiD1: null,
        sampleD1: d1 ? d1.sample : 0,
        ontimeD1: 0,
        kpiD8,
        sampleD8,
        deltaD8: null,
        rank: null,
        hasCommonBaseline: false,
        cohortRankD1: null,
        cohortRankD8: null,
        deltaRank: null,
        isSmallSample: false,
        meetsTarget: null,
        hasData: false,
        status: 'no_data'
      });
    }
  });

  // Sort ranked candidates deterministically:
  // 1. KPI D-1 descending
  // 2. Sample count descending
  // 3. Hub name ascending (locale: vi)
  // 4. Hub ID ascending (fallback tie-break)
  rankedCandidates.sort((a, b) => {
    if (b.kpiD1 !== a.kpiD1) return b.kpiD1 - a.kpiD1;
    if (b.sampleD1 !== a.sampleD1) return b.sampleD1 - a.sampleD1;
    const nameCmp = a.hub.localeCompare(b.hub, 'vi', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id, 'vi', { sensitivity: 'base' });
  });

  // Assign final rank across all D-1 eligible hubs
  const ranked = rankedCandidates.map((item, index) => {
    const rank = index + 1;
    return {
      ...item,
      rank
    };
  });

  // Sort unranked alphabetically
  unranked.sort((a, b) => {
    const nameCmp = a.hub.localeCompare(b.hub, 'vi', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id, 'vi', { sensitivity: 'base' });
  });

  return {
    metricKey,
    metricLabel,
    target,
    d1Date,
    d8Date,
    ranked,
    unranked,
    totalCount: ranked.length + unranked.length,
    rankedCount: ranked.length,
    unrankedCount: unranked.length,
    scopeEmpty: false,
    smallSampleThreshold: SMALL_SAMPLE_THRESHOLD
  };
}
