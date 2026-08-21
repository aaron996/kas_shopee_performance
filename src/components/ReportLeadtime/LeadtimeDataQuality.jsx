import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { STAGE_KEYS, BASELINE_CONFIG, formatOrders } from '../../utils/leadtimeCalc';

/**
 * Chất lượng dữ liệu — nói rõ những gì đã bị loại khỏi phân tích, để không ai
 * nghĩ có số bị ém. Bản cũ chỉ có một bảng "không xác định lane" rời rạc và
 * không hề nói tới các dòng thiếu chặng hay tuyến mẫu ít bị lọc.
 */
export default function LeadtimeDataQuality({ missingStage, unresolvedLane, cleanCount, pairRows, trend }) {
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => {
    const totalRows = cleanCount + missingStage.length + unresolvedLane.length;
    const patterns = new Map();
    let missingOrders = 0;
    for (const row of missingStage) {
      missingOrders += row.mau;
      const key = STAGE_KEYS.map((s, i) => (row.stages[i] === null ? 'N' : '·')).join('');
      patterns.set(key, (patterns.get(key) || 0) + 1);
    }
    const lowSample = pairRows.filter(r => r.lowSample);
    return {
      totalRows,
      missingRows: missingStage.length,
      missingOrders,
      patterns: [...patterns.entries()].sort((a, b) => b[1] - a[1]),
      unresolvedRows: unresolvedLane.length,
      unresolvedOrders: unresolvedLane.reduce((s, r) => s + r.mau, 0),
      lowSampleCount: lowSample.length,
      lowSampleOrders: lowSample.reduce((s, r) => s + r.mau, 0),
      totalPairs: pairRows.length
    };
  }, [missingStage, unresolvedLane, cleanCount, pairRows]);

  const excludedPct = stats.totalRows ? ((stats.missingRows + stats.unresolvedRows) / stats.totalRows) * 100 : 0;

  return (
    <section className="lt-block lt-block--quality">
      <button type="button" className="lt-quality-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span>Chất lượng dữ liệu</span>
        <span className="lt-quality-summary">
          loại {formatOrders(stats.missingRows + stats.unresolvedRows)}/{formatOrders(stats.totalRows)} dòng
          ({excludedPct.toFixed(2)}%)
        </span>
      </button>

      {open && (
        <div className="lt-quality-body">
          <div className="lt-quality-grid">
            <article>
              <h4>Dòng thiếu mốc chặng</h4>
              <p className="lt-quality-num">{formatOrders(stats.missingRows)} dòng</p>
              <p className="lt-quality-sub">{formatOrders(stats.missingOrders)} đơn</p>
              <p className="lt-quality-note">
                Thiếu bất kỳ mốc nào trong 4 chặng thì không weighted được cho chặng đó, nên loại
                cả dòng để tổng không bị lệch mẫu số.
              </p>
              {stats.patterns.length > 0 && (
                <table className="lt-quality-table">
                  <thead>
                    <tr>
                      <th>Pre / FM / MM / LM</th>
                      <th>Dòng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.patterns.map(([pattern, count]) => (
                      <tr key={pattern}>
                        <td><code>{pattern}</code></td>
                        <td>{formatOrders(count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            <article>
              <h4>Dòng không xác định được lane</h4>
              <p className="lt-quality-num">{formatOrders(stats.unresolvedRows)} dòng</p>
              <p className="lt-quality-sub">{formatOrders(stats.unresolvedOrders)} đơn</p>
              <p className="lt-quality-note">
                Cả 3 cột from / to / lane đều rỗng — không quy được về lane nào nên không vào
                breakdown. Nguyên nhân nằm ở phía query nguồn.
              </p>
            </article>

            <article>
              <h4>Tuyến mẫu ít bị lọc khỏi bảng</h4>
              <p className="lt-quality-num">
                {formatOrders(stats.lowSampleCount)}/{formatOrders(stats.totalPairs)} tuyến
              </p>
              <p className="lt-quality-sub">{formatOrders(stats.lowSampleOrders)} đơn</p>
              <p className="lt-quality-note">
                Dưới {BASELINE_CONFIG.minMau} đơn trong kỳ. Không xoá khỏi dữ liệu — vẫn nằm trong
                tổng của lane và của toàn mạng, chỉ không xếp hạng vì % lệch trên vài đơn không
                nói được gì.
              </p>
            </article>

            <article>
              <h4>Sản lượng theo ngày</h4>
              <p className="lt-quality-note">
                Dùng để phát hiện ngày khuyết dữ liệu: sản lượng dao động theo ngày trong tuần là
                bình thường, nhưng tụt hẳn một bậc thì là ngày chưa đủ dữ liệu.
              </p>
              <table className="lt-quality-table">
                <thead><tr><th>Ngày</th><th>Đơn</th></tr></thead>
                <tbody>
                  {trend.slice(-7).reverse().map(d => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{formatOrders(d.mau)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
