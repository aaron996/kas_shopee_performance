/**
 * Unified Loading Overlay configuration & contract.
 *
 * Enforces:
 * 1. Exclusively character sprite frame animation (no visible text, CTA, or hint).
 * 2. Proper accessibility attributes (role="status", aria-live="polite", aria-busy="true", aria-label).
 * 3. Support for fullscreen (viewport fixed) and contained (container bounded) overlays.
 */

export function getLoadingOverlayConfig({
  fullScreen = true,
  option = 4,
  text: _text = '' // Ignored for visible output, retained only for legacy signature compatibility
} = {}) {
  return {
    overlayClass: `loading-overlay ${fullScreen ? 'loading-overlay--fullscreen' : 'loading-overlay--contained'}`,
    role: 'status',
    ariaLive: 'polite',
    ariaBusy: 'true',
    ariaLabel: 'Đang tải dữ liệu',
    tabIndex: -1,
    contentClass: 'loading-content',
    spriteClass: `loading-sprite sprite-option-${option}`,
    spriteAriaHidden: 'true',
    hasVisibleText: false
  };
}
