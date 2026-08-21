import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { STAGE_CONFIG, formatHours, formatDeviation, formatOrders } from '../../utils/leadtimeCalc';
import { getClientLabel } from '../../utils/clientLabels';

/**
 * Dòng kết luận — thứ đầu tiên người mở tab đọc được.
 *
 * Bản cũ không có tầng này: mở tab ra là 3 nút hành động, 3 bộ lọc, một panel 7
 * thông số rồi mới tới chart, nên không ai biết phải nhìn vào đâu (audit C4).
 *
 * "Nút thắt" chọn theo impact = số đơn × giờ lệch, KHÔNG theo % lệch — nếu theo
 * % thì một tuyến 1 đơn lệch +200% sẽ luôn thắng mà không ai cần xử lý.
 */
export default function LeadtimeVerdict({ from, to, clients, overall, bottleneck, alertCount, thresholds }) {
  if (!overall) return null;

  const e2e = overall.e2e;
  const periodLabel = from === to ? from : `${from} → ${to}`;
  const clientLabel = clients.map(getClientLabel).join(' + ');
  const hasIssue = alertCount > 0 || (bottleneck && bottleneck.impact > 0);

  return (
    <section className={`lt-verdict ${hasIssue ? 'lt-verdict--alert' : 'lt-verdict--ok'}`}>
      <div className="lt-verdict-icon" aria-hidden="true">
        {hasIssue ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
      </div>

      <div className="lt-verdict-body">
        <p className="lt-verdict-lead">
          <strong>{periodLabel}</strong> · {clientLabel} · {formatOrders(overall.mau)} đơn ·
          {' '}E2E <strong>{formatHours(e2e.value)}</strong>
          {e2e.pct !== null && (
            <span className={`lt-dev lt-dev--${e2e.direction}`}>
              {' '}{formatDeviation(e2e.pct)} so baseline {e2e.baselineDays} ngày
            </span>
          )}
        </p>

        {bottleneck ? (
          <p className="lt-verdict-detail">
            Nút thắt: <strong>{STAGE_CONFIG[bottleneck.stage].label}</strong>
            {' '}— cộng dồn <strong>{formatOrders(bottleneck.impact)} giờ trễ</strong> so baseline.
            {bottleneck.pair && (
              <> Tuyến nặng nhất: <strong>{bottleneck.pair.from} → {bottleneck.pair.to}</strong>
                {' '}({bottleneck.pair.laneLabel}, {bottleneck.pair.client}) —
                {' '}{formatHours(bottleneck.pair.stages[bottleneck.pair.worstStage]?.value)}
                {' '}vs {formatHours(bottleneck.pair.stages[bottleneck.pair.worstStage]?.baseline)}.
              </>
            )}
          </p>
        ) : (
          <p className="lt-verdict-detail">
            Không chặng nào lệch lên so baseline trong kỳ này.
          </p>
        )}

        <p className="lt-verdict-meta">
          {alertCount > 0
            ? <><strong>{alertCount}</strong> tuyến vượt ngưỡng cảnh báo (preset {thresholds.label}: +{thresholds.warningPct}% / +{thresholds.criticalPct}%)</>
            : <>Không tuyến nào vượt ngưỡng {thresholds.label.toLowerCase()} (+{thresholds.warningPct}%)</>}
          {' · '}so sánh với chính mình theo lịch sử, không có target
        </p>
      </div>
    </section>
  );
}
