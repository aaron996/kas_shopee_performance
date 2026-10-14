import React, { useId } from 'react';

function contour(style) {
  const count = style === 'gear' ? 96 : 160;
  return Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2;
    const radius = style === 'gear' ? (i % 8 < 4 ? 49 : 42) : 44 + 5 * Math.cos(angle * 8);
    return `${i ? 'L' : 'M'}${50 + radius * Math.cos(angle)},${50 + radius * Math.sin(angle)}`;
  }).join(' ') + ' Z';
}
const FLOWER = contour('flower');
const GEAR = contour('gear');

export default function MusicDisc({ shape = 'vinyl' }) {
  const id = useId().replaceAll(':', '');
  return <span className="prr-music-disc" data-shape={shape} aria-hidden="true">
    <svg viewBox="0 0 100 100" focusable="false">
      <defs>
        <clipPath id={`${id}-shape`}>
          {shape === 'flower' || shape === 'gear'
            ? <path d={shape === 'flower' ? FLOWER : GEAR} /> : <circle cx="50" cy="50" r="49" />}
        </clipPath>
        <linearGradient id={`${id}-cd`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#e2e8f0" /><stop offset=".25" stopColor="#7dd3fc" />
          <stop offset=".45" stopColor="#f8fafc" /><stop offset=".65" stopColor="#c4b5fd" />
          <stop offset=".85" stopColor="#99f6e4" /><stop offset="1" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-shape)`}>
        <rect width="100" height="100" fill={shape === 'cd' ? `url(#${id}-cd)` : '#172336'} />
        {[23, 27, 31, 35, 39, 43, 47].map(r => <circle key={r} cx="50" cy="50" r={r}
          fill="none" stroke={shape === 'cd' ? '#64748b' : '#40516a'} strokeOpacity=".45" strokeWidth=".8" />)}
        <path d="M12 24L35 40M66 61L88 76" stroke="#fff" strokeOpacity=".24" strokeWidth="3" />
        <circle cx="50" cy="50" r="21" fill="var(--action-primary)" />
        <circle cx="50" cy="50" r="4" fill="#f2f7fd" />
      </g>
    </svg>
  </span>;
}
