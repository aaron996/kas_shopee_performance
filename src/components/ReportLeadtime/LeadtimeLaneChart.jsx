import React from 'react';
import { STAGE_KEYS, STAGE_CONFIG, formatHours, formatDeviation, formatOrders } from '../../utils/leadtimeCalc';
import { getClientLabel } from '../../utils/clientLabels';

/**
 * Cấu trúc leadtime theo lane — small-multiple ngang, mỗi lane một panel.
 *
 * Bản trước dùng recharts BarChart dọc, stack 4 chặng theo cột, trục X là các
 * lane cạnh nhau. Đọc kiểu đó dễ so lane nào TỔNG cao hơn, nhưng khó thấy chặng
 * nào là nút thắt của một lane cụ thể — phải nhìn tỉ lệ màu trong 1 cột mảnh.
 * Đổi sang panel riêng cho mỗi lane, mỗi chặng một dòng bar ngang: chặng dài
 * nhất trong lane tô đỏ, còn lại xám — nhìn ra nút thắt ngay không cần tính tỉ
 * lệ trong đầu. Thang đo (độ dài bar) DÙNG CHUNG cho cả nhóm panel của một
 * khách hàng để không so sai giữa panel intra-city (vài giờ) và cross-region
 * (vài chục giờ).
 *
 * Khi xem cả 2 khách hàng thì vẫn tách 2 nhóm panel cạnh nhau như bản cũ — mỗi
 * khách hàng một thang đo riêng vì quy mô giờ có thể khác hẳn nhau.
 */
export default function LeadtimeLaneChart({ groups }) {
  if (!groups.length) return null;

  return (
    <section className="lt-block">
      <header className="lt-block-head">
        <div>
          <h3>Cấu trúc leadtime theo lane</h3>
          <p className="lt-block-sub">Mỗi panel một lane · chặng dài nhất là nút thắt, tô đỏ.</p>
        </div>
        <ul className="lt-hbar-legend">
          <li><span className="lt-hbar-swatch lt-hbar-swatch--worst" aria-hidden="true" /> Chặng nghiêm nhất</li>
          <li><span className="lt-hbar-swatch" aria-hidden="true" /> Các chặng khác</li>
        </ul>
      </header>

      {groups.map(group => {
        const maxValue = Math.max(
          1,
          ...group.lanes.flatMap(row => STAGE_KEYS.map(s => row.stages[s].value ?? 0))
        );
        return (
          <div className="lt-lanepanel-block" key={group.client}>
            <div className="lt-lanepanel-block-head">
              {groups.length > 1 && (
                <h4 className="lt-multiple-title">
                  {getClientLabel(group.client)} <span>{group.client}</span>
                </h4>
              )}
              <span className="lt-lanepanel-scale">Thang đo dùng chung · tối đa {formatHours(maxValue)}</span>
            </div>

            <div className="lt-lanepanel-grid">
              {group.lanes.map(row => {
                const bottleneck = STAGE_KEYS.reduce((best, s) => (
                  (row.stages[s].value ?? 0) > (row.stages[best].value ?? 0) ? s : best
                ), STAGE_KEYS[0]);
                const bottleneckValue = row.stages[bottleneck].value ?? 0;

                return (
                  <article className="lt-lanepanel" key={row.lane.key}>
                    <header className="lt-lanepanel-head">
                      <h5>{row.lane.label}</h5>
                      <span className="lt-lanepanel-meta">
                        {formatOrders(row.mau)} đơn · tổng {formatHours(row.sumOfStages)}
                      </span>
                    </header>

                    <div className="lt-lanepanel-rows">
                      {STAGE_KEYS.map(s => {
                        const st = row.stages[s];
                        const value = st.value ?? 0;
                        const isWorst = s === bottleneck && bottleneckValue > 0;
                        return (
                          <div className="lt-hbar-row" key={s}>
                            <span className="lt-hbar-label">{STAGE_CONFIG[s].label}</span>
                            <span className="lt-hbar-track">
                              <span
                                className={`lt-hbar-fill ${isWorst ? 'lt-hbar-fill--worst' : ''}`}
                                style={{ width: `${value > 0 ? Math.max(2, (value / maxValue) * 100) : 0}%` }}
                              />
                            </span>
                            <span className="lt-hbar-value">
                              {formatHours(st.value)}
                              {st.pct !== null && (
                                <span
                                  className={`lt-dev lt-dev--${st.direction} ${st.level !== 'normal' ? `lt-dev--${st.level}` : ''}`}
                                >
                                  {formatDeviation(st.pct)}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
