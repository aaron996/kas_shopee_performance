import { useEffect, useState } from 'react';
import { overviewMtdLoader } from '../../utils/overviewMtdLoader';
import { overviewMtdRanges, resolveOverviewMtdCard } from '../../utils/overviewMtd';
import { supabase } from '../../utils/supabaseClient';

export default function useOverviewMtd(cards, filters, scope) {
  const rangeKey = JSON.stringify(overviewMtdRanges(cards));
  const key = JSON.stringify([scope, rangeKey]);
  const [state, setState] = useState({ key: '', datasets: {} });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ key, datasets: prev.key === key
      ? Object.fromEntries(Object.entries(prev.datasets).filter(([, result]) => Array.isArray(result.rows))
        .map(([dataset, result]) => [dataset, { rows: result.rows }]))
      : {} }));
    void overviewMtdLoader.run({ client: supabase, scope,
      ranges: JSON.parse(rangeKey),
      forceRefresh: attempt > 0, cancelled: () => cancelled,
      onResult: (dataset, result) => setState(prev => {
        const datasets = prev.key === key ? prev.datasets : {};
        return { key, datasets: { ...datasets, [dataset]: { ...datasets[dataset], ...result } } };
      }) });
    return () => { cancelled = true; };
  }, [key, rangeKey, attempt, scope]);

  const datasets = state.key === key ? state.datasets : {};
  return {
    cards: cards.map(card => resolveOverviewMtdCard(card, datasets, filters)),
    retry: () => { setAttempt(value => value + 1); },
  };
}
