import { createResourceCache } from './resourceCache.js';
import { expandCompactRows } from './weeklyKpi.js';
import { normalizeDashboardRows } from './dataProcessor.js';
import { buildOverviewMtdCacheKey, loadOverviewMtdCache, saveOverviewMtdCache, clearOverviewMtdCache } from './overviewMtdCache.js';

// Cache all geography/client rows; apply the current filters at render time.
// Scope includes identity/role and prevents the shared weekly cache from serving
// an earlier account's data or retaining it indefinitely.
export function createOverviewMtdLoader({ load = loadOverviewMtdCache, save = saveOverviewMtdCache,
  clear = clearOverviewMtdCache, memory = createResourceCache({ maxEntries: 12 }) } = {}) {
  let generation = 0;
  const isCurrent = (token, cancelled) => token === generation && !cancelled();
  return {
    async run({ client, scope, ranges, onResult, cancelled = () => false, forceRefresh = false }) {
      if (!scope) return;
      const token = generation;
      const requests = ranges.filter(([, to]) => to).map(([dataset, to]) => ({ dataset, to,
        from: `${to.slice(0, 7)}-01`, key: buildOverviewMtdCacheKey(dataset, `${to.slice(0, 7)}-01`, to, scope) }));
      const restored = new Set();
      // Restore every card before waiting for any network request.
      await Promise.all(requests.map(async ({ dataset, key }) => {
        const rows = memory.peek(key) ?? await load(key);
        if (rows && isCurrent(token, cancelled)) {
          restored.add(dataset);
          onResult(dataset, { rows });
        }
      }));
      // Revalidate sequentially to avoid three large history queries at once.
      for (const { dataset, from, to, key } of requests) {
        if (!isCurrent(token, cancelled)) return;
        try {
          let fetched = false;
          const rows = await memory.read(key, async () => {
            fetched = true;
            const { data, error } = await client.rpc('get_kas_daily_range_compact', { dataset, date_from: from, date_to: to });
            if (error) throw error;
            if (!data || !Array.isArray(data.weeks) || !Array.isArray(data.cols) || !Array.isArray(data.rows)) throw new Error('INVALID_DAILY_PAYLOAD');
            return normalizeDashboardRows(expandCompactRows(data.cols, data.rows));
          }, { forceRefresh });
          if (!isCurrent(token, cancelled)) return;
          onResult(dataset, { rows, refreshError: false, error: false });
          // Do not extend disk TTL when merely reusing a recent RAM response.
          if (fetched || !restored.has(dataset)) await save(key, rows);
        } catch {
          if (isCurrent(token, cancelled)) onResult(dataset, restored.has(dataset) ? { refreshError: true } : { error: true });
        }
      }
    },
    async clear() {
      generation++;
      memory.invalidate();
      await clear();
    }
  };
}

export const overviewMtdLoader = createOverviewMtdLoader();
