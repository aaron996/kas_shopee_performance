/**
 * Loading-state contract shared by every tab.
 *
 * One visual language: a skeleton shaped like the content that is about to
 * arrive (no spinner, no sprite, no progress bar). Enforces:
 * 1. No visible text or CTA — the placeholder is purely structural.
 * 2. Accessibility: role="status", aria-live="polite", aria-busy="true", aria-label.
 * 3. Two shapes: `page` (KPI tiles + chart + table, for a whole tab) and
 *    `block` (title + rows, for a card/section/modal region).
 */

export function getLoadingOverlayConfig({ variant = 'block' } = {}) {
  const shape = variant === 'page' ? 'page' : 'block';
  return {
    variant: shape,
    className: `loading-skeleton loading-skeleton--${shape}`,
    role: 'status',
    ariaLive: 'polite',
    ariaBusy: 'true',
    ariaLabel: 'Đang tải dữ liệu',
    tabIndex: -1,
    kpiCount: shape === 'page' ? 4 : 0,
    rowCount: shape === 'page' ? 7 : 4,
    hasChart: shape === 'page',
    hasVisibleText: false
  };
}
