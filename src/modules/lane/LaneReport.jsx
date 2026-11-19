import React, { useState } from 'react';
import Report5LaneCa1 from '../../components/Report5LaneCa1.jsx';
import SelectionIndicator from '../../components/ui/SelectionIndicator';
import { useToast } from '../../components/ui/Toast';
import KpiFormattingControl from '../ops-metrics/KpiFormattingControl';
import useKpiFormatting from '../../hooks/useKpiFormatting';
import { CLIENT_LABELS } from '../../utils/clientLabels';
import LaneKpiTable from './LaneKpiTable.jsx';
import useLaneDelivery from './useLaneDelivery.js';

const METRIC_LABELS = { d1st: '1st Deli', dodr: 'ODR' };
const LANE_CLIENTS = ['SPB', 'SPE'];

// Tab "Lane" (KAS-314): gom mọi chỉ số theo lane. Id module vẫn là `report5` để không
// vỡ URL, trạng thái đã lưu, snapshot và chat. Khung tab, chế độ xem Ngày/Tuần, bộ lọc khoảng ngày
// và cài đặt tô màu dùng chung với Chi tiết Vùng/Hub.
export default function LaneReport(props) {
  const { density = 'comfortable', clientFilter = 'ALL', userEmail = '' } = props;
  // Header ẩn chip Client ở tab này (Ca 1 không chia client) nên dịch vụ chọn ngay trong thanh tab;
  // khởi tạo theo dịch vụ đang chọn ở app, ALL/Reverse (không có giao hàng theo lane) về SPB.
  const [client, setClient] = useState(LANE_CLIENTS.includes(clientFilter) ? clientFilter : 'SPB');
  const [activeTab, setActiveTab] = useState('d1st');
  const [viewMode, setViewMode] = useState('day');
  const showToast = useToast();
  const lane = useLaneDelivery();
  const { rules: formattingRules, save: saveFormatting, preview: previewFormatting } = useKpiFormatting(userEmail);
  const formattingControl = metricKey => (
    <KpiFormattingControl key={`${userEmail}:${metricKey}`} metricKey={metricKey} label={METRIC_LABELS[metricKey]}
      rule={formattingRules[metricKey]} onPreview={previewFormatting}
      onSave={(key, rule) => { saveFormatting(key, rule); showToast('Đã lưu cài đặt tô màu.', { tone: 'success' }); }} />
  );
  const isDelivery = activeTab !== 'ca1';

  const onTabKeyDown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  };

  const tab = key => (
    <button role="tab" id={`lane-tab-${key}`} aria-selected={activeTab === key} aria-controls="lane-metric-panel"
      tabIndex={activeTab === key ? 0 : -1} className={`kpi-table-tab ${activeTab === key ? 'active' : ''}`}
      onClick={() => setActiveTab(key)}>{METRIC_LABELS[key] || '% Ca 1'}</button>
  );

  return (
    <div className={`density-${density} kpi-tab-container`}>
      <div className="kpi-table-tabs" role="tablist" aria-label="Chọn chỉ số theo lane" onKeyDown={onTabKeyDown}>
        <SelectionIndicator value={activeTab} selector='[aria-selected="true"]' />
        <div className="kpi-tab-group" role="group" aria-label="Nhóm giao hàng">{tab('d1st')}{tab('dodr')}</div>
        <div className="kpi-tab-group" role="group" aria-label="Ca 1">{tab('ca1')}</div>
        {isDelivery && (
          <div className="kpi-tab-group" role="group" aria-label="Dịch vụ" style={{ marginLeft: 'auto' }}>
            {LANE_CLIENTS.map(c => (
              <button key={c} type="button" aria-pressed={client === c} className={`kpi-table-tab ${client === c ? 'active' : ''}`}
                onClick={() => setClient(c)}>{CLIENT_LABELS[c] || c}</button>
            ))}
          </div>
        )}
        {isDelivery && (
          <div className="kpi-tab-group view-mode-toggle" role="group" aria-label="Chế độ xem">
            <button type="button" aria-pressed={viewMode === 'day'} className={`kpi-table-tab ${viewMode === 'day' ? 'active' : ''}`} onClick={() => setViewMode('day')}>Theo ngày</button>
            <button type="button" aria-pressed={viewMode === 'week'} className={`kpi-table-tab ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>Theo tuần</button>
          </div>
        )}
      </div>
      <div className="kpi-table-content" role="tabpanel" id="lane-metric-panel" aria-labelledby={`lane-tab-${activeTab}`}>
        {activeTab === 'ca1' ? <Report5LaneCa1 {...props} />
          : <LaneKpiTable key={`${activeTab}:${viewMode}`} metricKey={activeTab} mode={viewMode} rows={lane.rows} status={lane.status}
              error={lane.error} onRetry={lane.retry} clientFilter={client}
              selectedHubTypes={props.selectedHubTypes} isHubTypeFiltered={props.isHubTypeFiltered}
              formattingRule={formattingRules[activeTab]} formattingControl={formattingControl(activeTab)} />}
      </div>
    </div>
  );
}
