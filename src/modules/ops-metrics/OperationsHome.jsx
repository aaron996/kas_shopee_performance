import { useState } from 'react';
import { ArrowUpRight, CalendarDays, CheckCheck } from 'lucide-react';
import IconButton from '../../components/ui/IconButton';
import OverviewTrend from './OverviewTrend';
import OverviewKpiCards from './OverviewKpiCards';
import WeatherOverview from './WeatherOverview';
import { formatPct, formatVol, formatDateLabel } from '../../utils/dataProcessor';
import './overview.css';
import useOverviewMtd from './useOverviewMtd';

const dateLabel = date => date ? formatDateLabel(date).replace('\n', ' ') : 'Chưa có dữ liệu';
const percentage = value => formatPct(value).replace('.', ',');

export default function OperationsHome({ cards, risks, onOpenOps, weatherProps, dataNotice, mtdFilters, mtdScope }) {
  const [metric, setMetric] = useState('p1st');
  const { cards: mtdCards, retry } = useOverviewMtd(cards, mtdFilters, mtdScope);
  const card = cards.find(item => item.id === metric) || cards[0];
  const commonDate = cards.find(item => item.id === 'p1st')?.historyDates.at(-1) || cards.find(item => item.historyDates.length)?.historyDates.at(-1);
  const selectedDate = card?.historyDates.at(-1);
  const hasData = card?.d1?.tot > 0 && Number.isFinite(card?.d1?.pct);
  const selectedStatus = !hasData || card.target == null ? 'neutral' : card.d1.pct >= card.target ? 'good' : 'bad';

  return <div className="operations-home overview-workspace">
    {import.meta.env.VITE_WEATHER_ENABLED !== 'false' && weatherProps && <WeatherOverview key={weatherProps.userKey} {...weatherProps} />}

    {cards.length > 0 && <section className="overview-performance" aria-label="KPI vận hành">
      <div className="overview-performance-heading">
        <span className="overview-data-date"><CalendarDays aria-hidden="true" />MTD · {commonDate ? `${dateLabel(`${commonDate.slice(0, 7)}-01`)} – ${dateLabel(commonDate)}` : 'Chưa có dữ liệu'}</span>
        <span className="overview-comparison-note">Lũy kế từ đầu tháng
          <IconButton icon="Info" label="Cách đọc KPI" detail="MTD tính từ đầu tháng đến ngày dữ liệu mới nhất của từng KPI, theo bộ lọc đang chọn. Tỷ lệ bằng tổng tử chia tổng mẫu. Chọn KPI để xem xu hướng từng ngày; — là chưa có số liệu MTD." />
        </span>
      </div>
      <OverviewKpiCards cards={mtdCards} selectedMetric={card?.id} onSelect={setMetric} />
      {mtdCards.some(item => item.mtdRefreshError) && <div role="status">Đang hiển thị số MTD đã lưu; chưa cập nhật được số mới. <button type="button" className="overview-table-link" onClick={retry}>Thử lại</button></div>}
      {mtdCards.some(item => item.mtdStatus === 'error') && <div role="alert">Không tải được số liệu MTD. <button type="button" className="overview-table-link" onClick={retry}>Thử lại</button></div>}
    </section>}

    {dataNotice}

    {card && <div className="overview-analysis">
      <section id="overview-trend" className="overview-trend-panel" aria-labelledby="overview-trend-title">
        <div className="overview-section-heading">
          <div><h2 id="overview-trend-title">Xu hướng {card.title}</h2><p>{card.historyDates.length} ngày có dữ liệu gần nhất</p></div>
          <button type="button" className="overview-table-link" onClick={() => onOpenOps({ metricKey: card.id })} aria-label={`Mở bảng ${card.title}`}>
            Xem bảng <ArrowUpRight aria-hidden="true" />
          </button>
        </div>
        <div className="overview-trend-summary">
          <strong className={`is-${selectedStatus}`}>{hasData ? percentage(card.d1.pct) : '—'}</strong>
          <span>{dateLabel(selectedDate)}<small>{card.target != null ? `Target ≥${card.target}%` : 'Không áp dụng target'}</small></span>
        </div>
        <OverviewTrend key={card.id} card={card} />
        <div className={`overview-chart-caption ${selectedStatus === 'bad' ? 'has-bad-trend' : ''}`}><span><i aria-hidden="true" />{card.title}</span>{card.target != null && <span><i className="is-target" aria-hidden="true" />Target {card.target}%</span>}</div>
      </section>

      <section className="overview-hubs-panel" aria-labelledby="overview-hubs-title">
        <div className="overview-section-heading">
          <div><h2 id="overview-hubs-title">Hub cần theo dõi</h2><p>1st Pickup / 1st Deli · lượng trễ cao nhất</p></div>
          <span className="overview-hub-count" aria-label={`${risks.length} cảnh báo Hub`}>{risks.length}</span>
        </div>
        {risks.length ? <ol className="overview-hub-list">{risks.map((risk, index) => <li key={`${risk.hub}-${risk.sectionId}-${index}`}>
          <button type="button" onClick={() => onOpenOps({ hub: risk.hub, region: risk.region, metricKey: risk.sectionId })}>
            <span className="overview-hub-top"><strong>{risk.hub}</strong><ArrowUpRight aria-hidden="true" /></span>
            <span className="overview-hub-meta">{risk.region} · {risk.metric}</span>
            <span className="overview-hub-bottom"><span><strong>{formatVol(risk.late)}</strong> đơn trễ</span><span className="overview-hub-rate">{percentage(risk.pct)} <small>/ {risk.target}%</small></span></span>
          </button>
        </li>)}</ol> : <div className="overview-hubs-empty"><CheckCheck aria-hidden="true" /><p>Không có Hub dưới target phát sinh đơn trễ trong phạm vi đang chọn.</p></div>}
      </section>
    </div>}

  </div>;
}
