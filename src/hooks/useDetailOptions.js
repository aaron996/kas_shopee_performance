import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { fetchDetailOptions, clearWeeklyCache } from '../utils/weeklyKpi';

// Danh sách Tỉnh thành / Lane của bảng chi tiết cho chỉ số đang xem (null = không cần).
// Trạng thái chờ có ngay từ lần render đầu; đổi bảng nguồn thì bỏ danh sách cũ.
export default function useDetailOptions(dataset, client = supabase) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: '', status: 'loading', options: null });
  const key = `${dataset}:${attempt}`;
  useEffect(() => {
    if (!dataset) return undefined;
    let cancelled = false;
    setState({ key, status: 'loading', options: null });
    fetchDetailOptions(client, dataset)
      .then(options => { if (!cancelled) setState({ key, status: 'ready', options }); })
      .catch(() => { if (!cancelled) setState({ key, status: 'error', options: null }); });
    return () => { cancelled = true; };
  }, [key, dataset, client]);
  const retry = useCallback(() => { clearWeeklyCache(); setAttempt(n => n + 1); }, []);
  if (!dataset) return { status: 'idle', options: null, retry };
  return state.key === key ? { status: state.status, options: state.options, retry } : { status: 'loading', options: null, retry };
}
