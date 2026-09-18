const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export function canRetry(failedRequest, quota) {
  if (!failedRequest) {
    return { allowed: false, reason: '' };
  }
  if (quota && !quota.isUnlimited && quota.remainingTurns <= 0) {
    return { allowed: false, reason: 'Đã hết lượt truy vấn hôm nay.' };
  }
  if (failedRequest.isQuotaExceeded) {
    return { allowed: false, reason: 'Đã hết lượt truy vấn hôm nay.' };
  }
  return { allowed: true, reason: '' };
}

export function formatDataScope(source) {
  if (!source || typeof source !== 'object') return null;

  const client = source.scope?.client
    ? (source.scope.client === 'ALL' ? 'Toàn bộ' : source.scope.client)
    : null;

  const grain = source.scope?.grain === 'nationwide'
    ? 'Toàn quốc'
    : source.scope?.grain === 'region'
      ? 'Theo vùng'
      : source.scope?.grain === 'hub'
        ? 'Theo kho/hub'
        : null;

  const parts = [client, grain];
  if (Array.isArray(source.scope?.regions) && source.scope.regions.length > 0) {
    parts.push(`Vùng: ${source.scope.regions.join(', ')}`);
  }
  const hubTypes = source.scope?.hubTypes || source.scope?.hub_types;
  if (Array.isArray(hubTypes) && hubTypes.length > 0) {
    parts.push(`Loại hub: ${hubTypes.join(', ')}`);
  }

  const scopeDesc = parts.filter(Boolean).join(' · ');

  let dateRangeText = null;
  if (source.scope?.dateFrom && source.scope?.dateTo) {
    dateRangeText = source.scope.dateFrom === source.scope.dateTo
      ? formatDateVi(source.scope.dateFrom)
      : `${formatDateVi(source.scope.dateFrom)} – ${formatDateVi(source.scope.dateTo)}`;
  }

  return {
    evidenceId: source.evidenceId || null,
    tool: source.tool || null,
    scopeDesc: scopeDesc || null,
    dateRangeText,
    dataAsOfText: source.dataAsOf ? formatDateVi(source.dataAsOf) : null,
    syncedAtText: source.syncedAt ? formatDateTimeVi(source.syncedAt) : null
  };
}
