import React from 'react';
import { SMALL_SAMPLE_THRESHOLD } from '../../utils/performanceRanking.js';

// Floating info tag shared by the 2D and 3D scenes: #rank, Hub name, KPI D-1,
// rank delta ("Mới" without a D-8 baseline) and a small-sample warning.
export default function TruckTag({ item, viewRank = null, className = '' }) {
  return (
    <div className={`prr-truck-tag ${item.meetsTarget ? 'tag-good' : 'tag-below'} ${className}`.trim()}>
      <div className="truck-tag-row">
        <span className="truck-tag-rank" title={viewRank ? `Tệ thứ ${viewRank} · Hạng gốc #${item.rank}` : undefined}>#{item.rank}{viewRank ? ` · W${viewRank}` : ''}</span>
        <span className="truck-tag-name" title={item.displayName || item.hub}>
          {item.displayName || item.hub}
        </span>
      </div>
      <div className="truck-tag-metric">
        <strong className="kpi-value">{item.kpiD1.toFixed(1)}%</strong>
        {item.hasCommonBaseline === false ? (
          <span className="truck-tag-delta none" title="Chưa có baseline D-8 trong nhóm đối soát chung">
            Mới
          </span>
        ) : item.deltaRank !== null && item.deltaRank !== 0 ? (
          <span className={`truck-tag-delta ${item.deltaRank > 0 ? 'up' : 'down'}`}>
            {item.deltaRank > 0 ? `+${item.deltaRank}` : item.deltaRank}
          </span>
        ) : null}
        {item.isSmallSample && (
          <span className="truck-tag-warning" title={`Mẫu ít (<${SMALL_SAMPLE_THRESHOLD} đơn, ngưỡng cấu hình tạm tính)`}>
            !
          </span>
        )}
      </div>
    </div>
  );
}
