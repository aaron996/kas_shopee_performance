// Use unfiltered source rows: a filter with no matches is an empty result,
// while a source that has not finished its request is still loading.
export function isReportDataLoading(requiredDatasets = [], pending = {}, rows = {}) {
  return requiredDatasets.some(dataset => pending[dataset])
    && !requiredDatasets.some(dataset => rows[dataset]?.length);
}

export function pendingReportDatasets(loading) {
  return Object.fromEntries(['pick', 'deli', 'fd', 'ca1', 'leadtime'].map(key => [key, loading]));
}
