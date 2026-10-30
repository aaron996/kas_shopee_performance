import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, CheckCheck, MapPin, UsersRound, Warehouse } from 'lucide-react';
import IconButton from '../../components/ui/IconButton';
import OverviewTrend from './OverviewTrend';
import OverviewKpiCards from './OverviewKpiCards';
import WeatherOverview from './WeatherOverview';
import { MIEN_REGIONS } from '../../data/defaultDataset';
import { formatPct, formatVol, formatDateLabel } from '../../utils/dataProcessor';
import './overview.css';
import useOverviewMtd from './useOverviewMtd';

// Matches the mobile block in overview.css. Below it the panels stack, so the
// weather strip moves under the KPI numbers instead of pushing them off screen.
const MOBILE_LAYOUT = '(max-width: 600px)';
const ALL_REGION_COUNT = Object.values(MIEN_REGIONS).flat().length;

const dateLabel = date => date ? formatDateLabel(date).replace('\n', ' ') : 'Chưa có dữ liệu';
const percentage = value => formatPct(value).replace('.', ',');

// The header filters are icon-only at every width, so the numbers on this tab
// would otherwise never say which Client or Vùng they belong to. Each chip opens
// its own header popover; Header listens for this event.
const openScopeFilter = name => window.dispatchEvent(new CustomEvent('open-scope-popover', { detail: { name } }));

function ScopeStrip({ filters, allHubTypes }) {
  const regions = filters?.selectedRegions || [];
  const hubTypes = filters?.selectedHubTypes || [];
  const total = allHubTypes?.length || 0;
  const chips = [
    { name: 'client', Icon: UsersRound, label: 'Client', text: filters?.clientFilter || 'Tất cả' },
    { name: 'region', Icon: MapPin, label: 'Vùng',
      text: regions.length === ALL_REGION_COUNT ? 'Tất cả vùng' : regions.length ? `${regions.length}/${ALL_REGION_COUNT} vùng` : 'Chưa chọn vùng',
      warn: regions.length === 0 },
    // Same wording as the header summary, including the no-data case where both
    // counts are zero and no Loại Hub filter is in play yet.
    { name: 'hub', Icon: Warehouse, label: 'Loại Hub',
      text: hubTypes.length === total ? 'Tất cả loại Hub' : hubTypes.length ? `${hubTypes.length}/${total} loại Hub` : 'Chưa chọn loại Hub',
      warn: total > 0 && hubTypes.length === 0 }
  ];
  return <div className="overview-scope" role="group" aria-label="Phạm vi dữ liệu đang xem">
    {chips.map(({ name, Icon, label, text, warn }) => <button type="button" key={name}
      className={`overview-scope-chip ${warn ? 'is-warn' : ''}`}
      aria-label={`${label}: ${text}. Mở bộ lọc ${label}`} onClick={() => openScopeFilter(name)}>
      <Icon aria-hidden="true" /><span>{text}</span>
    </button>)}
  </div>;
}

export default function OperationsHome({ cards, risks, riskTotal, riskDates, onOpenOps, weatherProps, dataNotice, mtdFilters, mtdScope, allHubTypes }) {
  const [metric, setMetric] = useState('p1st');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_LAYOUT).matches);
  const trendRef = useRef(null);
  const { cards: mtdCards, retry } = useOverviewMtd(cards, mtdFilters, mtdScope);
  const card = cards.find(item => item.id === metric) || cards[0];
  const commonDate = cards.find(item => item.id === 'p1st')?.historyDates.at(-1) || cards.find(item => item.historyDates.length)?.historyDates.at(-1);
  const selectedDate = card?.historyDates.at(-1);
  const hasData = card?.d1?.tot > 0 && Number.isFinite(card?.d1?.pct);
  const selectedStatus = !hasData || card.target == null ? 'neutral' : card.d1.pct >= card.target ? 'good' : 'bad';
  // Every card repeating the heading's own range is noise; only a KPI whose data
  // ends on a different day still needs to say so.
  const headingRange = commonDate ? { from: `${commonDate.slice(0, 7)}-01`, to: commonDate } : null;

  useEffect(() => {
    const query = window.matchMedia(MOBILE_LAYOUT);
    const update = () => setIsMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // On a phone the trend panel sits a full screen below the cards, so selecting a
  // KPI would otherwise look like nothing happened. The jump is instant on
  // purpose: smooth scrolling is a silent no-op wherever the browser suppresses
  // scroll animation, which would leave the tap with no feedback at all.
  const selectMetric = id => {
    setMetric(id);
    if (!isMobile || !trendRef.current) return;
    trendRef.current.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  const weather = import.meta.env.VITE_WEATHER_ENABLED !== 'false' && weatherProps
    && <WeatherOverview key={weatherProps.userKey} {...weatherProps} />;

  // The list is D-1 only, and pickup and deli can stop on different days.
  const riskDateText = !riskDates?.pick && !riskDates?.deli ? ''
    : riskDates.pick === riskDates.deli || !riskDates.deli ? `D-1 ${dateLabel(riskDates.pick)}`
      : !riskDates.pick ? `D-1 ${dateLabel(riskDates.deli)}`
        : `Pickup ${dateLabel(riskDates.pick)} · Deli ${dateLabel(riskDates.deli)}`;
  const riskCapped = Number.isFinite(riskTotal) && riskTotal > risks.length;

  return <div className="operations-home overview-workspace">
    <ScopeStrip filters={mtdFilters} allHubTypes={allHubTypes} />

    {!isMobile && weather}

    {cards.length > 0 && <section className="overview-performance" aria-label="KPI vận hành">
      <div className="overview-performance-heading">
        <span className="overview-data-date"><CalendarDays aria-hidden="true" />MTD · {commonDate ? `${dateLabel(`${commonDate.slice(0, 7)}-01`)} – ${dateLabel(commonDate)}` : 'Chưa có dữ liệu'}</span>
        <IconButton icon="Info" label="Cách đọc KPI" detail="Lũy kế từ đầu tháng đến ngày dữ liệu mới nhất của từng KPI, theo bộ lọc đang chọn. Tỷ lệ bằng tổng tử chia tổng mẫu. Chọn KPI để xem xu hướng từng ngày; — là chưa có số liệu MTD." />
      </div>
      <OverviewKpiCards cards={mtdCards} selectedMetric={card?.id} onSelect={selectMetric} headingRange={headingRange} />
      {mtdCards.some(item => item.mtdRefreshError) && <div role="status">Đang hiển thị số MTD đã lưu; chưa cập nhật được số mới. <button type="button" className="overview-table-link" onClick={retry}>Thử lại</button></div>}
      {mtdCards.some(item => item.mtdStatus === 'error') && <div role="alert">Không tải được số liệu MTD. <button type="button" className="overview-table-link" onClick={retry}>Thử lại</button></div>}
    </section>}

    {dataNotice}

    {isMobile && weather}

    {card && <div className="overview-analysis">
      <section id="overview-trend" ref={trendRef} className="overview-trend-panel" aria-labelledby="overview-trend-title">
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
          <div><h2 id="overview-hubs-title">Hub cần theo dõi</h2><p>1st Pickup / 1st Deli · lượng trễ cao nhất{riskDateText && ` · ${riskDateText}`}</p></div>
          <span className="overview-hub-count"
            aria-label={riskCapped ? `Hiển thị ${risks.length} trong ${riskTotal} Hub dưới target` : `${risks.length} Hub dưới target`}>
            {riskCapped ? `${risks.length}/${riskTotal}` : risks.length}
          </span>
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
