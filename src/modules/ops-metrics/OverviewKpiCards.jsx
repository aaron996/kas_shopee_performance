import LoadingScreen from '../../components/LoadingScreen.jsx';
import { Check } from 'lucide-react';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import { formatPct, formatVol, formatDateLabel } from '../../utils/dataProcessor';

const percentage = value => formatPct(value).replace('.', ',');

export default function OverviewKpiCards({ cards, selectedMetric, onSelect }) {
  return <div className="overview-metrics" role="group" aria-label="Chọn KPI để xem xu hướng">
    {cards.map(card => {
      const hasData = card.mtd?.tot > 0 && Number.isFinite(card.mtd?.pct);
      const hasTarget = card.target != null;
      const status = !hasData || !hasTarget ? 'neutral' : card.mtd.pct >= card.target ? 'good' : 'bad';
      return <button type="button" key={card.id}
        className={`overview-metric ${selectedMetric === card.id ? 'is-selected' : ''}`}
        aria-pressed={selectedMetric === card.id} aria-controls="overview-trend" aria-busy={card.mtdStatus === 'loading'}
        onClick={() => onSelect(card.id)}>
        <span className="overview-metric-heading">
          <span>{card.title}</span>
          <Check className="overview-metric-check" aria-hidden="true" />
        </span>
        <span className={`overview-metric-value is-${status}`}>
          {card.mtdStatus === 'loading' ? <LoadingScreen variant="inline" /> : hasData ? <AnimatedNumber value={card.mtd.pct} format={percentage} /> : '—'}
        </span>
        <span className="overview-metric-comparison">
          <span>{card.mtdStatus === 'loading' ? <LoadingScreen variant="inline" /> : card.mtdStatus === 'error' ? 'Lỗi tải MTD' : hasData ? 'MTD' : 'Chưa có dữ liệu MTD'}</span>
          {hasTarget && <span>Target ≥{card.target}%</span>}
        </span>
        <span className="overview-metric-volume">
          {card.mtdStatus === 'loading' ? <LoadingScreen variant="inline" /> : hasData ? <><span>{formatVol(card.mtd.tot)} đơn</span><span>{formatVol(card.subStatLabel ? card.mtd.ont : card.mtd.tot - card.mtd.ont)} {card.subStatLabel || 'trễ'}</span></> : <span>— đơn</span>}
        </span>
        {card.mtd?.to && <span className="overview-metric-date">{formatDateLabel(card.mtd.from).replace('\n', ' ')} – {formatDateLabel(card.mtd.to).replace('\n', ' ')}</span>}
      </button>;
    })}
  </div>;
}
