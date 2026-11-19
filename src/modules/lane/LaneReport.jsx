import React, { useState } from 'react';
import Report5LaneCa1 from '../../components/Report5LaneCa1.jsx';
import SelectionIndicator from '../../components/ui/SelectionIndicator';
import { useToast } from '../../components/ui/Toast';
import KpiFormattingControl from '../ops-metrics/KpiFormattingControl';
import useKpiFormatting from '../../hooks/useKpiFormatting';
import { LANE_VIEWS } from '../../utils/scopeSupport';
import LaneKpiTable from './LaneKpiTable.jsx';
import useLaneDelivery from './useLaneDelivery.js';

const METRIC_LABELS = { d1st: '1st Deli', dodr: 'ODR' };

// Tab "Báo cáo theo Lane" (KAS-314). Id module vẫn là `report5` để không vỡ URL, trạng thái đã lưu,
// snapshot và chat. Hai subtab: "Deli performance" (1st Deli / ODR theo lane) và "% Ca 1".
// Client chọn ở header như Chi tiết Vùng/Hub (`clientFilter`); subtab Ca 1 không chia client nên header ẩn chip đó.
// Subtab đang chọn do App giữ (`view`) để header biết khi nào ẩn Client / nút Xuất CSV.
export default function LaneReport(props) {
  const { density = 'comfortable', clientFilter = 'ALL', userEmail = '', view = 'deli', onViewChange = () => {} } = props;
  const [metric, setMetric] = useState('d1st');
  const [viewMode, setViewMode] = useState('day');
  const showToast = useToast();
  const lane = useLaneDelivery();
  const { rules: formattingRules, save: saveFormatting, preview: previewFormatting } = useKpiFormatting(userEmail);
  const formattingControl = metricKey => (
    <KpiFormattingControl key={`${userEmail}:${metricKey}`} metricKey={metricKey} label={METRIC_LABELS[metricKey]}
      rule={formattingRules[metricKey]} onPreview={previewFormatting}
      onSave={(key, rule) => { saveFormatting(key, rule); showToast('Đã lưu cài đặt tô màu.', { tone: 'success' }); }} />
  );

  const onTabKeyDown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  };

  const subtab = key => (
    <button role="tab" id={`lane-view-${key}`} aria-selected={view === key} aria-controls="lane-view-panel"
      tabIndex={view === key ? 0 : -1} className={`kpi-table-tab ${view === key ? 'active' : ''}`}
      onClick={() => onViewChange(key)}>{LANE_VIEWS[key]}</button>
  );
  const metricTab = key => (
    <button role="tab" id={`lane-tab-${key}`} aria-selected={metric === key} aria-controls="lane-metric-panel"
      tabIndex={metric === key ? 0 : -1} className={`kpi-table-tab ${metric === key ? 'active' : ''}`}
      onClick={() => setMetric(key)}>{METRIC_LABELS[key]}</button>
  );

  return (
    <div className={`density-${density} kpi-tab-container`}>
      <div className="kpi-table-tabs" role="tablist" aria-label="Chọn báo cáo theo lane" onKeyDown={onTabKeyDown}>
        <SelectionIndicator value={view} selector='[aria-selected="true"]' />
        <div className="kpi-tab-group" role="group" aria-label="Báo cáo">{subtab('deli')}{subtab('ca1')}</div>
      </div>
      <div role="tabpanel" id="lane-view-panel" aria-labelledby={`lane-view-${view}`}>
        {view === 'ca1' ? <Report5LaneCa1 {...props} /> : (
          <>
            <div className="kpi-table-tabs" role="tablist" aria-label="Chọn chỉ số theo lane" onKeyDown={onTabKeyDown}>
              <SelectionIndicator value={metric} selector='[aria-selected="true"]' />
              <div className="kpi-tab-group" role="group" aria-label="Chỉ số giao hàng">{metricTab('d1st')}{metricTab('dodr')}</div>
              <div className="kpi-tab-group view-mode-toggle" role="group" aria-label="Chế độ xem" style={{ marginLeft: 'auto' }}>
                <button type="button" aria-pressed={viewMode === 'day'} className={`kpi-table-tab ${viewMode === 'day' ? 'active' : ''}`} onClick={() => setViewMode('day')}>Theo ngày</button>
                <button type="button" aria-pressed={viewMode === 'week'} className={`kpi-table-tab ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>Theo tuần</button>
              </div>
            </div>
            <div className="kpi-table-content" role="tabpanel" id="lane-metric-panel" aria-labelledby={`lane-tab-${metric}`}>
              <LaneKpiTable key={`${metric}:${viewMode}`} metricKey={metric} mode={viewMode} rows={lane.rows} status={lane.status}
                error={lane.error} onRetry={lane.retry} clientFilter={clientFilter}
                selectedHubTypes={props.selectedHubTypes} isHubTypeFiltered={props.isHubTypeFiltered}
                formattingRule={formattingRules[metric]} formattingControl={formattingControl(metric)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
