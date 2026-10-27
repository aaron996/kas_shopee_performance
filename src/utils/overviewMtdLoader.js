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
      // Each small MTD request runs independently of other datasets and disk I/O.
      await Promise.all(requests.map(async ({ dataset, from, to, key }) => {
        if (!isCurrent(token, cancelled)) return;
        let restored = false;
        let fresh = false;
        const restore = rows => {
          if (Array.isArray(rows)) {
            restored = true;
            if (!fresh && isCurrent(token, cancelled)) onResult(dataset, { rows });
          }
        };
        const cached = memory.peek(key);
        const cacheRead = cached !== undefined
          ? Promise.resolve(restore(cached))
          : Promise.resolve().then(() => load(key)).then(restore).catch(() => {});
        try {
          let fetched = false;
          const rows = await memory.read(key, async () => {
            fetched = true;
            const { data, error } = await client.rpc('get_kas_mtd_compact', { dataset, date_from: from, date_to: to });
            if (error) throw error;
            if (!data || data.dataset !== dataset || data.date_from !== from || data.date_to !== to
              || !Array.isArray(data.cols) || !Array.isArray(data.rows)) throw new Error('INVALID_MTD_PAYLOAD');
            return normalizeDashboardRows(expandCompactRows(data.cols, data.rows).map(row => ({ ...row, report_date: to })));
          }, { forceRefresh });
          fresh = true;
          if (!isCurrent(token, cancelled)) return;
          onResult(dataset, { rows, refreshError: false, error: false });
          // Do not extend disk TTL when merely reusing a recent RAM response.
          if (fetched || !restored) void Promise.resolve().then(() => {
            if (isCurrent(token, cancelled)) return save(key, rows);
          }).catch(() => {});
        } catch {
          await cacheRead;
          if (isCurrent(token, cancelled)) onResult(dataset, restored ? { refreshError: true } : { error: true });
        }
      }));
    },
    async clear() {
      generation++;
      memory.invalidate();
      await clear();
    }
  };
}

export const overviewMtdLoader = createOverviewMtdLoader();
