import React from 'react';
import './LoadingScreen.css';
import { getLoadingOverlayConfig } from '../utils/loadingOverlay.js';

/**
 * Unified application-wide loading overlay.
 * Displays exclusively the running character frame animation.
 * Conforms strictly to zero visible text (no headings, status copy, percentages, or hints).
 * Accessibility is handled via ARIA status semantics and screen-reader labels.
 */
export default function LoadingScreen({
  fullScreen = true,
  option = 4,
  // Accepted for backwards compatibility with existing callers, but explicitly NOT rendered as visible text
  text = 'Đang tải dữ liệu...'
}) {
  const config = getLoadingOverlayConfig({ fullScreen, option, text });

  return (
    <div
      className={config.overlayClass}
      role={config.role}
      aria-live={config.ariaLive}
      aria-busy={config.ariaBusy}
      aria-label={config.ariaLabel}
      tabIndex={config.tabIndex}
    >
      <div className={config.contentClass}>
        <div className={config.spriteClass} aria-hidden={config.spriteAriaHidden} />
      </div>
    </div>
  );
}
