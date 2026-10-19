import { useEffect, useState } from 'react';
import { fetchDailyRangeRows, clearWeeklyCache } from '../../utils/weeklyKpi';
import { aggregateOverviewMtd } from '../../utils/overviewMtd';
import { supabase } from '../../utils/supabaseClient';

export default function useOverviewMtd(cards, filters) {
  const pickTo = cards.find(card => card.id === 'p1st')?.historyDates.at(-1) || '';
  const deliTo = cards.find(card => card.id === 'd1st')?.historyDates.at(-1) || '';
  const fdTo = cards.find(card => card.id === 'fd')?.historyDates.at(-1) || '';
  const key = `${pickTo}/${deliTo}/${fdTo}`;
  const [state, setState] = useState({ key: '', datasets: {} });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ key, datasets: {} });
    (async () => {
      for (const [dataset, to] of [['pick', pickTo], ['deli', deliTo], ['fd', fdTo]]) {
        if (cancelled) return;
        if (!to) continue;
        try {
          const data = await fetchDailyRangeRows(supabase, dataset, `${to.slice(0, 7)}-01`, to);
          if (!cancelled) setState(prev => ({ key, datasets: { ...prev.datasets, [dataset]: { rows: data.rows } } }));
        } catch {
          if (!cancelled) setState(prev => ({ key, datasets: { ...prev.datasets, [dataset]: { error: true } } }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [key, pickTo, deliTo, fdTo, attempt]);

  const datasets = state.key === key ? state.datasets : {};
  return {
    cards: cards.map(card => {
      const dataset = card.id === 'fd' ? 'fd' : ['d1st', 'dodr'].includes(card.id) ? 'deli' : 'pick';
      const to = dataset === 'pick' ? pickTo : dataset === 'deli' ? deliTo : fdTo;
      const result = datasets[dataset];
      return { ...card, mtd: result?.rows ? aggregateOverviewMtd(result.rows, card.id, to, filters) : null,
        mtdStatus: !to ? 'empty' : result?.error ? 'error' : result?.rows ? 'ready' : 'loading' };
    }),
    retry: () => { clearWeeklyCache(); setAttempt(value => value + 1); },
  };
}
