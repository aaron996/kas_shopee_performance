import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import { STAGE_KEYS, STAGE_CONFIG, formatHours, formatDeviation, formatOrders } from '../../utils/leadtimeCalc';
import { getClientLabel } from '../../utils/clientLabels';
import StageLegend from './StageLegend';

/**
 * Cấu trúc leadtime theo lane.
 *
 * Khi xem cả 2 khách hàng thì vẽ 2 chart CẠNH NHAU, mỗi chart một khách hàng —
 * không xếp 2 stack lẫn trong cùng một nhóm như bản cũ. Lý do: cả 2 stack đều
 * dùng chung 4 màu chặng nên hai cột cạnh nhau giống hệt nhau, và legend cũ còn
 * ghi "cột 1 = SPB (cam) / cột 2 = SPE (xanh)" trong khi không có cột nào màu đó
 * (audit C1).
 *
 * Trục X lấy động từ data nên đủ cả 5 lane — bản cũ hardcode 3 giá trị và so ===
 * phân biệt hoa/thường nên Cross metro / Cross metro * biến mất khỏi chart (A2).
 */
export default function LeadtimeLaneChart({ groups }) {
  if (!groups.length) return null;

  return (
    <section className="lt-block">
      <header className="lt-block-head">
        <div>
          <h3>Cấu trúc leadtime theo lane</h3>
          <p className="lt-block-sub">
            Chiều cao cột = tổng 4 chặng (weighted theo số đơn). Hover để xem lệch so baseline.
          </p>
        </div>
        <StageLegend />
      </header>

      <div className={`lt-multiples lt-multiples--${groups.length}`}>
        {groups.map(group => {
          const data = group.lanes.map(row => {
            // CHỈ 4 key chặng ở tầng trên. YAxis domain={[0,'dataMax']} quét mọi
            // trường số ở tầng này, nên để `mau` lọt vào là trục nhảy lên
            // 14.417h. Số cho tooltip nằm trong _row.
            const entry = { lane: row.lane.label, _row: row };
            for (const s of STAGE_KEYS) entry[s] = row.stages[s].value ?? 0;
            return entry;
          });
          return (
            <div className="lt-multiple" key={group.client}>
              <h4 className="lt-multiple-title">
                {getClientLabel(group.client)} <span>{group.client}</span>
              </h4>
              <div className="lt-chart lt-chart--lane">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="lt-grid" />
                    <XAxis dataKey="lane" tick={{ fontSize: 11 }} interval={0} height={30} />
                    <YAxis
              tick={{ fontSize: 11 }} width={48}
              // domain 'dataMax' để nguyên thì tick cuối là số thực thô
              // (73.33563424614417h). Làm tròn lên bậc 10 cho trục sạch.
              domain={[0, (max) => Math.ceil((max || 1) / 10) * 10]}
              tickFormatter={(v) => `${Math.round(v)}h`}
            />
                    <Tooltip content={<LaneTooltip />} cursor={{ className: 'lt-bar-cursor' }} />
                    {STAGE_KEYS.map(s => (
                      <Bar
                        key={s} dataKey={s} name={STAGE_CONFIG[s].label}
                        stackId="stage" className={`lt-bar lt-bar--${s}`}
                        fill={`var(${STAGE_CONFIG[s].cssVar})`}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Chỉ hiện chặng đang hover + baseline thật, không in cả 2 client × 4 chặng như bản cũ. */
function LaneTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload?._row;
  if (!row) return null;
  const total = STAGE_KEYS.reduce((s, k) => s + (row.stages[k].value ?? 0), 0);

  return (
    <div className="lt-tooltip">
      <div className="lt-tooltip-head">{label}</div>
      {STAGE_KEYS.map(s => {
        const st = row.stages[s];
        const share = total > 0 && st.value !== null ? (st.value / total) * 100 : null;
        return (
          <div key={s} className="lt-tooltip-row">
            <span className="lt-stage-dot" data-stage={s} aria-hidden="true" />
            <span>{STAGE_CONFIG[s].label}</span>
            <strong>{formatHours(st.value)}</strong>
            {share !== null && <span className="lt-tooltip-share">{share.toFixed(0)}%</span>}
            {st.pct !== null && (
              <span className={`lt-dev lt-dev--${st.direction} ${st.level !== 'normal' ? `lt-dev--${st.level}` : ''}`}>
                {formatDeviation(st.pct)}
              </span>
            )}
          </div>
        );
      })}
      <div className="lt-tooltip-foot">
        Tổng 4 chặng {formatHours(total)} · E2E {formatHours(row.e2e)} · {formatOrders(row.mau)} đơn
        <br />
        {row.stages.middlemile.baseline !== null
          ? `baseline ${row.stages.middlemile.baselineDays} ngày trước kỳ`
          : 'chưa đủ lịch sử để có baseline'}
      </div>
    </div>
  );
}
