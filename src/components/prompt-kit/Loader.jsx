// Selected variants adapted from ibelick/prompt-kit (MIT); see LICENSE.
import React from 'react';
import { TextShimmer } from './TextShimmer';
import './prompt-kit.css';

export function Loader({ variant = 'typing', size = 'md', text = 'Đang xử lý…', className = '', ...props }) {
  return (
    <span className={`pk-loader pk-loader--${size} ${className}`} role="status" aria-label={text} {...props}>
      {variant === 'text-shimmer'
        ? <TextShimmer aria-hidden="true">{text}</TextShimmer>
        : <span className={`pk-loader-dots pk-loader-dots--${variant}`} aria-hidden="true">
          {Array.from({ length: variant === 'pulse-dot' ? 1 : 3 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * (variant === 'dots' ? 160 : 250)}ms` }} />
          ))}
        </span>}
    </span>
  );
}
