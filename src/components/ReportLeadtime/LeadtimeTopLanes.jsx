import React from 'react';
import { ArrowRight } from 'lucide-react';
import { STAGE_CONFIG, formatHours, formatDeviation, formatOrders } from '../../utils/leadtimeCalc';

/**
 * Top tuyến cần xử lý — câu hỏi vận hành hay hỏi nhất, bản cũ không có chỗ nào
 * trả lời (audit C3).
 *
 * Xếp theo impact = số đơn × giờ lệch so baseline, KHÔNG theo e2e giảm dần như
 * bảng cũ: Cross region luôn cao nhất về bản chất địa lý nên sort theo e2e cho
 * ra một danh sách không bao giờ đổi và không mang thông tin.
 */
export default function LeadtimeTopLanes({ rows, onSelect }) {
  if (!rows.length) {
    return (
      <section className="lt-block">
        <header className="lt-block-head"><h3>Top tuyến cần xử lý</h3></header>
        <p className="lt-empty">
          Không tuyến nào có chặng lệch lên so baseline trong kỳ này (đã bỏ tuyến mẫu ít).
        </p>
      </section>
    );
  }

  const max = rows[0].worstImpact || 1;

  return (
    <section className="lt-block">
      <header className="lt-block-head">
        <div>
          <h3>Top {rows.length} tuyến cần xử lý</h3>
          <p className="lt-block-sub">
            Xếp theo giờ trễ cộng dồn (số đơn × giờ lệch so baseline), không theo % lệch, để
            tuyến mẫu ít lệch to không chen lên đầu. Bấm một dòng để lọc bảng dưới theo tuyến đó.
          </p>
        </div>
      </header>

      <ol className="lt-toplist">
        {rows.map(row => {
          const stage = row.worstStage;
          const st = row.stages[stage];
          return (
            <li key={row.key}>
              <button type="button" className="lt-toplist-item" onClick={() => onSelect(row)}>
                <span className="lt-toplist-bar" style={{ width: `${Math.max(4, (row.worstImpact / max) * 100)}%` }} aria-hidden="true" />
                <span className="lt-toplist-route">
                  <strong>{row.from} → {row.to}</strong>
                  <span className="lt-toplist-tags">
                    <span className="lt-tag">{row.laneLabel}</span>
                    <span className="lt-tag lt-tag--client">{row.client}</span>
                    {row.baselineLevel === 'fallback' && (
                      <span className="lt-tag lt-tag--muted" title="Tuyến chưa đủ ngày lịch sử, đang so với baseline của cả nhóm lane">
                        baseline nhóm
                      </span>
                    )}
                  </span>
                </span>
                <span className="lt-toplist-stage">
                  <span className="lt-stage-dot" data-stage={stage} aria-hidden="true" />
                  {STAGE_CONFIG[stage].label}
                </span>
                <span className="lt-toplist-numbers">
                  <strong>{formatHours(st.value)}</strong>
                  <span className="lt-toplist-vs">vs {formatHours(st.baseline)}</span>
                  <span className={`lt-dev lt-dev--${st.direction} ${st.level !== 'normal' ? `lt-dev--${st.level}` : ''}`}>
                    {formatDeviation(st.pct)}
                  </span>
                </span>
                <span className="lt-toplist-impact">
                  <strong>{formatOrders(row.worstImpact)}</strong>
                  <span>giờ trễ · {formatOrders(row.mau)} đơn</span>
                </span>
                <ArrowRight size={15} className="lt-toplist-go" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
