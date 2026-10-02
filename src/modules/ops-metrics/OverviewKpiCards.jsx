import AnimatedNumber from '../../components/ui/AnimatedNumber';
import { Check } from 'lucide-react';
import KpiSparkline from './KpiSparkline';
import { formatPct, formatVol, formatDateLabel } from '../../utils/dataProcessor';

export default function OverviewKpiCards({ cards, selectedMetric, onSelect, commonDate }) {
 const fdDate = cards.find(card => card.id === 'fd')?.historyDates.at(-1);
 return <div className="kpi-cards-container overview-kpi-cards">
            {cards.map((card, idx) => {
              const isFd = card.id === 'fd';
              const isFdEmpty = isFd && (!card.d1 || card.d1.pct === null || card.d1.tot === 0);
              const hasD8 = card.d8 && card.d8.pct !== null;
              const hasD1 = card.d1 && card.d1.pct !== null;
              const diff = (hasD1 && hasD8) ? Number((card.d1.pct - card.d8.pct).toFixed(1)) : null;
              const lateVol = card.d1.tot - card.d1.ont;
              const hasTarget = card.target != null;
              const isGood = hasTarget ? card.d1.pct >= card.target : !isFd;

              return (
                <button type="button"
                  key={card.id}
                  className={`kpi-card ${isFdEmpty ? 'kpi-card-empty' : ''} ${selectedMetric === card.id ? 'selected' : ''}`}
                  aria-pressed={selectedMetric === card.id}
                  data-tooltip={card.title}
                  data-tooltip-detail={card.compareNote || 'So với cùng thứ tuần trước'}
                  style={{ '--card-index': idx }}
                  onClick={() => onSelect(card.id)}
                >
                  <div className="kpi-card-title">
                    <span className="overview-kpi-name">
                      <span className="kpi-selection-mark" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
                      {card.title}
                      {isFd && !isFdEmpty && fdDate && commonDate && fdDate !== commonDate && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 500, marginLeft: '6px', color: 'var(--text-muted)' }}>
                          ({formatDateLabel(fdDate).replace('\n', ' ')})
                        </span>
                      )}
                    </span>
                    {hasTarget && (
                      <span className={`kpi-card-target ${isGood ? 'good' : 'bad'}`}>≥{card.target}%</span>
                    )}
                  </div>
                  {isFdEmpty ? (
                    <div className="kpi-card-empty-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                      <div className="kpi-card-main">
                        <span className="kpi-card-pct" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          Chưa có dữ liệu FD
                        </span>
                      </div>
                      <div className="kpi-card-chart" style={{ opacity: 0.3 }}>
                        <div style={{ height: '2px', background: 'var(--border-subtle)', width: '100%', marginTop: '18px' }} />
                      </div>
                      <div className="kpi-card-stats">
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>–</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="kpi-card-main">
                        <AnimatedNumber
                          value={card.d1.pct}
                          format={v => formatPct(v)}
                          className={`kpi-card-pct ${hasTarget && isGood ? 'good' : ''}`}
                        />
                        {diff !== null ? (
                          <AnimatedNumber
                            value={diff}
                            format={v => v > 0 ? `+${v.toFixed(1)} đpt` : `${Number(v.toFixed(1))} đpt`}
                            className={`kpi-card-diff ${isFd ? (diff >= 0 ? 'down' : 'up') : (diff >= 0 ? 'up' : 'down')}`}
                          />
                        ) : (
                          <span className="kpi-card-diff">–</span>
                        )}
                      </div>

                      {/* Visual sparkline */}
                      <div className="kpi-card-chart">
                        <KpiSparkline card={card} isGood={isGood} />
                      </div>

                      <div className="kpi-card-stats">
                        <AnimatedNumber value={card.d1.tot} format={v => `${formatVol(Math.round(v))} đơn`} />
                        <AnimatedNumber
                          value={card.subStatLabel ? card.d1.ont : lateVol}
                          format={v => `${formatVol(Math.round(v))} ${card.subStatLabel || 'trễ'}`}
                          className={card.subStatLabel ? '' : 'late'}
                        />
                      </div>
                    </>
                  )}
                </button>
              );
            })}
 </div>;
}
