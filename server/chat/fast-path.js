import { callDashboardRpc, DASHBOARD_RPCS } from './db.js';
import { toPublicSource } from './context.js';
import { ChatError } from './errors.js';
import { resolveEffectiveScope } from './scope.js';

export const METRIC_DATASETS = Object.freeze({
  p1st: 'pick',
  opr: 'pick',
  d1st: 'deli',
  odr: 'deli'
});

export const METRIC_NAMES = Object.freeze({
  p1st: '1st Pickup (P1ST)',
  opr: 'OPR',
  d1st: '1st Delivery (D1ST)',
  odr: 'ODR'
});

export const CLIENT_NAMES = Object.freeze({
  SPB: 'SPB',
  SPE: 'SPE',
  ALL: 'Toàn bộ'
});

const VALID_METRICS = new Set(['p1st', 'opr', 'd1st', 'odr']);
const VALID_CLIENTS = new Set(['SPB', 'SPE', 'ALL']);
const VALID_DATE_MODES = new Set(['latest', 'trailing_7d', 'custom']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCOPE_GRAIN_OVERRIDE_RE = /\b(vùng|miền|hub|kho|tỉnh|lane|tuyến|huyện|quận|xã|ca\s*1|ca1|leadtime|pre-pickup|first\s*mile|middle\s*mile|last\s*mile)\b/i;

/** Dịch 'YYYY-MM-DD' đi n ngày theo UTC */
export function shiftDate(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

export function formatDateVi(dateStr) {
  if (!DATE_RE.test(dateStr || '')) return dateStr || '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTimeVi(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return isoStr;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isFastPathEligible(request) {
  const query = request?.query;
  if (!query || typeof query !== 'object') return false;
  if (!VALID_METRICS.has(query.metric)) return false;
  if (!VALID_CLIENTS.has(query.client)) return false;
  if (!VALID_DATE_MODES.has(query.dateMode)) return false;

  if (query.dateMode === 'custom') {
    if (!query.dateFrom || !query.dateTo) return false;
    if (!DATE_RE.test(query.dateFrom) || !DATE_RE.test(query.dateTo)) return false;
  }

  // Nếu câu hỏi tự nhiên có yêu cầu grain chi tiết (vùng, kho, Ca 1, leadtime...), giữ luồng agent
  const question = typeof request.question === 'string' ? request.question : '';
  if (SCOPE_GRAIN_OVERRIDE_RE.test(question)) {
    return false;
  }

  return true;
}

export function isSafeMetricResult(result) {
  if (!result?.data || typeof result.data !== 'object') return false;
  const rows = result.data.rows;
  if (!Array.isArray(rows)) return false;
  if (rows.length === 0) return true;
  const first = rows[0];
  if (!first || typeof first !== 'object') return false;
  return (typeof first.entity === 'string' || first.entity === null) &&
         (typeof first.value === 'number' || first.value === null || typeof first.value === 'string');
}

export function formatDeterministicKpiResponse({
  metric,
  client,
  regions,
  hubTypes,
  dateFrom,
  dateTo,
  dataAsOf,
  syncedAt,
  evidenceId,
  row
}) {
  const metricLabel = METRIC_NAMES[metric] || metric.toUpperCase();
  const clientLabel = CLIENT_NAMES[client] || client;
  const timeRange = dateFrom === dateTo
    ? `ngày ${formatDateVi(dateFrom)}`
    : `${formatDateVi(dateFrom)} – ${formatDateVi(dateTo)}`;

  let resultText = 'Chưa có dữ liệu vận hành trong khoảng thời gian này.';
  if (row && (row.value !== null && row.value !== undefined)) {
    const numVal = Number(row.value);
    const valStr = Number.isFinite(numVal) ? `${numVal.toFixed(2).replace(/\.?0+$/, '')}%` : `${row.value}%`;
    if (row.volume != null && row.ontime != null && Number(row.volume) > 0) {
      const ontime = Number(row.ontime).toLocaleString('vi-VN');
      const volume = Number(row.volume).toLocaleString('vi-VN');
      resultText = `**${valStr}** (${ontime} / ${volume} đơn đúng hạn)`;
    } else {
      resultText = `**${valStr}**`;
    }
  } else if (row && row.value === null) {
    resultText = 'Chưa có dữ liệu (mẫu = 0).';
  }

  let scopeLabel = row?.entity || 'Toàn quốc';
  if (Array.isArray(regions) && regions.length > 0) {
    scopeLabel = regions.join(', ');
  }

  const lines = [
    `Kết quả tra cứu KPI vận hành (${scopeLabel}):`,
    '',
    `- **Chỉ số**: ${metricLabel}`,
    `- **Khách hàng**: ${clientLabel}`
  ];

  if (Array.isArray(regions)) {
    lines.push(`- **Vùng**: ${regions.length > 0 ? regions.join(', ') : 'Không chọn vùng nào'}`);
  }
  if (Array.isArray(hubTypes)) {
    lines.push(`- **Loại hub**: ${hubTypes.length > 0 ? hubTypes.join(', ') : 'Không chọn loại hub nào'}`);
  }

  lines.push(
    `- **Thời gian**: ${timeRange}`,
    `- **Kết quả**: ${resultText}`
  );

  if (dataAsOf) {
    lines.push(`- **Dữ liệu tính đến (dataAsOf)**: ${formatDateVi(dataAsOf)}`);
  }
  if (syncedAt) {
    lines.push(`- **Thời điểm đồng bộ**: ${formatDateTimeVi(syncedAt)}`);
  }
  if (evidenceId) {
    lines.push(`- **Evidence ID**: \`${evidenceId}\``);
  }

  return lines.join('\n');
}

export async function executeFastPath({ request, userClient, signal, onStatus, onText, onSource }, dependencies = {}) {
  const rpcCaller = dependencies.callRpc ?? callDashboardRpc;
  const query = request.query;
  if (!isFastPathEligible(request)) return null;

  const effectiveScope = resolveEffectiveScope({
    question: request.question,
    query: request.query,
    screenContext: request.screenContext
  });

  const client = effectiveScope.client || query.client;
  let rpcRegions = [];
  if (Array.isArray(effectiveScope.regions)) {
    rpcRegions = effectiveScope.regions.length === 0 ? ['__NO_MATCH__'] : effectiveScope.regions;
  }

  let rpcHubTypes = [];
  if (Array.isArray(effectiveScope.hubTypes)) {
    rpcHubTypes = effectiveScope.hubTypes.length === 0 ? ['__NO_MATCH__'] : effectiveScope.hubTypes;
  }

  onStatus?.({ phase: 'querying_database', round: 1, count: 1 });

  let dateFrom = query.dateFrom;
  let dateTo = query.dateTo;
  let dataAsOf = null;
  let syncedAt = null;
  let coverageSource = null;
  const toolNames = [];

  if (query.dateMode === 'latest' || query.dateMode === 'trailing_7d') {
    toolNames.push('get_data_coverage');
    const coverage = await rpcCaller(userClient, DASHBOARD_RPCS.coverage, {
      p_dataset: METRIC_DATASETS[query.metric],
      p_client: client
    });
    dataAsOf = coverage.data?.dataAsOf;
    if (!dataAsOf) {
      throw new ChatError('CHAT_DATA_EMPTY', 'Database chưa có ngày dữ liệu phù hợp với phạm vi này.', 422);
    }
    syncedAt = coverage.data?.syncedAt || null;
    coverageSource = toPublicSource('get_data_coverage', coverage);

    if (query.dateMode === 'latest') {
      dateFrom = dataAsOf;
      dateTo = dataAsOf;
    } else {
      dateTo = dataAsOf;
      dateFrom = shiftDate(dataAsOf, -6);
    }
  }

  toolNames.push('get_metric_summary');
  const metricResult = await rpcCaller(userClient, DASHBOARD_RPCS.metric, {
    p_metric: query.metric,
    p_client: client,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_grain: 'nationwide',
    p_regions: rpcRegions,
    p_hub_types: rpcHubTypes,
    p_limit: 1,
    p_sort: 'worst'
  });

  if (!isSafeMetricResult(metricResult)) {
    console.warn('[FastPath] RPC result shape is not safe to render deterministically; falling back to agent.', metricResult);
    return null;
  }

  const rows = metricResult.data?.rows || [];
  const firstRow = rows[0] || null;
  const metricDataAsOf = metricResult.data?.dataAsOf || dataAsOf;
  const metricSyncedAt = metricResult.data?.syncedAt || syncedAt;

  const metricSource = toPublicSource('get_metric_summary', metricResult);
  const sources = coverageSource ? [coverageSource, metricSource] : [metricSource];
  sources.forEach(src => onSource?.(src));

  const text = formatDeterministicKpiResponse({
    metric: query.metric,
    client,
    regions: effectiveScope.regions,
    hubTypes: effectiveScope.hubTypes,
    dateFrom,
    dateTo,
    dataAsOf: metricDataAsOf,
    syncedAt: metricSyncedAt,
    evidenceId: metricResult.evidenceId,
    row: firstRow
  });

  onStatus?.({ phase: 'answering' });
  onText?.(text);

  return {
    usage: [],
    toolNames,
    sources,
    actualMicrousd: 0
  };
}
