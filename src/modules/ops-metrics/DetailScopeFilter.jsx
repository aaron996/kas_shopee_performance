import React, { useEffect, useState } from 'react';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import MultiSelectDropdown from '../../components/ui/MultiSelectDropdown';
import { supabase } from '../../utils/supabaseClient';
import { fetchDetailOptions, clearWeeklyCache, hasLaneFilter } from '../../utils/weeklyKpi';

const summarize = values => (values.length <= 2 ? values.join(', ') : `${values.slice(0, 2).join(', ')} +${values.length - 2}`);

// Huy hiệu hiển thị trong tiêu đề bảng khi bộ lọc đang bật.
export function ScopeBadges({ scope }) {
  return <>
    {scope.provinces.length > 0 && <span className="kpi-badge weekly-kpi-badge">Province: {summarize(scope.provinces)}</span>}
    {scope.lanes.length > 0 && <span className="kpi-badge weekly-kpi-badge">Lane: {summarize(scope.lanes)}</span>}
  </>;
}

// KAS-317: bộ lọc Province (4 luồng) và Lane (chỉ Deli/FD). Danh sách lấy từ bảng chi tiết của chỉ số đang xem.
// Chỉ là bộ lọc: bảng hiện có tự đọc lại từ bảng chi tiết. `value` = { provinces, lanes }, rỗng = không lọc.
export default function DetailScopeFilter({ dataset, value, onChange, client = supabase }) {
  const [state, setState] = useState({ key: '', status: 'loading', options: null });
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${dataset}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ key: requestKey, status: 'loading', options: prev.options }));
    fetchDetailOptions(client, dataset)
      .then(options => { if (!cancelled) setState({ key: requestKey, status: 'ready', options }); })
      .catch(() => { if (!cancelled) setState({ key: requestKey, status: 'error', options: null }); });
    return () => { cancelled = true; };
  }, [requestKey, dataset, client]);

  const showLane = hasLaneFilter(dataset);
  const active = value.provinces.length > 0 || value.lanes.length > 0;
  const toOptions = list => list.map(v => ({ value: v, label: v }));
  // Giữ cả lựa chọn đã chọn nhưng không còn trong danh sách mới (đổi chỉ số) để người dùng còn thấy và bỏ được.
  const withSelected = (list, selected) => toOptions([...new Set([...list, ...selected])].sort());

  let body;
  if (state.status === 'error') {
    body = <span className="weekly-kpi-note" role="alert">Không tải được danh sách Province/Lane.{' '}
      <button type="button" className="btn-secondary" onClick={() => { clearWeeklyCache(); setAttempt(n => n + 1); }}>Thử lại</button></span>;
  } else if (!state.options) {
    body = <LoadingScreen variant="inline" />;
  } else if (!state.options.provinces.length && !state.options.lanes.length) {
    body = <span className="detail-scope-empty">Bảng chi tiết chưa có dữ liệu Province/Lane cho chỉ số này.</span>;
  } else {
    body = <>
      <MultiSelectDropdown label="Province" triggerLabel="Province" searchable placeholder="Tìm tỉnh…"
        options={withSelected(state.options.provinces, value.provinces)} value={value.provinces}
        triggerSummary={value.provinces.length ? undefined : 'Tất cả'}
        onChange={provinces => onChange({ ...value, provinces })} />
      {showLane && <MultiSelectDropdown label="Lane" triggerLabel="Lane" searchable placeholder="Tìm lane…"
        options={withSelected(state.options.lanes, value.lanes)} value={value.lanes}
        triggerSummary={value.lanes.length ? undefined : 'Tất cả'}
        onChange={lanes => onChange({ ...value, lanes })} />}
    </>;
  }

  return (
    <div className="detail-scope-filter" role="group" aria-label="Bộ lọc Province và Lane">
      {body}
      {active && <button type="button" className="btn-secondary" onClick={() => onChange({ provinces: [], lanes: [] })}>Bỏ lọc</button>}
      {active && !showLane && value.lanes.length > 0 && <span className="detail-scope-empty">Lane chỉ áp dụng cho 1st Deli, ODR và FD.</span>}
    </div>
  );
}
