import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { normalizeLaneDeliveryRows } from '../../utils/laneDelivery';

const PAGE = 1000;
const COLUMNS = 'report_date,lane,client_name,hub_type,mau_deli,ontime_deli_1st,ontime_deli_odr';

async function fetchLaneDelivery() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('kas_deli_lane_daily').select(COLUMNS)
      .order('report_date', { ascending: false }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

// Nguồn tải riêng của tab Lane (như thời tiết ở Tổng quan): trạng thái 'loading' ngay từ
// render đầu; lỗi giữ số cũ khi refresh; 'ready' + 0 dòng mới là rỗng thật.
export default function useLaneDelivery() {
  const [state, setState] = useState({ status: 'loading', rows: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchLaneDelivery().then(
      rows => { if (!cancelled) setState({ status: 'ready', rows: normalizeLaneDeliveryRows(rows), error: null }); },
      error => { if (!cancelled) setState(prev => ({ status: 'error', rows: prev.rows, error })); }
    );
    return () => { cancelled = true; };
  }, [attempt]);

  // Thử lại: giữ dữ liệu đang có, chỉ bỏ cờ lỗi (hoặc quay về skeleton nếu chưa có gì).
  const retry = useCallback(() => {
    setState(prev => ({ status: prev.rows.length ? 'ready' : 'loading', rows: prev.rows, error: null }));
    setAttempt(value => value + 1);
  }, []);
  return { ...state, retry };
}
