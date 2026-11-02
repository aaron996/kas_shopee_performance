import React, { useMemo } from 'react';
import { buildWeeklyMatrix, dayLabel } from '../../utils/weeklyKpi';
import { REVERSE_CLIENT } from '../../utils/clientLabels';
import { PUD_NOTE } from '../../utils/pud';
import KpiMatrixTable from './KpiMatrixTable';

// Default daily view uses the already loaded Reverse rows; no extra request.
export default function PudKpiTable({ rows, rangeFilter, selectedRegions, selectedHubTypes }) {
  const matrix = useMemo(() => buildWeeklyMatrix({ rows,
    weeks: [...new Set(rows.map(row => row.report_date))].sort(), metricKey: 'pud',
    clientFilter: REVERSE_CLIENT, selectedRegions, selectedHubTypes, labelFor: dayLabel
  }), [rows, selectedRegions, selectedHubTypes]);
  return <div className="metric-block metric-block-sticky weekly-kpi-block">
    <div className="metric-header daily-range-header detail-metric-toolbar">
      <div className="metric-title"><span>PUD</span><span className="kpi-badge">SPE Reverse</span></div>
      {rangeFilter}
    </div>
    {matrix.empty ? <div className="weekly-kpi-note">Không có dữ liệu PUD trong phạm vi đang chọn.</div>
      : <KpiMatrixTable matrix={matrix} lastLabel="ngày gần nhất" horizontalScroll />}
    <div className="table-legend"><div>{PUD_NOTE}</div></div>
  </div>;
}
