import React, { useEffect, useRef } from 'react';
import TruckTag from './TruckTag.jsx';

// SVG Vector Delivery Truck component
function DeliveryTruckIcon({ rank, isSelected, meetsTarget: _meetsTarget }) {
  const isTop1 = rank === 1;
  const isTop2 = rank === 2;
  const isTop3 = rank === 3;

  const cabColor = isSelected ? '#0ea5c4' : '#ffffff';
  const cargoColor = isSelected ? '#0284c7' : '#1e293b';
  const stripeColor = '#f15a22'; // GHN signature orange
  const wheelColor = '#0f172a';
  const rimColor = '#94a3b8';
  const windowColor = isSelected ? '#bae6fd' : '#94a3b8';

  const badgeBg = isTop1 ? '#f59e0b' : isTop2 ? '#94a3b8' : isTop3 ? '#d97706' : '#334155';
  const badgeBorder = isTop1 ? '#fbbf24' : isTop2 ? '#cbd5e1' : isTop3 ? '#f59e0b' : '#475569';

  return (
    <svg width="78" height="46" viewBox="0 0 78 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="truck-svg">
      <defs>
        <filter id={`truck-shadow-${rank}`} x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.28" />
        </filter>
      </defs>
      <g filter={`url(#truck-shadow-${rank})`}>
        {/* Cargo Body (thùng xe tải) */}
        <rect x="2" y="10" width="46" height="24" rx="3" fill={cargoColor} />
        {/* GHN Orange Brand Stripe */}
        <rect x="2" y="22" width="46" height="4" fill={stripeColor} />
        {/* Cargo Door line */}
        <line x1="14" y1="10" x2="14" y2="34" stroke="#475569" strokeWidth="1" strokeDasharray="1 1" />
        <line x1="34" y1="10" x2="34" y2="34" stroke="#475569" strokeWidth="1" strokeDasharray="1 1" />

        {/* Cabin (đầu xe) */}
        <path d="M48 16H66C68 16 71 18 72 21L75 27C75.5 28 76 29 76 30V34H48V16Z" fill={cabColor} />
        {/* Windshield (kính chắn gió) */}
        <path d="M56 18H65C66.5 18 68 19.5 69 22L71 26H56V18Z" fill={windowColor} />
        {/* Headlight (đèn pha) */}
        <rect x="74" y="29" width="2.5" height="3.5" rx="1" fill="#fef08a" />
        {/* Front bumper */}
        <rect x="73" y="32" width="4" height="2.5" rx="1" fill="#64748b" />

        {/* Wheels (Bánh xe) */}
        {/* Rear Wheel 1 */}
        <circle cx="12" cy="34" r="6" fill={wheelColor} />
        <circle cx="12" cy="34" r="3" fill={rimColor} />
        {/* Rear Wheel 2 */}
        <circle cx="26" cy="34" r="6" fill={wheelColor} />
        <circle cx="26" cy="34" r="3" fill={rimColor} />
        {/* Front Wheel */}
        <circle cx="63" cy="34" r="6" fill={wheelColor} />
        <circle cx="63" cy="34" r="3" fill={rimColor} />

        {/* Rank Crown/Badge on roof */}
        <rect x="18" y="2" width="18" height="9" rx="4.5" fill={badgeBg} stroke={badgeBorder} strokeWidth="1" />
        <text x="27" y="8.5" fill="#ffffff" fontSize="6.5" fontWeight="bold" fontFamily="Outfit, sans-serif" textAnchor="middle">
          #{rank}
        </text>
      </g>
    </svg>
  );
}

// 2D SVG/CSS road scene. Kept as its own component so the 3D scene can sit beside it.
export default function RoadScene2D({ sceneTrucks, selectedHubId, onSelectHub }) {
  const roadContainerRef = useRef(null);
  const truckElementsRef = useRef(new Map());

  // Smooth scroll scene to selected truck
  useEffect(() => {
    if (!selectedHubId || !roadContainerRef.current) return;
    const truckEl = truckElementsRef.current.get(selectedHubId);
    if (truckEl && roadContainerRef.current) {
      const container = roadContainerRef.current;
      const truckLeft = truckEl.offsetLeft;
      const truckWidth = truckEl.offsetWidth;
      const containerWidth = container.clientWidth;
      const targetScrollLeft = truckLeft - (containerWidth / 2) + (truckWidth / 2);

      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    }
  }, [selectedHubId]);

  return (
    <div className="prr-road-viewport" ref={roadContainerRef}>
      {/* The Road Surface */}
      <div
        className="prr-road-canvas"
        style={{
          // Scale width smoothly with number of trucks to ensure optimal readability
          minWidth: `${Math.max(1100, sceneTrucks.length * 115)}px`
        }}
      >
        {/* Road scenery: neutral operational checkpoints (no race track/F1 elements) */}
        <div className="prr-road-scenery">
          <div className="scenery-checkpoint start">
            <span className="checkpoint-marker" />
            <span>Điểm tiếp nhận &amp; điều phối</span>
          </div>
          <div className="scenery-checkpoint mid">
            <span className="checkpoint-marker" />
            <span>Hành lang kiểm soát KPI D-1</span>
          </div>
          <div className="scenery-checkpoint sla">
            <div className="sla-badge">
              <span className="sla-label">Mốc chuẩn SLA</span>
            </div>
            <div className="sla-baseline-line" />
          </div>
        </div>

        {/* 4 Lanes with dashed markings */}
        <div className="prr-lanes-container">
          <div className="prr-lane lane-1" />
          <div className="prr-lane lane-2" />
          <div className="prr-lane lane-3" />
          <div className="prr-lane lane-4" />
        </div>

        {/* Delivery Trucks */}
        {sceneTrucks.map((item, idx) => {
          const rank = item.rank;
          const isSelected = selectedHubId === item.id;
          const totalVisible = sceneTrucks.length;

          // Calibrated rank-based positioning:
          // idx is the slot index in sceneTrucks (sorted by rank: idx 0 is highest rank).
          // Using idx / (totalVisible - 1) guarantees monotonic progress [0, 1]
          // and keeps coordinates strictly within bounds [5%, 88%] with NO negative coordinates.
          const startPercent = 5;
          const endPercent = 88;
          const rankProgress = totalVisible > 1
            ? 1 - (idx / (totalVisible - 1))
            : 0.5;
          const leftPos = startPercent + (rankProgress * (endPercent - startPercent));

          // 4-Lane alternating distribution to prevent vertical collisions
          const laneOrder = [0, 2, 1, 3];
          const laneIdx = laneOrder[idx % 4];
          const topPos = 14 + (laneIdx * 64);

          return (
            <button
              type="button"
              key={item.id}
              ref={el => {
                if (el) truckElementsRef.current.set(item.id, el);
                else truckElementsRef.current.delete(item.id);
              }}
              aria-pressed={isSelected}
              aria-label={`Hub ${item.displayName || item.hub}, Vùng ${item.region}, Hạng ${rank}, KPI ${item.kpiD1.toFixed(1)}%`}
              className={`prr-truck-node prr-truck-btn ${isSelected ? 'is-selected' : ''}`}
              style={{
                left: `${leftPos}%`,
                top: `${topPos}px`,
                zIndex: isSelected ? 80 : 20 + laneIdx
              }}
              onClick={() => onSelectHub(item.id)}
            >
              {/* Floating Info Tag above truck */}
              <TruckTag item={item} />

              {/* Vector Truck SVG */}
              <DeliveryTruckIcon
                rank={rank}
                isSelected={isSelected}
                meetsTarget={item.meetsTarget}
              />

              {/* Selected Spotlight Glow */}
              {isSelected && <div className="truck-spotlight" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
