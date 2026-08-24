import React, { useMemo } from 'react';
import { Sparkles, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatPct, formatVol } from '../utils/dataProcessor';
import { buildAttentionList, buildNarrative } from '../utils/insightAnalysis';
import StatusNotice from './ui/StatusNotice';

const STAGE_STYLE = {
  critical: { bg: 'var(--status-danger-bg)', fg: 'var(--status-danger-fg)' },
  warning: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning-fg)' },
  normal: { bg: 'var(--surface-subtle)', fg: 'var(--text-secondary)' }
};

/**
 * Tab "Insight" — tính năng MỚI, tách hẳn khỏi ExecutiveSummaryModal (vốn là
 * bản tóm tắt D-1 vs D-8 dạng text để dán Zalo/Telegram, giữ nguyên không đụng
 * vào). Insight trả lời 2 câu hỏi ExecutiveSummary không trả lời:
 *   - "Vì sao xấu đi?" — nối KPI (tab 1) với leadtime từng chặng (tab 3).
 *   - "Vùng/hub nào đáng lo nhất hôm nay?" — xếp hạng đủ cả 4 chỉ số, không
 *     chỉ top 3 như ExecutiveSummary hay 2 chỉ số như risk-chip của Report 1.
 */
export default function ReportInsight({ pickRows = [], deliRows = [], leadtimeRows = [], clientFilter = 'SPB', onJumpToRegion }) {
  const narrative = useMemo(
    () => buildNarrative({ pickRows, deliRows, leadtimeRows, clientFilter }),
    [pickRows, deliRows, leadtimeRows, clientFilter]
  );

  const attentionList = useMemo(
    () => buildAttentionList(pickRows, deliRows, clientFilter, { limit: 10 }),
    [pickRows, deliRows, clientFilter]
  );

  return (
    <div className="insight-root">
      <div className="section-header">
        <div className="section-title">
          <Sparkles size={18} style={{ color: 'var(--action-primary)', marginRight: '0.4rem', verticalAlign: '-3px' }} />
          Insight — {narrative.clientLabel}
        </div>
        <div className="section-desc">Vì sao chỉ số đổi, và vùng/hub nào cần chú ý nhất hôm nay — tự động, không cần dựng lại từ 2 tab kia.</div>
      </div>

      {/* Narrative: câu chuyện có nguyên nhân khả dĩ */}
      <div className="insight-card">
        <div className="insight-card-title">Vì sao chỉ số đổi</div>
        {narrative.bullets.length > 0 ? (
          <ul className="insight-narrative-list">
            {narrative.bullets.map((sentence, idx) => (
              <li key={idx}>{sentence}</li>
            ))}
          </ul>
        ) : (
          <div className="insight-narrative-ok">
            <CheckCircle2 size={16} style={{ color: 'var(--status-success-fg)' }} />
            <span>Không có chỉ số nào giảm đáng kể so với D-8 (ngưỡng 0.5pp).</span>
          </div>
        )}
        <StatusNotice tone="info" style={{ marginTop: '0.75rem', fontSize: '0.76rem' }}>
          {narrative.caveat}
        </StatusNotice>
      </div>

      {/* Leadtime signal: chặng nào đang lệch baseline */}
      {narrative.leadtimeSignal && (
        <div className="insight-card">
          <div className="insight-card-title">Leadtime từng chặng — so với bình thường (baseline 28 ngày)</div>
          <div className="insight-stage-strip">
            {narrative.leadtimeSignal.stages.map(s => {
              const style = STAGE_STYLE[s.level] || STAGE_STYLE.normal;
              return (
                <div key={s.key} className="insight-stage-chip" style={{ background: style.bg, color: style.fg }}>
                  <span className="insight-stage-label">{s.label}</span>
                  <span className="insight-stage-value">{s.current !== null ? `${s.current.toFixed(1)}h` : '–'}</span>
                  <span className="insight-stage-dev">{s.pct !== null ? `${s.pct > 0 ? '+' : ''}${s.pct.toFixed(0)}%` : '–'}</span>
                </div>
              );
            })}
            <div className="insight-stage-chip insight-stage-chip--e2e" style={(() => {
              const style = STAGE_STYLE[narrative.leadtimeSignal.e2e.level] || STAGE_STYLE.normal;
              return { background: style.bg, color: style.fg };
            })()}>
              <span className="insight-stage-label">E2E</span>
              <span className="insight-stage-value">{narrative.leadtimeSignal.e2e.current !== null ? `${narrative.leadtimeSignal.e2e.current.toFixed(1)}h` : '–'}</span>
              <span className="insight-stage-dev">{narrative.leadtimeSignal.e2e.pct !== null ? `${narrative.leadtimeSignal.e2e.pct > 0 ? '+' : ''}${narrative.leadtimeSignal.e2e.pct.toFixed(0)}%` : '–'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Xếp hạng vùng/hub đáng chú ý nhất — cả 4 chỉ số, không chỉ top 3 */}
      <div className="insight-card">
        <div className="insight-card-title">
          <AlertTriangle size={15} style={{ color: 'var(--status-danger-fg)', marginRight: '0.35rem', verticalAlign: '-2px' }} />
          Vùng/Hub đáng chú ý nhất (D-1, xếp theo mức độ nghiêm trọng)
        </div>
        {attentionList.length > 0 ? (
          <div className="insight-attention-list">
            {attentionList.map((item, idx) => (
              <div key={`${item.hub}-${item.metricKey}-${idx}`} className="insight-attention-row">
                <span className="insight-attention-rank">#{idx + 1}</span>
                <div className="insight-attention-main">
                  <div className="insight-attention-hub">
                    <b>{item.hub}</b> <span className="insight-attention-region">· {item.region} · {item.mien}</span>
                  </div>
                  <div className="insight-attention-metric">
                    {item.metric}: <b className="insight-attention-pct">{formatPct(item.pct)}</b> (target ≥{item.target}%) — {formatVol(item.late)} đơn trễ
                  </div>
                </div>
                {onJumpToRegion && (
                  <button type="button" className="insight-attention-jump" onClick={() => onJumpToRegion(item.region)} title={`Mở Report 1, vùng ${item.region}`}>
                    Xem <ArrowRight size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="insight-narrative-ok">
            <CheckCircle2 size={16} style={{ color: 'var(--status-success-fg)' }} />
            <span>Không có hub nào lệch target đáng kể hôm nay.</span>
          </div>
        )}
      </div>
    </div>
  );
}
