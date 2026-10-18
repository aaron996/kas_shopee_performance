import { ArrowDownRight, ArrowUpRight, Check } from 'lucide-react';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import { formatPct, formatVol, formatDateLabel } from '../../utils/dataProcessor';

const percentage = value => formatPct(value).replace('.', ',');

export default function OverviewKpiCards({ cards, selectedMetric, onSelect, commonDate }) {
  return <div className="overview-metrics" role="group" aria-label="Chọn KPI để xem xu hướng">
    {cards.map(card => {
      const hasData = card.d1?.tot > 0 && Number.isFinite(card.d1?.pct);
      const hasComparison = hasData && Number.isFinite(card.d8?.pct);
      const diff = hasComparison ? Number((card.d1.pct - card.d8.pct).toFixed(1)) : null;
      const hasTarget = card.target != null;
      const status = !hasData || !hasTarget ? 'neutral' : card.d1.pct >= card.target ? 'good' : 'bad';
      const improved = card.id === 'fd' ? diff < 0 : diff > 0;
      const date = card.historyDates.at(-1);
      const DiffIcon = diff < 0 ? ArrowDownRight : ArrowUpRight;
      return <button type="button" key={card.id}
        className={`overview-metric ${selectedMetric === card.id ? 'is-selected' : ''}`}
        aria-pressed={selectedMetric === card.id} aria-controls="overview-trend"
        onClick={() => onSelect(card.id)}>
        <span className="overview-metric-heading">
          <span>{card.title}</span>
          <Check className="overview-metric-check" aria-hidden="true" />
        </span>
        <span className={`overview-metric-value is-${status}`}>
          {hasData ? <AnimatedNumber value={card.d1.pct} format={percentage} /> : '—'}
        </span>
        <span className="overview-metric-comparison">
          {diff !== null ? <span className={`overview-metric-delta ${diff === 0 ? '' : improved ? 'is-good' : 'is-bad'}`}>
            {diff !== 0 && <DiffIcon aria-hidden="true" />}
            {diff > 0 ? '+' : ''}{diff.toLocaleString('vi-VN', { minimumFractionDigits: 1 })}
            <span className="sr-only"> điểm phần trăm so với cùng thứ tuần trước</span>
          </span> : <span>{hasData ? 'Chưa có kỳ so sánh' : `Chưa có dữ liệu${card.id === 'fd' ? ' FD' : ''}`}</span>}
          {hasTarget && <span>Target ≥{card.target}%</span>}
        </span>
        <span className="overview-metric-volume">
          {hasData ? <><span>{formatVol(card.d1.tot)} đơn</span><span>{formatVol(card.subStatLabel ? card.d1.ont : card.d1.tot - card.d1.ont)} {card.subStatLabel || 'trễ'}</span></> : <span>— đơn</span>}
        </span>
        {date && commonDate && date !== commonDate && <span className="overview-metric-date">Dữ liệu {formatDateLabel(date).replace('\n', ' ')}</span>}
      </button>;
    })}
  </div>;
}
