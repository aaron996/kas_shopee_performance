/**
 * Loading-state contract shared by every tab.
 *
 * One visual language: a skeleton shaped like the content that is about to
 * arrive (no spinner, no sprite, no progress bar). Enforces:
 * 1. No visible text or CTA — the placeholder is purely structural.
 * 2. Accessibility: role="status", aria-live="polite", aria-busy="true", aria-label.
 * 3. One skeleton style, sized for `page`, `block` or an `inline` value.
 */

export function getLoadingOverlayConfig({ variant = 'block' } = {}) {
  const shape = ['page', 'inline'].includes(variant) ? variant : 'block';
  return {
    variant: shape,
    className: `loading-skeleton loading-skeleton--${shape}`,
    role: 'status',
    ariaLive: 'polite',
    ariaBusy: 'true',
    ariaLabel: 'Đang tải dữ liệu',
    tabIndex: -1,
    kpiCount: shape === 'page' ? 4 : 0,
    rowCount: shape === 'inline' ? 0 : shape === 'page' ? 7 : 4,
    hasChart: shape === 'page',
    hasVisibleText: false
  };
}
