import React from 'react';

/**
 * Sparkline tối giản cho KPI card của tab Leadtime.
 *
 * Không tái dùng SparklineChart của Report1 vì thứ đó vẽ theo % và luôn kẻ một
 * đường target — còn leadtime KHÔNG có target (đã xác nhận), đơn vị là giờ, và
 * "cao hơn" nghĩa là xấu hơn. Trộn hai ngữ nghĩa vào một component sẽ phải
 * truyền cờ điều kiện khắp nơi, nên để riêng.
 *
 * @param {number[]} values chuỗi giá trị theo ngày (giờ)
 * @param {'up'|'down'|'flat'} direction chiều biến động của kỳ so baseline
 */
export default function MiniSparkline({ values = [], direction = 'flat', height = 34 }) {
  const points = values.filter(v => Number.isFinite(v));
  if (points.length < 2) {
    return <div className="lt-spark lt-spark--empty" style={{ height }} />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = range * 0.15;
  const lo = min - pad;
  const span = (max + pad) - lo || 1;

  const coords = points.map((v, i) => ({
    x: (i / (points.length - 1)) * 100,
    y: 100 - ((v - lo) / span) * 100
  }));

  let path = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const cx = (a.x + b.x) / 2;
    path += ` C ${cx},${a.y} ${cx},${b.y} ${b.x},${b.y}`;
  }
  const last = coords[coords.length - 1];

  return (
    <svg
      className={`lt-spark lt-spark--${direction}`}
      style={{ height }}
      width="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${path} L 100,100 L 0,100 Z`} className="lt-spark-area" />
      <path d={path} className="lt-spark-line" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="3.5" className="lt-spark-dot" />
    </svg>
  );
}
