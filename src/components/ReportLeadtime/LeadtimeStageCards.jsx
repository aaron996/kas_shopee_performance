import React from 'react';
import { STAGE_KEYS, STAGE_CONFIG, formatHours, formatDeviation, formatOrders } from '../../utils/leadtimeCalc';
import AnimatedNumber from '../ui/AnimatedNumber';
import MiniSparkline from '../ui/MiniSparkline';

/**
 * 5 card: E2E + 4 chặng. Mỗi card có giá trị, lệch so baseline, sparkline và
 * số đơn — trả lời "bao nhiêu giờ / tăng hay giảm" mà không cần đọc chart.
 *
 * Card E2E ghi rõ nguồn số: giá trị là avg_lt_e2e_hour của nguồn, và khi tổng 4
 * chặng lệch quá 5% thì nói luôn lý do (mẫu số từng chặng khác nhau) — bản cũ để
 * 2 con số "tổng" khác nhau cách nhau 200px mà không giải thích (audit B4).
 */
export default function LeadtimeStageCards({ overall, trend }) {
  if (!overall) return null;

  const e2eSpark = trend.map(d => d.e2e).filter(v => v !== null);
  const sumStages = overall.sumOfStages;
  const e2eValue = overall.e2e.value;
  const gapPct = (sumStages !== null && e2eValue) ? ((sumStages - e2eValue) / e2eValue) * 100 : null;
  const showGap = gapPct !== null && Math.abs(gapPct) > 5;

  return (
    <div className="lt-cards">
      <article className="lt-card lt-card--e2e">
        <header className="lt-card-title">
          <span>E2E (tạo đơn → giao xong)</span>
        </header>
        <div className="lt-card-main">
          <AnimatedNumber value={e2eValue ?? 0} format={v => formatHours(v)} className="lt-card-value" />
          {overall.e2e.pct !== null && (
            <span className={`lt-dev lt-dev--${overall.e2e.direction}`}>{formatDeviation(overall.e2e.pct)}</span>
          )}
        </div>
        <MiniSparkline values={e2eSpark} direction={overall.e2e.direction} />
        <footer className="lt-card-foot">
          {formatOrders(overall.mau)} đơn
          {showGap && (
            <span className="lt-card-note">
              Tổng 4 chặng {formatHours(sumStages)} — lệch {formatDeviation(gapPct)} do mẫu số từng chặng khác nhau
            </span>
          )}
        </footer>
      </article>

      {STAGE_KEYS.map(key => {
        const s = overall.stages[key];
        const spark = trend.map(d => d.stages[key].value).filter(v => v !== null);
        return (
          <article key={key} className="lt-card" data-stage={key}>
            <header className="lt-card-title">
              <span className="lt-stage-dot" data-stage={key} aria-hidden="true" />
              <span>{STAGE_CONFIG[key].label}</span>
            </header>
            <div className="lt-card-main">
              <AnimatedNumber value={s.value ?? 0} format={v => formatHours(v)} className="lt-card-value" />
              {s.pct !== null && (
                <span className={`lt-dev lt-dev--${s.direction} ${s.level !== 'normal' ? `lt-dev--${s.level}` : ''}`}>
                  {formatDeviation(s.pct)}
                </span>
              )}
            </div>
            <MiniSparkline values={spark} direction={s.direction} />
            <footer className="lt-card-foot">
              {s.baseline !== null
                ? <>baseline {formatHours(s.baseline)} · {s.baselineDays} ngày</>
                : <>chưa đủ lịch sử để có baseline</>}
              {s.suspectData && <span className="lt-flag lt-flag--suspect">nghi lỗi data</span>}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
