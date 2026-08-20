// Calculation and classification engine for Tab "Leadtime từng chặng"
// All calculations accept dynamic thresholdConfig as input (never hardcoded inside functions).

export const DEFAULT_THRESHOLD_CONFIG = {
  baselineWindowDays: 28,
  baselineMethod: 'mean', // 'mean' | 'median'
  minDataPoints: 5,
  warningThresholdPct: 20,
  criticalThresholdPct: 50,
  lowSampleThreshold: 5,
  highlightedStage: 'middlemile',
};

export const STAGE_KEYS = ['prepickup', 'firstmile', 'middlemile', 'lastmile'];

export const STAGE_CONFIG = {
  prepickup: {
    key: 'prepickup',
    col: 'avg_lt_prepickup_hour',
    label: 'Pre-pickup',
    shortLabel: 'Pre-PU',
    color: '#3B82F6', // Blue
    highlightColor: '#1D4ED8'
  },
  firstmile: {
    key: 'firstmile',
    col: 'avg_lt_firstmile_hour',
    label: 'First mile',
    shortLabel: 'FM',
    color: '#10B981', // Emerald
    highlightColor: '#047857'
  },
  middlemile: {
    key: 'middlemile',
    col: 'avg_lt_middlemile_hour',
    label: 'Middle mile',
    shortLabel: 'MM',
    color: '#F59E0B', // Amber / Orange
    highlightColor: '#B45309'
  },
  lastmile: {
    key: 'lastmile',
    col: 'avg_lt_lastmile_hour',
    label: 'Last mile',
    shortLabel: 'LM',
    color: '#8B5CF6', // Purple
    highlightColor: '#6D28D9'
  }
};

/**
 * Checks whether a row belongs to the "Không xác định lane" bucket
 * (fromprovince_new, toprovince_new, and externallane_new are all empty/null).
 */
export function isUnresolvedLaneRow(row) {
  if (!row) return false;
  const from = (row.fromprovince_new || '').toString().trim();
  const to = (row.toprovince_new || '').toString().trim();
  const lane = (row.externallane_new || '').toString().trim();
  return !from && !to && !lane;
}

/**
 * Helper to get numeric stage value from a row safely.
 */
export function getStageValue(row, stageKey) {
  if (!row) return null;
  const col = STAGE_CONFIG[stageKey]?.col || `avg_lt_${stageKey}_hour`;
  const val = row[col];
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

/**
 * Helper to calculate median of a numeric array.
 */
function calculateMedian(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Helper to calculate mean of a numeric array.
 */
function calculateMean(arr) {
  if (!arr || arr.length === 0) return null;
  const sum = arr.reduce((acc, v) => acc + v, 0);
  return sum / arr.length;
}

/**
 * Computes rolling baseline for a specific lane or lane group.
 * If data points for specific lane < minDataPoints, fallbacks to (externallane_new, client_name).
 *
 * @param {Array} allRows - Full dataset
 * @param {Object} target - { from, to, lane, client, stageKey, asOfDate }
 * @param {Object} config - thresholdConfig
 * @returns {number|null}
 */
export function computeBaseline(allRows, { from, to, lane, client, stageKey, asOfDate }, config = DEFAULT_THRESHOLD_CONFIG) {
  if (!allRows || !asOfDate || !stageKey) return null;

  const windowDays = Number(config.baselineWindowDays) || 28;
  const minPoints = Number(config.minDataPoints) || 5;
  const method = config.baselineMethod || 'mean';

  const asOfTime = new Date(asOfDate).getTime();
  const windowStartTime = asOfTime - windowDays * 86400000;

  // Filter window rows before asOfDate (excluding asOfDate itself)
  const windowRows = allRows.filter(r => {
    if (!r.report_date) return false;
    const rTime = new Date(r.report_date).getTime();
    return rTime >= windowStartTime && rTime < asOfTime && r.client_name === client;
  });

  // Step 1: Try specific lane (from -> to -> lane)
  const specificLaneRows = windowRows.filter(r => 
    r.fromprovince_new === from &&
    r.toprovince_new === to &&
    r.externallane_new === lane
  );

  const specificValues = [];
  const distinctDates = new Set();

  specificLaneRows.forEach(r => {
    const val = getStageValue(r, stageKey);
    if (val !== null) {
      specificValues.push(val);
      distinctDates.add(r.report_date);
    }
  });

  // If sufficient data points, compute baseline from specific lane
  if (distinctDates.size >= minPoints && specificValues.length > 0) {
    return method === 'median' ? calculateMedian(specificValues) : calculateMean(specificValues);
  }

  // Step 2: Fallback to (externallane_new, client_name)
  const fallbackLaneRows = windowRows.filter(r => r.externallane_new === lane);
  const fallbackDateMap = new Map();

  fallbackLaneRows.forEach(r => {
    const val = getStageValue(r, stageKey);
    const mau = Number(r.mau) || 0;
    if (val !== null && mau > 0) {
      if (!fallbackDateMap.has(r.report_date)) {
        fallbackDateMap.set(r.report_date, { sumProd: 0, sumMau: 0 });
      }
      const acc = fallbackDateMap.get(r.report_date);
      acc.sumProd += val * mau;
      acc.sumMau += mau;
    }
  });

  const fallbackDailyWeightedAverages = [];
  for (const acc of fallbackDateMap.values()) {
    if (acc.sumMau > 0) {
      fallbackDailyWeightedAverages.push(acc.sumProd / acc.sumMau);
    }
  }

  if (fallbackDailyWeightedAverages.length === 0) return null;

  return method === 'median'
    ? calculateMedian(fallbackDailyWeightedAverages)
    : calculateMean(fallbackDailyWeightedAverages);
}

/**
 * Classifies deviation of currentValue against baseline.
 *
 * @param {number|null} currentValue
 * @param {number|null} baseline
 * @param {Object} config - thresholdConfig
 * @returns {{ pctDeviation: number|null, level: 'normal'|'warning'|'critical' }}
 */
export function classifyDeviation(currentValue, baseline, config = DEFAULT_THRESHOLD_CONFIG) {
  if (currentValue === null || currentValue === undefined || baseline === null || baseline === undefined || baseline <= 0) {
    return { pctDeviation: null, level: 'normal' };
  }

  const warningPct = Number(config.warningThresholdPct) || 20;
  const criticalPct = Number(config.criticalThresholdPct) || 50;

  const pctDeviation = ((currentValue - baseline) / baseline) * 100;

  let level = 'normal';
  if (pctDeviation >= criticalPct) {
    level = 'critical';
  } else if (pctDeviation >= warningPct) {
    level = 'warning';
  }

  return {
    pctDeviation: Number(pctDeviation.toFixed(1)),
    level
  };
}

/**
 * Computes weighted average for a specific stage key over a set of rows.
 * Null values are excluded from both numerator and denominator.
 *
 * @param {Array} rows
 * @param {string} stageKey
 * @returns {number|null}
 */
export function weightedAvgByStage(rows, stageKey) {
  if (!rows || rows.length === 0) return null;

  let sumProd = 0;
  let sumMau = 0;

  rows.forEach(r => {
    const val = getStageValue(r, stageKey);
    const mau = Number(r.mau) || 0;
    if (val !== null && mau > 0) {
      sumProd += val * mau;
      sumMau += mau;
    }
  });

  if (sumMau === 0) return null;
  return Number((sumProd / sumMau).toFixed(2));
}

/**
 * Computes total stacked bar height as SUM of 4 weighted stage averages.
 * (Does NOT use avg_lt_e2e_hour directly, as per rule 2.3).
 *
 * @param {Array} rows
 * @returns {number}
 */
export function stackedHeightByLaneGroup(rows) {
  if (!rows || rows.length === 0) return 0;

  let total = 0;
  STAGE_KEYS.forEach(stageKey => {
    const avg = weightedAvgByStage(rows, stageKey);
    if (avg !== null) {
      total += avg;
    }
  });

  return Number(total.toFixed(2));
}

/**
 * Flags if sample size (mau) is considered low based on configuration.
 *
 * @param {number} mau
 * @param {Object} config
 * @returns {boolean}
 */
export function isLowSample(mau, config = DEFAULT_THRESHOLD_CONFIG) {
  const threshold = Number(config.lowSampleThreshold) || 5;
  return Number(mau) < threshold;
}
