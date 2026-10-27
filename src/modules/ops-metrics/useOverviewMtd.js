import { useEffect, useState } from 'react';
import { overviewMtdLoader } from '../../utils/overviewMtdLoader';
import { aggregateOverviewMtd } from '../../utils/overviewMtd';
import { supabase } from '../../utils/supabaseClient';

export default function useOverviewMtd(cards, filters, scope) {
  const pickTo = cards.find(card => card.id === 'p1st')?.historyDates.at(-1) || '';
  const deliTo = cards.find(card => card.id === 'd1st')?.historyDates.at(-1) || '';
  const fdTo = cards.find(card => card.id === 'fd')?.historyDates.at(-1) || '';
  const key = `${scope}:${pickTo}/${deliTo}/${fdTo}`;
  const [state, setState] = useState({ key: '', datasets: {} });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ key, datasets: {} });
    void overviewMtdLoader.run({ client: supabase, scope,
      ranges: [['pick', pickTo], ['deli', deliTo], ['fd', fdTo]],
      forceRefresh: attempt > 0, cancelled: () => cancelled,
      onResult: (dataset, result) => setState(prev => ({ key, datasets: { ...prev.datasets,
        [dataset]: { ...prev.datasets[dataset], ...result } } })) });
    return () => { cancelled = true; };
  }, [key, pickTo, deliTo, fdTo, attempt, scope]);

  const datasets = state.key === key ? state.datasets : {};
  return {
    cards: cards.map(card => {
      const dataset = card.id === 'fd' ? 'fd' : ['d1st', 'dodr'].includes(card.id) ? 'deli' : 'pick';
      const to = dataset === 'pick' ? pickTo : dataset === 'deli' ? deliTo : fdTo;
      const result = datasets[dataset];
      return { ...card, mtd: result?.rows ? aggregateOverviewMtd(result.rows, card.id, to, filters) : null,
        mtdRefreshError: !!result?.refreshError,
        mtdStatus: !to ? 'empty' : result?.error ? 'error' : result?.rows ? 'ready' : 'loading' };
    }),
    retry: () => { setAttempt(value => value + 1); },
  };
}
