import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ChevronDown, ChevronRight } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import {
  STAGE_KEYS, STAGE_CONFIG, BASELINE_CONFIG,
  formatHours, formatDeviation, formatOrders
} from '../../utils/leadtimeCalc';

const PAGE = 25;

/**
 * Bảng chi tiết.
 *
 * Khác bản cũ (audit A2b, A4, C8, C9, B6):
 *  - Nhóm chính là LANE, mỗi lane là một section collapse. Mặc định TẤT CẢ đóng
 *    — trước đây tự mở lane có cảnh báo (hoặc lane đầu) nên "Đào sâu theo tuyến"
 *    lúc nào mở ra cũng thấy cả trăm dòng bung sẵn, phải cuộn qua mới thấy hết
 *    các lane khác. Giờ người xem bấm vào lane nào thì mới load dòng của lane đó.
 *  - Gộp theo tuyến cho cả kỳ nhiều ngày, nên không còn cảnh một tuyến hiện 7 lần
 *    với 7 bộ số mà không có cột ngày để phân biệt.
 *  - Cột text canh trái, font sans (class .lt-cell-text). Bản cũ chỉ set textAlign
 *    trên <th> nên tiêu đề canh trái mà nội dung canh phải theo mặc định của
 *    .mtx-table, lại còn render tên tỉnh bằng font mono.
 *  - Cột "MAU" đổi thành "Số đơn" — mau là số mẫu, không phải Monthly Active Users.
 */
export default function LeadtimeDetailTable({ rows, lanes, multiDay, onClearPairFilter }) {
  const [showLowSample, setShowLowSample] = useState(false);
  const [openLanes, setOpenLanes] = useState(() => new Set());
  const [pageByLane, setPageByLane] = useState({});

  const groups = useMemo(() => {
    const byLane = new Map();
    for (const row of rows) {
      if (!showLowSample && row.lowSample) continue;
      if (!byLane.has(row.laneKey)) byLane.set(row.laneKey, { laneKey: row.laneKey, label: row.laneLabel, rows: [] });
      byLane.get(row.laneKey).rows.push(row);
    }
    const order = new Map(lanes.map((l, i) => [l.key, i]));
    return [...byLane.values()]
      .map(g => ({
        ...g,
        rows: g.rows.sort((a, b) => b.worstImpact - a.worstImpact || b.mau - a.mau),
        alertCount: g.rows.filter(r => r.level !== 'normal').length,
        mau: g.rows.reduce((s, r) => s + r.mau, 0)
      }))
      .sort((a, b) => (order.get(a.laneKey) ?? 99) - (order.get(b.laneKey) ?? 99));
  }, [rows, lanes, showLowSample]);

  const toggleLane = (laneKey) => {
    setOpenLanes(prev => {
      const next = new Set(prev);
      if (next.has(laneKey)) next.delete(laneKey);
      else next.add(laneKey);
      return next;
    });
  };

  const hiddenLowSample = rows.filter(r => r.lowSample).length;

  return (
    <section className="lt-block">
      <header className="lt-block-head">
        <div>
          <h3>Chi tiết theo tuyến</h3>
          <p className="lt-block-sub">
            Nhóm theo lane, mỗi dòng là một tuyến tỉnh → tỉnh
            {multiDay ? ' (gộp weighted cho cả kỳ)' : ''}. % lệch so baseline{' '}
            {BASELINE_CONFIG.windowDays} ngày trước kỳ.
          </p>
        </div>
        <div className="lt-block-actions">
          {onClearPairFilter && (
            <button type="button" className="lt-chip-btn" onClick={onClearPairFilter}>
              <X size={13} /> Bỏ lọc tuyến
            </button>
          )}
          <label className="lt-checkbox">
            <input
              type="checkbox"
              checked={showLowSample}
              onChange={(e) => setShowLowSample(e.target.checked)}
            />
            <span>Hiện tuyến mẫu ít ({hiddenLowSample})</span>
          </label>
        </div>
      </header>

      {!groups.length ? (
        <p className="lt-empty">
          Không còn tuyến nào sau khi lọc. {hiddenLowSample > 0 && 'Bật "Hiện tuyến mẫu ít" để xem phần còn lại.'}
        </p>
      ) : groups.map(group => {
        const isOpen = openLanes.has(group.laneKey);
        const page = pageByLane[group.laneKey] || PAGE;
        const visible = group.rows.slice(0, page);
        return (
          <div className="lt-lane-group" key={group.laneKey}>
            <button type="button" className="lt-lane-head" onClick={() => toggleLane(group.laneKey)} aria-expanded={isOpen}>
              <MorphIcon icon={isOpen ? ChevronDown : ChevronRight} size={15} reducedMotion="user" />
              <strong>{group.label}</strong>
              <span className="lt-lane-meta">
                {formatOrders(group.rows.length)} tuyến · {formatOrders(group.mau)} đơn
              </span>
              {group.alertCount > 0 && (
                <span className="lt-tag lt-tag--warn">{group.alertCount} vượt ngưỡng</span>
              )}
            </button>

            {isOpen && (
              <>
                <div className="lt-table-wrap">
                  <table className="lt-table">
                    <thead>
                      <tr>
                        <th className="lt-cell-text">Tuyến</th>
                        <th className="lt-cell-text">KH</th>
                        <th>Số đơn</th>
                        {STAGE_KEYS.map(s => <th key={s}>{STAGE_CONFIG[s].short}</th>)}
                        <th className="lt-col-e2e">E2E</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(row => (
                        <tr key={row.key} className={row.level !== 'normal' ? `lt-row--${row.level}` : ''}>
                          <td className="lt-cell-text">
                            {row.from} → {row.to}
                            {row.baselineLevel === 'fallback' && (
                              <span className="lt-tag lt-tag--muted" title="Tuyến chưa đủ ngày lịch sử — baseline lấy ở cấp nhóm lane">
                                baseline nhóm
                              </span>
                            )}
                          </td>
                          <td className="lt-cell-text"><span className="lt-tag lt-tag--client">{row.client}</span></td>
                          <td>
                            {formatOrders(row.mau)}
                            {row.lowSample && <span className="lt-flag">mẫu ít</span>}
                          </td>
                          {STAGE_KEYS.map(s => {
                            const st = row.stages[s];
                            return (
                              <td key={s} className={st.level !== 'normal' ? `lt-cell--${st.level}` : ''}>
                                <span className="lt-cell-value">{formatHours(st.value)}</span>
                                {st.pct !== null && (
                                  <span
                                    className={`lt-cell-dev lt-dev--${st.direction} ${st.level !== 'normal' ? `lt-dev--${st.level}` : ''}`}
                                    title={`baseline ${formatHours(st.baseline)} · ${st.baselineDays} ngày · cấp ${st.baselineLevel === 'fallback' ? 'nhóm lane' : 'tuyến'}`}
                                  >
                                    {formatDeviation(st.pct)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className={`lt-col-e2e ${row.e2eInfo.level !== 'normal' ? `lt-cell--${row.e2eInfo.level}` : ''}`}>
                            <span className="lt-cell-value">{formatHours(row.e2e)}</span>
                            {row.e2eInfo.pct !== null && (
                              <span
                                className={`lt-cell-dev lt-dev--${row.e2eInfo.direction} ${row.e2eInfo.level !== 'normal' ? `lt-dev--${row.e2eInfo.level}` : ''}`}
                                title={`baseline ${formatHours(row.e2eInfo.baseline)} · ${row.e2eInfo.baselineDays} ngày · cấp ${row.e2eInfo.baselineLevel === 'fallback' ? 'nhóm lane' : 'tuyến'}`}
                              >
                                {formatDeviation(row.e2eInfo.pct)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {group.rows.length > visible.length && (
                  <button
                    type="button"
                    className="lt-showmore"
                    onClick={() => setPageByLane(p => ({ ...p, [group.laneKey]: group.rows.length }))}
                  >
                    Hiện tất cả {formatOrders(group.rows.length)} tuyến
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
