import { useState } from 'react';
import AnimatedIcon from '../../components/ui/AnimatedIcon';
import IconButton from '../../components/ui/IconButton';
import OverviewTrend from './OverviewTrend';
import OverviewKpiCards from './OverviewKpiCards';
import { formatVol, formatDateLabel } from '../../utils/dataProcessor';

export default function OperationsHome({ cards, risks, onOpenOps }) {
  const [metric, setMetric] = useState('p1st');
  const card = cards.find(item => item.id === metric) || cards[0];
  const commonDate = cards.find(item => item.id === 'p1st')?.historyDates.at(-1);
  return <div className="operations-home">
    <div className="workspace-heading"><div><h1>Tổng quan</h1><p>Hiệu suất và những Hub cần ưu tiên trong phạm vi đang chọn.</p></div><button className="nav-btn-sleek" onClick={() => onOpenOps()}><span>Chi tiết Vùng/Hub</span><AnimatedIcon name="ArrowRight" /></button></div>
    <OverviewKpiCards cards={cards} selectedMetric={metric} onSelect={setMetric} commonDate={commonDate} />
    <div className="home-kpi-context"><span>{commonDate ? formatDateLabel(commonDate).replace('\n', ' ') : 'Chưa có dữ liệu'} · Δ tuần trước</span><IconButton icon="Info" label="Cách đọc KPI" detail="Δ là chênh lệch theo điểm phần trăm so với cùng thứ tuần trước. Hover từng KPI để xem kỳ so sánh cụ thể; — là chưa có kỳ so sánh." /></div>
    <div className="home-work-grid">
      <section className="home-panel"><div className="home-panel-heading"><div><h2>Hub cần ưu tiên</h2><p>Tối đa 4 cảnh báo có lượng trễ cao nhất · 1st Pickup / 1st Deli</p></div><AnimatedIcon name="ShieldAlert" /></div>
        {risks.length ? <div className="home-risk-list">{risks.map((risk, index) => <button key={`${risk.hub}-${risk.sectionId}-${index}`} onClick={() => onOpenOps({ hub: risk.hub, region: risk.region, metricKey: risk.sectionId })}>
          <span className="risk-order">{String(index + 1).padStart(2, '0')}</span><span className="home-risk-name"><strong>{risk.hub}</strong><small>{risk.region} · {risk.metric}</small></span><span className="home-risk-value"><strong>{risk.pct.toFixed(1)}%</strong><small>{formatVol(risk.late)} đơn trễ · target {risk.target}%</small></span><AnimatedIcon name="ArrowUpRight" />
        </button>)}</div> : <p className="home-empty">Không có Hub dưới target phát sinh đơn trễ trong phạm vi đang chọn.</p>}
      </section>
      <section className="home-panel home-trend"><div className="home-panel-heading"><div><h2>Xu hướng {card.title}</h2><p>{card.historyDates.length} ngày có dữ liệu gần nhất</p></div><button className="nav-btn-sleek icon-btn" aria-label={`Mở bảng ${card.title}`} data-tooltip={`Mở bảng ${card.title}`} onClick={() => onOpenOps({ metricKey: card.id })}><AnimatedIcon name="ArrowUpRight" /></button></div>
        <OverviewTrend key={card.id} card={card} />
      </section>
    </div>
  </div>;
}
