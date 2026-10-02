import { useState } from 'react';
import { formatDateLabel } from '../../utils/dataProcessor';

export default function KpiSparkline({ card, isGood }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!card.history || card.history.length < 2) {
    return <div style={{ height: '2px', background: isGood ? '#0F6E56' : '#A13B2A', width: '100%', marginTop: '18px' }} />;
  }

  const h = card.history;
  const dates = card.historyDates || [];
  const actualMin = Math.min(...h);
  const actualMax = Math.max(...h);
  const diff = actualMax - actualMin;
  const padding = Math.max(diff * 0.4, 5);

  const min = card.target != null ? Math.min(actualMin - padding, card.target - 2) : actualMin - padding;
  const max = card.target != null ? Math.max(actualMax + padding, card.target + 2) : actualMax + padding;
  const range = max - min || 1;

  const coords = h.map((val, idx) => {
    const x = (idx / (h.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return { x, y, val, date: dates[idx] };
  });

  let pathD = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const cx = (p0.x + p1.x) / 2;
    pathD += ` C ${cx},${p0.y} ${cx},${p1.y} ${p1.x},${p1.y}`;
  }

  const areaD = `${pathD} L 100,100 L 0,100 Z`;
  const targetY = card.target != null ? 100 - ((card.target - min) / range) * 100 : null;
  const lastPt = coords[coords.length - 1];

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const pctX = (mouseX / rect.width) * 100;

    let closestIdx = 0;
    let minDist = Infinity;
    coords.forEach((pt, idx) => {
      const dist = Math.abs(pt.x - pctX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const activePt = hoverIndex !== null ? coords[hoverIndex] : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {activePt && (
        <div style={{
          position: 'absolute',
          top: '-32px',
          left: `${Math.min(Math.max(activePt.x, 18), 82)}%`,
          transform: 'translateX(-50%)',
          background: '#0f172a',
          color: '#fff',
          padding: '3px 8px',
          borderRadius: '6px',
          fontSize: '0.7rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          zIndex: 25,
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {activePt.date ? formatDateLabel(activePt.date).replace('\n', ' ') : ''}: <span style={{ color: isGood ? '#34d399' : '#f87171' }}>{activePt.val.toFixed(1)}%</span>
        </div>
      )}
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        style={{ overflow: 'visible', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={`spark-grad-${card.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isGood ? '#0F6E56' : '#A13B2A'} stopOpacity="0.25" />
            <stop offset="100%" stopColor={isGood ? '#0F6E56' : '#A13B2A'} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {targetY !== null && targetY >= 0 && targetY <= 100 && (
          <line x1="0" y1={targetY} x2="100" y2={targetY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" vectorEffect="non-scaling-stroke" style={{ transition: 'y1 0.6s ease, y2 0.6s ease' }} />
        )}
        <path d={areaD} fill={`url(#spark-grad-${card.id})`} style={{ transition: 'd 0.6s cubic-bezier(0.4, 0, 0.2, 1), fill 0.6s ease' }} />
        <path d={pathD} fill="none" stroke={isGood ? '#0F6E56' : '#A13B2A'} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'd 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.6s ease' }} />

        <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={isGood ? '#0F6E56' : '#A13B2A'} style={{ transition: 'cx 0.6s ease, cy 0.6s ease, fill 0.6s ease' }} />

        {activePt && (
          <>
            <line x1={activePt.x} y1="0" x2={activePt.x} y2="100" stroke="#64748b" strokeWidth="1" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
            <circle cx={activePt.x} cy={activePt.y} r="4" fill="#38bdf8" stroke="#fff" strokeWidth="1.5" />
          </>
        )}
      </svg>
    </div>
  );
}
