import React from 'react';
import './LoadingScreen.css';
import { getLoadingOverlayConfig } from '../utils/loadingOverlay.js';

/**
 * The one loading state for every tab: a skeleton shaped like the content that is
 * about to arrive. `variant="page"` stands in for a whole report (KPI tiles, chart,
 * table); `variant="block"` for a card, section or modal region.
 * Zero visible text — accessibility is carried by the ARIA status semantics.
 */
export default function LoadingScreen({ variant = 'block' }) {
  const config = getLoadingOverlayConfig({ variant });
  const rows = Array.from({ length: config.rowCount }, (_, i) => i);

  return (
    <div
      className={config.className}
      role={config.role}
      aria-live={config.ariaLive}
      aria-busy={config.ariaBusy}
      aria-label={config.ariaLabel}
      tabIndex={config.tabIndex}
    >
      {config.kpiCount > 0 && (
        <div className="loading-skeleton__kpis" aria-hidden="true">
          {Array.from({ length: config.kpiCount }, (_, i) => (
            <div className="loading-skeleton__kpi" key={i}>
              <span className="loading-skeleton__bar loading-skeleton__bar--label" />
              <span className="loading-skeleton__bar loading-skeleton__bar--value" />
            </div>
          ))}
        </div>
      )}
      {config.hasChart && <div className="loading-skeleton__chart loading-skeleton__bar" aria-hidden="true" />}
      <div className="loading-skeleton__table" aria-hidden="true">
        <span className="loading-skeleton__bar loading-skeleton__bar--title" />
        {rows.map(i => (
          <div className="loading-skeleton__row" key={i}>
            <span className="loading-skeleton__bar loading-skeleton__bar--name" />
            <span className="loading-skeleton__bar loading-skeleton__bar--cell" />
            <span className="loading-skeleton__bar loading-skeleton__bar--cell" />
            <span className="loading-skeleton__bar loading-skeleton__bar--cell" />
          </div>
        ))}
      </div>
    </div>
  );
}
