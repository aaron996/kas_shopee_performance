import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceArea, ReferenceLine
} from 'recharts';
import { STAGE_KEYS, STAGE_CONFIG, formatHours, formatOrders } from '../../utils/leadtimeCalc';
import StageLegend from './StageLegend';

/**
 * Chart theo thời gian — thứ bản cũ thiếu hoàn toàn (audit C3).
 *
 * Leadtime là chỉ số xu hướng: toàn bộ máy móc baseline rolling 28 ngày đã tính
 * sẵn mà không có chỗ nào vẽ ra, nên người xem không thấy được hôm nào bắt đầu
 * xấu đi. Vùng tô nhạt là kỳ đang chọn, để đối chiếu với các card phía trên.
 */
export default function LeadtimeTrendChart({ data, windowDays, periodFrom, periodTo }) {
  const [showE2E, setShowE2E] = useState(true);

  const rows = useMemo(() => data.map(d => {
    const row = { date: d.date, label: d.date.slice(5), mau: d.mau, e2e: d.e2e };
    for (const s of STAGE_KEYS) row[s] = d.stages[s].value;
    return row;
  }), [data]);

  if (rows.length < 2) {
    return (
      <section className="lt-block">
        <header className="lt-block-head">
          <h3>Xu hướng {windowDays} ngày</h3>
        </header>
        <p className="lt-empty">Cần ít nhất 2 ngày dữ liệu để vẽ xu hướng.</p>
      </section>
    );
  }

  return (
    <section className="lt-block">
      <header className="lt-block-head">
        <div>
          <h3>Xu hướng {windowDays} ngày gần nhất</h3>
          <p className="lt-block-sub">
            Trục Y là giờ — cao hơn là chậm hơn. Vạch dọc là kỳ đang xem ở các card phía trên.
          </p>
        </div>
        <div className="lt-block-actions">
          <StageLegend showE2E={showE2E} />
          <label className="lt-checkbox">
            <input type="checkbox" checked={showE2E} onChange={(e) => setShowE2E(e.target.checked)} />
            <span>Hiện đường E2E</span>
          </label>
        </div>
      </header>

      <div className="lt-chart lt-chart--trend">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="lt-grid" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11 }} width={48}
              // domain 'dataMax' để nguyên thì tick cuối là số thực thô
              // (73.33563424614417h). Làm tròn lên bậc 10 cho trục sạch.
              domain={[0, (max) => Math.ceil((max || 1) / 10) * 10]}
              tickFormatter={(v) => `${Math.round(v)}h`}
            />
            {/* Kỳ 1 ngày thì ReferenceArea có x1 === x2 nên không vẽ ra gì —
                phải dùng ReferenceLine cho trường hợp đó. Label để filter
                "Kỳ xem" luôn thấy rõ đang tác động vào chart, không chỉ là
                một dải mờ dễ bị 5 đường Line che mất. */}
            {periodFrom && periodTo && (periodFrom === periodTo ? (
              <ReferenceLine
                x={periodTo.slice(5)} className="lt-period-line" ifOverflow="hidden"
                label={{ value: 'Kỳ đang xem', position: 'insideTopRight', className: 'lt-period-label' }}
              />
            ) : (
              <ReferenceArea
                x1={periodFrom.slice(5)} x2={periodTo.slice(5)} className="lt-period-band" ifOverflow="hidden"
                label={{ value: 'Kỳ đang xem', position: 'insideTop', className: 'lt-period-label' }}
              />
            ))}
            <Tooltip content={<TrendTooltip showE2E={showE2E} />} />
            {showE2E && (
              <Line
                type="monotone" dataKey="e2e" name="E2E (tổng)"
                className="lt-line lt-line--e2e"
                stroke="var(--text-muted)" strokeDasharray="5 4"
                strokeWidth={2} dot={false} connectNulls
              />
            )}
            {STAGE_KEYS.map(s => (
              <Line
                key={s} type="monotone" dataKey={s} name={STAGE_CONFIG[s].label}
                className={`lt-line lt-line--${s}`}
                // Truyền màu qua cả prop và CSS: prop đặt presentation attribute
                // ngay trên <path>, CSS nhắm .recharts-line-curve. Cả hai đọc
                // cùng một token nên không có nguồn màu thứ hai.
                stroke={`var(${STAGE_CONFIG[s].cssVar})`}
                strokeWidth={2} dot={false} connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TrendTooltip({ active, payload, showE2E }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="lt-tooltip">
      <div className="lt-tooltip-head">{row.date}</div>
      {showE2E && <div className="lt-tooltip-row lt-tooltip-row--total"><span>E2E</span><strong>{formatHours(row.e2e)}</strong></div>}
      {STAGE_KEYS.map(s => (
        <div key={s} className="lt-tooltip-row">
          <span className="lt-stage-dot" data-stage={s} aria-hidden="true" />
          <span>{STAGE_CONFIG[s].label}</span>
          <strong>{formatHours(row[s])}</strong>
        </div>
      ))}
      <div className="lt-tooltip-foot">{formatOrders(row.mau)} đơn</div>
    </div>
  );
}
