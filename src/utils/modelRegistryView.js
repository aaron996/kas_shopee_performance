const PRICE_KEYS = ['inputNanoUsdPerToken', 'cachedInputNanoUsdPerToken', 'outputNanoUsdPerToken'];
export const hasModelPrices = row => PRICE_KEYS.every(key => Number.isInteger(row.definition.pricing?.[key]));
export const isModelTested = row => row.tested_revision === row.revision;

export function selectRegistryModels(models, { search = '', showAll = false, status = 'all', price = 'all', availability = 'all', sort = 'name-asc' } = {}) {
  const term = search.trim().toLowerCase();
  const result = models.filter(row => {
    if (!showAll && !row.chat_candidate && !row.enabled) return false;
    if (!`${row.id} ${row.definition.label}`.toLowerCase().includes(term)) return false;
    const tested = isModelTested(row);
    if (status === 'enabled' && !row.enabled || status === 'disabled' && row.enabled) return false;
    if (status === 'tested' && !tested || status === 'untested' && (tested || row.probe_success === false)) return false;
    if (status === 'failed' && (tested || row.probe_success !== false)) return false;
    if (price === 'complete' && !hasModelPrices(row) || price === 'missing' && hasModelPrices(row)) return false;
    if (availability === 'available' && row.available !== true || availability === 'unavailable' && row.available !== false) return false;
    if (availability === 'unknown' && row.available != null) return false;
    return true;
  });
  const name = (a, b) => (a.definition.label || a.id).localeCompare(b.definition.label || b.id, 'vi', { numeric: true }) || a.id.localeCompare(b.id);
  const [field, direction] = sort.split('-');
  const multiplier = direction === 'desc' ? -1 : 1;
  const value = row => field === 'input' ? row.definition.pricing?.inputNanoUsdPerToken
    : field === 'output' ? row.definition.pricing?.outputNanoUsdPerToken
      : Date.parse(field === 'seen' ? row.last_seen_at : row.updated_at) || null;
  return result.sort((a, b) => {
    if (field === 'name') return multiplier * name(a, b);
    const left = value(a), right = value(b);
    // Unknown values go last in either direction; zero is a valid price.
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    return left != null && right != null && left !== right ? multiplier * (left - right) : name(a, b);
  });
}
