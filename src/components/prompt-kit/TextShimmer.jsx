// Adapted from ibelick/prompt-kit (MIT); see LICENSE and README.md.
import React from 'react';
import './prompt-kit.css';

export function TextShimmer({ as: Component = 'span', duration = 4, spread = 20, className = '', style, children, ...props }) {
  const dynamicSpread = Math.min(Math.max(spread, 5), 45);
  return (
    <Component
      className={`pk-text-shimmer ${className}`}
      style={{
        '--pk-shimmer-start': `${50 - dynamicSpread}%`,
        '--pk-shimmer-end': `${50 + dynamicSpread}%`,
        animationDuration: `${duration}s`,
        ...style,
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
