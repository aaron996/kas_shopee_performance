import React from 'react';

const summarize = values => (values.length <= 2 ? values.join(', ') : `${values.slice(0, 2).join(', ')} +${values.length - 2}`);

// Huy hiệu trong tiêu đề bảng khi bộ lọc Tỉnh thành / Lane (đặt ở header) đang bật.
export default function ScopeBadges({ scope }) {
  return <>
    {scope.provinces.length > 0 && <span className="kpi-badge weekly-kpi-badge">Province: {summarize(scope.provinces)}</span>}
    {scope.lanes.length > 0 && <span className="kpi-badge weekly-kpi-badge">Lane: {summarize(scope.lanes)}</span>}
  </>;
}
