import { useId, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpRight, Minus, ChevronUp } from 'lucide-react';
import { formatVol } from '../../utils/dataProcessor.js';

export default function RankingLeaderboard({ items, rankView, selectedHubId, onSelect, onViewTable, d8Label }) {
  const [collapsed, setCollapsed] = useState(false);
  const listId = useId();
  if (!items.length) return null;
  return <div className={`prr-leaderboard-panel${collapsed ? ' is-collapsed' : ''}`}>
    <div className="prr-leaderboard-heading">
      <div><strong>Ranking</strong></div>
      <div className="prr-leaderboard-actions">
        <button type="button" onClick={onViewTable} title="Mở bảng số liệu đầy đủ" aria-label="Mở bảng số liệu đầy đủ"><ArrowUpRight size={17} aria-hidden="true" /></button>
        <button type="button" aria-label={collapsed ? 'Mở danh sách ranking' : 'Thu gọn danh sách ranking'} title={collapsed ? 'Mở danh sách ranking' : 'Thu gọn danh sách ranking'}
          aria-expanded={!collapsed} aria-controls={listId} onClick={() => setCollapsed(value => !value)}>
          <ChevronUp className="prr-leaderboard-chevron" size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
    <div id={listId} className="prr-leaderboard-reveal" inert={collapsed} aria-hidden={collapsed}>
    <div className="prr-leaderboard-content">
    <div className="prr-leaderboard-columns" aria-hidden="true"><span>Hạng</span><span>Hub / Số mẫu</span><span>KPI</span><span title={d8Label ? `So với ${d8Label} trong nhóm đối soát chung` : 'Chưa có ngày so sánh'}>Δ hạng</span></div>
    <ol className="prr-3d-leaderboard" aria-label={rankView === 'worst' ? 'Năm Hub cuối bảng' : 'Năm Hub dẫn đầu'}>
      {items.map((item, index) => {
        const isNew = item.hasCommonBaseline === false;
        const delta = item.deltaRank;
        const tone = isNew || !delta ? 'none' : delta > 0 ? 'up' : 'down';
        const DeltaIcon = tone === 'up' ? ArrowUp : tone === 'down' ? ArrowDown : Minus;
        return <li key={item.id}>
          <button type="button" className={item.id === selectedHubId ? 'is-selected' : ''}
            aria-pressed={item.id === selectedHubId} onClick={() => onSelect(item.id)}
            title={`${item.displayName || item.hub} · Hạng #${item.rank} · KPI ${item.kpiD1.toFixed(1)}% · ${formatVol(item.sampleD1)} mẫu`}>
            <span className="prr-lb-rank">{rankView === 'worst' ? <><span>W{index + 1}</span><span className="prr-lb-canonical">#{item.rank}</span></> : `#${item.rank}`}</span>
            <span className="prr-lb-hub"><span className="prr-lb-name">{item.displayName || item.hub}</span><span className="prr-lb-sample">{formatVol(item.sampleD1)} mẫu</span></span>
            <span className={`prr-lb-kpi ${item.meetsTarget ? 'is-good' : 'is-below'}`}>{item.kpiD1.toFixed(1)}%</span>
            <span className={`prr-lb-delta is-${tone}`} title={isNew ? 'Chưa có dữ liệu D-8 trong nhóm đối soát' : delta ? `${delta > 0 ? 'Tăng' : 'Giảm'} ${Math.abs(delta)} bậc so với ${d8Label || 'D-8'} trong nhóm đối soát chung` : 'Hạng không đổi so với D-8'}>
              {isNew ? 'Mới' : <><DeltaIcon size={11} aria-hidden="true" />{delta ? <><span className="sr-only">{delta > 0 ? 'Tăng ' : 'Giảm '}</span>{Math.abs(delta)}</> : <span className="sr-only">Không đổi</span>}</>}
            </span>
          </button>
        </li>;
      })}
    </ol>
    </div>
    </div>
  </div>;
}
